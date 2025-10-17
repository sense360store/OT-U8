from __future__ import annotations

from http import HTTPStatus

from ..auth import require_auth
from ..db import db, row_to_dict
from ..http import Request, Response, error_response, json_response
from ..rbac import role_can_manage_members


def get_teams(request: Request) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    teams = []
    for team in auth.teams:
        teams.append({"team_id": team["team_id"], "name": team["name"], "role": auth.memberships.get(team["team_id"])})
    return json_response({"teams": teams, "profile_id": auth.profile_id, "email": auth.email, "display_name": auth.display_name})


def get_members(request: Request, team_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    try:
        role = auth.memberships[team_id]
    except KeyError:
        return error_response("Not a member of this team", HTTPStatus.FORBIDDEN)
    rows = db.query(
        "SELECT team_members.id, team_members.role, team_members.joined_at, profiles.display_name, profiles.email FROM team_members JOIN profiles ON profiles.id = team_members.profile_id WHERE team_members.team_id = ?",
        (team_id,),
    )
    members = [row_to_dict(row) for row in rows]
    return json_response({"members": members, "role": role})


def update_member(request: Request, team_id: int, member_id: int) -> Response:
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
    new_role = payload.get("role")
    if new_role not in {"manager", "coach", "player"}:
        return error_response("Invalid role")
    db.execute("UPDATE team_members SET role = ? WHERE id = ? AND team_id = ?", (new_role, member_id, team_id))
    return json_response({"status": "updated"})


def delete_member(request: Request, team_id: int, member_id: int) -> Response:
    auth = require_auth(request)
    if isinstance(auth, Response):
        return auth
    role = auth.memberships.get(team_id)
    if not role or not role_can_manage_members(role):
        return error_response("Managers only", HTTPStatus.FORBIDDEN)
    db.execute("DELETE FROM team_members WHERE id = ? AND team_id = ?", (member_id, team_id))
    return json_response({"status": "removed"})
