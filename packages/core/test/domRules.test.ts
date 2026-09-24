import { describe, expect, it } from 'vitest';
import { compatibleTokenTypes, domRuleType } from '../src/domRules';

describe('domRuleType', () => {
  it('password input', () => expect(domRuleType({ tag: 'input', inputType: 'password' })).toBe('PASSWORD'));
  it('autocomplete otp and cards', () => {
    expect(domRuleType({ tag: 'input', autocomplete: 'one-time-code' })).toBe('OTP');
    expect(domRuleType({ tag: 'input', autocomplete: 'cc-csc' })).toBe('CVV');
    expect(domRuleType({ tag: 'input', autocomplete: 'cc-number' })).toBe('CARD');
  });
  it('labels and ids', () => {
    expect(domRuleType({ tag: 'input', label: 'Enter OTP' })).toBe('OTP');
    expect(domRuleType({ tag: 'input', name: 'aadhaarNumber' })).toBe('AADHAAR');
    expect(domRuleType({ tag: 'input', id: 'pan_no' })).toBe('PAN');
    expect(domRuleType({ tag: 'input', label: 'IFSC Code' })).toBe('IFSC');
    expect(domRuleType({ tag: 'input', label: 'Account Number' })).toBe('ACCOUNT');
    expect(domRuleType({ tag: 'input', label: 'Date of Birth' })).toBe('DOB');
    expect(domRuleType({ tag: 'input', label: 'CVV' })).toBe('CVV');
    expect(domRuleType({ tag: 'input', label: 'UPI PIN' })).toBe('PIN');
    expect(domRuleType({ tag: 'input', label: 'PIN code' })).toBe('PINCODE');
    expect(domRuleType({ tag: 'input', autocomplete: 'postal-code' })).toBe('PINCODE');
  });
  it('does not flag ordinary fields', () => {
    for (const label of ['First name', 'City', 'Search', 'Company', 'Panel title', 'Japan'])
      expect(domRuleType({ tag: 'input', label })).toBeNull();
  });
});

describe('compatibleTokenTypes', () => {
  it('tel and email inputs', () => {
    expect(compatibleTokenTypes({ tag: 'input', inputType: 'tel' })).toEqual(['PHONE']);
    expect(compatibleTokenTypes({ tag: 'input', inputType: 'email' })).toEqual(['EMAIL']);
  });
  it('rule fields take their own type', () => expect(compatibleTokenTypes({ tag: 'input', label: 'Aadhaar' })).toEqual(['AADHAAR']));
});
