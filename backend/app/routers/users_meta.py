"""Users + static meta endpoints (replaces src/data/users.js mocks)."""
from fastapi import APIRouter

from app.config import get_client
from app.models import CATEGORIES, PRIORITIES, STATUSES, user_out
from app.routers.tickets_core import rows_of

router = APIRouter(tags=["users"])


def _order_by_role(role: str) -> list[dict]:
    return rows_of(
        get_client().table("users").select("*").eq("role", role).order("created_at")
    )


@router.get("/users")
def list_users():
    return [user_out(u) for u in (_order_by_role("employee") + _order_by_role("agent"))]


@router.get("/users/agents")
def list_agents():
    return [user_out(u) for u in _order_by_role("agent")]


@router.get("/meta")
def meta():
    return {"categories": CATEGORIES, "priorities": PRIORITIES, "statuses": STATUSES}