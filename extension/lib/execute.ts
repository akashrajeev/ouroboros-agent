/**
 * A11 execute. Uses the native value setter so React/Angular controlled inputs
 * see the change, then fires input + change.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  el.focus();
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export type ExecResult = { ok: true } | { ok: false; reason: string };

export function executeOnElement(el: Element | undefined, op: string, text?: string): ExecResult {
  if (!el) return { ok: false, reason: 'node_gone' };
  if (!el.isConnected) return { ok: false, reason: 'node_detached' };
  switch (op) {
    case 'click':
      (el as HTMLElement).click();
      return { ok: true };
    case 'type':
    case 'select':
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        setNativeValue(el, text ?? '');
        return { ok: true };
      }
      if ((el as HTMLElement).isContentEditable || el.getAttribute('contenteditable') === 'true') {
        (el as HTMLElement).focus();
        el.textContent = text ?? '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return { ok: true };
      }
      return { ok: false, reason: 'not_editable' };
    default:
      return { ok: false, reason: 'unsupported_op' };
  }
}

/** Resolve after the DOM has been quiet for `quietMs` (or `maxMs` elapsed). */
export function waitForDomQuiet(doc: Document, quietMs = 300, maxMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let timer = setTimeout(done, quietMs);
    const hard = setTimeout(done, maxMs);
    const mo = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, quietMs); });
    mo.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
    function done() { mo.disconnect(); clearTimeout(timer); clearTimeout(hard); resolve(); }
  });
}
