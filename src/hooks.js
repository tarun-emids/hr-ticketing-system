import { useEffect, useRef, useState } from "react";
import { listTickets, subscribe, refreshTickets } from "./data/store";

export function useTickets(pollMs = 0) {
  const [tickets, setTickets] = useState(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  useEffect(() => {
    let interval;
    alive.current = true;

    const unsub = subscribe(() => {
      setTickets(listTickets());
    });

    // Cache-first: show stale data immediately, then refresh from the API.
    const cached = listTickets();
    if (cached.length > 0) {
      setTickets(cached);
      setLoading(false);
    }
    refreshTickets()
      .then(() => {
        if (alive.current) {
          setTickets(listTickets());
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive.current) setLoading(false);
      });

    if (pollMs > 0) {
      interval = setInterval(() => {
        refreshTickets().catch(() => {});
      }, pollMs);
    }

    return () => {
      alive.current = false;
      clearInterval(interval);
      unsub();
    };
  }, []);

  return { tickets: tickets ?? [], loading, ready: tickets !== null };
}