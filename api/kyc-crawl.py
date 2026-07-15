"""Authenticated Vercel Python Function running the Crawl4AI KYC collector."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler
from typing import Any

from scripts.kyc_worker import (
    Settings,
    normalized_query,
    research,
    sanitize_error,
    synthesize_report,
)


MAX_BODY_BYTES = 16_384
WORKER_TOKEN_CONTEXT = b"moana-kyc-worker-v1\x00"


def worker_token(secret: str) -> str:
    return hashlib.sha256(WORKER_TOKEN_CONTEXT + secret.encode("utf-8")).hexdigest()


def run_crawl(payload: dict[str, Any]) -> dict[str, Any]:
    query = normalized_query(payload.get("query_input") or payload)
    query = {key: value[:300] for key, value in query.items()}
    if not query["full_name"]:
        raise ValueError("full_name is required")

    async def execute() -> dict[str, Any]:
        settings = Settings.from_env(require_database=False, require_llm=False)
        documents = await research(query, settings)
        return await synthesize_report(query, documents, settings)

    return asyncio.run(execute())


class handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def authorized(self) -> bool:
        expected = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        supplied = self.headers.get("X-Moana-KYC-Token", "")
        return bool(expected) and hmac.compare_digest(supplied, worker_token(expected))

    def do_GET(self) -> None:
        self.send_json(405, {"success": False, "error": "Method not allowed"})

    def do_POST(self) -> None:
        if not self.authorized():
            self.send_json(401, {"success": False, "error": "Unauthorized"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > MAX_BODY_BYTES:
                self.send_json(413, {"success": False, "error": "Invalid request size"})
                return
            payload = json.loads(self.rfile.read(content_length))
            if not isinstance(payload, dict):
                raise ValueError("JSON body must be an object")
            report = run_crawl(payload)
            self.send_json(200, {"success": True, "report": report})
        except (json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"success": False, "error": sanitize_error(error)})
        except Exception as error:
            print(f"[KYC Crawl4AI] {sanitize_error(error)}")
            self.send_json(500, {"success": False, "error": "Crawl4AI execution failed"})
