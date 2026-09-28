import { compatibleTokenTypes, domRuleType } from './domRules';
import type { RawElement, RawObservation, ScreenElement, ScreenMap } from './observation';
import { detectPatterns } from './patterns';
import { PlaceholderMap, redactText } from './placeholders';
import type { FieldInfo, PiiType, SensitiveDetection, TextMatch } from './types';

/** Optional extra text detector (A3c NER). Returns matches over the given string. */
export type TextDetector = (text: string) => TextMatch[];

export interface SanitizeOptions {
  extraDetectors?: TextDetector[];
  /** Hostname of the observed page (www stripped); lets contact-link gating recognize a site's own domain. */
  pageHost?: string;
}

export interface SanitizeResult {
  screen: ScreenMap;
  detections: SensitiveDetection[];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function fieldOf(el: RawElement): FieldInfo {
  return {
    tag: el.tag, inputType: el.inputType, autocomplete: el.autocomplete, name: el.htmlName,
    id: el.htmlId, label: el.name, placeholder: el.placeholder,
    insideSensitiveForm: el.insideSensitiveForm, contentEditable: el.contentEditable,
  };
}

/**
 * A4 fusion for text. Rule/pattern spans are authoritative. Model (NER) spans never
 * override them: an overlapping model span is cut into the pieces outside the rule spans.
 * Remaining overlaps are unioned for recall.
 */
export function mergeMatches(lists: TextMatch[][]): TextMatch[] {
  const flat = lists.flat();
  const rules = flat.filter((m) => m.source !== 'ner');
  const pieces: TextMatch[] = [];
  for (const m of flat.filter((x) => x.source === 'ner')) {
    let segs: [number, number][] = [[m.start, m.end]];
    for (const r of rules) {
      segs = segs.flatMap(([a, b]) => (r.end <= a || r.start >= b ? [[a, b]] : [[a, Math.max(a, r.start)], [Math.min(b, r.end), b]]).filter((seg) => seg[1]! > seg[0]!) as [number, number][]);
    }
    for (const [a, b] of segs) pieces.push({ ...m, start: a, end: b });
  }
  const all = [...rules, ...pieces].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out: TextMatch[] = [];
  for (const m of all) {
    const last = out[out.length - 1];
    if (last && m.start < last.end) {
      if (m.end > last.end && last.source === 'ner' && m.source === 'ner') last.end = m.end;
      continue;
    }
    out.push({ ...m });
  }
  return out;
}

/** Strip surrounding spaces/punctuation from a span so tokens replace only the value. */
function trimSpan(s: string, m: TextMatch): TextMatch {
  let { start, end } = m;
  while (start < end && /[\s,.:;]/.test(s[start]!)) start++;
  while (end > start && /[\s,.:;]/.test(s[end - 1]!)) end--;
  if (m.type === 'ADDRESS') {
    // A cut before a pincode can leave its label behind ("..., Pasan, PIN").
    const tail = /[\s,]*\b(pin ?code|pin|zip|postal code)$/i.exec(s.slice(start, end));
    if (tail) end -= tail[0].length;
  }
  return { ...m, start, end, value: s.slice(start, end) };
}

const escRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A6b: a value the device already mapped (e.g. from the task text) is replaced wherever it shows up on screen, even where no detector fires. */
function knownValues(s: string, map: PlaceholderMap): TextMatch[] {
  const out: TextMatch[] = [];
  for (const { type, value } of map.values()) {
    if (value.length < 3) continue;
    const re = new RegExp(`(?<![A-Za-z0-9])${escRe(value)}(?![A-Za-z0-9])`, 'gi');
    for (const m of s.matchAll(re)) out.push({ type, start: m.index!, end: m.index! + m[0].length, value: m[0], source: 'known', confidence: 1 });
  }
  return out;
}

interface RedactCtx {
  /** Element sits in a boilerplate region (footer/contentinfo). */
  boilerplate?: boolean;
  /** Link whose visible text is the site's own contact endpoint. */
  contact?: 'mailto' | 'tel';
  /** True when redacting a field value (what the user typed). */
  isValue?: boolean;
}

function redactString(s: string, map: PlaceholderMap, opts: SanitizeOptions, sink: TextMatch[], context = '', rctx?: RedactCtx): string {
  if (!s) return s;
  // Context (e.g. a column header) is prepended for detection only, then offsets are shifted back.
  const pre = context ? `${context}: ` : '';
  const shift = (ms: TextMatch[]) => ms.map((m) => ({ ...m, start: m.start - pre.length, end: m.end - pre.length })).filter((m) => m.start >= 0);
  const lists = [knownValues(s, map), shift(detectPatterns(pre + s)), ...(opts.extraDetectors ?? []).map((d) => d(s))];
  const merged = mergeMatches(lists)
    .map((m) => trimSpan(s, m))
    .filter((m) => m.source !== 'ner' || (m.value.match(/[A-Za-z0-9]/g) ?? []).length >= 3)
    .filter((m) => {
      // A mailto:/tel: link's visible text is usually the site's own published contact endpoint,
      // not user data - but only when the context backs that: the link sits in boilerplate
      // (footer/contentinfo, e.g. broker complaint lines) or points at the site's own domain.
      // Anywhere else (a personal inbox, a message body) the visible address IS user data and masks.
      if (rctx?.contact === 'mailto' && m.type === 'EMAIL') {
        const dom = (m.value.split('@')[1] ?? '').toLowerCase();
        const own = !!opts.pageHost && !!dom && (dom === opts.pageHost || dom.endsWith(`.${opts.pageHost}`));
        if (rctx?.boilerplate || own) return false;
      }
      if (rctx?.contact === 'tel' && m.type === 'PHONE' && rctx?.boilerplate) return false;
      // Boilerplate regions (footer/contentinfo) are dominated by site-owned corporate text
      // (registered addresses, regulatory disclosures, navigation); uncorroborated NER-only spans
      // there are mostly false positives. Pattern/DOM-rule matches still mask. Field values are
      // never gated: what the user typed is user data wherever the field sits. Values already
      // tokenized (source 'known') also still mask everywhere - real user data in a footer stays protected.
      if (!rctx?.isValue && rctx?.boilerplate && m.source === 'ner') return false;
      return true;
    });
  sink.push(...merged);
  return merged.length ? redactText(s, merged, map) : s;
}

/**
 * A3a/A3b(+A3c) -> A4 -> A5 -> A6 for DOM elements. Pure: all real values end up
 * only inside `map`.
 */
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

export function sanitize(obs: RawObservation, map: PlaceholderMap, opts: SanitizeOptions = {}): SanitizeResult {
  opts = { ...opts, pageHost: opts.pageHost ?? hostOf(obs.url) };
  const { w, h } = obs.viewport;
  const elements: ScreenElement[] = [];
  const nodeOf: Record<string, string> = {};
  const fingerprint: Record<string, string> = {};
  const accepts: ScreenMap['accepts'] = {};
  const detections: SensitiveDetection[] = [];

  obs.elements.forEach((el, i) => {
    const id = `e${i + 1}`;
    const field = fieldOf(el);
    const rule: PiiType | null = domRuleType(field);
    const hits: TextMatch[] = [];

    let value = el.value;
    if (value) {
      if (rule) {
        value = map.tokenFor(rule, value);
        detections.push({ id: `d${detections.length + 1}`, type: rule, sources: ['dom_rule'], confidence: 1, nodeId: el.nodeId, bbox: el.bbox });
      } else {
        value = redactString(value, map, opts, hits, el.name, { isValue: true, boilerplate: el.boilerplate, contact: el.contact });
      }
    }
    const label = redactString(el.name, map, opts, hits, el.context, { boilerplate: el.boilerplate, contact: el.contact });
    const text = el.text && el.text !== el.name ? redactString(el.text, map, opts, hits, el.context, { boilerplate: el.boilerplate, contact: el.contact }) : '';
    for (const m of hits) {
      detections.push({ id: `d${detections.length + 1}`, type: m.type, sources: [m.source], confidence: m.confidence, nodeId: el.nodeId, bbox: el.bbox });
    }

    const bbox: [number, number, number, number] = [round(el.bbox.x / w), round(el.bbox.y / h), round(el.bbox.w / w), round(el.bbox.h / h)];
    const state: Record<string, boolean> = {};
    if (el.disabled) state.disabled = true;
    if (el.checked !== undefined) state.checked = el.checked;
    const fullLabel = text ? (label ? `${label} | ${text}` : text) : label;
    elements.push({
      id, role: el.role, label: fullLabel,
      ...(el.inputType ? { field_type: el.inputType } : el.tag === 'textarea' ? { field_type: 'textarea' } : {}),
      value, state,
      ...(el.options?.length ? { options: el.options.map((o) => redactString(o, map, opts, hits, el.name, { boilerplate: el.boilerplate, contact: el.contact })) } : {}),
      bbox,
    });
    nodeOf[id] = el.nodeId;
    fingerprint[id] = `${el.role}|${fullLabel}|${bbox.map((n) => n.toFixed(2)).join(',')}`;
    accepts[id] = compatibleTokenTypes(field);
  });

  // Images/canvases: the planner must know they exist to ask for need_visual. Only kind + sanitized alt + box; never src (URLs can carry PII).
  obs.opaque.forEach((o, j) => {
    const id = `e${obs.elements.length + j + 1}`;
    const hits: TextMatch[] = [];
    const alt = o.name ? redactString(o.name, map, opts, hits) : '';
    const bbox: [number, number, number, number] = [round(o.bbox.x / w), round(o.bbox.y / h), round(o.bbox.w / w), round(o.bbox.h / h)];
    const label = `${alt || o.kind} (${o.kind}: pixels not in this list; use need_visual to see it)`;
    elements.push({ id, role: 'image', label, value: '', state: {}, bbox });
    nodeOf[id] = o.nodeId;
    fingerprint[id] = `image|${label}|${bbox.map((n) => n.toFixed(2)).join(',')}`;
    accepts[id] = [];
  });

  let origin = '';
  try { origin = new URL(obs.url).origin; } catch { /* about:blank etc. */ }
  return {
    screen: { url_origin: origin, elements, nodeOf, fingerprint, accepts, opaqueCount: obs.opaque.length },
    detections,
  };
}

/** The exact object serialized for egress: no device-local fields. */
export function wireScreenMap(s: ScreenMap): Pick<ScreenMap, 'url_origin' | 'elements'> {
  return { url_origin: s.url_origin, elements: s.elements };
}
