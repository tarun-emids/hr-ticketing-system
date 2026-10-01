"""Ticket CRUD + the reply endpoint. Mirrors src/data/store.js 1:1."""
import re
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from postgrest.exceptions import APIError

from app.config import db, get_client
from app.models import ReplyCreate, TicketCreate, ticket_out

router = APIRouter(prefix="/tickets", tags=["tickets"])

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
REF_RE = re.compile(r"^TKT-\d+$")


class NotFound(HTTPException):
    def __init__(self, detail: str = "Ticket not found"):
        super().__init__(status_code=404, detail=detail)


def unwrap(res: Any):
    """Version-proof PostgREST response handling.

    supabase-py variants return APIResponse objects (with .data), plain lists,
    dicts, or (data, count) tuples depending on installed version — normalise
    all of them to dict/list JSON data here.
    """
    if isinstance(res, tuple) and len(res) == 2:
        return res[0]
    if isinstance(res, (list, dict)):
        return res
    return getattr(res, "data", None)


def run(q):
    """Execute a build, mapping PostgREST errors to HTTP 4xx/5xx-with-detail."""
    try:
        return unwrap(q.execute())
    except APIError as e:
        detail = getattr(e, "message", None) or str(e)
        code = str(getattr(e, "code", "") or "")
        status = 400 if code.startswith("23") else 502
        raise HTTPException(status_code=status, detail=f"Database rejected the write: {detail}")


def rows_of(q) -> list[dict]:
    data = run(q)
    if isinstance(data, dict):
        return [data]
    return data or []


def _first(q) -> Optional[dict]:
    list_ = rows_of(q)
    return list_[0] if list_ else None


def ticket_ref(tid: str) -> tuple[str, str]:
    """Resolve a UUID or a TKT-<n> reference to (column, value)."""
    if UUID_RE.match(tid):
        return "id", tid
    col_val = tid if REF_RE.match(tid) else f"TKT-{tid}"
    return "ref", col_val


def fetch_row(tid: str) -> dict:
    col, val = ticket_ref(tid)
    row = _first(db().select("*").eq(col, val).limit(1))
    if not row:
        raise NotFound()
    return row


def fetch_replies(ticket_uuid: str) -> list[dict]:
    return rows_of(
        get_client().table("replies")
        .select("*")
        .eq("ticket_id", ticket_uuid)
        .order("created_at")
    )


def fetch_full(tid: str) -> dict:
    row = fetch_row(tid)
    return ticket_out(row, fetch_replies(row["id"]))


def get_user(uid: str) -> Optional[dict]:
    if not uid:
        return None
    return _first(get_client().table("users").select("*").eq("id", uid).limit(1))


def _update_and_return(tid: str, patch: dict) -> dict:
    """Patch the ticket row (trigger bumps updated_at), return the full ticket."""
    row = fetch_row(tid)
    run(db().update(patch).eq("id", row["id"]))
    return fetch_full(tid)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
def create_ticket(payload: TicketCreate):
    """POST /tickets — create a ticket (guards: employee exists + role check).

    Body accepts camelCase (employeeId, ...) thanks to the alias config.
    """
    employee = get_user(payload.employee_id)
    if not employee:
        raise HTTPException(status_code=422, detail="employeeId does not match a known user")
    if employee["role"] != "employee":
        raise HTTPException(status_code=422, detail="employeeId must belong to a user with role 'employee'")

    row = {
        "employee_id": payload.employee_id,
        "category": payload.category,
        "subject": payload.subject.strip(),
        "description": payload.description.strip(),
        "priority": payload.priority,
        "status": "Open",
    }
    created = rows_of(db().insert(row).select("*"))
    return ticket_out(created[0], [])


@router.get("")
def list_tickets(
    status: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    employeeId: Optional[str] = None,
    assigneeId: Optional[str] = None,
    q: Optional[str] = None,
    unassigned: bool = False,
    limit: int = 200,
):
    """GET /tickets — newest-first by updatedAt (list items carry empty turns;
    load a single ticket for the full thread)."""
    query = db().select("*").order("updated_at", desc=True).limit(min(limit, 500))
    if status:
        query = query.eq("status", status)
    if category:
        query = query.eq("category", category)
    if priority:
        query = query.eq("priority", priority)
    if employeeId:
        query = query.eq("employee_id", employeeId)
    if assigneeId:
        query = query.eq("assignee_id", assigneeId)
    if unassigned:
        query = query.is_("assignee_id", None)
    if q:
        query = query.ilike("subject", f"%{q}%")
    return [ticket_out(r, []) for r in rows_of(query)]


@router.get("/{tid}")
def get_ticket(tid: str):
    """GET /tickets/{TKT-123 | uuid} — full ticket incl. thread."""
    return fetch_full(tid)


@router.post("/{tid}/replies")
def add_reply(tid: str, payload: ReplyCreate):
    """POST /tickets/{id}/replies — store.js addReply parity.

    Agent reply: stamps firstReplyAt (once) and Open -> In Progress.
    Employee reply: non-final statuses flip to Waiting on Employee.
    """
    from datetime import datetime, timezone

    row = fetch_row(tid)
    author = get_user(payload.author_id)
    if not author:
        raise HTTPException(status_code=422, detail="authorId does not match a known user")
    role = author["role"]

    now = datetime.now(timezone.utc).isoformat()
    rows_of(
        get_client().table("replies").insert({
            "ticket_id": row["id"],
            "author_id": payload.author_id,
            "author_role": role,
            "body": payload.text.strip(),
        }).select("*")
    )

    patch: dict = {}
    if role == "agent":
        if not row.get("first_reply_at"):
            patch["first_reply_at"] = now
        if row["status"] == "Open":
            patch["status"] = "In Progress"
    elif role == "employee" and row["status"] not in ("Resolved", "Closed"):
        patch["status"] = "Waiting on Employee"

    if patch:
        run(db().update(patch).eq("id", row["id"]))
    return fetch_full(tid)