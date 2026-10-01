"""Request models + response serializers.

Serializers convert snake_case Supabase rows into the exact camelCase shape the
frontend's `src/data/store.js` works with, so the API layer can be dropped in
without touching UI code.
"""
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

CATEGORIES = ["Payroll", "Leave", "Benefits", "Onboarding", "Policy", "Other"]
PRIORITIES = ["Low", "Medium", "High", "Urgent"]
STATUSES = ["Open", "In Progress", "Waiting on Employee", "Resolved", "Closed"]

AGENT_PICKUP_TEXT = (
    "Thanks for raising this — I've picked it up and will get back to you shortly."
)


class CamelModel(BaseModel):
    """Accepts camelCase keys from the frontend, exposes python fields."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TicketCreate(CamelModel):
    employee_id: str
    category: Literal["Payroll", "Leave", "Benefits", "Onboarding", "Policy", "Other"]
    subject: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=20, max_length=10_000)
    priority: Literal["Low", "Medium", "High", "Urgent"] = "Medium"


class ReplyCreate(CamelModel):
    author_id: str
    text: str = Field(min_length=1, max_length=5_000)


class StatusUpdate(CamelModel):
    status: Literal["Open", "In Progress", "Waiting on Employee", "Resolved", "Closed"]
    actor_id: str


class AssigneeUpdate(CamelModel):
    assignee_id: Optional[str] = None


class PriorityUpdate(CamelModel):
    priority: Literal["Low", "Medium", "High", "Urgent"]


class CategoryUpdate(CamelModel):
    category: Literal["Payroll", "Leave", "Benefits", "Onboarding", "Policy", "Other"]


# ---------------------------------------------------------------------------
# Serializers (Supabase row -> API/frontend shape)
# ---------------------------------------------------------------------------

def turn_out(r: dict) -> dict:
    return {
        "authorId": r["author_id"],
        "role": r["author_role"],
        "text": r["body"],
        "at": r["created_at"],
    }


def user_out(u: dict) -> dict:
    return {"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"]}


def attachment_out(row: dict) -> Optional[dict]:
    if not row.get("attachment_path"):
        return None
    return {
        "name": row.get("attachment_name"),
        "size": row.get("attachment_size"),
        "path": row["attachment_path"],
        "url": None,  # filled in by /tickets/{id}/attachment (signed URL)
    }


def ticket_out(row: dict, replies: list[dict]) -> dict:
    """Shape matches the mock ticket objects in src/data/tickets.js."""
    return {
        "id": row["ref"],  # e.g. "TKT-101" — what the frontend uses in URLs
        "uuid": row["id"],  # raw Postgres uuid, mostly for admin/debugging
        "employeeId": row["employee_id"],
        "category": row["category"],
        "subject": row["subject"],
        "description": row["description"],
        "priority": row["priority"],
        "status": row["status"],
        "assigneeId": row.get("assignee_id"),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "firstReplyAt": row.get("first_reply_at"),
        "resolvedAt": row.get("resolved_at"),
        "closedBy": row.get("closed_by"),
        "turns": [turn_out(r) for r in (replies or [])],
        "attachment": attachment_out(row),
    }