const task = document.getElementById('task') as HTMLTextAreaElement;
const log = document.getElementById('log')!;
document.getElementById('run')!.addEventListener('click', async () => {
  log.textContent = 'running...';
  const res = await browser.runtime.sendMessage({ type: 'ouro:run', task: task.value });
  log.textContent = JSON.stringify(res, null, 2);
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
