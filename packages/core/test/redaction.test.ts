import { describe, expect, it } from 'vitest';
import {
  buildRedactionManifest, PlaceholderMap, PAYLOAD_VERSION, REDACTION_SCHEME, sanitize, tokensIn, type RawObservation,
} from '../src/index';

const obs = (value: string): RawObservation => ({
  url: 'https://kyc.test/form',
  viewport: { w: 1000, h: 800 },
  elements: [
    { nodeId: 'n1', tag: 'input', role: 'textbox', name: 'Mobile number', text: '', value, inputType: 'tel', bbox: { x: 10, y: 10, w: 200, h: 30 } },
    { nodeId: 'n2', tag: 'button', role: 'button', name: 'Submit', text: '', value: '', bbox: { x: 10, y: 60, w: 100, h: 30 } },
  ],
  opaque: [{ nodeId: 'n3', kind: 'img', bbox: { x: 0, y: 100, w: 50, h: 50 } }],
});

describe('redaction manifest (payload v2)', () => {
  it('names the scheme and the token grammar explicitly', () => {
    const m = buildRedactionManifest(sanitize(obs(''), new PlaceholderMap()).screen, new PlaceholderMap());
    expect(m.scheme).toBe(REDACTION_SCHEME);
    expect(m.placeholder_format).toBe('<TYPE_N>');
    expect(PAYLOAD_VERSION).toBe(2);
  });

  it('lists exactly the masked elements with their typed tokens, never real values', () => {
    const map = new PlaceholderMap();
    const { screen } = sanitize(obs('9876543210'), map);
    const m = buildRedactionManifest(screen, map);
    expect(m.masked_element_count).toBe(1);
    expect(m.masked_elements[0]).toEqual({ element_id: 'e1', tokens: ['<PHONE_1>'] });
    expect(m.legend).toEqual({ '<PHONE_1>': 'PHONE' });
    expect(JSON.stringify(m)).not.toContain('9876543210');
  });

  it('reports opaque regions and, when present, the image redaction method + re-OCR gate', () => {
    const map = new PlaceholderMap();
    const { screen } = sanitize(obs(''), map);
    const without = buildRedactionManifest(screen, map);
    expect(without.opaque_regions).toBe(1);
    expect(without.image).toBeUndefined();
    const withImg = buildRedactionManifest(screen, map, { detections: 3 });
    expect(withImg.image).toEqual({ encoding: 'jpeg', method: 'solid-fill-text+blur-faces', detections: 3, re_ocr_gated: true });
  });

  it('tokensIn finds distinct placeholders only', () => {
    expect(tokensIn('a <PAN_1> b <PAN_1> <NAME_2> c')).toEqual(['<PAN_1>', '<NAME_2>']);
    expect(tokensIn('no tokens')).toEqual([]);
  });
});
