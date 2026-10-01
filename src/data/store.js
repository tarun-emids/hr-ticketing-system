// API-backed ticket store (replaces the in-memory mock).
//
// Same contract as before:
//   - listTickets()/getTicket(id) stay SYNCHRONOUS reads of a local cache,
//     so existing components keep working unchanged.
//   - refreshTickets()/refreshTicket(id) pull fresh data from the API and
//     notify subscribers; hooks.js calls these on mount.
//   - every write goes to the API, merges the authoritative returned ticket
//     into the cache (status bumps, auto pickup reply, closedBy… server-side),
//     then notifies.
import * as api from "../api/client";

let tickets = [];
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn());
const sortDesc = (list) =>
  [...list].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

function upsert(saved) {
  const i = tickets.findIndex((t) => t.id === saved.id);
  if (i >= 0) {
    tickets[i] = saved;
  } else {
    tickets.unshift(saved);
  }
  tickets = sortDesc(tickets);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function listTickets() {
  return sortDesc(tickets);
}

export function getTicket(id) {
  return tickets.find((t) => t.id === id) ?? null;
}

async function updateCache(promise) {
  const saved = await promise;
  upsert(saved);
  notify();
  return saved;
}

// ---- cache refreshers -------------------------------------------------------
export function refreshTickets() {
  return api.listTickets().then((fresh) => {
    tickets = sortDesc(fresh);
    notify();
    return tickets;
  });
}

export function refreshTicket(id) {
  return updateCache(api.getTicket(id));
}

// ---- writes -----------------------------------------------------------------
export const createTicket = (payload) => updateCache(api.createTicket(payload));

export const uploadAttachment = (ticketId, file) =>
  updateCache(api.uploadAttachment(ticketId, file));

// role is derived from authorId server-side; kept in the signature for compatibility
export const addReply = (ticketId, { authorId, role, text }) =>
  updateCache(api.addReply(ticketId, { authorId, text }));

export const updateStatus = (ticketId, status, actorId) =>
  updateCache(api.updateStatus(ticketId, { status, actorId }));

export const assignTicket = (ticketId, assigneeId) =>
  updateCache(api.assignTicket(ticketId, { assigneeId }));

export const setPriority = (ticketId, priority) =>
  updateCache(api.setPriority(ticketId, { priority }));

export const setCategory = (ticketId, category) =>
  updateCache(api.setCategory(ticketId, { category }));

// ---- attachments ------------------------------------------------------------
export function getAttachmentUrl(ticketId) {
  return api.getAttachmentUrl(ticketId);
}