import type { RawObservation } from '@ouroboros/core';
import { runTask, type LoopEvent } from '../lib/agentLoop';
import { confirmWithTimeout, type ConfirmRequest, type ContentRequest } from '../lib/messages';

const SERVER = 'http://localhost:8000';

// A8: the only component that calls fetch.
async function post(body: string) {
  const r = await fetch(`${SERVER}/step`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  if (!r.ok) throw new Error(`server ${r.status}`);
  return r.json();
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((raw: unknown, _s, sendResponse) => {
    const msg = raw as { type: string; task?: string };
    if (msg.type !== 'ouro:run' || !msg.task) { sendResponse(undefined); return true; }
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
        scroll: async (direction) => { await send({ type: 'ouro:scroll', direction }); },
        settle: async () => { await send({ type: 'ouro:settle' }); },
        // A9: consequential actions need a click in the popup; closed popup or 60 s silence = decline.
        confirm: (label) => confirmWithTimeout(() => browser.runtime.sendMessage({ type: 'ouro:confirm', label } satisfies ConfirmRequest)),
        log: (e) => events.push(e),
      });
      sendResponse({ result, events });
    })();
    return true;
  });
});
