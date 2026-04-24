from fastapi import HTTPException
from starlette.requests import Request

from app.gateway.user_context import (
    ANONYMOUS_USER_ID,
    USER_ID_COOKIE,
    USER_ID_HEADER,
    USER_ID_QUERY_PARAM,
    assert_owner_matches,
    get_request_user_id,
    with_owner_metadata,
)


def _make_request(headers: list[tuple[bytes, bytes]] | None = None, query_string: bytes = b"") -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": headers or [],
            "query_string": query_string,
        }
    )


def test_get_request_user_id_prefers_header():
    request = _make_request(
        headers=[
            (USER_ID_HEADER.lower().encode("ascii"), b"user-from-header"),
            (b"cookie", f"{USER_ID_COOKIE}=user-from-cookie".encode("ascii")),
        ],
        query_string=f"{USER_ID_QUERY_PARAM}=user-from-query".encode("ascii"),
    )
    assert get_request_user_id(request) == "user-from-header"


def test_get_request_user_id_uses_cookie_when_header_missing():
    request = _make_request(headers=[(b"cookie", f"{USER_ID_COOKIE}=cookie-user".encode("ascii"))])
    assert get_request_user_id(request) == "cookie-user"


def test_get_request_user_id_uses_query_when_cookie_missing():
    request = _make_request(query_string=f"{USER_ID_QUERY_PARAM}=query-user".encode("ascii"))
    assert get_request_user_id(request) == "query-user"


def test_get_request_user_id_falls_back_to_anonymous():
    request = _make_request()
    assert get_request_user_id(request) == ANONYMOUS_USER_ID


def test_get_request_user_id_rejects_invalid_chars():
    request = _make_request(headers=[(USER_ID_HEADER.lower().encode("ascii"), b"bad id!")])
    try:
        get_request_user_id(request)
        raise AssertionError("Expected HTTPException")
    except HTTPException as exc:
        assert exc.status_code == 400


def test_with_owner_metadata_always_overrides_owner():
    metadata = with_owner_metadata({"owner_id": "old", "k": "v"}, "new-user")
    assert metadata["owner_id"] == "new-user"
    assert metadata["k"] == "v"


def test_assert_owner_matches_raises_404_on_mismatch():
    try:
        assert_owner_matches({"owner_id": "u1"}, "u2", not_found_detail="Thread missing")
        raise AssertionError("Expected HTTPException")
    except HTTPException as exc:
        assert exc.status_code == 404
