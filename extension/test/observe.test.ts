import { describe, expect, it } from 'vitest';
import { executeOnElement } from '../lib/execute';
import { accessibleName, NodeRegistry, observe } from '../lib/observe';

const rect = () => ({ x: 10, y: 20, w: 100, h: 30 });

function page(html: string) {
  document.body.innerHTML = html;
  return observe(document, new NodeRegistry(), rect);
}

describe('observe', () => {
  it('captures inputs with labels, values and attributes', () => {
    const obs = page(`
      <form id="kyc"><label for="m">Mobile</label><input id="m" type="tel" name="mobile" value="9876543210">
      <label>Aadhaar <input name="aadhaar" value="123"></label>
      <input type="password" aria-label="Password" value="x">
      <input type="hidden" name="csrf" value="tok">
      <button>Submit</button></form>`);
    const byName = Object.fromEntries(obs.elements.map((e) => [e.name, e]));
    expect(byName.Mobile).toMatchObject({ role: 'textbox', inputType: 'tel', value: '9876543210', htmlName: 'mobile', insideSensitiveForm: true });
    expect(byName.Aadhaar).toMatchObject({ htmlName: 'aadhaar', value: '123' });
    expect(byName.Password).toMatchObject({ inputType: 'password' });
    expect(byName.Submit).toMatchObject({ role: 'button' });
    expect(obs.elements.some((e) => e.htmlName === 'csrf')).toBe(false);
  });

  it('collects text blocks and marks opaque regions', () => {
    const obs = page(`<h1>Account</h1><p>Hello Ravi</p><img src="aadhaar.png"><canvas></canvas><div style="display:none"><p>secret</p></div>`);
    expect(obs.elements.map((e) => [e.role, e.text])).toEqual([['heading', 'Account'], ['text', 'Hello Ravi']]);
    expect(obs.opaque.map((o) => o.kind)).toEqual(['img', 'canvas']);
    expect(obs.opaque[0]!.src).toBe('aadhaar.png');
  });

  it('joins values split across inline tags into one text element', () => {
    const obs = page(`<p>Phone: <span>98765</span><span>43210</span></p><p>UID: <b>2345</b> <b>6789</b></p><div><p>a</p><span>b</span></div>`);
    expect(obs.elements.map((e) => e.text)).toEqual(['Phone: 9876543210', 'UID: 2345 6789', 'a', 'b']);
  });

  it('ignores local mask overlays in observations', () => {
    const obs = page('<p>page text</p><div class="ouro-mask-overlay"><span>NAME</span></div>');
    expect(obs.elements.map(e => e.text)).toEqual(['page text']);
  });

  it('button text is not duplicated as a separate text element', () => {
    const obs = page(`<button><span>Pay now</span></button>`);
    expect(obs.elements).toHaveLength(1);
    expect(obs.elements[0]!.name).toBe('Pay now');
  });

  it('aria-labelledby and placeholder fallbacks', () => {
    document.body.innerHTML = `<span id="l1">PAN</span><input id="a" aria-labelledby="l1"><input id="b" placeholder="City">`;
    expect(accessibleName(document.getElementById('a')!, document)).toBe('PAN');
    expect(accessibleName(document.getElementById('b')!, document)).toBe('City');
  });
});

describe('execute', () => {
  it('sets values through the native setter and fires input/change', () => {
    document.body.innerHTML = `<input id="x">`;
    const el = document.getElementById('x') as HTMLInputElement;
    const seen: string[] = [];
    el.addEventListener('input', () => seen.push('input'));
    el.addEventListener('change', () => seen.push('change'));
    expect(executeOnElement(el, 'type', 'hello')).toEqual({ ok: true });
    expect(el.value).toBe('hello');
    expect(seen).toEqual(['input', 'change']);
  });
  it('clicks and refuses non-editables and detached nodes', () => {
    document.body.innerHTML = `<button id="b">Go</button><div id="d"></div>`;
    let clicked = 0;
    document.getElementById('b')!.addEventListener('click', () => clicked++);
    executeOnElement(document.getElementById('b')!, 'click');
    expect(clicked).toBe(1);
    expect(executeOnElement(document.getElementById('d')!, 'type', 'x')).toEqual({ ok: false, reason: 'not_editable' });
    const gone = document.createElement('input');
    expect(executeOnElement(gone, 'type', 'x')).toEqual({ ok: false, reason: 'node_detached' });
  });
});

describe('egress isolation', () => {
  it('content-side code never touches the network', async () => {
    const fs = await import('node:fs');
    for (const f of ['lib/observe.ts', 'lib/execute.ts', 'entrypoints/content.ts', 'lib/agentLoop.ts']) {
      const src = fs.readFileSync(`${process.cwd()}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
    }
  });
});
