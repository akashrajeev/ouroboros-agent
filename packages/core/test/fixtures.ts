import type { RawElement, RawObservation } from '../src/observation';
import { verhoeffCheckDigit } from '../src/checksums';

export const AADHAAR = '23456789012' + verhoeffCheckDigit('23456789012');

const el = (i: number, e: Partial<RawElement>): RawElement => ({
  nodeId: `n${i}`, tag: 'input', role: 'textbox', name: '', text: '', value: '',
  bbox: { x: 100, y: 100 + i * 50, w: 300, h: 30 }, ...e,
});

export function kycObservation(): RawObservation {
  return {
    url: 'https://bank.example.in/kyc?step=2',
    viewport: { w: 1280, h: 800 },
    elements: [
      el(0, { tag: 'h1', role: 'heading', name: 'Welcome back', text: 'Welcome back' }),
      el(1, { name: 'Full name', inputType: 'text', value: 'Ravi Kumar' }),
      el(2, { name: 'Mobile', inputType: 'tel', value: '+91 98765 43210' }),
      el(3, { name: 'Aadhaar number', inputType: 'text', htmlName: 'aadhaar', value: AADHAAR }),
      el(4, { name: 'Password', inputType: 'password', value: 'hunter2!' }),
      el(5, { tag: 'p', role: 'text', name: '', text: 'Registered email ravi.k@example.com, PAN ABCPE1234F' }),
      el(6, { name: 'Email', inputType: 'email', value: '' }),
      el(7, { tag: 'button', role: 'button', name: 'Submit application', text: 'Submit application' }),
    ],
    opaque: [{ nodeId: 'n9', kind: 'img', bbox: { x: 900, y: 100, w: 200, h: 120 } }],
  };
}
