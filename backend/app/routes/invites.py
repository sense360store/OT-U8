from __future__ import annotations

import secrets
from datetime import timedelta
from http import HTTPStatus

from ..auth import require_auth
from ..config import settings
from ..db import current_timestamp, db, row_to_dict
from ..http import Request, Response, error_response, json_response
from ..rbac import role_can_manage_members
from ..services.notifications import send_email
from ..utils.time import format_iso8601, utc_now


def list_invites(request: Request, team_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    role = auth.memberships.get(team_id)
    if not role or not role_can_manage_members(role):
        return error_response("Managers only", HTTPStatus.FORBIDDEN)
    rows = db.query("SELECT * FROM invites WHERE team_id = ?", (team_id,))
    invites = [row_to_dict(row) for row in rows]
    return json_response({"invites": invites})


def create_invite(request: Request, team_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    role = auth.memberships.get(team_id)
    if not role or not role_can_manage_members(role):
        return error_response("Managers only", HTTPStatus.FORBIDDEN)
    try:
        payload = request.json()
    except ValueError as exc:
        return error_response(str(exc))
    email = payload.get("email", "").strip().lower()
    invite_role = payload.get("role", "player")
    if invite_role not in {"manager", "coach", "player"}:
        return error_response("Invalid role")
    if not email:
        return error_response("Email required")
    code = secrets.token_urlsafe(6)
    expires_at = format_iso8601(utc_now() + settings.invite_ttl)
    db.execute(
        "INSERT OR REPLACE INTO invites(team_id, email, role, code, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            team_id,
            email,
            invite_role,
            code,
            auth.profile_id,
            current_timestamp(),
            expires_at,
        ),
    )
    invite_link = f"{settings.base_url}/accept?code={code}&team_id={team_id}&email={email}"
    send_email(
        subject=f"OTJ U8s invite to {invite_role} team",
        body=f"You've been invited to join team {team_id}. Use code {code} or visit {invite_link}",
        recipients=[email],
    )
    return json_response({"status": "created", "code": code, "expires_at": expires_at})


def revoke_invite(request: Request, team_id: int, invite_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    role = auth.memberships.get(team_id)
    if not role or not role_can_manage_members(role):
        return error_response("Managers only", HTTPStatus.FORBIDDEN)
    db.execute("DELETE FROM invites WHERE id = ? AND team_id = ?", (invite_id, team_id))
    return json_response({"status": "revoked"})
