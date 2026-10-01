"""Attachment upload (Supabase Storage) + signed-url lookup."""
import os
import uuid as uuidlib

from fastapi import APIRouter, HTTPException, UploadFile

from app.config import ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, SIGNED_URL_TTL, SUPABASE_URL, get_client
from app.routers.tickets_core import _update_and_return, fetch_row

router = APIRouter(prefix="/tickets", tags=["attachments"])


def _sb():
    return get_client()


@router.post("/{tid}/attachment")
def upload_attachment(tid: str, file: UploadFile):
    """POST /tickets/{id}/attachment — multipart upload, <=5 MB, one file per
    ticket (re-upload replaces the previous attachment)."""
    if not file.filename:
        raise HTTPException(status_code=422, detail="No file provided")

    row = fetch_row(tid)
    data = file.file.read()
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is larger than {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB",
        )

    ext = os.path.splitext(file.filename)[1][:16] or ".bin"
    path = f"{row['ref']}/{uuidlib.uuid4().hex}{ext}"
    storage = _sb().storage.from_(ATTACHMENT_BUCKET)
    try:
        storage.upload(
            path,
            data,
            {"contentType": file.content_type or "application/octet-stream", "upsert": "false"},
        )
    except Exception as e:  # storage3 raises generic StorageException
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {e}")

    return _update_and_return(tid, {
        "attachment_path": path,
        "attachment_name": file.filename,
        "attachment_size": len(data),
    })


@router.get("/{tid}/attachment")
def attachment_url(tid: str, ttl: int = SIGNED_URL_TTL):
    """GET /tickets/{id}/attachment — short-lived signed URL for the file.

    The bucket is private; the backend (service key) signs the URL on demand.
    """
    row = fetch_row(tid)
    if not row.get("attachment_path"):
        raise HTTPException(status_code=404, detail="Ticket has no attachment")

    storage = _sb().storage.from_(ATTACHMENT_BUCKET)
    try:
        res = storage.create_signed_url(row["attachment_path"], max(60, min(ttl, 86400)))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not sign URL: {e}")

    url = res.get("signedURL") or res.get("signedUrl") or ""
    if url and not url.startswith("http"):
        url = f"{SUPABASE_URL}/storage/v1{url}"

    return {
        "name": row.get("attachment_name"),
        "size": row.get("attachment_size"),
        "url": url,
        "expiresInSeconds": SIGNED_URL_TTL,
    }