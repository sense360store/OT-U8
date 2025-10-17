from __future__ import annotations

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.db import current_timestamp, db

TEAMS = [
    ("Titans", "TITANS_MANAGER_EMAIL"),
    ("Trojans", "TROJANS_MANAGER_EMAIL"),
    ("Gladiators", "GLADIATORS_MANAGER_EMAIL"),
    ("Spartans", "SPARTANS_MANAGER_EMAIL"),
    ("Argonauts", "ARGONAUTS_MANAGER_EMAIL"),
]


def ensure_team(name: str) -> int:
    row = db.query("SELECT id FROM teams WHERE name = ?", (name,))
    if row:
        return row[0]["id"]
    now = current_timestamp()
    cursor = db.execute("INSERT INTO teams(name, created_at, updated_at) VALUES (?, ?, ?)", (name, now, now))
    return cursor.lastrowid


def ensure_manager(email: str, team_id: int) -> None:
    if not email:
        return
    email = email.strip().lower()
    now = current_timestamp()
    profile_rows = db.query("SELECT id FROM profiles WHERE email = ?", (email,))
    if profile_rows:
        profile_id = profile_rows[0]["id"]
    else:
        cursor = db.execute(
            "INSERT INTO profiles(email, created_at, updated_at) VALUES (?, ?, ?)",
            (email, now, now),
        )
        profile_id = cursor.lastrowid
    member_rows = db.query("SELECT id FROM team_members WHERE team_id = ? AND profile_id = ?", (team_id, profile_id))
    if member_rows:
        db.execute("UPDATE team_members SET role = 'manager' WHERE id = ?", (member_rows[0]["id"],))
    else:
        db.execute(
            "INSERT INTO team_members(team_id, profile_id, role, joined_at) VALUES (?, ?, 'manager', ?)",
            (team_id, profile_id, now),
        )


def main() -> None:
    db.migrate()
    for team_name, env_key in TEAMS:
        team_id = ensure_team(team_name)
        ensure_manager(os.getenv(env_key, ""), team_id)
    print("Seed completed")


if __name__ == "__main__":
    main()
