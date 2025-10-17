from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Iterable

from ..config import settings

logger = logging.getLogger("notifications")


def send_email(subject: str, body: str, recipients: Iterable[str]) -> None:
    recipients = list(recipients)
    if not recipients:
        return
    if not settings.enable_email or not settings.smtp_host or not settings.email_sender:
        logger.info("Email skipped for %s because provider not configured", subject)
        return
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.email_sender
    message["To"] = ", ".join(recipients)
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as client:
        if settings.smtp_username and settings.smtp_password:
            client.starttls()
            client.login(settings.smtp_username, settings.smtp_password)
        client.send_message(message)
        logger.info("Email sent to %s", recipients)
