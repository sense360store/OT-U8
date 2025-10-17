from __future__ import annotations

from typing import Any

from ..db import current_timestamp, db, serialize_payload


def log_action(team_id: int, profile_id: int | None, action: str, entity_type: str, entity_id: int | None, payload: dict[str, Any] | None = None) -> None:
    db.execute(
        "INSERT INTO activity_logs(team_id, profile_id, action, entity_type, entity_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            team_id,
            profile_id,
            action,
            entity_type,
            entity_id,
            serialize_payload(payload),
            current_timestamp(),
        ),
    )
