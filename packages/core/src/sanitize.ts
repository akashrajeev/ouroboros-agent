import { compatibleTokenTypes, domRuleType } from './domRules';
import type { RawElement, RawObservation, ScreenElement, ScreenMap } from './observation';
import { detectPatterns } from './patterns';
import { PlaceholderMap, redactText } from './placeholders';
import type { FieldInfo, PiiType, SensitiveDetection, TextMatch } from './types';

/** Optional extra text detector (A3c NER). Returns matches over the given string. */
export type TextDetector = (text: string) => TextMatch[];

export interface SanitizeOptions {
  extraDetectors?: TextDetector[];
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

function mergeMatches(lists: TextMatch[][]): TextMatch[] {
  const all = lists.flat().sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out: TextMatch[] = [];
  for (const m of all) {
    const last = out[out.length - 1];
    if (last && m.start < last.end) {
      // Union for recall: extend the earlier span, keep the pattern type if either is a pattern.
      if (m.end > last.end) { last.end = m.end; }
      continue;
    }
    out.push({ ...m });
  }
  return out;
}

function redactString(s: string, map: PlaceholderMap, opts: SanitizeOptions, sink: TextMatch[]): string {
  if (!s) return s;
  const lists = [detectPatterns(s), ...(opts.extraDetectors ?? []).map((d) => d(s))];
  const merged = mergeMatches(lists).map((m) => ({ ...m, value: s.slice(m.start, m.end) }));
  sink.push(...merged);
  return merged.length ? redactText(s, merged, map) : s;
}

/**
 * A3a/A3b(+A3c) -> A4 -> A5 -> A6 for DOM elements. Pure: all real values end up
 * only inside `map`.
 */
export function sanitize(obs: RawObservation, map: PlaceholderMap, opts: SanitizeOptions = {}): SanitizeResult {
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
        value = redactString(value, map, opts, hits);
      }
    }
    const label = redactString(el.name, map, opts, hits);
    const text = el.text && el.text !== el.name ? redactString(el.text, map, opts, hits) : '';
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
      value, state, bbox,
    });
    nodeOf[id] = el.nodeId;
    fingerprint[id] = `${el.role}|${fullLabel}|${bbox.map((n) => n.toFixed(2)).join(',')}`;
    accepts[id] = compatibleTokenTypes(field);
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
