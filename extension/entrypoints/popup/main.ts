const task = document.getElementById('task') as HTMLTextAreaElement;
const log = document.getElementById('log')!;
const runBtn = document.getElementById('run') as HTMLButtonElement;

type Status = { models: boolean; server: boolean };
type Peek = { total: number; byType: Record<string, number> } | { error: string };

function showLog(text: string) {
  log.hidden = false;
  log.textContent = text;
}

async function refreshStatus() {
  const pill = document.getElementById('models-pill')!;
  const dot = document.getElementById('server-dot')!;
  const serverText = document.getElementById('server-text')!;
  const setupToggle = document.getElementById('setup-toggle')!;
  let st: Status | undefined;
  try { st = (await browser.runtime.sendMessage({ type: 'ouro:status' })) as Status; } catch { /* fall through */ }
  if (st?.models) { pill.textContent = 'models on-device'; pill.className = 'pill pill-on'; }
  else if (st) { pill.textContent = 'rules only'; pill.className = 'pill pill-rules'; }
  else { pill.textContent = 'offline'; pill.className = 'pill pill-dim'; }
  if (st?.server) {
    dot.className = 'dot dot-on';
    serverText.textContent = 'Local server connected - full agent loop ready';
    setupToggle.hidden = true;
  } else {
    dot.className = 'dot dot-off';
    serverText.textContent = 'Local server offline - masking still works';
    setupToggle.hidden = false;
  }
}

async function scanPage() {
  const status = document.getElementById('scan-status')!;
  const chips = document.getElementById('scan-chips')!;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('no tab');
    const peek = (await browser.tabs.sendMessage(tab.id, { type: 'ouro:peek' })) as Peek;
    if ('error' in peek) throw new Error(peek.error);
    maskBtn.hidden = false;
    if (peek.total === 0) {
      status.textContent = 'Nothing sensitive detected here';
      status.className = 'scan-status ok';
      chips.innerHTML = '';
    } else {
      status.textContent = `${peek.total} sensitive ${peek.total === 1 ? 'spot' : 'spots'} - masked from the cloud`;
      status.className = 'scan-status warn';
      chips.innerHTML = Object.entries(peek.byType)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `<span class="chip">${t}${n > 1 ? ' x' + n : ''}</span>`)
        .join('');
    }
  } catch {
    status.textContent = 'Scan runs on regular web pages';
    status.className = 'scan-status';
    chips.innerHTML = '';
  }
}

let maskOn = false;
const maskBtn = document.getElementById('mask-toggle') as HTMLButtonElement;
maskBtn.addEventListener('click', async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    if (!maskOn) {
      const r = (await browser.tabs.sendMessage(tab.id, { type: 'ouro:mask:preview' })) as { painted?: number };
      maskOn = true;
      maskBtn.textContent = `Masking on - ${r?.painted ?? 0} boxes. Tap to hide`;
      maskBtn.classList.add('on');
    } else {
      await browser.tabs.sendMessage(tab.id, { type: 'ouro:mask:clear' });
      maskOn = false;
      maskBtn.textContent = 'Show masking on this page';
      maskBtn.classList.remove('on');
    }
  } catch { /* not a regular page */ }
});

document.getElementById('setup-toggle')!.addEventListener('click', () => {
  const box = document.getElementById('setup-box')!;
  box.hidden = !box.hidden;
});
document.getElementById('copy-setup')!.addEventListener('click', async (ev) => {
  const cmd = document.getElementById('setup-cmd')!.textContent ?? '';
  await navigator.clipboard.writeText(cmd).catch(() => {});
  (ev.target as HTMLButtonElement).textContent = 'Copied';
});

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  showLog('running...');
  try {
    const res = (await browser.runtime.sendMessage({ type: 'ouro:run', task: task.value })) as { status: string; steps?: number; reason?: string };
    if (res.status === 'error' || res.status === 'exec_failed') showLog(`Run failed: ${res.reason ?? 'unknown error'}`);
    else showLog(JSON.stringify(res, null, 2));
  } catch (e) {
    showLog(`Run failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    runBtn.disabled = false;
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
// Server state changes while the popup is open (he starts the server mid-test) - keep the dot live.
setInterval(() => { void refreshStatus(); }, 4000);
