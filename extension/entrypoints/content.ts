import { executeOnElement, waitForDomQuiet } from '../lib/execute';
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
