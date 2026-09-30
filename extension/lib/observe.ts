import type { OpaqueKind, OpaqueRegion, RawElement, RawObservation } from '@ouroboros/core';

/**
 * A2 observe. Runs in the content script. Produces REAL values; the result
 * goes to the background worker over extension messaging only.
 */
export type RectFn = (el: Element) => { x: number; y: number; w: number; h: number };

const defaultRect: RectFn = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

const INTERACTIVE = 'input, textarea, select, button, a[href], [role="button"], [role="link"], [role="checkbox"], [role="textbox"], [contenteditable="true"]';
const TEXT_TAGS = new Set(['P', 'SPAN', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LABEL', 'DT', 'DD', 'DIV', 'STRONG', 'EM', 'B']);
const INLINE_TAGS = new Set(['SPAN', 'B', 'I', 'STRONG', 'EM', 'SMALL', 'SUB', 'SUP', 'MARK', 'CODE', 'ABBR', 'TIME', 'BR', 'U', 'S', 'BDI', 'BDO', 'WBR', 'FONT']);

/**
 * A text block whose children are all inline formatting ("<p>Phone: <span>98765</span><span>43210</span></p>")
 * is observed as ONE element with its full text, so values split across tags are detected whole.
 */
function isInlineOnlyBlock(el: Element): boolean {
  if (!TEXT_TAGS.has(el.tagName) || INLINE_TAGS.has(el.tagName) || el.children.length === 0) return false;
  const all = el.querySelectorAll('*');
  if (all.length > 40) return false;
  for (const d of Array.from(all)) if (!INLINE_TAGS.has(d.tagName)) return false;
  return true;
}

const SENSITIVE_FORM = /otp|pin|cvv|aadha+r|pan|account|ifsc|kyc|payment|card|bank/i;

/** Device-local registry: nodeId -> element, so actions can be executed later. */
export class NodeRegistry {
  private byId = new Map<string, Element>();
  private ids = new WeakMap<Element, string>();
  private n = 0;
  idFor(el: Element): string {
    let id = this.ids.get(el);
    if (!id) { id = `n${++this.n}`; this.ids.set(el, id); }
    this.byId.set(id, el);
    return id;
  }
  get(id: string): Element | undefined { return this.byId.get(id); }
}

function visible(el: Element, rect: RectFn, win: Window): boolean {
  for (let a: Element | null = el; a; a = a.parentElement) {
    const s = win.getComputedStyle(a);
    if (s.display === 'none' || (a === el && (s.visibility === 'hidden' || s.opacity === '0'))) return false;
  }
  if ((el as HTMLInputElement).type === 'hidden') return false;
  const r = rect(el);
  return r.w > 0 && r.h > 0;
}

/** Column header text for a table cell, used as detector context. */
function columnHeader(el: Element): string | undefined {
  const cell = el.closest('td');
  if (!cell) return undefined;
  const row = cell.parentElement as HTMLTableRowElement | null;
  const table = cell.closest('table');
  if (!row || !table) return undefined;
  const idx = Array.prototype.indexOf.call(row.children, cell);
  const th = table.querySelector('tr')?.children[idx];
  return th && th.tagName === 'TH' ? (th.textContent ?? '').trim() || undefined : undefined;
}

function roleOf(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName;
  if (tag === 'BUTTON') return 'button';
  if (tag === 'A') return 'link';
  if (tag === 'SELECT') return 'combobox';
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'INPUT') {
    const t = (el as HTMLInputElement).type;
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    if (t === 'submit' || t === 'button') return 'button';
    return 'textbox';
  }
  if ((el as HTMLElement).isContentEditable || el.getAttribute('contenteditable') === 'true') return 'textbox';
  if (/^H[1-6]$/.test(tag)) return 'heading';
  return 'text';
}

function directText(el: Element): string {
  let t = '';
  el.childNodes.forEach((c) => { if (c.nodeType === 3) t += c.textContent ?? ''; });
  return t.replace(/\s+/g, ' ').trim();
}

export function accessibleName(el: Element, doc: Document): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? '').join(' ').trim();
    if (t) return t.replace(/\s+/g, ' ');
  }
  const id = el.getAttribute('id');
  if (id) {
    const lab = doc.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (lab?.textContent) return lab.textContent.replace(/\s+/g, ' ').trim();
  }
  const wrap = el.closest('label');
  if (wrap && wrap !== el) {
    const t = directText(wrap);
    if (t) return t;
  }
  if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') {
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  if (el.tagName === 'INPUT' && ['submit', 'button'].includes((el as HTMLInputElement).type)) return (el as HTMLInputElement).value;
  return (el.getAttribute('placeholder') ?? el.getAttribute('title') ?? el.getAttribute('alt') ?? '').trim();
}

function valueOf(el: Element): string {
  if (el instanceof HTMLInputElement) {
    if (['checkbox', 'radio', 'submit', 'button'].includes(el.type)) return '';
    return el.value;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;
  if ((el as HTMLElement).isContentEditable || el.getAttribute('contenteditable') === 'true') return (el.textContent ?? '').trim();
  return '';
}

function opaqueKind(el: Element, win: Window): OpaqueKind | null {
  switch (el.tagName) {
    case 'IMG': return 'img';
    case 'CANVAS': return 'canvas';
    case 'VIDEO': return 'video';
    case 'IFRAME': {
      try { return (el as HTMLIFrameElement).contentDocument ? null : 'iframe'; } catch { return 'iframe'; }
    }
    case 'svg': case 'SVG': return (el.textContent ?? '').trim() ? null : 'svg';
  }
  const bg = win.getComputedStyle(el).backgroundImage;
  return bg && bg !== 'none' && bg.includes('url(') ? 'background' : null;
}

export function observe(doc: Document, registry: NodeRegistry, rect: RectFn = defaultRect): RawObservation {
  const win = doc.defaultView!;
  const elements: RawElement[] = [];
  const opaque: OpaqueRegion[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const merged = new Set<Element>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node as Element;
    if (el.parentElement && merged.has(el.parentElement)) { merged.add(el); continue; }
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue;
    if (!visible(el, rect, win)) continue;
    const ok = opaqueKind(el, win);
    if (ok) {
      const alt = (el.getAttribute('alt') ?? el.getAttribute('aria-label') ?? '').trim();
      opaque.push({ nodeId: registry.idFor(el), kind: ok, bbox: rect(el), ...(el.getAttribute('src') ? { src: el.getAttribute('src')! } : {}), ...(alt ? { name: alt } : {}) });
      continue;
    }
    const interactive = el.matches(INTERACTIVE);
    const block = !interactive && isInlineOnlyBlock(el);
    if (block) merged.add(el);
    const text = block ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : directText(el);
    if (!interactive && !(TEXT_TAGS.has(el.tagName) && text)) continue;
    if (el.closest('.ouro-mask-overlay')) continue; // presentation chrome is not page input
    if (!interactive && el.closest('button, a[href], label')) continue; // folded into the control's name
    const input = el as HTMLInputElement;
    const form = el.closest('form');
    const formHay = form ? `${form.id} ${form.getAttribute('name') ?? ''} ${form.getAttribute('action') ?? ''}` : '';
    elements.push({
      nodeId: registry.idFor(el),
      tag: el.tagName.toLowerCase(),
      role: roleOf(el),
      name: interactive ? accessibleName(el, doc) : text,
      text: interactive ? '' : text,
      value: valueOf(el),
      ...(el.tagName === 'INPUT' ? { inputType: input.type || 'text' } : {}),
      ...(el.getAttribute('autocomplete') ? { autocomplete: el.getAttribute('autocomplete')! } : {}),
      ...(el.getAttribute('name') ? { htmlName: el.getAttribute('name')! } : {}),
      ...(el.id ? { htmlId: el.id } : {}),
      ...(el.getAttribute('placeholder') ? { placeholder: el.getAttribute('placeholder')! } : {}),
      ...((input.disabled ?? false) ? { disabled: true } : {}),
      ...(el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(input.type) ? { checked: input.checked } : {}),
      ...(el.getAttribute('contenteditable') === 'true' ? { contentEditable: true } : {}),
      ...(SENSITIVE_FORM.test(formHay) ? { insideSensitiveForm: true } : {}),
      ...(el.closest('footer, [role="contentinfo"]') ? { boilerplate: true } : {}),
      ...(el.tagName === 'A' && /^mailto:/i.test(el.getAttribute('href') ?? '') ? { contact: 'mailto' as const } : {}),
      ...(el.tagName === 'A' && /^tel:/i.test(el.getAttribute('href') ?? '') ? { contact: 'tel' as const } : {}),
      ...(columnHeader(el) ? { context: columnHeader(el)! } : {}),
      ...(el.tagName === 'SELECT' ? { options: Array.from((el as HTMLSelectElement).options).map((o) => (o.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 30) } : {}),
      bbox: rect(el),
    });
  }
  return { url: doc.location?.href ?? '', viewport: { w: win.innerWidth, h: win.innerHeight }, elements, opaque };
}
