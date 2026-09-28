import type { RawObservation, TextMatch } from '@ouroboros/core';
import type { HostRequest, PrimeResponse, VisualResponse } from '../lib/browserHost';
import { runTask, type LoopEvent } from '../lib/agentLoop';
import { MetricsStore } from '../lib/metricsStore';
import { confirmWithTimeout, type ConfirmRequest, type ContentRequest } from '../lib/messages';

const SERVER = 'http://localhost:8000';

// A8: the only component that calls fetch.
async function post(body: string) {
  const r = await fetch(`${SERVER}/step`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  if (!r.ok) throw new Error(`server ${r.status}`);
  return r.json();
}

// A3c/A3d host: Chrome offscreen document; Firefox MV2 background page runs it in-process.
async function host<T>(req: HostRequest): Promise<T> {
  if (import.meta.env.FIREFOX) {
    const { handleHostRequest } = await import('../lib/browserHost');
    return handleHostRequest(req) as Promise<T>;
  }
  const off = (globalThis as any).chrome.offscreen;
  if (!(await off.hasDocument?.())) {
    await off.createDocument({ url: 'offscreen.html', reasons: ['WORKERS'], justification: 'On-device PII models (onnxruntime-web)' }).catch(() => {});
  }
  const r = (await browser.runtime.sendMessage(req)) as T & { error?: string };
  if (r?.error) throw new Error(r.error);
  return r;
}

let modelsOn: boolean | undefined;
async function modelsEnabled(): Promise<boolean> {
  // Models are staged into the build by scripts/stage-models.sh; without them the loop runs rules-only.
  modelsOn ??= await fetch(browser.runtime.getURL('/models/paddleocr/det.onnx' as never), { method: 'HEAD' }).then((r) => r.ok, () => false);
  return modelsOn;
}

export default defineBackground(() => {
  const metrics = new MetricsStore();
  browser.runtime.onMessage.addListener((raw: unknown, _s, sendResponse) => {
    const msg = raw as { type: string; task?: string; runId?: string };
    if (msg.type === 'ouro:status') {
      (async () => {
        const models = await modelsEnabled();
        let server = false;
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 1500);
          // Any HTTP response (even 405) proves the proxy is listening; a network error means it is down.
          await fetch(`${SERVER}/step`, { method: 'GET', signal: ctl.signal }).catch(() => { throw new Error('down'); });
          clearTimeout(t);
          server = true;
        } catch { server = false; }
        sendResponse({ models, server });
      })();
      return true;
    }
    if (msg.type === 'ouro:metrics:csv') { metrics.csv(msg.runId).then(sendResponse, () => sendResponse('')); return true; }
    if (msg.type === 'ouro:metrics:clear') { metrics.clear().then(() => sendResponse(true)); return true; }
        if (msg.type !== 'ouro:run' || !msg.task) return undefined as never;
    (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return sendResponse({ status: 'no_tab' });
      const tabId = tab.id;
      const send = <T>(m: ContentRequest) => browser.tabs.sendMessage(tabId, m) as Promise<T>;
      const events: LoopEvent[] = [];
      const result = await runTask(msg.task!, {
        observe: () => send<RawObservation>({ type: 'ouro:observe' }),
        execute: (nodeId, op, text) => send({ type: 'ouro:execute', nodeId, op, text }),
        post,
        detectText: async (texts) => {
          if (!(await modelsEnabled())) return () => [];
          const m = await host<PrimeResponse>({ type: 'ouro:host:prime', target: 'host', texts });
          return (t: string): TextMatch[] => m[t] ?? [];
        },
        visual: async (raw) => {
          if (!(await modelsEnabled())) return null; // fail closed: no masked image, text-only step
          const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId!, { format: 'png' });
          const r = await host<VisualResponse>({ type: 'ouro:host:visual', target: 'host', dataUrl, regions: raw.opaque.map((o) => o.bbox), viewportW: raw.viewport.w });
          events.push({ kind: 'vision', ms: r.ms, regions: r.regions } as never);
          return { jpegB64: r.jpegB64, imageText: r.imageText, detections: r.detections, semanticHint: r.semanticHint };
        },
        scroll: async (direction) => { await send({ type: 'ouro:scroll', direction }); },
        settle: async () => { await send({ type: 'ouro:settle' }); },
        // A9: consequential actions need a click in the popup; closed popup or 60 s silence = decline.
        confirm: (label) => confirmWithTimeout(() => browser.runtime.sendMessage({ type: 'ouro:confirm', label } satisfies ConfirmRequest)),
        log: (e) => events.push(e),
        record: (r) => { void metrics.add(r); },
      });
      sendResponse({ result, events });
    })();
    return true;
  });
});
