// Thin HTTP client over the HR Desk FastAPI backend.
// Base URL can be overridden with VITE_API_URL (see vite .env), e.g.
//   VITE_API_URL=http://localhost:8000/api
const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/+$/, "");

function detailFrom(res, body) {
  if (body?.detail) {
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d) => d?.msg ?? String(d)).join("; ");
    }
    return JSON.stringify(body.detail);
  }
  return `${res.status} ${res.statusText}`;
}

async function request(path, { method = "GET", body, form } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: form ? undefined : { "Content-Type": "application/json" },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error body — fall back to status text */
    }
    throw new Error(detailFrom(res, payload));
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- users ----------------------------------------------------------------
export const listUsers = () => request("/users");

// ---- tickets ----------------------------------------------------------------
export const listTickets = () => request("/tickets");
export const getTicket = (id) => request(`/tickets/${encodeURIComponent(id)}`);
export const createTicket = (body) => request("/tickets", { method: "POST", body });
export const addReply = (id, body) =>
  request(`/tickets/${encodeURIComponent(id)}/replies`, { method: "POST", body });
export const updateStatus = (id, body) =>
  request(`/tickets/${encodeURIComponent(id)}/status`, { method: "PATCH", body });
export const assignTicket = (id, body) =>
  request(`/tickets/${encodeURIComponent(id)}/assignee`, { method: "PATCH", body });
export const setPriority = (id, body) =>
  request(`/tickets/${encodeURIComponent(id)}/priority`, { method: "PATCH", body });
export const setCategory = (id, body) =>
  request(`/tickets/${encodeURIComponent(id)}/category`, { method: "PATCH", body });

// ---- attachments ------------------------------------------------------------
export const uploadAttachment = (id, file) => {
  const form = new FormData();
  form.append("file", file);
  return request(`/tickets/${encodeURIComponent(id)}/attachment`, { method: "POST", form });
};
export const getAttachmentUrl = (id) =>
  request(`/tickets/${encodeURIComponent(id)}/attachment`); // { name, size, url, expiresInSeconds }