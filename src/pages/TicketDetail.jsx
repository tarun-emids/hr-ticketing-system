import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CATEGORIES, PRIORITIES, STATUSES } from "../data/users";
import { getTicket, subscribe, refreshTicket, updateStatus, assignTicket, setPriority, setCategory, getAttachmentUrl } from "../data/store";
import { useAuth } from "../context/AuthContext";
import { StatusBadge, PriorityBadge } from "../components/Badge";
import Thread from "../components/Thread";
import { Spinner, EmptyState } from "../components/primitives";
import { formatDateTime, timeAgo } from "../utils";

const SELECT =
  "w-full border border-surface-2 bg-canvas px-2.5 py-2 text-body text-warm focus:border-teal focus:outline-none";

function MetaItem({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="mono-label text-[10px] text-warm/40">{label}</p>
      <div className="mt-1.5 text-body-lg text-warm/85">{children}</div>
    </div>
  );
}

function AgentControls({ ticket, actor, users }) {
  const agents = users.filter((u) => u.role === "agent");
  return (
    <div className="mt-6 grid gap-5 border-t border-surface-2 pt-6 sm:grid-cols-2">
      <MetaItem label="Status">
        <select value={ticket.status} onChange={(e) => updateStatus(ticket.id, e.target.value, actor.id)} className={SELECT}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </MetaItem>
      <MetaItem label="Assignee">
        <select value={ticket.assigneeId ?? ""} onChange={(e) => assignTicket(ticket.id, e.target.value || null)} className={SELECT}>
          <option value="">Unassigned</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </MetaItem>
      <MetaItem label="Priority">
        <select value={ticket.priority} onChange={(e) => setPriority(ticket.id, e.target.value)} className={SELECT}>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </MetaItem>
      <MetaItem label="Re-categorise">
        <select value={ticket.category} onChange={(e) => setCategory(ticket.id, e.target.value)} className={SELECT}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </MetaItem>
    </div>
  );
}

function AttachmentChip({ ticket }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const res = await getAttachmentUrl(ticket.id); // { url, name, size }
      if (res?.url) window.open(res.url, "_blank", "noopener");
    } catch (e) {
      window.alert(`Could not open attachment: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border border-surface-2 bg-canvas px-3 py-2.5 text-body text-warm/80">
      <svg className="h-3.5 w-3.5 text-teal/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m18.4 9.7-6.7 6.7a4 4 0 0 1-5.7-5.7l7.1-7.1a2.6 2.6 0 1 1 3.8 3.6l-6.5 6.5a1.4 1.4 0 0 1-2-2l5.9-6" />
      </svg>
      <button type="button" onClick={open} disabled={busy} className="underline decoration-teal/50 underline-offset-4 transition-colors hover:text-teal disabled:opacity-40">
        {ticket.attachment.name}
      </button>
      <span className="mono-label text-[10px] text-warm/35">{(ticket.attachment.size / 1024).toFixed(0)} KB</span>
      <span className="mono-label text-[10px] text-warm/25">{busy ? "opening…" : "open ↗"}</span>
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const { user, users } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justCreated = searchParams.get("created") === "1";
  const [, force] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(justCreated);

  useEffect(() => {
    const unsub = subscribe(() => force((n) => n + 1));
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    refreshTicket(id)
      .catch((e) => {
        if (alive) setError(e.message ?? String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!banner) return undefined;
    const t = setTimeout(() => setBanner(false), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  if (loading) return <Spinner />;

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl pt-8">
        <EmptyState title="Session expired" body="Your saved user no longer exists in the backend — please sign in again." icon="▸" />
      </div>
    );
  }

  const ticket = getTicket(id);

  if (!ticket) {
    return (
      <div className="mx-auto max-w-4xl pt-8">
        <EmptyState
          title={`Ticket ${id} not available`}
          body={error ?? "It may have been removed, or the link is wrong."}
          icon="↘"
        />
      </div>
    );
  }

  const isMine = ticket.employeeId === user.id;
  const isAgent = user.role === "agent";
  if (!isAgent && !isMine) {
    return (
      <div className="mx-auto max-w-4xl pt-8">
        <EmptyState title="No access to this ticket" body="You can only view your own tickets." icon="▸" />
      </div>
    );
  }

  const employee = users.find((u) => u.id === ticket.employeeId);
  const assignee = users.find((u) => u.id === ticket.assigneeId);
  const closedBy = users.find((u) => u.id === ticket.closedBy);

  return (
    <div className="mx-auto max-w-4xl">
      <button
        onClick={() => navigate(isAgent ? "/inbox" : "/my-tickets")}
        className="mono-label inline-flex items-center gap-2 text-[10px] text-warm/45 transition-colors hover:text-teal"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to {isAgent ? "inbox" : "my tickets"}
      </button>

      {banner && (
        <div className="mt-4 flex items-center gap-2 border border-ok/40 bg-ok/10 px-4 py-3 text-body-lg text-ok">
          <span aria-hidden>▸</span> Ticket {ticket.id} submitted — HR has been notified.
        </div>
      )}

      <header className="mt-6 mb-6">
        <span className="mono-label mb-3 block text-[10px] text-teal">↘ T I C K E T</span>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="mono-label text-[10px] text-warm/40">{ticket.id}</span>
          <StatusBadge status={ticket.status} size="md" />
          <PriorityBadge priority={ticket.priority} size="md" />
        </div>
        <h1 className="text-h3 text-warm sm:text-h2 sm:leading-[0.85]">{ticket.subject}</h1>
        <p className="mt-2 text-caption text-warm/50">
          {employee?.name} · {employee?.email} · opened {timeAgo(ticket.createdAt)}
        </p>
      </header>

      <section className="soft-bl mb-8 border border-surface-2 bg-surface-2/40 p-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <MetaItem label="Category">{ticket.category}</MetaItem>
          <MetaItem label="Opened">{formatDateTime(ticket.createdAt)}</MetaItem>
          <MetaItem label="Last update">{timeAgo(ticket.updatedAt)}</MetaItem>
          <MetaItem label="Assignee">
            {assignee ? assignee.name : <span className="text-warm/25 italic">Unassigned</span>}
          </MetaItem>
          <MetaItem label="Resolved">
            {ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : <span className="text-warm/25">—</span>}
          </MetaItem>
          <MetaItem label="Closed by">
            {closedBy ? closedBy.name : <span className="text-warm/25">—</span>}
          </MetaItem>
        </div>

        {ticket.attachment?.path && <AttachmentChip ticket={ticket} />}

        {isAgent && <AgentControls ticket={ticket} actor={user} users={users} />}
      </section>

      <p className="mono-label mb-4 text-[10px] text-warm/40">CONVERSATION / FIG. {ticket.id.replace("-", ".")}</p>
      <Thread ticket={ticket} users={users} viewer={user} />
    </div>
  );
}
