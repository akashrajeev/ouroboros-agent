import { executeOnElement, waitForDomQuiet } from '../lib/execute';
import { PlaceholderMap, sanitize } from '@ouroboros/core';
import type { ContentRequest } from '../lib/messages';
import { NodeRegistry, observe } from '../lib/observe';

// Content script: observes and executes. It has no network role (A8 is the background).
/**
 * Demo-harness trigger (SIH26171 end-to-end demo). Pages served from local demo
 * origins may start a run by dispatching `new CustomEvent('ouro:run', { detail: { task } })`;
 * the outcome is mirrored into <html data-ouro-status> and an 'ouro:run-done' event so an
 * external local driver (demo/orchestrator.py, browser-use) can follow along.
 * Gated to localhost/127.0.0.1 on purpose: everywhere else the popup remains the
 * only way to start a run, and the same trust-boundary rules apply to the payload.
 */
const DEMO_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// Compile-time gate, mirroring WXT_NER_SOURCE: only builds made with
// WXT_DEMO_TRIGGER=1 honor page-dispatched run events at all.
const DEMO_TRIGGER_ENABLED = ((import.meta as { env?: Record<string, string> }).env?.WXT_DEMO_TRIGGER ?? '') === '1';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const registry = new NodeRegistry();
    // Injection marker for demo drivers (harmless in normal use).
    document.documentElement.dataset.ouroContentScript = '1';
    window.addEventListener('ouro:run', (ev) => {
      if (!DEMO_TRIGGER_ENABLED || !DEMO_ORIGIN.test(window.location.origin)) return;
      const task = (ev as CustomEvent<{ task?: unknown }>).detail?.task;
      if (typeof task !== 'string' || !task.trim()) return;
      const root = document.documentElement;
      root.dataset.ouroStatus = 'running';
      root.dataset.ouroResult = '';
      browser.runtime.sendMessage({ type: 'ouro:run', task }).then((res) => {
        const status = (res as { result?: { status?: string } } | undefined)?.result?.status ?? 'error';
        root.dataset.ouroStatus = status;
        root.dataset.ouroResult = JSON.stringify(res ?? null);
        window.dispatchEvent(new CustomEvent('ouro:run-done', { detail: res }));
      }, (err) => {
        root.dataset.ouroStatus = 'error';
        root.dataset.ouroResult = String(err);
        window.dispatchEvent(new CustomEvent('ouro:run-done', { detail: { error: String(err) } }));
      });
    });
    browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
      const msg = raw as ContentRequest;
      if (msg.type === 'ouro:observe') {
        sendResponse(observe(document, registry));
        return true;
      }
      if (msg.type === 'ouro:mask:preview' || msg.type === 'ouro:mask:clear') {
        // On-demand visual proof: paint the current detections as black boxes with
        // token labels on the live page. Purely local; nothing leaves the device.
        document.querySelectorAll('.ouro-mask-overlay').forEach((n) => n.remove());
        if (msg.type === 'ouro:mask:clear') { sendResponse({ cleared: true }); return true; }
        try {
          const obs = observe(document, registry);
          const res = sanitize(obs, new PlaceholderMap());
          const sx = window.scrollX, sy = window.scrollY;
          const vh = window.innerHeight, vw = window.innerWidth;
          let painted = 0;
          for (const d of res.detections) {
            const b = d.bbox;
            if (!b || b.w <= 0 || b.h <= 0) continue;
            if (b.y > vh || b.y + b.h < 0 || b.x > vw || b.x + b.w < 0) continue;
            const el = document.createElement('div');
            el.className = 'ouro-mask-overlay';
            el.textContent = `<${d.type}>`;
            el.setAttribute('style', [
              `left:${Math.max(0, b.x + sx) - 2}px`, `top:${Math.max(0, b.y + sy) - 2}px`,
              `width:${b.w + 4}px`, `height:${b.h + 4}px`,
              'position:absolute', 'z-index:2147483647', 'background:#000',
              'color:#2dd4bf', 'font:600 10px/1 ui-monospace,monospace',
              'display:flex', 'align-items:center', 'justify-content:center',
              'border-radius:2px', 'pointer-events:none', 'overflow:hidden',
            ].join(';'));
            document.body.appendChild(el);
            painted++;
          }
          sendResponse({ painted, total: res.detections.length });
        } catch (e) {
          sendResponse({ error: String(e) });
        }
        return true;
      }
      if (msg.type === 'ouro:peek') {
        // Popup status: same rules+pattern detectors as the real pipeline (A3a/A3b), instant and fully on-device.
        try {
          const obs = observe(document, registry);
          const map = new PlaceholderMap();
          const res = sanitize(obs, map);
          const byType: Record<string, number> = {};
          for (const d of res.detections) byType[d.type] = (byType[d.type] ?? 0) + 1;
          // Wire view: the exact raw -> token pairs the placeholder map holds. Device-local, capped for display.
          const pairs = map.values().slice(0, 8).map((v) => ({ type: v.type, raw: v.value, token: v.token }));
          const dom = res.screen.elements.filter((e) => e.label || e.value).slice(0, 24).map((e) => ({ role: e.role, label: e.label, value: e.value }));
          sendResponse({ total: res.detections.length, byType, pairs, dom });
        } catch (e) {
          sendResponse({ error: String(e) });
        }
        return true;
      }
      if (msg.type === 'ouro:execute') {
        const r = executeOnElement(registry.get(msg.nodeId), msg.op, msg.text);
        waitForDomQuiet(document).then(() => sendResponse(r));
        return true;
      }
      if (msg.type === 'ouro:scroll') {
        window.scrollBy({ top: (msg.direction === 'up' ? -0.8 : 0.8) * window.innerHeight, behavior: 'instant' as ScrollBehavior });
        waitForDomQuiet(document, 200, 1500).then(() => sendResponse(true));
        return true;
      }
      if (msg.type === 'ouro:settle') {
        waitForDomQuiet(document).then(() => sendResponse(true));
        return true;
      }
      sendResponse(undefined);
      return true;
    });
  },
});
