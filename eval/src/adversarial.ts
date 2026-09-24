import { fakerEN_IN, type Faker } from '@faker-js/faker';
import type { Page } from './generate';
import * as id from './ids';

/**
 * HELD-OUT adversarial set. Different seed, label wording and formats the detectors
 * were NOT tuned on. Rule: never change detectors to fit a specific page here; only
 * report. Fragments mark values split across elements (leak = all fragments visible).
 */
export interface AdvTruth { type: import('@ouroboros/core').PiiType; value: string; fragments?: string[] }
export interface AdvPage extends Omit<Page, 'truth'> { truth: AdvTruth[]; tags: string[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const digits = (s: string) => s.replace(/\D/g, '');

function labelVariants(f: Faker): AdvPage {
  const name = `${f.person.firstName()} ${f.person.lastName()}`;
  const mob = digits(id.mobile(f)).slice(-10);
  const aad = id.aadhaar(f);
  const pan = id.pan(f);
  const email = f.internet.email().toLowerCase();
  const html = `<h2>Applicant</h2><form>
    <div><label for="a">Applicant</label><input id="a" value="${esc(name)}"></div>
    <div><label for="b">Cell</label><input id="b" value="${mob}"></div>
    <div><label for="c">Aadhar No.</label><input id="c" value="${aad}"></div>
    <div><label for="d">Permanent Account Number</label><input id="d" value="${pan}"></div>
    <div><label for="e">E-mail ID</label><input id="e" value="${esc(email)}"></div></form>`;
  return { id: '', template: 'label-variants', html, decoys: [], tags: ['labels'], truth: [
    { type: 'NAME', value: name }, { type: 'PHONE', value: mob }, { type: 'AADHAAR', value: aad }, { type: 'PAN', value: pan }, { type: 'EMAIL', value: email },
  ] };
}

function hindiLabels(f: Faker): AdvPage {
  const name = `${f.person.firstName()} ${f.person.lastName()}`;
  const mob = id.mobile(f);
  const aad = id.aadhaarFormatted(f);
  const html = `<h2>आवेदन पत्र</h2><form>
    <div><label for="n">नाम</label><input id="n" value="${esc(name)}"></div>
    <div><label for="m">मोबाइल नंबर</label><input id="m" value="${esc(mob)}"></div>
    <div><label for="u">आधार संख्या</label><input id="u" value="${esc(aad)}"></div></form>`;
  return { id: '', template: 'hindi-labels', html, decoys: [], tags: ['hindi'], truth: [
    { type: 'NAME', value: name }, { type: 'PHONE', value: mob }, { type: 'AADHAAR', value: aad },
  ] };
}

function splitValues(f: Faker): AdvPage {
  const mob = digits(id.mobile(f)).slice(-10);
  const aad = id.aadhaar(f);
  const html = `<h2>Contact</h2>
    <p>Phone: <span>${mob.slice(0, 5)}</span><span>${mob.slice(5)}</span></p>
    <p>UID: <b>${aad.slice(0, 4)}</b> <b>${aad.slice(4, 8)}</b> <b>${aad.slice(8)}</b></p>`;
  return { id: '', template: 'split-values', html, decoys: [], tags: ['split'], truth: [
    { type: 'PHONE', value: mob, fragments: [mob.slice(0, 5), mob.slice(5)] },
    { type: 'AADHAAR', value: aad, fragments: [aad.slice(0, 4), aad.slice(4, 8), aad.slice(8)] },
  ] };
}

function oddFormats(f: Faker): AdvPage {
  const n = digits(id.mobile(f)).slice(-10);
  const mobDots = `${n.slice(0, 5)}.${n.slice(5)}`;
  const d = f.date.birthdate({ min: 20, max: 60, mode: 'age' });
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dobText = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  const user = f.internet.username().toLowerCase().replace(/[^a-z0-9]/g, '');
  const obf = `${user} [at] gmail [dot] com`;
  const name = `${f.person.firstName().toLowerCase()} ${f.person.lastName().toLowerCase()}`;
  const html = `<h2>Notes</h2>
    <p>Reach me at ${mobDots} after 6.</p>
    <p>Born on ${dobText}.</p>
    <p>mail: ${esc(obf)}</p>
    <p>signed, ${esc(name)}</p>`;
  return { id: '', template: 'odd-formats', html, decoys: [], tags: ['formats'], truth: [
    { type: 'PHONE', value: mobDots }, { type: 'DOB', value: dobText }, { type: 'EMAIL', value: obf }, { type: 'NAME', value: name },
  ] };
}

function headerlessTable(f: Faker): AdvPage {
  const rows = Array.from({ length: 2 }, () => ({ name: `${f.person.firstName()} ${f.person.lastName()}`, acct: id.account(f), ifsc: id.ifsc(f) }));
  const html = `<table>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.acct}</td><td>${r.ifsc}</td></tr>`).join('')}</table>`;
  return { id: '', template: 'headerless-table', html, decoys: [], tags: ['table'], truth: rows.flatMap((r) => [
    { type: 'NAME' as const, value: r.name }, { type: 'ACCOUNT' as const, value: r.acct }, { type: 'IFSC' as const, value: r.ifsc },
  ]) };
}

const TPL = [labelVariants, hindiLabels, splitValues, oddFormats, headerlessTable];

export function generateAdversarial(n = 50, seed = 777): AdvPage[] {
  const f = fakerEN_IN;
  f.seed(seed);
  return Array.from({ length: n }, (_, i) => {
    const p = TPL[i % TPL.length]!(f);
    return { ...p, id: `adv${String(i + 1).padStart(3, '0')}-${p.template}` };
  });
}
