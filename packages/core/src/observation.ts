import type { BBox } from './types';

/** A2 output. Contains REAL values. Device memory only; never serialize to the network. */
export interface RawElement {
  nodeId: string;
  tag: string;
  role: string;
  name: string;
  text: string;
  value: string;
  inputType?: string;
  autocomplete?: string;
  htmlName?: string;
  htmlId?: string;
  placeholder?: string;
  disabled?: boolean;
  checked?: boolean;
  contentEditable?: boolean;
  insideSensitiveForm?: boolean;
  /** Nearby label text that is not part of the element (e.g. table column header). Used only as detector context. */
  context?: string;
  /** <select> option texts (real page content; sanitized before sending). */
  options?: string[];
  /** Element sits inside a boilerplate region (<footer>, [role=contentinfo]). Detection context only; never serialized. */
  boilerplate?: boolean;
  /** Link whose visible text is the site's own contact endpoint (mailto:/tel: href), not user data. */
  contact?: 'mailto' | 'tel';
  bbox: BBox;
}

export type OpaqueKind = 'img' | 'canvas' | 'video' | 'svg' | 'iframe' | 'background';

export interface OpaqueRegion { nodeId: string; kind: OpaqueKind; bbox: BBox; src?: string; /** alt / aria-label, sanitized before sending */ name?: string }

export interface RawObservation {
  url: string;
  viewport: { w: number; h: number };
  elements: RawElement[];
  opaque: OpaqueRegion[];
}

/** A5 element as sent to the server. Values are safe text or placeholders. */
export interface ScreenElement {
  id: string;
  role: string;
  label: string;
  field_type?: string;
  value: string;
  state: Record<string, boolean>;
  options?: string[];
  bbox: [number, number, number, number];
}

export interface ScreenMap {
  url_origin: string;
  elements: ScreenElement[];
  /** e-id -> nodeId, device-local, used to execute actions. */
  nodeOf: Record<string, string>;
  /** e-id -> fingerprint (role|label|rounded bbox) for the stale-state check. */
  fingerprint: Record<string, string>;
  /** e-id -> token types the field accepts. */
  accepts: Record<string, string[] | 'any'>;
  opaqueCount: number;
}
