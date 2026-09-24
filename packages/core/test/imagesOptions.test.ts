import { describe, expect, it } from 'vitest';
import { leakGate } from '../src/leakGate';
import { PlaceholderMap } from '../src/placeholders';
import { sanitize, wireScreenMap } from '../src/sanitize';
import type { RawObservation } from '../src/observation';

const obs = (): RawObservation => ({
  url: 'https://kyc.example.in/verify', viewport: { w: 1000, h: 800 },
  elements: [{ nodeId: 'n1', tag: 'select', role: 'combobox', name: 'Pick your PAN', text: '', value: '', options: ['Select...', 'ABCPE1234F', 'e-KYC card'], bbox: { x: 0, y: 0, w: 100, h: 20 } }],
  opaque: [{ nodeId: 'n2', kind: 'img', bbox: { x: 0, y: 100, w: 500, h: 300 }, src: 'https://x.in/u/ABCPE1234F.png', name: 'Card of ABCPE1234F' }],
});

describe('images and select options on the wire', () => {
  it('lists the image so the planner can ask need_visual, without src or raw alt PII', async () => {
    const map = new PlaceholderMap();
    const { screen } = sanitize(obs(), map);
    const wire = JSON.stringify(wireScreenMap(screen));
    expect(wire).not.toContain('ABCPE1234F');
    const img = screen.elements.find((e) => e.role === 'image')!;
    expect(img.label).toContain('need_visual');
    expect(screen.nodeOf[img.id]).toBe('n2');
    expect(screen.elements[0]!.options).toEqual(['Select...', '<PAN_1>', 'e-KYC card']);
    expect((await leakGate(wire, map)).pass).toBe(true);
  });
});

import { validateAction } from '../src/validator';
describe('click-with-option repair', () => {
  it('turns click+exact option text on a combobox into select, and nothing else', () => {
    const map = new PlaceholderMap();
    const { screen } = sanitize(obs(), map);
    const ok = validateAction({ op: 'click', element_id: 'e1', text: 'e-KYC card' }, screen, screen, map);
    expect(ok.ok && ok.action.op).toBe('select');
    const other = validateAction({ op: 'click', element_id: 'e1', text: 'something else' }, screen, screen, map);
    expect(other.ok && other.action.op).toBe('click');
  });
});
