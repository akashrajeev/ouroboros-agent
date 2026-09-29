import { Window } from 'happy-dom';
import { observe, NodeRegistry } from '../../extension/lib/observe';
import { sanitize } from '../../packages/core/src/sanitize';
import { PlaceholderMap } from '../../packages/core/src/placeholders';
import { NerDetector } from '../../packages/ner/src/index';

const M = '/home/sandbox/ouroboros-agent/models/';
const html = `
<form id="kyc">
  <label>Full name <input name="fullname" value="Aarav Sharma"></label>
  <label>Email <input type="email" name="email" value="aarav.sharma92@gmail.com"></label>
  <label>Mobile <input type="tel" name="mobile" value="9876543210"></label>
  <label>Date of birth <input name="dob" value="14-03-2001"></label>
  <button>Submit</button>
</form>
<p>Support: care@examplebank.in | Helpline 1800 425 3800</p>`;

const win = new Window({ url: 'https://kyc.example.in/form', width: 1280, height: 800 });
const g = globalThis as Record<string, unknown>;
for (const k of ['HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','NodeFilter','CSS','Event','InputEvent','MutationObserver']) g[k] = (win as any)[k];
win.document.body.innerHTML = html;

const ner = await NerDetector.create({ localModelPath: M });
const registry = new NodeRegistry();
const raw = observe(win.document as unknown as Document, registry, () => ({ x: 0, y: 0, w: 120, h: 22 }));
const map = new PlaceholderMap();
const texts: string[] = [];
for (const e of raw.elements as any[]) { if (e.value) texts.push(e.value); if (e.label) texts.push(e.label); }
await ner.prime(texts);
const extra = [ner.lookup];
const out = sanitize(raw, map, { extraDetectors: extra as any });

const rawEls = raw.elements.filter((e: any) => e.value).map((e: any) => ({ tag: e.tag, name: e.name ?? e.htmlName, value: e.value }));
const sanEls = out.screen.elements.filter((e: any) => e.value).map((e: any) => ({ tag: e.tag, name: e.name ?? e.htmlName, value: e.value }));
const rawText = (raw as any).text ?? (raw as any).textNodes ?? null;
console.log(JSON.stringify({ rawEls, sanEls, screen: out.screen }, null, 1).slice(0, 4000));
await win.happyDOM.close();
