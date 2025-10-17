from __future__ import annotations

import logging
from http import HTTPStatus
from wsgiref.simple_server import make_server

from .auth import handle_magic_login
from .config import settings
from .db import db
from .http import Request, Response, error_response, router
from .routes import invites, rsvps, sessions, teams

logger = logging.getLogger("otj_u8s")

_routes_registered = False


def register_routes() -> None:
    global _routes_registered
    if _routes_registered:
        return
    router.add("POST", "/auth/magic-link", lambda request: handle_magic_login(request))

    router.add("GET", "/teams", teams.get_teams)
    router.add("GET", "/teams/:team_id/members", lambda request, team_id: teams.get_members(request, int(team_id)))
    router.add("PATCH", "/teams/:team_id/members/:member_id", lambda request, team_id, member_id: teams.update_member(request, int(team_id), int(member_id)))
    router.add("DELETE", "/teams/:team_id/members/:member_id", lambda request, team_id, member_id: teams.delete_member(request, int(team_id), int(member_id)))

    router.add("GET", "/teams/:team_id/invites", lambda request, team_id: invites.list_invites(request, int(team_id)))
    router.add("POST", "/teams/:team_id/invites", lambda request, team_id: invites.create_invite(request, int(team_id)))
    router.add("DELETE", "/teams/:team_id/invites/:invite_id", lambda request, team_id, invite_id: invites.revoke_invite(request, int(team_id), int(invite_id)))

    router.add("GET", "/teams/:team_id/sessions", lambda request, team_id: sessions.list_sessions(request, int(team_id)))
    router.add("POST", "/teams/:team_id/sessions", lambda request, team_id: sessions.create_session(request, int(team_id)))
    router.add("GET", "/teams/:team_id/sessions/:session_id", lambda request, team_id, session_id: sessions.get_session(request, int(team_id), int(session_id)))
    router.add("PUT", "/teams/:team_id/sessions/:session_id", lambda request, team_id, session_id: sessions.update_session(request, int(team_id), int(session_id)))
    router.add("DELETE", "/teams/:team_id/sessions/:session_id", lambda request, team_id, session_id: sessions.delete_session(request, int(team_id), int(session_id)))

    router.add("GET", "/teams/:team_id/sessions/:session_id/rsvps", lambda request, team_id, session_id: rsvps.list_rsvps(request, int(team_id), int(session_id)))
    router.add("PUT", "/teams/:team_id/sessions/:session_id/rsvps/self", lambda request, team_id, session_id: rsvps.upsert_rsvp(request, int(team_id), int(session_id)))
    router.add("PUT", "/teams/:team_id/sessions/:session_id/rsvps/:profile_id", lambda request, team_id, session_id, profile_id: rsvps.upsert_rsvp(request, int(team_id), int(session_id), int(profile_id)))
    router.add("DELETE", "/teams/:team_id/sessions/:session_id/rsvps/:profile_id", lambda request, team_id, session_id, profile_id: rsvps.delete_rsvp(request, int(team_id), int(session_id), int(profile_id)))
    _routes_registered = True


def _select_cors_origin(request: Request) -> str | None:
    origin = request.headers.get("Origin")
    if not origin:
        return None
    allowed_origins = settings.cors_allowed_origins
    if "*" in allowed_origins:
        if settings.cors_allow_credentials:
            return origin
        return "*"
    if origin in allowed_origins:
        return origin
    return None


def _build_cors_headers(request: Request, include_preflight: bool = False) -> dict[str, str]:
    origin = _select_cors_origin(request)
    if origin is None:
        return {}
    headers: dict[str, str] = {"Access-Control-Allow-Origin": origin}
    if origin != "*":
        headers["Vary"] = "Origin"
    if settings.cors_allow_credentials:
        headers["Access-Control-Allow-Credentials"] = "true"
    allow_methods = ", ".join(settings.cors_allowed_methods)
    allow_headers = ", ".join(settings.cors_allowed_headers)
    if include_preflight:
        headers["Access-Control-Allow-Methods"] = allow_methods
        headers["Access-Control-Allow-Headers"] = allow_headers
    return headers


def _merge_headers(base_headers: list[tuple[str, str]], extra: dict[str, str]) -> list[tuple[str, str]]:
    headers: dict[str, str] = {}
    for key, value in base_headers:
        headers[key] = value
    for key, value in extra.items():
        if key.lower() == "vary" and key in headers:
            existing_values = {item.strip() for item in headers[key].split(",") if item.strip()}
            existing_values.update(item.strip() for item in value.split(",") if item.strip())
            headers[key] = ", ".join(sorted(existing_values))
        else:
            headers[key] = value
    return [(key, value) for key, value in headers.items()]


def _handle_preflight(request: Request) -> Response:
    headers = _build_cors_headers(request, include_preflight=True)
    if not headers:
        return error_response("CORS origin not allowed", HTTPStatus.FORBIDDEN)
    return Response(status=HTTPStatus.NO_CONTENT, body=None, headers=headers)


def application(environ, start_response):
    register_routes()
    request = Request(environ)
    if request.method == "OPTIONS":
        response = _handle_preflight(request)
    else:
        match = router.match(request.method, request.path)
        if match is None:
            response = error_response("Not found", HTTPStatus.NOT_FOUND)
        else:
            handler, params = match
            try:
                response = handler(request, **params)
            except Exception as exc:  # pylint: disable=broad-except
                logger.exception("Unhandled error: %s", exc)
                response = error_response("Server error", HTTPStatus.INTERNAL_SERVER_ERROR)
    status_code, headers, body = response.to_wsgi()
    if status_code < 400:
        cors_headers = _build_cors_headers(request, include_preflight=True)
        if cors_headers:
            headers = _merge_headers(headers, cors_headers)
    start_response(f"{status_code} {HTTPStatus(status_code).phrase}", headers)
    return [body]


def run(port: int = 8000) -> None:
    logging.basicConfig(level=logging.INFO)
    db.migrate()
    register_routes()
    with make_server("0.0.0.0", port, application) as server:
        logger.info("Server running on port %s", port)
        server.serve_forever()


if __name__ == "__main__":
    run()
