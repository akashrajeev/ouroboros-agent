import { parseCsv } from '@ouroboros/core';
import { renderDashboard } from '../../lib/dashboard';

const out = document.getElementById('out')!;
const show = (csv: string) => { out.innerHTML = renderDashboard(csv.trim() ? parseCsv(csv) : []); };
browser.runtime.sendMessage({ type: 'ouro:metrics:csv' }).then((csv) => show(String(csv ?? '')), () => show(''));
document.getElementById('file')!.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) show(await file.text());
});
