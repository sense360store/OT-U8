from __future__ import annotations

import json
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any, Callable, Optional
from urllib.parse import parse_qs

from .utils.time import format_iso8601, utc_now


@dataclass
class Response:
    status: int
    body: dict[str, Any] | list[Any] | str | None
    headers: dict[str, str] | None = None

    def to_wsgi(self) -> tuple[int, list[tuple[str, str]], bytes]:
        if isinstance(self.body, (dict, list)):
            payload = json.dumps(self.body).encode("utf-8")
            headers = {"Content-Type": "application/json", **(self.headers or {})}
        elif isinstance(self.body, str):
            payload = self.body.encode("utf-8")
            headers = {"Content-Type": "text/plain; charset=utf-8", **(self.headers or {})}
        elif self.body is None:
            payload = b""
            headers = self.headers or {}
        else:
            raise TypeError("Unsupported response body type")
        headers.setdefault("Cache-Control", "no-store")
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers_list = [(key, value) for key, value in headers.items()]
        return self.status, headers_list, payload


class Request:
    def __init__(self, environ: dict[str, Any]):
        self.environ = environ
        self.method = environ["REQUEST_METHOD"].upper()
        self.path = environ.get("PATH_INFO", "")
        self.query_string = environ.get("QUERY_STRING", "")
        self.headers = self._extract_headers(environ)
        self._json: Optional[Any] = None
        self._body: Optional[bytes] = None

    @staticmethod
    def _extract_headers(environ: dict[str, Any]) -> dict[str, str]:
        headers = {}
        for key, value in environ.items():
            if key.startswith("HTTP_"):
                headers[key[5:].replace("_", "-").title()] = value
        if "CONTENT_TYPE" in environ:
            headers["Content-Type"] = environ["CONTENT_TYPE"]
        if "CONTENT_LENGTH" in environ:
            headers["Content-Length"] = environ["CONTENT_LENGTH"]
        return headers

    def read_body(self) -> bytes:
        if self._body is None:
            length = int(self.environ.get("CONTENT_LENGTH") or 0)
            if length:
                self._body = self.environ["wsgi.input"].read(length)
            else:
                self._body = b""
        return self._body

    def json(self) -> Any:
        if self._json is not None:
            return self._json
        body = self.read_body()
        if not body:
            self._json = {}
            return self._json
        try:
            self._json = json.loads(body.decode("utf-8"))
            return self._json
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid JSON payload") from exc

    def query(self) -> dict[str, list[str]]:
        return parse_qs(self.query_string)


Handler = Callable[..., Response]


def json_response(data: Any, status: HTTPStatus = HTTPStatus.OK) -> Response:
    return Response(status=status, body=data)


def error_response(message: str, status: HTTPStatus = HTTPStatus.BAD_REQUEST) -> Response:
    return Response(status=status, body={"error": message, "timestamp": format_iso8601(utc_now())})


class Router:
    def __init__(self):
        self.routes: list[tuple[str, str, Handler]] = []

    def add(self, method: str, pattern: str, handler: Handler) -> None:
        self.routes.append((method.upper(), pattern, handler))

    def match(self, method: str, path: str) -> tuple[Handler, dict[str, str]] | None:
        for route_method, pattern, handler in self.routes:
            if route_method != method.upper():
                continue
            params = self._match_pattern(pattern, path)
            if params is not None:
                return handler, params
        return None

    @staticmethod
    def _match_pattern(pattern: str, path: str) -> dict[str, str] | None:
        if pattern == path:
            return {}
        pattern_parts = [p for p in pattern.split("/") if p]
        path_parts = [p for p in path.split("/") if p]
        if len(pattern_parts) != len(path_parts):
            return None
        params: dict[str, str] = {}
        for pattern_part, path_part in zip(pattern_parts, path_parts):
            if pattern_part.startswith(":"):
                params[pattern_part[1:]] = path_part
            elif pattern_part == path_part:
                continue
            else:
                return None
        return params


router = Router()
