import type { ScreenMap } from './observation';
import { detectPatterns } from './patterns';
import { PlaceholderMap, TOKEN_RE } from './placeholders';

/** A9: nothing from the server executes without passing every check here. */
export const OPS = ['click', 'type', 'select', 'scroll', 'wait', 'done', 'ask_user', 'need_visual'] as const;
export type Op = (typeof OPS)[number];

export interface Action { op: Op; element_id?: string | null; text?: string | null; reason?: string }

export type Verdict =
  | { ok: true; needsConfirm: boolean; action: Action }
  | { ok: false; reason: string };

const CONSEQUENTIAL = /submit|pay|place order|delete|remove|send|upload|confirm|transfer|buy|sign ?up|register/i;
const NEEDS_ELEMENT: Op[] = ['click', 'type', 'select'];

function isAction(x: unknown): x is Action {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  if (typeof a.op !== 'string' || !(OPS as readonly string[]).includes(a.op)) return false;
  if (a.element_id != null && typeof a.element_id !== 'string') return false;
  if (a.text != null && typeof a.text !== 'string') return false;
  return true;
}

/**
 * @param planned  screen map the server planned on
 * @param current  screen map observed right before execution
 */
export function validateAction(raw: unknown, planned: ScreenMap, current: ScreenMap, map: PlaceholderMap): Verdict {
  if (!isAction(raw)) return { ok: false, reason: 'schema' };
  const a = raw;
  if (NEEDS_ELEMENT.includes(a.op)) {
    const id = a.element_id;
    if (!id) return { ok: false, reason: 'missing_element' };
    const el = current.elements.find((e) => e.id === id);
    if (!el) return { ok: false, reason: 'unknown_element' };
    if (planned.fingerprint[id] !== current.fingerprint[id]) return { ok: false, reason: 'stale_element' };
    if (el.state.disabled) return { ok: false, reason: 'disabled_element' };

    if (a.op === 'type' || a.op === 'select') {
      const text = a.text ?? '';
      const tokens = [...text.matchAll(TOKEN_RE)].map((m) => m[0]);
      for (const t of tokens) {
        const r = map.resolve(t);
        if (!r) return { ok: false, reason: 'unknown_token' };
        const acc = current.accepts[id] ?? 'any';
        if (acc === 'any') {
          if (el.field_type === 'password') return { ok: false, reason: 'token_type_mismatch' };
        } else if (!acc.includes(r.type)) {
          return { ok: false, reason: 'token_type_mismatch' };
        }
      }
      // A raw value-like string the device never handed out is suspicious.
      if (detectPatterns(text.replace(TOKEN_RE, ' ')).length) return { ok: false, reason: 'raw_value_in_text' };
    }
    const needsConfirm = a.op === 'click' && CONSEQUENTIAL.test(el.label);
    return { ok: true, needsConfirm, action: a };
  }
  return { ok: true, needsConfirm: false, action: a };
}
