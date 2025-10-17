import os
from dataclasses import dataclass
from datetime import timedelta


def env_bool(key: str, default: bool = False) -> bool:
    value = os.getenv(key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(key: str, default: int) -> int:
    value = os.getenv(key)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def env_list(key: str, default: tuple[str, ...]) -> tuple[str, ...]:
    value = os.getenv(key)
    if value is None:
        return default
    items = [item.strip() for item in value.split(",") if item.strip()]
    if not items:
        return default
    return tuple(items)


@dataclass(frozen=True)
class Settings:
    database_path: str = os.getenv("DATABASE_PATH", "./otj_u8.db")
    app_secret: str = os.getenv("APP_SECRET", "dev-secret")
    base_url: str = os.getenv("APP_BASE_URL", "http://localhost:8000")
    invite_ttl_hours: int = env_int("INVITE_TTL_HOURS", 120)
    session_lock_grace_minutes: int = env_int("SESSION_LOCK_GRACE_MINUTES", 5)
    season_access_code: str | None = os.getenv("SEASON_ACCESS_CODE")
    smtp_host: str | None = os.getenv("SMTP_HOST")
    smtp_port: int = env_int("SMTP_PORT", 587)
    smtp_username: str | None = os.getenv("SMTP_USERNAME")
    smtp_password: str | None = os.getenv("SMTP_PASSWORD")
    email_sender: str | None = os.getenv("EMAIL_SENDER")
    enable_email: bool = env_bool("ENABLE_EMAIL", False)
    # CORS configuration (comma-separated origins; use "*" to allow any origin)
    cors_allowed_origins: tuple[str, ...] = env_list("CORS_ALLOWED_ORIGINS", ("*",))
    cors_allowed_methods: tuple[str, ...] = env_list(
        "CORS_ALLOWED_METHODS",
        ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"),
    )
    cors_allowed_headers: tuple[str, ...] = env_list(
        "CORS_ALLOWED_HEADERS",
        ("Authorization", "Content-Type"),
    )
    cors_allow_credentials: bool = env_bool("CORS_ALLOW_CREDENTIALS", False)

    @property
    def invite_ttl(self) -> timedelta:
        return timedelta(hours=self.invite_ttl_hours)


settings = Settings()
