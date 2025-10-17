from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any

from .config import settings
from .db import current_timestamp, db, row_to_dict
from .http import Request, Response, error_response, json_response
from .utils.time import format_iso8601, parse_iso8601, utc_now

ALLOWED_ROLES = {"manager", "coach", "player"}


@dataclass
class AuthContext:
    profile_id: int
    email: str
    display_name: str | None
    teams: list[dict[str, Any]]
    memberships: dict[int, str]


class AuthError(Exception):
    pass


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def base64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def sign_payload(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(settings.app_secret.encode("utf-8"), encoded, hashlib.sha256).hexdigest()
    return f"{base64url_encode(encoded)}.{signature}"


def verify_token(token: str) -> dict[str, Any]:
    try:
        encoded, signature = token.split(".")
    except ValueError as exc:
        raise AuthError("Invalid token format") from exc
    payload_bytes = base64url_decode(encoded)
    expected_signature = hmac.new(settings.app_secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_signature, signature):
        raise AuthError("Invalid token signature")
    payload = json.loads(payload_bytes.decode("utf-8"))
    return payload


def issue_access_token(profile_id: int) -> str:
    raw_token = secrets.token_urlsafe(48)
    db.execute(
        "INSERT INTO access_tokens(profile_id, token, issued_at) VALUES (?, ?, ?)",
        (profile_id, raw_token, current_timestamp()),
    )
    payload = {"token": raw_token, "issued_at": format_iso8601(utc_now())}
    return sign_payload(payload)


def resolve_access_token(token: str) -> dict[str, Any]:
    payload = verify_token(token)
    raw_token = payload.get("token")
    if not raw_token:
        raise AuthError("Token missing inner value")
    row = db.query("SELECT access_tokens.*, profiles.email, profiles.display_name FROM access_tokens JOIN profiles ON profiles.id = access_tokens.profile_id WHERE token = ?", (raw_token,))
    if not row:
        raise AuthError("Token revoked")
    db.execute("UPDATE access_tokens SET last_used_at = ? WHERE token = ?", (current_timestamp(), raw_token))
    record = row_to_dict(row[0])
    memberships = db.query("SELECT team_members.team_id, team_members.role, teams.name FROM team_members JOIN teams ON teams.id = team_members.team_id WHERE team_members.profile_id = ?", (record["profile_id"],))
    membership_map = {m["team_id"]: m["role"] for m in memberships}
    teams = [row_to_dict(m) for m in memberships]
    return {
        "profile_id": record["profile_id"],
        "email": record["email"],
        "display_name": record.get("display_name"),
        "memberships": membership_map,
        "teams": teams,
    }


def require_auth(request: Request) -> AuthContext | Response:
    header = request.headers.get("Authorization")
    if not header or not header.startswith("Bearer "):
        return error_response("Missing authorization", HTTPStatus.UNAUTHORIZED)
    token = header.split(" ", 1)[1]
    try:
        payload = resolve_access_token(token)
    except AuthError as exc:
        return error_response(str(exc), HTTPStatus.UNAUTHORIZED)
    return AuthContext(
        profile_id=payload["profile_id"],
        email=payload["email"],
        display_name=payload.get("display_name"),
        teams=payload["teams"],
        memberships=payload["memberships"],
    )


def enforce_team_access(context: AuthContext, team_id: int) -> str:
    if team_id not in context.memberships:
        raise AuthError("You do not have access to this team")
    return context.memberships[team_id]


def onboarding_from_invite(email: str, invite_row: dict[str, Any], profile_payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
    now = current_timestamp()
    profile = db.query("SELECT * FROM profiles WHERE email = ?", (email,))
    if profile:
        profile_id = profile[0]["id"]
        db.execute(
            "UPDATE profiles SET display_name = COALESCE(?, display_name), phone = COALESCE(?, phone), guardian_name = COALESCE(?, guardian_name), updated_at = ? WHERE id = ?",
            (
                profile_payload.get("display_name"),
                profile_payload.get("phone"),
                profile_payload.get("guardian_name"),
                now,
                profile_id,
            ),
        )
    else:
        cursor = db.execute(
            "INSERT INTO profiles(email, display_name, phone, guardian_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                email,
                profile_payload.get("display_name"),
                profile_payload.get("phone"),
                profile_payload.get("guardian_name"),
                now,
                now,
            ),
        )
        profile_id = cursor.lastrowid
    member = db.query("SELECT * FROM team_members WHERE team_id = ? AND profile_id = ?", (invite_row["team_id"], profile_id))
    if not member:
        db.execute(
            "INSERT INTO team_members(team_id, profile_id, role, joined_at) VALUES (?, ?, ?, ?)",
            (invite_row["team_id"], profile_id, invite_row["role"], now),
        )
    else:
        db.execute(
            "UPDATE team_members SET role = ? WHERE id = ?",
            (invite_row["role"], member[0]["id"]),
        )
    db.execute("UPDATE invites SET accepted_at = ?, expires_at = ? WHERE id = ?", (now, invite_row["expires_at"], invite_row["id"]))
    issued_token = issue_access_token(profile_id)
    memberships = db.query(
        "SELECT team_members.team_id, team_members.role, teams.name FROM team_members JOIN teams ON teams.id = team_members.team_id WHERE team_members.profile_id = ?",
        (profile_id,),
    )
    teams = [row_to_dict(row) for row in memberships]
    membership_map = {row["team_id"]: row["role"] for row in memberships}
    profile_row = db.query("SELECT * FROM profiles WHERE id = ?", (profile_id,))[0]
    return {
        "profile": row_to_dict(profile_row),
        "teams": teams,
        "memberships": membership_map,
        "token": issued_token,
    }, issued_token


def handle_magic_login(request: Request) -> Response:
    try:
        payload = request.json()
    except ValueError as exc:
        return error_response(str(exc))
    email = payload.get("email", "").strip().lower()
    invite_code = payload.get("invite_code", "").strip()
    season_code = payload.get("season_code")
    profile_payload = payload.get("profile", {})
    if not email or not invite_code:
        return error_response("Email and invite code are required")
    if settings.season_access_code and settings.season_access_code != season_code:
        return error_response("Season access code is invalid", HTTPStatus.FORBIDDEN)
    invite_rows = db.query(
        "SELECT invites.*, teams.name as team_name FROM invites JOIN teams ON teams.id = invites.team_id WHERE invites.email = ? AND invites.code = ?",
        (email, invite_code),
    )
    if not invite_rows:
        return error_response("Invite not found", HTTPStatus.NOT_FOUND)
    invite_row = row_to_dict(invite_rows[0])
    if invite_row["accepted_at"]:
        # allow re-login but ensure membership
        pass
    expires_at = invite_row.get("expires_at")
    if expires_at:
        if parse_iso8601(expires_at) < utc_now():
            return error_response("Invite expired", HTTPStatus.GONE)
    if invite_row["role"] not in ALLOWED_ROLES:
        return error_response("Invalid role on invite", HTTPStatus.BAD_REQUEST)
    onboarding_result, token = onboarding_from_invite(email, invite_row, profile_payload)
    return json_response(onboarding_result)
