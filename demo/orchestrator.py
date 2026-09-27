#!/usr/bin/env python3
"""End-to-end demo driver for Ouroboros Agent (SIH26171), hybrid architecture.

The local agent harness (browser-use, open source) drives Chrome over CDP:
  1. launches Chrome with the built Ouroboros extension loaded,
  2. opens the target page,
  3. starts the task by dispatching the demo run event (see extension/entrypoints/content.ts;
     requires a WXT_DEMO_TRIGGER=1 build and a localhost origin),
  4. polls the mirrored run status, verifies the form was filled locally,
  5. lets a human (or --auto-submit) press the final submit, and screenshots each beat.

The planner (stub or Qwen2.5-VL via the Kaggle/Colab tunnel) runs behind the local
server; this script never sees real values - fills happen inside the extension's
isolated world after on-device rehydration.

Generic: any --url on localhost and any --task. demo/kyc.html is the shipped fixture.

Usage:
  python demo/orchestrator.py --url http://localhost:8080/kyc.html \
      --task "Fill the KYC form from my saved profile. Do not submit." \
      --extension extension/.output/chrome-mv3 [--headed] [--auto-submit] \
      [--chrome /usr/bin/google-chrome] [--shots demo/out]
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import sys
import tempfile
from pathlib import Path

from browser_use.browser import BrowserSession

POLL_JS = """() => {
  const d = document.documentElement;
  const fields = {};
  document.querySelectorAll('form input').forEach((el) => { fields[el.id || el.name] = el.value; });
  return JSON.stringify({
    status: d.dataset.ouroStatus || '',
    result: d.dataset.ouroResult || '',
    fields,
    banner: (document.getElementById('success') || {}).style ? document.getElementById('success').style.display : '',
  });
}"""


async def run() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--task", required=True)
    ap.add_argument("--extension", default="extension/.output/chrome-mv3")
    ap.add_argument("--chrome", default=None, help="chrome/chromium executable (default: browser-use's own)")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--auto-submit", action="store_true", help="press submit after the fill (stands in for the human)")
    ap.add_argument("--shots", default="demo/out")
    ap.add_argument("--timeout", type=int, default=180)
    args = ap.parse_args()

    ext = str(Path(args.extension).resolve())
    shots = Path(args.shots)
    shots.mkdir(parents=True, exist_ok=True)
    cli_args = [
        f"--disable-extensions-except={ext}",
        f"--load-extension={ext}",
        "--no-sandbox",
        "--disable-dev-shm-usage",
    ]

    session = BrowserSession(
        headless=not args.headed,
        executable_path=args.chrome,
        user_data_dir=tempfile.mkdtemp(prefix="ouro-demo-"),
        args=cli_args,
        enable_default_extensions=False,
        chromium_sandbox=False,
    )
    await session.start()
    summary: dict = {"url": args.url, "task": args.task}

    try:
        page = await session.new_page(args.url)
        await asyncio.sleep(3)  # let the extension service worker register
        # A page that loaded before the extension was ready has no content script; reload it.
        marker = await page.evaluate("() => document.documentElement.dataset.ouroContentScript || ''")
        if not marker:
            print("[setup] content script not injected yet; reloading page", file=sys.stderr, flush=True)
            await page.reload()
            await asyncio.sleep(3)
            marker = await page.evaluate("() => document.documentElement.dataset.ouroContentScript || ''")
        if not marker:
            print(json.dumps({"error": "content script not injected after reload", "url": args.url}))
            return 2
        await asyncio.sleep(2)  # models warm-up

        async def shot(name: str):
            b64 = await page.screenshot()
            (shots / name).write_bytes(base64.b64decode(b64))

        await shot("1-page.png")

        # Start the agent run (demo trigger: localhost-gated DOM event).
        task_js = json.dumps(args.task)
        await page.evaluate(f"() => window.dispatchEvent(new CustomEvent('ouro:run', {{ detail: {{ task: {task_js} }} }}))")

        deadline = asyncio.get_event_loop().time() + args.timeout
        last = {}
        while asyncio.get_event_loop().time() < deadline:
            raw = await page.evaluate(POLL_JS)
            last = json.loads(raw)
            print(f"[poll] status={last.get('status')!r} filled={sorted(k for k, v in (last.get('fields') or {}).items() if v and v.strip())}", file=sys.stderr, flush=True)
            if last.get("status") and last["status"] not in ("", "running"):
                break
            await asyncio.sleep(2)
        summary["run_status"] = last.get("status") or "timeout"
        summary["run_result"] = json.loads(last["result"]) if last.get("result") else None
        summary["fields"] = last.get("fields", {})
        await shot("2-filled.png")

        filled = {k: v for k, v in summary["fields"].items() if v and v.strip()}
        summary["filled_fields"] = sorted(filled)

        if args.auto_submit:
            await page.evaluate("() => document.getElementById('submit-kyc')?.click()")
            await asyncio.sleep(1)
            raw = await page.evaluate(POLL_JS)
            summary["banner"] = json.loads(raw).get("banner")
            await shot("3-submitted.png")

        print(json.dumps(summary, indent=2))
        return 0 if filled else 1
    finally:
        await session.kill()


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
