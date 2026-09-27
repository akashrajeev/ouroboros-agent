import type { ScreenMap } from './observation';
import { legend, TOKEN_RE, type PlaceholderMap } from './placeholders';

/**
 * Wire name of the redaction scheme the device applies before egress.
 * Bump the suffix whenever masking behavior changes so a server can tell
 * exactly which scheme produced a payload.
 */
export const REDACTION_SCHEME = 'ouroboros-redact/1' as const;

/**
 * /step payload schema version.
 * v1: implicit scheme; the server inferred masking from placeholder-shaped strings.
 * v2: explicit `redaction` manifest; the server KNOWS the scheme, the token
 *     grammar, which elements are masked, and how the image was redacted.
 */
export const PAYLOAD_VERSION = 2 as const;

export interface MaskedImageScheme {
  encoding: 'jpeg';
  /** Solid black fill over text/ID detections, blur over faces (A6). */
  method: 'solid-fill-text+blur-faces';
  /** Masked regions in this image. */
  detections: number;
  /** The masked image's own re-OCR text passed the leak gate before egress. */
  re_ocr_gated: true;
}

export interface MaskedElement {
  element_id: string;
  /** Distinct placeholders this element carries across label, value and options. */
  tokens: string[];
}

/**
 * The explicit redaction manifest attached to every v2 payload. It lets the
 * server process the sanitized context *according to the scheme* instead of
 * guessing: which tokens exist and their types (never the real values), which
 * elements are masked, what was withheld from the DOM list, and how the image
 * (when present) was redacted and re-gated.
 */
export interface RedactionManifest {
  scheme: typeof REDACTION_SCHEME;
  /** Grammar of every placeholder the server may echo back in type/select text. */
  placeholder_format: '<TYPE_N>';
  /** token -> PII type. The placeholder map's real values never leave the device. */
  legend: Record<string, string>;
  /** Every element carrying at least one placeholder, with the tokens it carries. */
  masked_elements: MaskedElement[];
  masked_element_count: number;
  /** Opaque pixel regions withheld from the DOM list; visible only via a need_visual image. */
  opaque_regions: number;
  /** Placeholders carried by the sanitized task text itself. */
  task_tokens: string[];
  image?: MaskedImageScheme;
}

/** Distinct placeholders appearing in a string. */
export function tokensIn(s: string): string[] {
  return [...new Set([...s.matchAll(TOKEN_RE)].map((m) => m[0]))];
}

export function buildRedactionManifest(screen: ScreenMap, map: PlaceholderMap, image?: { detections: number }, task?: string): RedactionManifest {
  const masked: MaskedElement[] = [];
  for (const el of screen.elements) {
    const tokens = [...new Set([el.label, el.value, ...(el.options ?? [])].flatMap(tokensIn))];
    if (tokens.length) masked.push({ element_id: el.id, tokens });
  }
  return {
    scheme: REDACTION_SCHEME,
    placeholder_format: '<TYPE_N>',
    legend: legend(map),
    masked_elements: masked,
    masked_element_count: masked.length,
    opaque_regions: screen.opaqueCount,
    task_tokens: task ? tokensIn(task) : [],
    ...(image
      ? { image: { encoding: 'jpeg' as const, method: 'solid-fill-text+blur-faces' as const, detections: image.detections, re_ocr_gated: true as const } }
      : {}),
  };
}
