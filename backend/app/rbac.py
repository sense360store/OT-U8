from __future__ import annotations

from http import HTTPStatus

from .auth import AuthContext, AuthError, enforce_team_access
from .http import Response, error_response


def require_team_role(context: AuthContext, team_id: int, allowed_roles: set[str]) -> Response | None:
    try:
        role = enforce_team_access(context, team_id)
    except AuthError as exc:
        return error_response(str(exc), HTTPStatus.FORBIDDEN)
    if role not in allowed_roles:
        return error_response("Insufficient permissions", HTTPStatus.FORBIDDEN)
    return None


def role_allows_session_management(role: str) -> bool:
    return role == "manager"


def role_allows_rsvp_management(role: str) -> bool:
    return role in {"manager", "coach", "player"}


def role_can_manage_members(role: str) -> bool:
    return role == "manager"
