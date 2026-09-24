import { describe, expect, it } from 'vitest';
import { PlaceholderMap } from '../src/placeholders';
import { sanitize } from '../src/sanitize';
import { validateAction } from '../src/validator';
import { kycObservation } from './fixtures';

function setup() {
  const map = new PlaceholderMap();
  const { screen } = sanitize(kycObservation(), map);
  return { map, screen };
}

describe('validator', () => {
  it('accepts a typed token into a compatible field', () => {
    const { map, screen } = setup();
    const v = validateAction({ op: 'type', element_id: 'e7', text: '<EMAIL_1>' }, screen, screen, map);
    expect(v.ok).toBe(true);
  });
  it('rejects token type mismatch (phone into email field)', () => {
    const { map, screen } = setup();
    const v = validateAction({ op: 'type', element_id: 'e7', text: '<PHONE_1>' }, screen, screen, map);
    expect(v).toEqual({ ok: false, reason: 'token_type_mismatch' });
  });
  it('rejects unknown tokens, unknown elements, bad ops', () => {
    const { map, screen } = setup();
    expect(validateAction({ op: 'type', element_id: 'e7', text: '<EMAIL_9>' }, screen, screen, map)).toMatchObject({ reason: 'unknown_token' });
    expect(validateAction({ op: 'click', element_id: 'e99' }, screen, screen, map)).toMatchObject({ reason: 'unknown_element' });
    expect(validateAction({ op: 'eval', text: 'x' }, screen, screen, map)).toMatchObject({ reason: 'schema' });
    expect(validateAction('click', screen, screen, map)).toMatchObject({ reason: 'schema' });
  });
  it('rejects stale elements', () => {
    const { map, screen } = setup();
    const obs = kycObservation();
    obs.elements[7]!.bbox.y += 200;
    const current = sanitize(obs, map).screen;
    expect(validateAction({ op: 'click', element_id: 'e8' }, screen, current, map)).toMatchObject({ reason: 'stale_element' });
  });
  it('rejects raw value-like text the device never issued', () => {
    const { map, screen } = setup();
    expect(validateAction({ op: 'type', element_id: 'e2', text: '9123456789' }, screen, screen, map)).toMatchObject({ reason: 'raw_value_in_text' });
  });
  it('flags consequential clicks for confirmation', () => {
    const { map, screen } = setup();
    const v = validateAction({ op: 'click', element_id: 'e8' }, screen, screen, map);
    expect(v).toMatchObject({ ok: true, needsConfirm: true });
  });
});
