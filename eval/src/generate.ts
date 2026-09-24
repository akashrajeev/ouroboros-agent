import { fakerEN_IN, type Faker } from '@faker-js/faker';
import type { PiiType } from '@ouroboros/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as id from './ids';

/**
 * Synthetic Indian test pages with exact ground truth. Deterministic by seed.
 * Each page lists every sensitive value it contains (truth) and the look-alike
 * strings that must NOT be flagged (decoys).
 */
export interface Truth { type: PiiType; value: string }
export interface Page { id: string; template: string; html: string; truth: Truth[]; decoys: string[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function person(f: Faker) {
  const first = f.person.firstName();
  const last = f.person.lastName();
  const addr = `${f.location.buildingNumber()}, ${f.location.street()}, ${f.location.city()}`;
  return { first, name: `${first} ${last}`, addr };
}

function decoys(f: Faker): string[] {
  return [
    `ORD-${f.number.int({ min: 2019, max: 2026 })}-${f.number.int({ min: 100000, max: 999999 })}`,
    `Rs ${f.number.int({ min: 1, max: 99 })},${f.number.int({ min: 100, max: 999 })}`,
    id.badAadhaar(f),
    id.badMobile(f),
    id.badCard(f),
    id.badPan(f),
    `${String(f.number.int({ min: 1, max: 28 })).padStart(2, '0')}/${String(f.number.int({ min: 1, max: 12 })).padStart(2, '0')}/2025`,
    `v${f.number.int({ min: 1, max: 9 })}.${f.number.int({ min: 0, max: 20 })}.${f.number.int({ min: 0, max: 400 })}`,
  ];
}

function decoyBlock(d: string[]): string {
  return `<section><h3>Recent activity</h3>
    <p>Order ${esc(d[0]!)} delivered. Amount ${esc(d[1]!)}.</p>
    <p>Reference number ${esc(d[2]!)} and ticket ${esc(d[3]!)}.</p>
    <p>Gift code ${esc(d[4]!)}, voucher ${esc(d[5]!)}.</p>
    <p>Next review due ${esc(d[6]!)}. App version ${esc(d[7]!)}.</p></section>`;
}

const input = (label: string, idAttr: string, value: string, extra = '') =>
  `<div><label for="${idAttr}">${esc(label)}</label><input id="${idAttr}" name="${idAttr}" value="${esc(value)}" ${extra}></div>`;

function kyc(f: Faker): Omit<Page, 'id'> {
  const p = person(f);
  const t = { name: p.name, dob: id.dob(f), mob: id.mobile(f), email: f.internet.email({ firstName: p.first }).toLowerCase(), aad: id.aadhaarFormatted(f), pan: id.pan(f), pin: id.pincode(f), pw: f.internet.password({ length: 12 }), otp: id.otp(f) };
  const d = decoys(f);
  const html = `<h1>KYC verification</h1><form id="kyc">
    ${input('Full name', 'fullname', t.name)}
    ${input('Date of birth', 'dob', t.dob)}
    ${input('Mobile number', 'mobile', t.mob, 'type="tel"')}
    ${input('Email', 'email', t.email, 'type="email"')}
    ${input('Aadhaar number', 'aadhaar', t.aad)}
    ${input('PAN', 'pan', t.pan)}
    <div><label for="addr">Address</label><textarea id="addr" name="address">${esc(p.addr)}</textarea></div>
    ${input('PIN code', 'pincode', t.pin)}
    ${input('Password', 'password', t.pw, 'type="password"')}
    ${input('Enter OTP', 'otp', t.otp, 'autocomplete="one-time-code"')}
    <button type="button">Submit</button></form>${decoyBlock(d)}`;
  return {
    template: 'kyc', html, decoys: d,
    truth: [
      { type: 'NAME', value: t.name }, { type: 'DOB', value: t.dob }, { type: 'PHONE', value: t.mob },
      { type: 'EMAIL', value: t.email }, { type: 'AADHAAR', value: t.aad }, { type: 'PAN', value: t.pan },
      { type: 'ADDRESS', value: p.addr }, { type: 'PINCODE', value: t.pin }, { type: 'PASSWORD', value: t.pw },
      { type: 'OTP', value: t.otp },
    ],
  };
}

function profile(f: Faker): Omit<Page, 'id'> {
  const p = person(f);
  const t = { mob: id.mobile(f), email: f.internet.email({ firstName: p.first }).toLowerCase(), pan: id.pan(f), dob: id.dob(f), pin: id.pincode(f), upi: id.upi(f, p.first) };
  const d = decoys(f);
  const html = `<h1>My profile</h1>
    <p>Name: ${esc(p.name)}</p>
    <p>Registered mobile: ${esc(t.mob)}</p>
    <p>Email: ${esc(t.email)}</p>
    <p>PAN: ${esc(t.pan)}</p>
    <p>DOB: ${esc(t.dob)}</p>
    <p>Address: ${esc(p.addr)}, PIN ${esc(t.pin)}</p>
    <p>UPI ID: ${esc(t.upi)}</p>${decoyBlock(d)}`;
  return {
    template: 'profile', html, decoys: d,
    truth: [
      { type: 'NAME', value: p.name }, { type: 'PHONE', value: t.mob }, { type: 'EMAIL', value: t.email },
      { type: 'PAN', value: t.pan }, { type: 'DOB', value: t.dob }, { type: 'ADDRESS', value: p.addr },
      { type: 'PINCODE', value: t.pin }, { type: 'UPI', value: t.upi },
    ],
  };
}

function bank(f: Faker): Omit<Page, 'id'> {
  const rows = Array.from({ length: 3 }, () => { const p = person(f); return { name: p.name, acct: id.account(f), ifsc: id.ifsc(f), upi: id.upi(f, p.first) }; });
  const c = id.card(f);
  const cv = id.cvv(f);
  const d = decoys(f);
  const html = `<h1>Beneficiaries</h1><table><tr><th>Name</th><th>Account</th><th>IFSC</th><th>UPI</th></tr>
    ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.acct)}</td><td>${esc(r.ifsc)}</td><td>${esc(r.upi)}</td></tr>`).join('')}</table>
    <p>Saved card ${esc(c)}</p>
    <form id="pay">${input('CVV', 'cvv', cv, 'autocomplete="cc-csc"')}<button type="button">Pay now</button></form>${decoyBlock(d)}`;
  return {
    template: 'bank', html, decoys: d,
    truth: [
      ...rows.flatMap((r) => [{ type: 'NAME' as const, value: r.name }, { type: 'ACCOUNT' as const, value: r.acct }, { type: 'IFSC' as const, value: r.ifsc }, { type: 'UPI' as const, value: r.upi }]),
      { type: 'CARD', value: c }, { type: 'CVV', value: cv },
    ],
  };
}

function checkout(f: Faker): Omit<Page, 'id'> {
  const p = person(f);
  const pan = id.pan(f);
  const t = { mob: id.mobile(f), email: f.internet.email({ firstName: p.first }).toLowerCase(), card: id.card(f), gst: id.gstin(f, pan.slice(0, 10)), veh: id.vehicle(f), pin: id.pincode(f) };
  const d = decoys(f);
  const html = `<h1>Checkout</h1><form id="checkout">
    ${input('Phone', 'phone', t.mob, 'type="tel" autocomplete="tel"')}
    ${input('Email', 'email', t.email, 'type="email"')}
    ${input('Card number', 'ccnum', t.card, 'autocomplete="cc-number"')}
    ${input('Company GSTIN', 'gstin', t.gst)}
    ${input('Pincode', 'zip', t.pin, 'autocomplete="postal-code"')}
    <p>Delivery vehicle registration: ${esc(t.veh)}</p>
    <button type="button">Place order</button></form>${decoyBlock(d)}`;
  return {
    template: 'checkout', html, decoys: d,
    truth: [
      { type: 'PHONE', value: t.mob }, { type: 'EMAIL', value: t.email }, { type: 'CARD', value: t.card },
      { type: 'GSTIN', value: t.gst }, { type: 'PINCODE', value: t.pin }, { type: 'VEHICLE', value: t.veh },
    ],
  };
}

function narrative(f: Faker): Omit<Page, 'id'> {
  const p = person(f);
  const t = { mob: id.mobile(f), pp: id.passport(f), aad: id.aadhaarFormatted(f), email: f.internet.email({ firstName: p.first }).toLowerCase() };
  const d = decoys(f);
  const html = `<h1>Support ticket</h1>
    <p>Hi team, this is ${esc(p.name)}. Please call me on ${esc(t.mob)} about my visa appointment.</p>
    <p>My passport number is ${esc(t.pp)} and my Aadhaar is ${esc(t.aad)}.</p>
    <p>You can also write to ${esc(t.email)}.</p>${decoyBlock(d)}`;
  return {
    template: 'narrative', html, decoys: d,
    truth: [
      { type: 'NAME', value: p.name }, { type: 'PHONE', value: t.mob }, { type: 'PASSPORT', value: t.pp },
      { type: 'AADHAAR', value: t.aad }, { type: 'EMAIL', value: t.email },
    ],
  };
}

export const TEMPLATES = { kyc, profile, bank, checkout, narrative };

export function generatePages(n = 60, seed = 26171): Page[] {
  const f = fakerEN_IN;
  f.seed(seed);
  const names = Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[];
  return Array.from({ length: n }, (_, i) => {
    const tpl = names[i % names.length]!;
    return { id: `p${String(i + 1).padStart(3, '0')}-${tpl}`, ...TEMPLATES[tpl](f) };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL('../pages/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const pages = generatePages(Number(process.argv[2] ?? 60));
  for (const p of pages) {
    writeFileSync(`${dir}${p.id}.html`, `<!doctype html><html><body>${p.html}</body></html>`);
    writeFileSync(`${dir}${p.id}.truth.json`, JSON.stringify({ truth: p.truth, decoys: p.decoys }, null, 2));
  }
  console.log(`wrote ${pages.length} pages to ${dir}`);
}
