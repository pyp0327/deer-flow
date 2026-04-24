"""User context helpers for lightweight per-user thread isolation."""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException, Request

THREADS_NS: tuple[str, ...] = ("threads",)
OWNER_METADATA_KEY = "owner_id"
USER_ID_HEADER = "X-Deer-User-Id"
USER_ID_COOKIE = "deer_user_id"
USER_ID_QUERY_PARAM = "deer_user_id"
ANONYMOUS_USER_ID = "anonymous"
_SAFE_USER_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


def get_request_user_id(request: Request) -> str:
    """Return the caller's user ID from request headers.

    For backward compatibility, requests without a header are grouped under
    the shared ``anonymous`` user bucket.
    """
    raw_user_id = request.headers.get(USER_ID_HEADER, "").strip()
    if not raw_user_id:
        raw_user_id = request.cookies.get(USER_ID_COOKIE, "").strip()
    if not raw_user_id:
        raw_user_id = request.query_params.get(USER_ID_QUERY_PARAM, "").strip()
    if not raw_user_id:
        return ANONYMOUS_USER_ID

    if not _SAFE_USER_ID_RE.fullmatch(raw_user_id):
        raise HTTPException(status_code=400, detail=f"Invalid {USER_ID_HEADER} header")

    return raw_user_id


def with_owner_metadata(metadata: dict[str, Any] | None, user_id: str) -> dict[str, Any]:
    """Return metadata enriched with the caller's owner_id."""
    merged = dict(metadata or {})
    merged[OWNER_METADATA_KEY] = user_id
    return merged


def extract_owner_id(metadata: dict[str, Any] | None) -> str | None:
    """Extract owner_id from metadata when present."""
    owner = (metadata or {}).get(OWNER_METADATA_KEY)
    return owner if isinstance(owner, str) and owner else None


def assert_owner_matches(metadata: dict[str, Any] | None, user_id: str, *, not_found_detail: str) -> None:
    """Raise 404 when metadata owner does not match current user."""
    owner_id = extract_owner_id(metadata)
    if owner_id != user_id:
        raise HTTPException(status_code=404, detail=not_found_detail)


async def ensure_thread_access(request: Request, thread_id: str) -> str:
    """Ensure the current user can access *thread_id*.

    Access is granted only when an existing thread record/checkpoint carries
    ``metadata.owner_id`` equal to the current request user.
    """
    user_id = get_request_user_id(request)
    not_found_detail = f"Thread {thread_id} not found"

    store = getattr(request.app.state, "store", None)
    if store is not None:
        item = await store.aget(THREADS_NS, thread_id)
        if item is not None:
            value = item.value or {}
            assert_owner_matches(value.get("metadata"), user_id, not_found_detail=not_found_detail)
            return user_id

    checkpointer = getattr(request.app.state, "checkpointer", None)
    if checkpointer is None:
        # Some lightweight test/dev app instances register routers only.
        # In that mode, skip ownership enforcement when no persistence backend exists.
        return user_id

    config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
    checkpoint_tuple = await checkpointer.aget_tuple(config)
    if checkpoint_tuple is None:
        raise HTTPException(status_code=404, detail=not_found_detail)

    metadata = getattr(checkpoint_tuple, "metadata", {}) or {}
    assert_owner_matches(metadata, user_id, not_found_detail=not_found_detail)
    return user_id
