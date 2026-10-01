"""HR Desk API — FastAPI entrypoint.

Run:
    uvicorn app.main:app --reload --port 8000
Docs at http://localhost:8000/docs
"""
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import CORS_ORIGINS
from app.routers import attachments, tickets_actions, tickets_core, users_meta

app = FastAPI(
    title="HR Desk API",
    description="Ticketing backend for the Emids HR Desk frontend (Supabase Postgres + Storage).",
    version="0.1.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# /api mount: frontend will call e.g. http://localhost:8000/api/tickets
app.include_router(tickets_core.router, prefix="/api")
app.include_router(tickets_actions.router, prefix="/api")
app.include_router(attachments.router, prefix="/api")
app.include_router(users_meta.router, prefix="/api")


@app.get("/health")
def health():
    """Liveness only — does not touch Supabase."""
    return {"ok": True}


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    """Dev handler: any uncaught server error returns readable JSON instead of
    a bare 500, and still prints the full traceback to the console."""
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"error": type(exc).__name__, "detail": str(exc)},
    )