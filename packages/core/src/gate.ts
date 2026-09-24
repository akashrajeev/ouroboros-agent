import type { RawObservation } from './observation';

/** FNV-1a 32-bit; fast, stable, not cryptographic (keys stay on device). */
export function fnv1a(s: string, h = 0x811c9dc5): number {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * A1/G1 DOM half: a key over everything the sanitizer reads. Equal keys mean the
 * sanitized screen map (and all detector work) can be reused. bbox rounded to 2 px so
 * sub-pixel layout jitter does not bust the cache.
 */
export function observationKey(raw: RawObservation): string {
  let h = fnv1a(`${raw.url}|${raw.viewport.w}x${raw.viewport.h}`);
  for (const e of raw.elements) {
    const b = e.bbox;
    h = fnv1a(`${e.nodeId}\u0001${e.role}\u0001${e.name}\u0001${e.text}\u0001${e.value}\u0001${e.checked ?? ''}\u0001${e.disabled ?? ''}\u0001${e.context ?? ''}\u0001${[b.x, b.y, b.w, b.h].map((n) => Math.round(n / 2)).join(',')}`, h);
  }
  for (const o of raw.opaque) h = fnv1a(`${o.nodeId}\u0001${o.kind}\u0001${o.src ?? ''}\u0001${Math.round(o.bbox.x / 2)},${Math.round(o.bbox.y / 2)},${Math.round(o.bbox.w / 2)},${Math.round(o.bbox.h / 2)}`, h);
  return `${raw.elements.length}.${raw.opaque.length}.${h.toString(16)}`;
}

/** Small LRU used by G4 caches (text->NER, image src->OCR/faces, observation key->screen map). */
export class Lru<V> {
  private m = new Map<string, V>();
  hits = 0; misses = 0;
  constructor(private cap = 256) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v === undefined) { this.misses++; return undefined; }
    this.hits++; this.m.delete(k); this.m.set(k, v); return v;
  }
  set(k: string, v: V): void {
    this.m.delete(k); this.m.set(k, v);
    if (this.m.size > this.cap) this.m.delete(this.m.keys().next().value!);
  }
  clear(): void { this.m.clear(); }
  get size() { return this.m.size; }
  get hitRate() { return this.hits / Math.max(1, this.hits + this.misses); }
}
