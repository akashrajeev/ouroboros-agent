const task = document.getElementById('task') as HTMLTextAreaElement;
const logEl = document.getElementById('log')!;
const runBtn = document.getElementById('run') as HTMLButtonElement;

type Gate = { verdict: 'pass' | 'blocked' | null; blocked: number; at: number };
type Status = { models: boolean; ner?: boolean; server: boolean; gate?: Gate };
type Pair = { type: string; raw: string; token: string };
type DomLine = { role: string; label: string; value: string };
type Peek = { total: number; byType: Record<string, number>; pairs?: Pair[]; dom?: DomLine[] } | { error: string };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function clip(s: string, n = 24): string {
  return s.length > n ? s.slice(0, n - 1) + '...' : s;
}

function showLog(text: string) {
  logEl.hidden = false;
  logEl.textContent = text;
}

let lastGate: Gate | undefined;

function renderGate() {
  const verdict = document.getElementById('gate-verdict')!;
  const line = document.getElementById('gate-line')!;
  const g = lastGate;
  if (!g || !g.verdict) {
    verdict.textContent = 'gate: idle';
    verdict.className = '';
    line.innerHTML = '<i>run the agent - every payload passes this gate first</i>';
  } else if (g.verdict === 'pass') {
    verdict.textContent = 'gate: PASS';
    verdict.className = '';
    line.innerHTML = '<i>this run passed the device leak gate</i>';
  } else {
    verdict.textContent = 'gate: BLOCKED';
    verdict.className = 'amber';
    line.innerHTML = `<i class="amber">${g.blocked} raw ${g.blocked === 1 ? 'value' : 'values'} caught at gate - never sent</i>`;
  }
}

async function refreshStatus() {
  const pill = document.getElementById('models-pill')!;
  const dot = document.getElementById('server-dot')!;
  const serverText = document.getElementById('server-text')!;
  const setupBox = document.getElementById('setup-box')!;
  let st: Status | undefined;
  try { st = (await browser.runtime.sendMessage({ type: 'ouro:status' })) as Status; } catch { /* fall through */ }
  if (st?.models && st?.ner) { pill.textContent = 'models: on-device'; pill.className = 'dim ok'; }
  else if (st?.models) { pill.textContent = 'vision: on-device · text: rules'; pill.className = 'dim warn'; }
  else if (st) { pill.textContent = 'models: rules only'; pill.className = 'dim warn'; }
  else { pill.textContent = 'models: offline'; pill.className = 'dim'; }
  if (st?.server) {
    dot.textContent = '[ok]';
    dot.className = 'ok';
    serverText.textContent = 'local server connected - full agent loop ready';
    setupBox.hidden = true;
  } else {
    dot.textContent = '[x]';
    dot.className = 'bad';
    serverText.textContent = 'local server offline - masking still works';
    setupBox.hidden = false;
  }
  if (st?.gate) { lastGate = st.gate; renderGate(); }
}

function renderPairs(pairs: Pair[] | undefined, total: number) {
  const pre = document.getElementById('wire-pairs')!;
  const blocked = lastGate?.blocked ?? 0;
  if (!pairs) {
    pre.textContent = 'scan unavailable on this page';
  } else if (pairs.length === 0) {
    pre.textContent = total === 0
      ? 'nothing sensitive on this page - payload would go out clean'
      : 'scanning page...';
  } else {
    pre.innerHTML = pairs
      .map((p) => ` ${esc(p.type.toLowerCase())}: <s>${esc(clip(p.raw))}</s>  ->  <b>"${esc(p.token)}"</b>`)
      .join('\n') + (total > pairs.length ? `\n  +${total - pairs.length} more` : '');
  }
  if (blocked > 0) {
    pre.innerHTML += `\n\nblocked: ${blocked} raw ${blocked === 1 ? 'value' : 'values'} caught at gate - never sent`;
  }
}

async function scanPage() {
  const status = document.getElementById('scan-status')!;
  const chips = document.getElementById('scan-chips')!;
  try {
    const active = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    const tab = active?.url?.startsWith('chrome-extension://') ? (await browser.tabs.query({ currentWindow: true })).find((t) => t.url?.startsWith('http')) : active;
    if (!tab?.id) throw new Error('no tab');
    targetTabId = tab.id;
    const peek = (await browser.tabs.sendMessage(tab.id, { type: 'ouro:peek' })) as Peek;
    if (!peek || 'error' in peek) throw new Error(peek?.error ?? 'No response from content script');
    maskBtn.hidden = false;
    if (peek.total === 0) {
      status.textContent = 'nothing sensitive detected here';
      status.className = 'row ok';
      chips.innerHTML = '';
    } else {
      status.textContent = `${peek.total} detected ${peek.total === 1 ? 'spot' : 'spots'} - preview available`;
      status.className = 'row amber';
      chips.innerHTML = Object.entries(peek.byType)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `<span class="chip">${t}${n > 1 ? ' x' + n : ''}</span>`)
        .join('');
    }
    renderPairs('pairs' in peek ? peek.pairs : undefined, peek.total);
    const view = document.getElementById('dom-view')!;
    view.innerHTML = (peek.dom ?? []).map((e) => `<div class="dom-row"><span class="dom-role">${esc(e.role)}</span><span class="dom-content">${esc(clip(e.label || e.value, 72))}${e.value && e.label ? ` <b>${esc(clip(e.value, 28))}</b>` : ''}</span></div>`).join('') || '<span class="dim">No visible DOM text.</span>';
  } catch {
    status.textContent = 'scan runs on regular web pages';
    status.className = 'row dim2';
    chips.innerHTML = '';
    renderPairs(undefined, -1);
    document.getElementById('dom-view')!.textContent = 'Open a regular web page to inspect its sanitized DOM.';
  }
}

let targetTabId: number | undefined;
let maskOn = false;
const maskBtn = document.getElementById('mask-toggle') as HTMLButtonElement;
maskBtn.addEventListener('click', async () => {
  try {
    const active = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    const tab = active?.url?.startsWith('chrome-extension://') ? (await browser.tabs.query({ currentWindow: true })).find((t) => t.url?.startsWith('http')) : active;
    if (!tab?.id) return;
    targetTabId = tab.id;
    if (!maskOn) {
      const r = (await browser.tabs.sendMessage(tab.id, { type: 'ouro:mask:preview' })) as { painted?: number };
      maskOn = true;
      maskBtn.textContent = `[ MASKING ON - ${r?.painted ?? 0} BOXES. TAP TO HIDE ]`;
      maskBtn.classList.add('on');
    } else {
      await browser.tabs.sendMessage(tab.id, { type: 'ouro:mask:clear' });
      maskOn = false;
      maskBtn.textContent = '[ SHOW MASKING ON THIS PAGE ]';
      maskBtn.classList.remove('on');
    }
  } catch { /* not a regular page */ }
});

document.getElementById('copy-setup')!.addEventListener('click', async (ev) => {
  // Continuation lines rejoin their command; $ prefixes strip, so the clipboard gets runnable commands.
  const cmd = (document.getElementById('setup-cmd')!.textContent ?? '').replace(/\n\s+/g, ' ').replace(/^\$ /gm, '');
  await navigator.clipboard.writeText(cmd).catch(() => {});
  (ev.target as HTMLButtonElement).textContent = '[ copied ]';
});

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  showLog('running...');
  try {
    const response = (await browser.runtime.sendMessage({ type: 'ouro:run', task: task.value, tabId: targetTabId })) as { result?: { status: string; steps?: number; reason?: string }; events?: unknown[]; status?: string };
    const result: { status?: string; steps?: number; reason?: string } = response.result ?? response;
    if (result.status === 'error' || result.status === 'exec_failed') showLog(`run failed: ${result.reason ?? 'unknown error'}`);
    else {
      const actions = (response.events ?? []).filter((e): e is { kind: string; op?: string } => !!e && typeof e === 'object' && 'kind' in e && (e as { kind: string }).kind === 'executed');
      showLog(`${result.status === 'done' ? '✓ Task complete' : result.status ?? 'Run ended'} · ${actions.length} actions · ${result.steps ?? 0} steps\n${actions.map((e, i) => `${String(i + 1).padStart(2, '0')}  ${e.op === 'type' ? 'Filled a field' : e.op ?? 'Action'}`).join('\n')}\n${result.status === 'done' ? 'Review the filled page before submitting.' : result.reason ?? ''}`);
    }
  } catch (e) {
    showLog(`run failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    runBtn.disabled = false;
    // The run updated the gate verdict - pick it up immediately instead of waiting for the poll.
    void refreshStatus().then(() => scanPage());
  }
});

// A9 confirmation: the background asks, the user answers here.
const box = document.getElementById('confirm')!;
browser.runtime.onMessage.addListener((raw: unknown, _s, sendResponse) => {
  const msg = raw as { type: string; label?: string };
  if (msg.type !== 'ouro:confirm') { sendResponse(undefined); return true; }
  document.getElementById('confirm-label')!.textContent = msg.label ?? '';
  box.hidden = false;
  const answer = (v: boolean) => { box.hidden = true; sendResponse(v); };
  (document.getElementById('yes') as HTMLButtonElement).onclick = () => answer(true);
  (document.getElementById('no') as HTMLButtonElement).onclick = () => answer(false);
  return true;
});

document.getElementById('csv')!.addEventListener('click', async () => {
  const csv = (await browser.runtime.sendMessage({ type: 'ouro:metrics:csv' })) as string;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `ouroboros-metrics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  a.click();
});

void refreshStatus();
void scanPage();
// Server state changes while the popup is open (he starts the server mid-test) - keep the row live.
setInterval(() => { void refreshStatus(); void scanPage(); }, 4000);
