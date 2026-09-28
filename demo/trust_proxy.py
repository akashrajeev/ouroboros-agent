#!/usr/bin/env python3
"""Trust-boundary proof proxy for the SIH26171 end-to-end demo.

Sits between the extension and the planner server:

    extension (A8 egress) -> localhost:8000 (this proxy) -> localhost:8001 (server)

For every /step request it:
  1. re-runs the server's own raw-PII guard (server/app/guard.py) over the payload,
  2. saves the exact payload to demo/out/last-payload.json so judges can inspect
     what crossed the trust boundary (placeholders, never values),
  3. prints one line per step with the verdict.

Stdlib only. Demo tooling - not part of the shipped architecture (A8 posts
directly to the server in normal use).
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
from app.guard import raw_pii_types  # noqa: E402

OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(exist_ok=True)

TARGET = "http://localhost:8001"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quieter than default
        pass

    def _forward(self, body: bytes | None = None):
        req = urllib.request.Request(
            TARGET + self.path,
            data=body,
            headers={"content-type": self.headers.get("content-type", "application/json")},
            method=self.command,
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            # A 404/405/500 from the backend is still an ANSWER. Forward it; dropping the
            # connection (ERR_EMPTY_RESPONSE) is what made a live server look offline.
            return e.code, e.read()
        except urllib.error.URLError as e:
            return 502, json.dumps({"detail": f"planner server unreachable on {TARGET}: {e.reason}"}).encode()

    def do_GET(self):
        status, data = self._forward()
        self.send_response(status)
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        if self.path == "/step":
            text = body.decode("utf-8", "replace")
            leaked = raw_pii_types(text)
            (OUT / "last-payload.json").write_text(text)
            try:
                tokens = sorted(set(__import__("re").findall(r"<[A-Z]+_\d+>", text)))
            except Exception:
                tokens = []
            verdict = "CLEAN (placeholders only)" if not leaked else f"RAW PII LEAKED: {leaked}"
            print(f"[{time.strftime('%H:%M:%S')}] /step {len(body)} bytes -> {verdict}; tokens on the wire: {', '.join(tokens) or '(none)'}", flush=True)
        status, data = self._forward(body)
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    TARGET = sys.argv[2] if len(sys.argv) > 2 else TARGET
    print(f"trust proxy: listening on {port}, forwarding to {TARGET}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
