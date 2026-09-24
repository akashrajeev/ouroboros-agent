const task = document.getElementById('task') as HTMLTextAreaElement;
const log = document.getElementById('log')!;
document.getElementById('run')!.addEventListener('click', async () => {
  log.textContent = 'running...';
  const res = await browser.runtime.sendMessage({ type: 'ouro:run', task: task.value });
  log.textContent = JSON.stringify(res, null, 2);
});
