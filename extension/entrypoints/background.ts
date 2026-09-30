import { runEvidence } from '../lib/runEvidence';
import { PlaceholderMap, sanitize, type RawObservation, type TextMatch } from '@ouroboros/core';
import type { HostRequest, PrimeResponse, VisualResponse } from '../lib/browserHost';
import { runTask, type LoopEvent } from '../lib/agentLoop';
import { MetricsStore } from '../lib/metricsStore';
import { confirmWithTimeout, type ConfirmRequest, type ContentRequest } from '../lib/messages';
import { NER_SOURCE } from '../lib/browserHost';

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
  // Wire-view gate state: verdict of the last payload plus cumulative blocked count (session only).
  let gateVerdict: 'pass' | 'blocked' | null = null;
  let gateBlocked = 0;
  let gateAt = 0;
  browser.runtime.onMessage.addListener((raw: unknown, _s, sendResponse) => {
    const msg = raw as { type: string; task?: string; runId?: string; tabId?: number };
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
        sendResponse({ models, ner: models && NER_SOURCE !== 'off', server, gate: { verdict: gateVerdict, blocked: gateBlocked, at: gateAt } });
      })();
      return true;
    }
    if (msg.type === 'ouro:preview:scan') {
      (async () => {
        const tab = msg.tabId ? await browser.tabs.get(msg.tabId).catch(() => undefined) : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
        if (!tab?.id || !/^https?:/.test(tab.url ?? '')) return sendResponse({ error: 'Open a regular web page first.' });
        const obs = await browser.tabs.sendMessage(tab.id, { type: 'ouro:observe' }) as RawObservation;
        if (!obs) return sendResponse({ error: 'No observation from this page.' });
        const texts = obs.elements.flatMap((e) => [e.name, e.text, e.value]).filter(Boolean);
        let detector: ((s: string) => TextMatch[]) | undefined;
        if (NER_SOURCE !== 'off' && await modelsEnabled()) {
          const m = await host<PrimeResponse>({ type: 'ouro:host:prime', target: 'host', texts });
          if (!m || typeof m !== 'object') return sendResponse({ error: 'On-device text model did not respond.' });
          detector = (s) => m[s] ?? [];
        }
        const map = new PlaceholderMap();
        const r = sanitize(obs, map, detector ? { extraDetectors: [detector] } : {});
        const byType: Record<string, number> = {};
        for (const d of r.detections) byType[d.type] = (byType[d.type] ?? 0) + 1;
        sendResponse({ total: r.detections.length, byType,
          pairs: map.values().slice(0, 8).map((v) => ({ type: v.type, raw: v.value, token: v.token })),
          dom: r.screen.elements.filter((e) => e.label || e.value).slice(0, 24).map((e) => ({ role: e.role, label: e.label, value: e.value })),
        });
      })().catch((e) => sendResponse({ error: String(e) }));
      return true;
    }
    if (msg.type === 'ouro:metrics:csv') { metrics.csv(msg.runId).then(sendResponse, () => sendResponse('')); return true; }
    if (msg.type === 'ouro:metrics:clear') { metrics.clear().then(() => sendResponse(true)); return true; }
        if (msg.type !== 'ouro:run' || !msg.task) return undefined as never;
    (async () => {
      const tab = msg.tabId ? await browser.tabs.get(msg.tabId).catch(() => undefined) : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      if (!tab?.id || !/^https?:/.test(tab.url ?? '')) return sendResponse({ result: { status: 'error', reason: 'Open a regular web page first.' } });
      const tabId = tab.id;
      const send = <T>(m: ContentRequest) => browser.tabs.sendMessage(tabId, m) as Promise<T>;
      const events: LoopEvent[] = [];
      const runRows: import('@ouroboros/core').StepRecord[] = [];
      const runStarted = performance.now();
      try {
        const result = await runTask(msg.task!, {
        observe: async () => { const obs = await send<RawObservation>({ type: 'ouro:observe' }); if (!obs) throw new Error('No observation from the active page'); return obs; },
        execute: (nodeId, op, text) => send({ type: 'ouro:execute', nodeId, op, text }),
        post,
        detectText: async (texts) => {
          if (NER_SOURCE === 'off' || !(await modelsEnabled())) return () => [];
          const m = await host<PrimeResponse>({ type: 'ouro:host:prime', target: 'host', texts });
          if (!m || typeof m !== 'object') throw new Error('On-device text model did not respond; outbound step stopped');
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
        log: (e) => {
          events.push(e);
          if (e.kind === 'blocked') { gateVerdict = 'blocked'; gateBlocked += e.hits.length; gateAt = Date.now(); }
          else if (e.kind === 'sent') { gateVerdict = 'pass'; gateAt = Date.now(); }
        },
        record: (r) => { runRows.push(r); void metrics.add(r); },
      });
      sendResponse({ result, events, evidence: runEvidence(runRows, performance.now() - runStarted) });
      } catch (error) {
        console.error('ouro run failed', error);
        sendResponse({ result: { status: 'error', reason: String(error) }, events });
      }
    })();
    return true;
  });
});
