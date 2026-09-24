import { handleHostRequest, type HostRequest } from '../../lib/browserHost';

// Chrome MV3: service workers cannot host WASM models comfortably, so the model host lives here.
browser.runtime.onMessage.addListener((raw: unknown, _s, sendResponse) => {
  const msg = raw as HostRequest;
  if ((msg as { target?: string }).target !== 'host') return undefined as never;
  handleHostRequest(msg).then(sendResponse, (e) => sendResponse({ error: String(e) }));
  return true;
});
