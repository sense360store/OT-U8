from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .config import settings


@dataclass
class Migration:
    version: str
    path: Path


class Database:
    def __init__(self, path: str):
        self.path = path
        self._connection: sqlite3.Connection | None = None

    @property
    def connection(self) -> sqlite3.Connection:
        if self._connection is None:
            needs_init = not Path(self.path).exists()
            self._connection = sqlite3.connect(self.path, detect_types=sqlite3.PARSE_DECLTYPES)
            self._connection.row_factory = sqlite3.Row
            self._connection.execute("PRAGMA foreign_keys = ON")
        return self._connection

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def execute(self, sql: str, params: Iterable[Any] | None = None) -> sqlite3.Cursor:
        cur = self.connection.cursor()
        cur.execute(sql, tuple(params or []))
        self.connection.commit()
        return cur

    def query(self, sql: str, params: Iterable[Any] | None = None) -> list[sqlite3.Row]:
        cur = self.connection.cursor()
        cur.execute(sql, tuple(params or []))
        rows = cur.fetchall()
        return rows

    def migrate(self) -> None:
        migrations_dir = Path(__file__).parent.parent / "migrations"
        applied = {row["version"] for row in self.query("SELECT version FROM schema_migrations")} if self._has_schema_table() else set()
        for migration_file in sorted(migrations_dir.glob("*.sql")):
            version = migration_file.stem
            if version in applied:
                continue
            sql = migration_file.read_text()
            statements = [stmt.strip() for stmt in sql.split(";\n") if stmt.strip()]
            for statement in statements:
                self.execute(statement)
            self.execute("INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)", (version, current_timestamp()))

    def _has_schema_table(self) -> bool:
        cur = self.connection.cursor()
        cur.execute("""
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'schema_migrations'
        """)
        exists = cur.fetchone() is not None
        if not exists:
            self.connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
            )
            self.connection.commit()
        return True


def current_timestamp() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def serialize_payload(payload: dict[str, Any] | None) -> str | None:
    if payload is None:
        return None
    return json.dumps(payload, separators=(",", ":"))


db = Database(settings.database_path)
