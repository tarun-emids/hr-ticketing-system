import { useAuth } from "../context/AuthContext";
import { useTickets } from "../hooks";
import TicketTable from "../components/TicketTable";
import { SkeletonList, EmptyState } from "../components/primitives";

export default function HRInbox() {
  const { users } = useAuth();
  const { tickets, loading } = useTickets();

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-h3 text-warm">All tickets</h1>
        </header>
        <div className="border border-surface-2 bg-surface"><SkeletonList rows={6} /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <span className="mono-label mb-3 block text-[10px] text-teal">↘ 0 1 /  I N B O X</span>
        <div className="rule-teal mb-5" />
        <h1 className="text-h3 text-warm">All tickets</h1>
        <p className="mt-1.5 text-caption text-warm/45">
          Every request from every employee — searchable, filterable, sortable.
        </p>
      </header>

      {tickets.length === 0 ? (
        <EmptyState
          title="The inbox is empty"
          body="When employees raise tickets they will appear here. This usually means nobody has used the service yet — try submitting a demo ticket."
          icon="↘"
        />
      ) : (
        <TicketTable tickets={tickets} users={users} />
      )}
    </div>
  );
}
