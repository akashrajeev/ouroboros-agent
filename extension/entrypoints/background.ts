import { startFullAgent, type AgentState } from '../lib/fullAgent';
import { safetyDrill } from '../lib/safetyDrill';
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
  // Offscreen createDocument can return before its listener is registered. Retry only
  // the local read request when no response exists, never a provider/action send.
  let r: (T & {error?:string}) | undefined;
  for(let attempt=0;attempt<8;attempt++){
    r=(await browser.runtime.sendMessage(req)) as T & {error?:string};
    if(r!==undefined) break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!r) throw new Error('On-device host startup unavailable');
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
  let latestAgent:AgentState|undefined;
  browser.runtime.onMessage.addListener((raw: unknown, _s, sendResponse) => {
    const msg = raw as { type: string; task?: string; runId?: string; tabId?: number };
    if (msg.type === 'ouro:status') {
      (async () => {
        const models = await modelsEnabled();
        let server = false;
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 1500);
          const r=await fetch(`${SERVER}/health`,{signal:ctl.signal});
          const h=await r.json();
          clearTimeout(t);
          if(!r.ok||h.mode!=='full-agent')throw Error('Wrong local service');
          server = true;
        } catch { server = false; }
        sendResponse({ models, ner: models && NER_SOURCE !== 'off', server, agentState:latestAgent, gate: { verdict: gateVerdict, blocked: gateBlocked, at: gateAt } });
      })();
      return true;
    }
    if (msg.type === 'ouro:safety:drill') { safetyDrill().then(sendResponse); return true; }
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
          boxes: r.detections.filter(d=>d.bbox).map(d=>({bbox:d.bbox,type:d.type})),
          rawBytes: new TextEncoder().encode(JSON.stringify(obs)).length,
          safeBytes: new TextEncoder().encode(JSON.stringify(r.screen.elements)).length,
          pairs: map.values().map((v) => ({ type: v.type, raw: v.value, token: v.token })),
          dom: r.screen.elements.filter((e) => (e.label || e.value) && obs.elements.find(x=>x.nodeId===r.screen.nodeOf[e.id])?.previewVisible !== false).slice(0, 80).map((e) => { const raw = obs.elements.find(x => x.nodeId === r.screen.nodeOf[e.id]); return { role: e.role, label: e.label, value: e.value, rawLabel: raw?.name || raw?.text || '', rawValue: raw?.value || '' }; }),
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
      try {
        const marker=crypto.randomUUID().replace(/-/g,'');
        const attached=await browser.tabs.sendMessage(tabId,{type:'ouro:attach',marker}) as {url?:string};
        if(!attached?.url)throw Error('Refresh the page in dedicated debug Chrome before running.');
        const state=await startFullAgent(SERVER,{task:msg.task!,marker,url:attached.url},(state:AgentState)=>{
          latestAgent=state;
          if(state.gate){gateVerdict=state.gate==='pass'?'pass':'blocked';gateAt=Date.now();if(state.gate==='blocked')gateBlocked++;}
          void browser.runtime.sendMessage({type:'ouro:agent:live',state}).catch(()=>{});
        });
        sendResponse({result:{status:state.status,steps:state.steps,reason:state.reason},events:state.actions.map(op=>({kind:'executed',op})),agentState:state});
      } catch(error){sendResponse({result:{status:'error',reason:error instanceof Error?error.message:'Full Agent bridge failed'}});}
    })();
    return true;
  });
});
