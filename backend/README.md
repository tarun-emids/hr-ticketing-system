# HR Desk API — FastAPI + Supabase backend

FastAPI backend that persists the HR ticketing data in **Supabase (Postgres + Storage)**.
Endpoint shapes mirror `src/data/store.js` 1:1 so the React frontend can swap the
mock store for real HTTP calls with minimal changes.

---

## 1. Put this folder in the project

Save these files into the repo so you end up with:

```
hr-ticketing-system/
  backend/
    .env.example
    requirements.txt
    schema.sql
    README.md   (this file)
    app/
      __init__.py
      config.py
      models.py
      main.py
      routers/
        __init__.py
        tickets_core.py     # create / list / get / replies
        tickets_actions.py  # status / assignee / priority / category
        attachments.py      # file upload + signed URL
        users_meta.py       # users / agents / meta lookups
  src/ ... (existing frontend, unchanged)
```

## 2. Create the Supabase project (first time only)

1. Go to https://supabase.com/dashboard and **New project** (any region near you;
   a DB password you can paste once — it is not used by this backend).
2. Wait for provisioning, then open **SQL Editor** (left sidebar, `_`-shaped terminal icon → SQL Editor → New query).
3. Paste the entire contents of `backend/schema.sql` and **Run**. It creates:
   - `users`, `tickets`, `replies` tables with constraints (same enums as the frontend)
   - a `TKT-<n>` reference generated per row, starting at **TKT-101**
   - an `updated_at` trigger, RLS enabled (server-only access), and the private
     storage bucket `ticket-attachments`
   - seeds your 7 demo users (Priya, Marcus, Dana, Tomas + Alicia, Ben, Ruth)
4. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret key** (localStorage "service_role") → `SUPABASE_SERVICE_ROLE_KEY`

> The backend uses the **service_role** key server-side (it bypasses RLS by design).
> Never put this key in frontend code or commit `backend/.env`.

## 3. Configure and run

Requires **Python 3.10+**.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env    # then paste your URL + service key into .env
uvicorn app.main:app --reload --port 8000
```

- Interactive docs: http://localhost:8000/docs
- Liveness: http://localhost:8000/health

## 4. Smoke test (curl) — create a ticket

Grab an employee uuid first:

```bash
curl http://localhost:8000/api/users
```

Then create a ticket:

```bash
curl -X POST http://localhost:8000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "<uuid-from-users-list>",
    "category": "Payroll",
    "priority": "High",
    "subject": "May payslip is missing the shift allowance",
    "description": "The May payslip does not include the 12 hours of weekend shift allowance I worked."
  }'
```

Validation mirrors the frontend: subject ≥ 5 chars, description ≥ 20 chars,
category ∈ {Payroll, Leave, Benefits, Onboarding, Policy, Other},
priority ∈ {Low, Medium, High, Urgent}. `GET /tickets/TKT-101` returns the created row
with its thread (`turns`), or 404 if missing.

## 5. Endpoint map (store.js → API)

| Frontend store function | API endpoint |
| --- | --- |
| `createTicket(...)` | `POST /api/tickets` |
| `listTickets()` | `GET /api/tickets?...` (filters: `status, category, priority, employeeId, assigneeId, q, unassigned`) |
| `getTicket(id)` | `GET /api/tickets/{TKT-n or uuid}` |
| `addReply(ticketId, {...})` | `POST /api/tickets/{id}/replies` (`{ authorId, text }`) |
| `updateStatus(id, status, actorId)` | `PATCH /api/tickets/{id}/status` (`{ status, actorId }`) |
| `assignTicket(id, assigneeId)` | `PATCH /api/tickets/{id}/assignee` (`{ assigneeId: uuid|null }`) |
| `setPriority(id, priority)` | `PATCH /api/tickets/{id}/priority` |
| `setCategory(id, category)` | `PATCH /api/tickets/{id}/category` |
| `USERS` / `HR_AGENTS` / lookups | `GET /api/users`, `GET /api/users/agents`, `GET /api/meta` |
| (attachment file) | `POST /api/tickets/{id}/attachment` (multipart `file`), `GET /api/tickets/{id}/attachment` (signed URL) |

Behaviour copied from the mock store: agent replies stamp `firstReplyAt` once and
move `Open → In Progress`; employee replies flip an active ticket to
`Waiting on Employee`; assigning an unanswered ticket auto-posts the agent
"picked it up" reply; `Resolved` stamps `resolvedAt`; `Closed` records `closedBy`;
reopening clears both.

## 6. Wiring the frontend later

`src/data/store.js` function bodies become `fetch` calls against
`http://localhost:8000/api/...` (JSON bodies use camelCase keys as above).
Users for the login screen come from `GET /api/users` instead of `USERS` — the
mock `u1/h1` ids become the seeded users' Postgres uuids. Until real auth exists,
requests carry the acting user's id (`employeeId`, `authorId`, `actorId`) exactly
like the mock store does today — that is the next hardening step (Supabase Auth
in frontend + FastAPI JWT check).

## 7. Attachments

Files go into the private `ticket-attachments` bucket at `<TKT-ref>/<uuid>.<ext>`
(capped at 5 MB, same as the frontend). Reading one back returns a signed URL
(default 1 h — tune `ATTACHMENT_SIGNED_URL_TTL`). A ticket holds one attachment;
uploading again replaces it.

## 8. Conventions

- All write endpoints return the **full ticket including the thread**, so callers
  can update their local state in one round-trip.
- `/api/tickets` list items have empty `turns` for size — fetch a single ticket
  for the full thread.
- Errors: `404` unknown ticket, `413` file too large, `422` validation/unknown user,
  `400/502` database or storage rejection.
