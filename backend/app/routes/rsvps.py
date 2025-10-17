from __future__ import annotations

from http import HTTPStatus
from ..auth import require_auth
from ..db import current_timestamp, db, row_to_dict
from ..http import Request, Response, error_response, json_response
from ..services.activity import log_action
from ..services.notifications import send_email
from ..utils.time import parse_iso8601, utc_now
from .sessions import session_is_locked

VALID_STATUSES = {"yes", "no", "maybe", "pending"}


def list_rsvps(request: Request, team_id: int, session_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    if team_id not in auth.memberships:
        return error_response("Team access denied", HTTPStatus.FORBIDDEN)
    rows = db.query(
        "SELECT rsvps.*, profiles.display_name, profiles.email FROM rsvps JOIN profiles ON profiles.id = rsvps.profile_id JOIN sessions ON sessions.id = rsvps.session_id WHERE sessions.team_id = ? AND sessions.id = ?",
        (team_id, session_id),
    )
    items = [row_to_dict(row) for row in rows]
    return json_response({"rsvps": items})


def upsert_rsvp(request: Request, team_id: int, session_id: int, target_profile_id: int | None = None) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    role = auth.memberships.get(team_id)
    if not role:
        return error_response("Team access denied", HTTPStatus.FORBIDDEN)
    session_rows = db.query("SELECT * FROM sessions WHERE id = ? AND team_id = ?", (session_id, team_id))
    if not session_rows:
        return error_response("Session not found", HTTPStatus.NOT_FOUND)
    session = row_to_dict(session_rows[0])
    if session_is_locked(session) or parse_iso8601(session["start_at"]) <= utc_now():
        return error_response("RSVP window closed", HTTPStatus.FORBIDDEN)
    try:
        payload = request.json()
    except ValueError as exc:
        return error_response(str(exc))
    status = payload.get("status", "").lower()
    note = (payload.get("note") or "").strip()
    if status not in VALID_STATUSES:
        return error_response("Invalid status")
    if target_profile_id is None:
        target_profile_id = auth.profile_id
    elif target_profile_id != auth.profile_id and role != "manager":
        return error_response("Managers may update other RSVPs only", HTTPStatus.FORBIDDEN)
    existing = db.query("SELECT * FROM rsvps WHERE session_id = ? AND profile_id = ?", (session_id, target_profile_id))
    now = current_timestamp()
    if existing:
        db.execute(
            "UPDATE rsvps SET status = ?, note = ?, updated_at = ? WHERE id = ?",
            (status, note, now, existing[0]["id"]),
        )
        action = "updated"
    else:
        db.execute(
            "INSERT INTO rsvps(session_id, profile_id, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, target_profile_id, status, note, now, now),
        )
        action = "created"
    log_action(team_id, auth.profile_id, action, "rsvp", session_id, {"status": status, "profile_id": target_profile_id})
    send_email(
        subject=f"RSVP {action}",
        body=f"RSVP for session {session.get('title')} set to {status}",
        recipients=[member["email"] for member in db.query(
            "SELECT profiles.email FROM team_members JOIN profiles ON profiles.id = team_members.profile_id WHERE team_members.team_id = ? AND team_members.role = 'manager'",
            (team_id,),
        ) if member["email"]],
    )
    return json_response({"status": action})


def delete_rsvp(request: Request, team_id: int, session_id: int, profile_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    role = auth.memberships.get(team_id)
    if not role:
        return error_response("Team access denied", HTTPStatus.FORBIDDEN)
    if profile_id != auth.profile_id and role != "manager":
        return error_response("Managers may remove other RSVPs only", HTTPStatus.FORBIDDEN)
    db.execute("DELETE FROM rsvps WHERE session_id = ? AND profile_id = ?", (session_id, profile_id))
    log_action(team_id, auth.profile_id, "deleted", "rsvp", session_id, {"profile_id": profile_id})
    return json_response({"status": "deleted"})
