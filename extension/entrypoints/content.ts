import { executeOnElement, waitForDomQuiet } from '../lib/execute';
import type { ContentRequest } from '../lib/messages';
import { NodeRegistry, observe } from '../lib/observe';

// Content script: observes and executes. It has no network role (A8 is the background).
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const registry = new NodeRegistry();
    browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
      const msg = raw as ContentRequest;
      if (msg.type === 'ouro:observe') {
        sendResponse(observe(document, registry));
        return true;
      }
      if (msg.type === 'ouro:execute') {
        const r = executeOnElement(registry.get(msg.nodeId), msg.op, msg.text);
        waitForDomQuiet(document).then(() => sendResponse(r));
        return true;
      }
      sendResponse(undefined);
      return true;
    });
  },
});
