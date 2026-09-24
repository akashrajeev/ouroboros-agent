import type { PiiType, TextMatch } from './types';

/** Canonical form used for token reuse and for the leak gate. */
export function normalizeValue(v: string): string {
  return v.toLowerCase().replace(/[\s\-_.()/+,:]/g, '');
}

export const TOKEN_RE = /<([A-Z]+)_(\d+)>/g;

/**
 * A6m: token -> real value. Lives in device memory only (chrome.storage.session
 * in the extension). Same (type, value) always yields the same token for the
 * life of the map. Never serialize this object into a network payload.
 */
export class PlaceholderMap {
  private byKey = new Map<string, string>();
  private byToken = new Map<string, { type: PiiType; value: string }>();
  private counters = new Map<PiiType, number>();

  tokenFor(type: PiiType, value: string): string {
    const key = `${type}:${normalizeValue(value)}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    const token = `<${type}_${n}>`;
    this.byKey.set(key, token);
    this.byToken.set(token, { type, value });
    return token;
  }

  resolve(token: string): { type: PiiType; value: string } | undefined {
    return this.byToken.get(token);
  }

  values(): { token: string; type: PiiType; value: string }[] {
    return [...this.byToken].map(([token, v]) => ({ token, ...v }));
  }

  get size(): number { return this.byToken.size; }

  clear(): void {
    this.byKey.clear();
    this.byToken.clear();
    this.counters.clear();
  }

  /** Snapshot for chrome.storage.session. Device-local only. */
  toJSON(): never {
    throw new Error('PlaceholderMap must not be serialized; use exportLocal()');
  }

  exportLocal(): { token: string; type: PiiType; value: string }[] { return this.values(); }

  static importLocal(rows: { token: string; type: PiiType; value: string }[]): PlaceholderMap {
    const m = new PlaceholderMap();
    for (const r of rows) {
      m.byToken.set(r.token, { type: r.type, value: r.value });
      m.byKey.set(`${r.type}:${normalizeValue(r.value)}`, r.token);
      const n = Number(/_(\d+)>$/.exec(r.token)?.[1] ?? 0);
      m.counters.set(r.type, Math.max(m.counters.get(r.type) ?? 0, n));
    }
    return m;
  }
}

/** Replace matched spans with tokens. Matches must not overlap. */
export function redactText(text: string, matches: TextMatch[], map: PlaceholderMap): string {
  let out = '';
  let pos = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < pos) continue;
    out += text.slice(pos, m.start) + map.tokenFor(m.type, m.value);
    pos = m.end;
  }
  return out + text.slice(pos);
}

/** A10: swap tokens back to real values. Unknown tokens are left untouched and reported. */
export function rehydrate(text: string, map: PlaceholderMap): { text: string; unknown: string[] } {
  const unknown: string[] = [];
  const out = text.replace(TOKEN_RE, (tok) => {
    const r = map.resolve(tok);
    if (!r) { unknown.push(tok); return tok; }
    return r.value;
  });
  return { text: out, unknown };
}

/** Human-readable legend sent with the payload so the planner knows token meaning. */
export function legend(map: PlaceholderMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { token, type } of map.values()) out[token] = type;
  return out;
}
