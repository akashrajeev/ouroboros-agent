import { detectPatterns } from './patterns';
import { normalizeValue, PlaceholderMap } from './placeholders';
import type { PiiType } from './types';

/**
 * A7: the last check before egress. Runs on the exact serialized payload.
 * Checks: (1) exact + normalized match against every mapped real value,
 * (2) pattern re-scan, (3) OCR text of the masked image (caller supplies it),
 * (4) canaries planted by test pages.
 */
export type LeakKind = 'map_exact' | 'map_normalized' | 'pattern' | 'ocr' | 'canary';

export interface LeakHit { kind: LeakKind; type?: PiiType; token?: string; where: 'payload' | 'image' }

export interface LeakGateResult {
  pass: boolean;
  hits: LeakHit[];
  sha256: string;
  bytes: number;
}

export interface LeakGateOptions {
  canaries?: string[];
  /** Text recovered by re-OCR of the masked screenshot, if any. */
  imageText?: string;
  /** Short values (< this many normalized chars) only match exactly on word boundaries. */
  minNormalizedLen?: number;
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function scan(text: string, where: 'payload' | 'image', map: PlaceholderMap, opts: LeakGateOptions): LeakHit[] {
  const hits: LeakHit[] = [];
  const minLen = opts.minNormalizedLen ?? 6;
  const norm = normalizeValue(text);
  for (const { token, type, value } of map.values()) {
    const nv = normalizeValue(value);
    if (!nv) continue;
    if (new RegExp(`(?<![A-Za-z0-9]|\\d[.,])${escapeRe(value)}(?![A-Za-z0-9]|[.,]\\d)`, 'i').test(text)) {
      hits.push({ kind: 'map_exact', type, token, where });
    } else if (nv.length >= minLen && norm.includes(nv)) {
      hits.push({ kind: 'map_normalized', type, token, where });
    }
  }
  for (const m of detectPatterns(text)) hits.push({ kind: where === 'image' ? 'ocr' : 'pattern', type: m.type, where });
  for (const c of opts.canaries ?? []) {
    if (text.includes(c) || norm.includes(normalizeValue(c))) hits.push({ kind: 'canary', where });
  }
  return hits;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function leakGate(payload: string, map: PlaceholderMap, opts: LeakGateOptions = {}): Promise<LeakGateResult> {
  const hits = scan(payload, 'payload', map, opts);
  if (opts.imageText) hits.push(...scan(opts.imageText, 'image', map, opts));
  return {
    pass: hits.length === 0,
    hits,
    sha256: await sha256Hex(payload),
    bytes: new TextEncoder().encode(payload).length,
  };
}
