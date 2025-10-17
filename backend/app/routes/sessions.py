from __future__ import annotations

from datetime import timedelta
from http import HTTPStatus
from typing import Any

from ..auth import require_auth
from ..db import current_timestamp, db, row_to_dict
from ..http import Request, Response, error_response, json_response
from ..rbac import role_allows_session_management
from ..services.activity import log_action
from ..services.notifications import send_email
from ..utils.time import parse_iso8601, utc_now

SESSION_MUTABLE_FIELDS = {"title", "description", "location", "start_at", "end_at", "is_locked", "auto_lock_minutes"}


def session_is_locked(session: dict[str, Any]) -> bool:
    if session.get("is_locked"):
        return True
    auto_lock = session.get("auto_lock_minutes")
    if auto_lock is None:
        return False
    try:
        start = parse_iso8601(session["start_at"])
    except (KeyError, ValueError):
        return False
    return utc_now() >= start - timedelta(minutes=int(auto_lock))


def list_sessions(request: Request, team_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    if team_id not in auth.memberships:
        return error_response("Team access denied", HTTPStatus.FORBIDDEN)
    rows = db.query("SELECT * FROM sessions WHERE team_id = ? ORDER BY start_at", (team_id,))
    sessions = []
    for row in rows:
        session = row_to_dict(row)
        session["is_effectively_locked"] = session_is_locked(session)
        sessions.append(session)
    return json_response({"sessions": sessions})


def get_session(request: Request, team_id: int, session_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    if team_id not in auth.memberships:
        return error_response("Team access denied", HTTPStatus.FORBIDDEN)
    row = db.query("SELECT * FROM sessions WHERE id = ? AND team_id = ?", (session_id, team_id))
    if not row:
        return error_response("Session not found", HTTPStatus.NOT_FOUND)
    session = row_to_dict(row[0])
    session["is_effectively_locked"] = session_is_locked(session)
    return json_response(session)


def create_session(request: Request, team_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    role = auth.memberships.get(team_id)
    if not role or not role_allows_session_management(role):
        return error_response("Only managers can create sessions", HTTPStatus.FORBIDDEN)
    try:
        payload = request.json()
    except ValueError as exc:
        return error_response(str(exc))
    required = {"title", "start_at", "end_at"}
    missing = [field for field in required if not payload.get(field)]
    if missing:
        return error_response(f"Missing fields: {', '.join(missing)}")
    try:
        parse_iso8601(payload["start_at"])
        parse_iso8601(payload["end_at"])
    except ValueError:
        return error_response("Invalid datetime format")
    session_values = {field: payload.get(field) for field in SESSION_MUTABLE_FIELDS}
    now = current_timestamp()
    cursor = db.execute(
        "INSERT INTO sessions(team_id, title, description, location, start_at, end_at, is_locked, auto_lock_minutes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            team_id,
            session_values.get("title"),
            session_values.get("description"),
            session_values.get("location"),
            session_values.get("start_at"),
            session_values.get("end_at"),
            1 if session_values.get("is_locked") else 0,
            session_values.get("auto_lock_minutes"),
            auth.profile_id,
            now,
            now,
        ),
    )
    session_id = cursor.lastrowid
    log_action(team_id, auth.profile_id, "created", "session", session_id, {"title": session_values.get("title")})
    send_email(
        subject="New session scheduled",
        body=f"A session titled {session_values.get('title')} was scheduled.",
        recipients=[member_row["email"] for member_row in db.query(
            "SELECT profiles.email FROM team_members JOIN profiles ON profiles.id = team_members.profile_id WHERE team_members.team_id = ?",
            (team_id,),
        ) if member_row["email"]],
    )
    return json_response({"session_id": session_id}, status=HTTPStatus.CREATED)


def update_session(request: Request, team_id: int, session_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    role = auth.memberships.get(team_id)
    if not role or not role_allows_session_management(role):
        return error_response("Only managers can update sessions", HTTPStatus.FORBIDDEN)
    row = db.query("SELECT * FROM sessions WHERE id = ? AND team_id = ?", (session_id, team_id))
    if not row:
        return error_response("Session not found", HTTPStatus.NOT_FOUND)
    session = row_to_dict(row[0])
    if session_is_locked(session):
        return error_response("Session is locked", HTTPStatus.FORBIDDEN)
    try:
        payload = request.json()
    except ValueError as exc:
        return error_response(str(exc))
    updates = []
    values = []
    for field in SESSION_MUTABLE_FIELDS:
        if field in payload:
            if field in {"start_at", "end_at"}:
                try:
                    parse_iso8601(payload[field])
                except ValueError:
                    return error_response(f"Invalid datetime for {field}")
            updates.append(f"{field} = ?")
            if field == "is_locked":
                values.append(1 if payload[field] else 0)
            else:
                values.append(payload[field])
    if not updates:
        return json_response({"status": "no_changes"})
    values.extend([current_timestamp(), session_id, team_id])
    db.execute(
        f"UPDATE sessions SET {', '.join(updates)}, updated_at = ? WHERE id = ? AND team_id = ?",
        values,
    )
    log_action(team_id, auth.profile_id, "updated", "session", session_id, payload)
    return json_response({"status": "updated"})


def delete_session(request: Request, team_id: int, session_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    role = auth.memberships.get(team_id)
    if not role or not role_allows_session_management(role):
        return error_response("Only managers can delete sessions", HTTPStatus.FORBIDDEN)
    row = db.query("SELECT * FROM sessions WHERE id = ? AND team_id = ?", (session_id, team_id))
    if not row:
        return error_response("Session not found", HTTPStatus.NOT_FOUND)
    session = row_to_dict(row[0])
    if session_is_locked(session):
        return error_response("Session is locked", HTTPStatus.FORBIDDEN)
    db.execute("DELETE FROM sessions WHERE id = ? AND team_id = ?", (session_id, team_id))
    log_action(team_id, auth.profile_id, "deleted", "session", session_id, {"title": session.get("title")})
    return json_response({"status": "deleted"})
