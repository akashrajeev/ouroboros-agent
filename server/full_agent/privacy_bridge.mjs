// server/full_agent/privacy_bridge.ts
import { createInterface } from "node:readline";
import { webcrypto } from "node:crypto";

// packages/core/src/checksums.ts
var D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
var P1 = [1, 5, 7, 6, 2, 8, 3, 0, 9, 4];
var P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]];
for (let i = 1; i < 8; i++) P.push(P[i - 1].map((v) => P1[v]));
var at = (t, i, j) => t[i][j];
function verhoeffValid(digits) {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const r = digits.split("").reverse();
  for (let i = 0; i < r.length; i++) c = at(D, c, at(P, i % 8, Number(r[i])));
  return c === 0;
}
function luhnValid(digits) {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
var B36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = B36.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + p % 36;
  }
  return B36[(36 - sum % 36) % 36];
}
function gstinValid(g) {
  const s = g.toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false;
  return gstinCheckChar(s.slice(0, 14)) === s[14];
}

// packages/core/src/patterns.ts
var digitsOnly = (s) => s.replace(/\D/g, "");
function hasContext(text, start, words, window = 40) {
  return words.test(text.slice(Math.max(0, start - window), start));
}
var CARD_IIN = /^(4|5[1-5]|2[2-7]|3[47]|3[0689]|35|6011|64[4-9]|65|60|81|82|508|5[06-8]|6[37])/;
var STATE_CODES = /* @__PURE__ */ new Set([
  "AN",
  "AP",
  "AR",
  "AS",
  "BR",
  "CH",
  "CG",
  "DD",
  "DL",
  "DN",
  "GA",
  "GJ",
  "HP",
  "HR",
  "JH",
  "JK",
  "KA",
  "KL",
  "LA",
  "LD",
  "MH",
  "ML",
  "MN",
  "MP",
  "MZ",
  "NL",
  "OD",
  "OR",
  "PB",
  "PY",
  "RJ",
  "SK",
  "TN",
  "TR",
  "TS",
  "UK",
  "UA",
  "UP",
  "WB",
  "BH"
]);
function validDate(d, m, y) {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2100) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}
var RULES = [
  {
    type: "EMAIL",
    priority: 90,
    confidence: 0.99,
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g
  },
  {
    // Obfuscated: "name [at] gmail [dot] com", "name(at)gmail(dot)com"
    type: "EMAIL",
    priority: 89,
    confidence: 0.9,
    re: /\b[A-Za-z0-9._%+-]+\s*[[(]\s*at\s*[\])]\s*[A-Za-z0-9-]+(?:\s*(?:[[(]\s*dot\s*[\])]|\.)\s*[A-Za-z0-9-]+)+\b/gi
  },
  {
    // UPI VPA: handle has no dot (that would be an email domain).
    type: "UPI",
    priority: 85,
    confidence: 0.95,
    re: /\b[A-Za-z0-9][A-Za-z0-9._-]{1,255}@[A-Za-z]{2,64}\b(?!\.[A-Za-z])/g
  },
  {
    // An explicit label may justify masking a checksum-failing value in a visual preview.
    // This raises recall but can hide non-ID text; never call it validated Aadhaar.
    type: "AADHAAR",
    priority: 72,
    confidence: 0.9,
    re: /(?<!\d)[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?!\d)/g,
    validate: (_raw, text, start) => hasContext(text, start, /\b(aadha+r|uidai|uid)\b[^\d]{0,12}$/i, 35)
  },
  {
    // Context-only fallback for PAN-shaped text; keep the strict holder-code rule below
    // for unlabeled IDs. A label is not an identity verification.
    type: "PAN",
    priority: 76,
    confidence: 0.9,
    re: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    validate: (_raw, text, start) => hasContext(text, start, /\bpan\b[^A-Z0-9]{0,12}$/i, 35)
  },
  {
    // Names have no checksum. Only a local explicit field label can authorize a
    // pattern fallback; free prose still relies on on-device NER.
    type: "NAME",
    priority: 22,
    confidence: 0.85,
    re: /\b[A-Z][a-z]{1,25}(?:[ '-][A-Z][a-z]{1,25}){1,3}\b/g,
    validate: (_raw, text, start) => hasContext(text, start, /\b(?:full[ -]?name|customer[ -]?name|applicant[ -]?name|name)\b[^A-Za-z]{0,5}$/i, 28)
  },
  {
    type: "GSTIN",
    priority: 80,
    confidence: 0.99,
    re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi,
    validate: (raw) => gstinValid(raw)
  },
  {
    // PAN: 4th char is holder type (P person, C company, H HUF, ...).
    type: "PAN",
    priority: 75,
    confidence: 0.97,
    re: /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/g
  },
  {
    type: "AADHAAR",
    priority: 70,
    confidence: 0.99,
    re: /(?<!\d[ -]?)[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![ -]?\d)/g,
    // 1 in 10 random 12-digit numbers pass Verhoeff, so an account label wins unless Aadhaar is named.
    validate: (raw, text, start) => verhoeffValid(digitsOnly(raw)) && !(hasContext(text, start, /\b(account|acct|a\/c)\b[^0-9]{0,20}$/i, 40) && !hasContext(text, start, /aadha+r|uid/i, 40))
  },
  {
    type: "CARD",
    priority: 65,
    confidence: 0.98,
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    validate: (raw, text, start) => {
      const d = digitsOnly(raw);
      if (d.length < 13 || d.length > 19 || !luhnValid(d) || /^(\d)\1+$/.test(d)) return false;
      if (!CARD_IIN.test(d)) return false;
      const acct = hasContext(text, start, /\b(account|acct|a\/c)\b[^0-9]{0,20}$/i, 40);
      return !acct || hasContext(text, start, /card/i, 40);
    }
  },
  {
    type: "IFSC",
    priority: 60,
    confidence: 0.97,
    re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g
  },
  {
    type: "PHONE",
    priority: 55,
    confidence: 0.93,
    re: /(?<![\d+.])(?:\+91[ -]?|0)?[6-9]\d{4}[ .-]?\d{5}\b(?!\.\d)/g
  },
  {
    type: "VEHICLE",
    priority: 50,
    confidence: 0.9,
    re: /\b([A-Z]{2})[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b/g,
    validate: (raw) => STATE_CODES.has(raw.slice(0, 2).toUpperCase())
  },
  {
    type: "PASSPORT",
    priority: 45,
    confidence: 0.85,
    re: /\b[A-PR-WY][1-9]\d{6}\b/g,
    validate: (_raw, text, start) => hasContext(text, start, /passport/i)
  },
  {
    type: "IP",
    priority: 40,
    confidence: 0.95,
    re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: (raw) => raw.split(".").every((o) => Number(o) <= 255 && !(o.length > 1 && o.startsWith("0")))
  },
  {
    type: "DOB",
    priority: 35,
    confidence: 0.9,
    re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g,
    validate: (raw, text, start) => {
      const [d, m, y] = raw.split(/[/.-]/).map(Number);
      return validDate(d, m, y) && hasContext(text, start, /\b(d[o0]b|d\.[o0]\.b|birth|born)\b/i);
    }
  },
  {
    type: "DOB",
    priority: 34,
    confidence: 0.88,
    re: /\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*,?\s+\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi,
    validate: (_raw, text, start) => hasContext(text, start, /\b(d[o0]b|d\.[o0]\.b|birth|born)\b/i)
  },
  {
    // An element whose whole text is one long bare number is an identifier (fail-closed).
    type: "ACCOUNT",
    priority: 31,
    confidence: 0.7,
    re: /^\s*\d{9,18}\s*$/g,
    validate: (raw) => !/^(\d)\1+$/.test(raw.trim())
  },
  {
    // Bank account numbers have no checksum; require an account context word.
    type: "ACCOUNT",
    priority: 32,
    confidence: 0.85,
    re: /\b\d{9,18}\b/g,
    validate: (_raw, text, start) => hasContext(text, start, /\b(account|acct|a\/c)\b[^0-9]{0,20}$/i, 40)
  },
  {
    type: "PINCODE",
    priority: 30,
    confidence: 0.85,
    re: /\b[1-9]\d{2}[ ]?\d{3}\b/g,
    validate: (_raw, text, start) => hasContext(text, start, /(pin ?code|pin|postal|zip|[A-Za-z]+,)\s*[:\-]?\s*$/i, 30)
  }
];
function detectPatterns(text) {
  const found = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      const raw = m[0];
      const start = m.index ?? 0;
      if (rule.validate && !rule.validate(raw, text, start)) continue;
      found.push({
        type: rule.type,
        start,
        end: start + raw.length,
        value: raw,
        source: "pattern",
        confidence: rule.confidence,
        priority: rule.priority
      });
    }
  }
  found.sort((a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start));
  const kept = [];
  for (const f of found) {
    if (kept.some((k) => f.start < k.end && k.start < f.end)) continue;
    kept.push(f);
  }
  return kept.sort((a, b) => a.start - b.start).map(({ priority: _p, ...rest }) => rest);
}
var PATTERN_TYPES = RULES.map((r) => r.type);

// packages/core/src/domRules.ts
var LABEL_RULES = [
  [/\b(otp|one[\s_-]?time)\b|verification[\s_-]?code/i, "OTP"],
  [/\b(full[\s_-]?name|applicant[\s_-]?name|customer[\s_-]?name)\b/i, "NAME"],
  [/\bcvv2?\b|\bcvc\b|security[\s_-]?code/i, "CVV"],
  [/\bm?pin\b(?![\s_-]?code)/i, "PIN"],
  [/aadha+r|\buid(ai)?\b/i, "AADHAAR"],
  [/\bpan\b(?![\s_-]?code)|pan[\s_-]?(no|number|card)|permanent[\s_-]?account[\s_-]?(no|number)/i, "PAN"],
  [/\bifsc\b/i, "IFSC"],
  [/\b(account|acct|a\/c)[\s_-]*(no|num|number)?\b/i, "ACCOUNT"],
  [/\bdob\b|date[\s_-]?of[\s_-]?birth|birth[\s_-]?date/i, "DOB"],
  [/pin[\s_-]?code|postal[\s_-]?code|\bzip(code)?\b/i, "PINCODE"],
  [/card[\s_-]?(no|num|number)|\bcc[\s_-]?num/i, "CARD"],
  [/password|passwd|\bpwd\b|passcode/i, "PASSWORD"],
  [/api[\s_-]?key|secret|token/i, "SECRET"]
];
function domRuleType(f) {
  const type = (f.inputType ?? "").toLowerCase();
  const ac = (f.autocomplete ?? "").toLowerCase();
  if (type === "password") return "PASSWORD";
  if (ac.includes("one-time-code")) return "OTP";
  if (ac === "cc-csc") return "CVV";
  if (ac === "cc-number") return "CARD";
  if (ac.startsWith("cc-")) return "CARD";
  if (ac === "bday" || ac.startsWith("bday-")) return "DOB";
  if (ac === "postal-code") return "PINCODE";
  const hay = [f.name, f.id, f.label, f.placeholder].filter(Boolean).join(" ");
  if (!hay) return null;
  const words = hay.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.]/g, " ");
  for (const [re, t] of LABEL_RULES) if (re.test(words)) return t;
  return null;
}
function compatibleTokenTypes(f) {
  const rule = domRuleType(f);
  if (rule) return [rule];
  const type = (f.inputType ?? "text").toLowerCase();
  const ac = (f.autocomplete ?? "").toLowerCase();
  if (type === "email" || ac === "email") return ["EMAIL"];
  if (type === "tel" || ac.startsWith("tel")) return ["PHONE"];
  return "any";
}

// packages/core/src/placeholders.ts
function normalizeValue(v) {
  return v.toLowerCase().replace(/[\s\-_.()/+,:]/g, "");
}
var TOKEN_RE = /<([A-Z]+)_(\d+)>/g;
var PlaceholderMap = class _PlaceholderMap {
  byKey = /* @__PURE__ */ new Map();
  byToken = /* @__PURE__ */ new Map();
  counters = /* @__PURE__ */ new Map();
  tokenFor(type, value) {
    const key = `${type}:${normalizeValue(value)}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    const token = `<${type}_${n}>`;
    this.byKey.set(key, token);
    this.byToken.set(token, { type, value });
    return token;
  }
  resolve(token) {
    return this.byToken.get(token);
  }
  values() {
    return [...this.byToken].map(([token, v]) => ({ token, ...v }));
  }
  get size() {
    return this.byToken.size;
  }
  clear() {
    this.byKey.clear();
    this.byToken.clear();
    this.counters.clear();
  }
  /** Snapshot for chrome.storage.session. Device-local only. */
  toJSON() {
    throw new Error("PlaceholderMap must not be serialized; use exportLocal()");
  }
  exportLocal() {
    return this.values();
  }
  static importLocal(rows) {
    const m = new _PlaceholderMap();
    for (const r of rows) {
      m.byToken.set(r.token, { type: r.type, value: r.value });
      m.byKey.set(`${r.type}:${normalizeValue(r.value)}`, r.token);
      const n = Number(/_(\d+)>$/.exec(r.token)?.[1] ?? 0);
      m.counters.set(r.type, Math.max(m.counters.get(r.type) ?? 0, n));
    }
    return m;
  }
};
function redactText(text, matches, map2) {
  let out = "";
  let pos = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < pos) continue;
    out += text.slice(pos, m.start) + map2.tokenFor(m.type, m.value);
    pos = m.end;
  }
  return out + text.slice(pos);
}
function rehydrate(text, map2) {
  const unknown = [];
  const out = text.replace(TOKEN_RE, (tok) => {
    const r = map2.resolve(tok);
    if (!r) {
      unknown.push(tok);
      return tok;
    }
    return r.value;
  });
  return { text: out, unknown };
}

// packages/core/src/leakGate.ts
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function scan(text, where, map2, opts2) {
  const hits = [];
  const minLen = opts2.minNormalizedLen ?? 6;
  const norm = normalizeValue(text);
  for (const { token, type, value } of map2.values()) {
    const nv = normalizeValue(value);
    if (!nv) continue;
    if (new RegExp(`(?<![A-Za-z0-9]|\\d[.,])${escapeRe(value)}(?![A-Za-z0-9]|[.,]\\d)`, "i").test(text)) {
      hits.push({ kind: "map_exact", type, token, where });
    } else if (nv.length >= minLen && norm.includes(nv)) {
      hits.push({ kind: "map_normalized", type, token, where });
    }
  }
  for (const m of detectPatterns(text)) hits.push({ kind: where === "image" ? "ocr" : "pattern", type: m.type, where });
  for (const c of opts2.canaries ?? []) {
    if (text.includes(c) || norm.includes(normalizeValue(c))) hits.push({ kind: "canary", where });
  }
  return hits;
}
async function sha256Hex(s) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function leakGate(payload, map2, opts2 = {}) {
  const hits = scan(payload, "payload", map2, opts2);
  if (opts2.imageText) hits.push(...scan(opts2.imageText, "image", map2, opts2));
  return {
    pass: hits.length === 0,
    hits,
    sha256: await sha256Hex(payload),
    bytes: new TextEncoder().encode(payload).length
  };
}

// packages/core/src/sanitize.ts
var round = (n) => Math.round(n * 1e3) / 1e3;
function fieldOf(el) {
  return {
    tag: el.tag,
    inputType: el.inputType,
    autocomplete: el.autocomplete,
    name: el.htmlName,
    id: el.htmlId,
    label: el.name,
    placeholder: el.placeholder,
    insideSensitiveForm: el.insideSensitiveForm,
    contentEditable: el.contentEditable
  };
}
function mergeMatches(lists) {
  const flat = lists.flat();
  const rules = flat.filter((m) => m.source !== "ner");
  const pieces = [];
  for (const m of flat.filter((x) => x.source === "ner")) {
    let segs = [[m.start, m.end]];
    for (const r of rules) {
      segs = segs.flatMap(([a, b]) => (r.end <= a || r.start >= b ? [[a, b]] : [[a, Math.max(a, r.start)], [Math.min(b, r.end), b]]).filter((seg) => seg[1] > seg[0]));
    }
    for (const [a, b] of segs) pieces.push({ ...m, start: a, end: b });
  }
  const all = [...rules, ...pieces].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out = [];
  for (const m of all) {
    const last = out[out.length - 1];
    if (last && m.start < last.end) {
      if (m.end > last.end && last.source === "ner" && m.source === "ner") last.end = m.end;
      continue;
    }
    out.push({ ...m });
  }
  return out;
}
function trimSpan(s, m) {
  let { start, end } = m;
  while (start < end && /[\s,.:;]/.test(s[start])) start++;
  while (end > start && /[\s,.:;]/.test(s[end - 1])) end--;
  if (m.type === "ADDRESS") {
    const tail = /[\s,]*\b(pin ?code|pin|zip|postal code)$/i.exec(s.slice(start, end));
    if (tail) end -= tail[0].length;
  }
  return { ...m, start, end, value: s.slice(start, end) };
}
var escRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function knownValues(s, map2) {
  const out = [];
  for (const { type, value } of map2.values()) {
    if (value.length < 3) continue;
    const re = new RegExp(`(?<![A-Za-z0-9])${escRe(value)}(?![A-Za-z0-9])`, "gi");
    for (const m of s.matchAll(re)) out.push({ type, start: m.index, end: m.index + m[0].length, value: m[0], source: "known", confidence: 1 });
  }
  return out;
}
function redactString(s, map2, opts2, sink, context = "", rctx) {
  if (!s) return s;
  const pre = context ? `${context}: ` : "";
  const shift = (ms) => ms.map((m) => ({ ...m, start: m.start - pre.length, end: m.end - pre.length })).filter((m) => m.start >= 0);
  const lists = [knownValues(s, map2), shift(detectPatterns(pre + s)), ...(opts2.extraDetectors ?? []).map((d) => d(s))];
  const merged = mergeMatches(lists).map((m) => trimSpan(s, m)).filter((m) => m.source !== "ner" || (m.value.match(/[A-Za-z0-9]/g) ?? []).length >= 3).filter((m) => {
    if (rctx?.contact === "mailto" && m.type === "EMAIL") {
      const dom = (m.value.split("@")[1] ?? "").toLowerCase();
      const own = !!opts2.pageHost && !!dom && (dom === opts2.pageHost || dom.endsWith(`.${opts2.pageHost}`));
      if (rctx?.boilerplate || own) return false;
    }
    if (rctx?.contact === "tel" && m.type === "PHONE" && rctx?.boilerplate) return false;
    if (!rctx?.isValue && rctx?.boilerplate && m.source === "ner") return false;
    return true;
  });
  sink.push(...merged);
  return merged.length ? redactText(s, merged, map2) : s;
}
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
function sanitize(obs, map2, opts2 = {}) {
  opts2 = { ...opts2, pageHost: opts2.pageHost ?? hostOf(obs.url) };
  const { w, h } = obs.viewport;
  const elements = [];
  const nodeOf = {};
  const fingerprint = {};
  const accepts = {};
  const detections = [];
  for (const el of obs.elements) {
    if (el.value) {
      const rule = domRuleType(fieldOf(el));
      if (rule) map2.tokenFor(rule, el.value);
    }
    for (const s of [el.name, el.text]) {
      if (!s) continue;
      for (const m of detectPatterns(s)) map2.tokenFor(m.type, m.value);
    }
  }
  obs.elements.forEach((el, i) => {
    const id = `e${i + 1}`;
    const field = fieldOf(el);
    const rule = domRuleType(field);
    const hits = [];
    let value = el.value;
    if (value) {
      if (rule) {
        value = map2.tokenFor(rule, value);
        detections.push({ id: `d${detections.length + 1}`, type: rule, sources: ["dom_rule"], confidence: 1, nodeId: el.nodeId, bbox: el.bbox });
      } else {
        value = redactString(value, map2, opts2, hits, el.name, { isValue: true, boilerplate: el.boilerplate, contact: el.contact });
      }
    }
    const label = redactString(el.name, map2, opts2, hits, el.context, { boilerplate: el.boilerplate, contact: el.contact });
    const text = el.text && el.text !== el.name ? redactString(el.text, map2, opts2, hits, el.context, { boilerplate: el.boilerplate, contact: el.contact }) : "";
    for (const m of hits) {
      detections.push({ id: `d${detections.length + 1}`, type: m.type, sources: [m.source], confidence: m.confidence, nodeId: el.nodeId, bbox: el.bbox });
    }
    const bbox = [round(el.bbox.x / w), round(el.bbox.y / h), round(el.bbox.w / w), round(el.bbox.h / h)];
    const state = {};
    if (el.disabled) state.disabled = true;
    if (el.checked !== void 0) state.checked = el.checked;
    const fullLabel = text ? label ? `${label} | ${text}` : text : label;
    elements.push({
      id,
      role: el.role,
      label: fullLabel,
      ...el.inputType ? { field_type: el.inputType } : el.tag === "textarea" ? { field_type: "textarea" } : {},
      value,
      state,
      ...el.options?.length ? { options: el.options.map((o) => redactString(o, map2, opts2, hits, el.name, { boilerplate: el.boilerplate, contact: el.contact })) } : {},
      bbox
    });
    nodeOf[id] = el.nodeId;
    fingerprint[id] = `${el.role}|${fullLabel}|${bbox.map((n) => n.toFixed(2)).join(",")}`;
    accepts[id] = compatibleTokenTypes(field);
  });
  obs.opaque.forEach((o, j) => {
    const id = `e${obs.elements.length + j + 1}`;
    const hits = [];
    const alt = o.name ? redactString(o.name, map2, opts2, hits) : "";
    const bbox = [round(o.bbox.x / w), round(o.bbox.y / h), round(o.bbox.w / w), round(o.bbox.h / h)];
    const label = `${alt || o.kind} (${o.kind}: pixels not in this list; use need_visual to see it)`;
    elements.push({ id, role: "image", label, value: "", state: {}, bbox });
    nodeOf[id] = o.nodeId;
    fingerprint[id] = `image|${label}|${bbox.map((n) => n.toFixed(2)).join(",")}`;
    accepts[id] = [];
  });
  let origin = "";
  try {
    origin = new URL(obs.url).origin;
  } catch {
  }
  return {
    screen: { url_origin: origin, elements, nodeOf, fingerprint, accepts, opaqueCount: obs.opaque.length },
    detections
  };
}

// packages/core/src/validator.ts
var OPS = ["click", "type", "select", "scroll", "wait", "done", "ask_user", "need_visual"];
var CONSEQUENTIAL = /submit|pay|place order|delete|remove|send|upload|confirm|transfer|buy|sign ?up|register/i;
var NEEDS_ELEMENT = ["click", "type", "select"];
function isAction(x) {
  if (!x || typeof x !== "object") return false;
  const a = x;
  if (typeof a.op !== "string" || !OPS.includes(a.op)) return false;
  if (a.element_id != null && typeof a.element_id !== "string") return false;
  if (a.text != null && typeof a.text !== "string") return false;
  return true;
}
function validateAction(raw, planned2, current, map2) {
  if (!isAction(raw)) return { ok: false, reason: "schema" };
  let a = raw;
  if (a.op === "click" && a.text) {
    const el = current.elements.find((e) => e.id === a.element_id);
    if (el?.role === "combobox" && el.options?.includes(a.text)) a = { ...a, op: "select" };
  }
  if (NEEDS_ELEMENT.includes(a.op)) {
    const id = a.element_id;
    if (!id) return { ok: false, reason: "missing_element" };
    const el = current.elements.find((e) => e.id === id);
    if (!el) return { ok: false, reason: "unknown_element" };
    if (planned2.fingerprint[id] !== current.fingerprint[id]) return { ok: false, reason: "stale_element" };
    if (el.state.disabled) return { ok: false, reason: "disabled_element" };
    if (a.op === "type" || a.op === "select") {
      const text = a.text ?? "";
      const tokens = [...text.matchAll(TOKEN_RE)].map((m) => m[0]);
      for (const t of tokens) {
        const r = map2.resolve(t);
        if (!r) return { ok: false, reason: "unknown_token" };
        const acc = current.accepts[id] ?? "any";
        if (acc === "any") {
          if (el.field_type === "password") return { ok: false, reason: "token_type_mismatch" };
        } else if (!acc.includes(r.type)) {
          return { ok: false, reason: "token_type_mismatch" };
        }
      }
      if (detectPatterns(text.replace(TOKEN_RE, " ")).length) return { ok: false, reason: "raw_value_in_text" };
    }
    const needsConfirm = a.op === "click" && CONSEQUENTIAL.test(el.label);
    return { ok: true, needsConfirm, action: a };
  }
  return { ok: true, needsConfirm: false, action: a };
}

// packages/ner/src/align.ts
var LABEL_MAP = {
  PERSON: "NAME",
  LOCATION: "ADDRESS",
  EMAIL_ADDRESS: "EMAIL",
  PHONE_NUMBER: "PHONE",
  CREDIT_CARD: "CARD",
  PASSWORD: "PASSWORD",
  FINANCIAL: "ACCOUNT",
  US_BANK_NUMBER: "ACCOUNT",
  IBAN_CODE: "ACCOUNT",
  IP_ADDRESS: "IP"
};
function tokenSpans(text, tokens) {
  const hay = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const sameLen = hay.length === text.length;
  let cursor = 0;
  return tokens.map((t) => {
    const piece = t.startsWith("##") ? t.slice(2) : t;
    if (!piece || piece.startsWith("[")) return null;
    const i = hay.indexOf(piece.toLowerCase(), cursor);
    if (i < 0 || !sameLen) return null;
    cursor = i + piece.length;
    return [i, i + piece.length];
  });
}
function toMatches(text, tokens, ents, threshold, allow) {
  const spans = tokenSpans(text, tokens);
  const out = [];
  for (const e of ents) {
    const label = e.entity.replace(/^[BI]-/, "");
    const type = LABEL_MAP[label];
    if (type && allow && !allow.has(type)) continue;
    const span = spans[e.index - 1];
    if (!type || !span) continue;
    const last = out[out.length - 1];
    const gap = last ? text.slice(last.end, span[0]) : "";
    if (last && last.type === type && /^[\s,.'-]*$/.test(gap) && (e.entity.startsWith("I-") || /^\s*$/.test(gap) || type === "ADDRESS" && /^[\s,]*$/.test(gap))) {
      last.end = span[1];
      last.scores.push(e.score);
    } else {
      out.push({ type, start: span[0], end: span[1], value: "", source: "ner", confidence: 0, scores: [e.score] });
    }
  }
  for (let i = 0; i + 2 < out.length; i++) {
    const [a, b, c] = [out[i], out[i + 1], out[i + 2]];
    const small = (x, y) => /^[\s,]*$/.test(text.slice(x.end, y.start));
    if (a.type === "ADDRESS" && b.type === "NAME" && c.type === "ADDRESS" && small(a, b) && small(b, c)) {
      a.end = c.end;
      a.scores.push(...b.scores, ...c.scores);
      out.splice(i + 1, 2);
      i--;
    }
  }
  return out.map(({ scores, ...m }) => ({ ...m, value: text.slice(m.start, m.end), confidence: scores.reduce((a, b) => a + b, 0) / scores.length })).filter((m) => m.confidence >= threshold && m.value.trim().length > 2).map((m) => m.type === "ADDRESS" ? extendHouseNumber(text, m) : m);
}
function extendHouseNumber(text, m) {
  const before = /(?:^|[\s:])((?:(?:flat|house|no\.?|#)\s*)?\d{1,5}[A-Za-z]?(?:\/\d{1,4})?,?\s*)$/i.exec(text.slice(0, m.start));
  if (!before) return m;
  const start = m.start - before[1].length;
  return { ...m, start, value: text.slice(start, m.end) };
}
var DEFAULT_NER_TYPES = /* @__PURE__ */ new Set(["NAME", "ADDRESS"]);

// packages/ner/src/index.ts
var FIELD_WORDS = /* @__PURE__ */ new Set(["upi", "id", "vpa", "pan", "otp", "pin", "ifsc", "cvv", "kyc", "dob", "aadhaar", "aadhar", "uid", "email", "mobile", "phone", "gstin", "account", "card", "code", "no", "number"]);
function dropKeywordNames(ms) {
  const out = [];
  for (const m of ms) {
    if (m.type !== "NAME") {
      out.push(m);
      continue;
    }
    const words = [...m.value.matchAll(/\S+/g)];
    let i = 0, j = words.length;
    const isField = (w) => {
      const k = w.toLowerCase().replace(/[^a-z]/g, "");
      return !k || FIELD_WORDS.has(k);
    };
    while (i < j && isField(words[i][0])) i++;
    while (j > i && isField(words[j - 1][0])) j--;
    if (i >= j) continue;
    const a = words[i].index, b = words[j - 1].index + words[j - 1][0].length;
    out.push({ ...m, start: m.start + a, end: m.start + b, value: m.value.slice(a, b) });
  }
  return out;
}
var NerDetector = class _NerDetector {
  constructor(pipe, tokenize, threshold, minChars, allow) {
    this.pipe = pipe;
    this.tokenize = tokenize;
    this.threshold = threshold;
    this.minChars = minChars;
    this.allow = allow;
  }
  cache = /* @__PURE__ */ new Map();
  stats = { calls: 0, cacheHits: 0, ms: 0 };
  static async create(opts2) {
    const tf = await import("@huggingface/transformers");
    tf.env.localModelPath = opts2.localModelPath.endsWith("/") ? opts2.localModelPath : `${opts2.localModelPath}/`;
    tf.env.allowRemoteModels = false;
    tf.env.allowLocalModels = true;
    const pipe = await tf.pipeline("token-classification", opts2.modelId ?? "bert-small-pii", { dtype: "q8" });
    const tok = pipe.tokenizer;
    return new _NerDetector((s) => pipe(s), (s) => tok.tokenize(s), opts2.threshold ?? 0.5, opts2.minChars ?? 4, opts2.types === "all" ? void 0 : opts2.types ?? DEFAULT_NER_TYPES);
  }
  async detect(text) {
    const hit = this.cache.get(text);
    if (hit) {
      this.stats.cacheHits++;
      return hit;
    }
    let out = [];
    if (text.trim().length >= this.minChars) {
      const t0 = performance.now();
      const ents = await this.pipe(text);
      this.stats.ms += performance.now() - t0;
      this.stats.calls++;
      out = dropKeywordNames(toMatches(text, this.tokenize(text), ents, this.threshold, this.allow));
    }
    this.cache.set(text, out);
    return out;
  }
  async prime(texts) {
    for (const t of new Set(texts)) await this.detect(t);
  }
  /** Synchronous detector for sanitize(); unprimed strings return no matches. */
  lookup = (text) => this.cache.get(text) ?? [];
};

// server/full_agent/privacy_bridge.ts
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });
var map = new PlaceholderMap();
var ner = await NerDetector.create({ localModelPath: "models/", types: "all" });
var cache = /* @__PURE__ */ new Map();
async function prime(texts) {
  for (const text of new Set(texts)) {
    if (cache.has(text)) continue;
    const hits = [];
    for (let start = 0; start < text.length; start += 700) {
      const chunk = text.slice(start, start + 900);
      for (const m of await ner.detect(chunk)) hits.push({ ...m, start: m.start + start, end: m.end + start });
    }
    cache.set(text, hits);
  }
}
var opts = { extraDetectors: [(s) => cache.get(s) ?? []] };
var planned;
function textObs(text) {
  return { url: "http://localhost", viewport: { w: 1, h: 1 }, opaque: [], elements: [{ nodeId: "text", tag: "div", role: "text", name: "", text, value: "", bbox: { x: 0, y: 0, w: 1, h: 1 } }] };
}
async function mask(text) {
  await prime([text]);
  return sanitize(textObs(text), map, opts).screen.elements[0]?.label ?? "";
}
async function walk(x) {
  if (typeof x === "string") return mask(x);
  if (Array.isArray(x)) return Promise.all(x.map(walk));
  if (x && typeof x === "object") {
    if (x.type === "image_url" || "image_url" in x || /image|audio|video|file/.test(x.type ?? "")) throw Error("non_text_content");
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = await walk(v);
    return out;
  }
  return x;
}
var lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  try {
    const r = JSON.parse(line);
    let out;
    if (r.op === "messages") {
      const value = await walk(r.value);
      const gate = await leakGate(JSON.stringify(value), map, { canaries: r.canaries ?? [] });
      if (!gate.pass) throw Error("leak_gate_blocked");
      out = { value, gate, legend: Object.fromEntries(map.values().map((v) => [v.token, v.type])) };
    } else if (r.op === "observe") {
      await prime(r.value.elements.flatMap((e) => [e.name, e.text, e.value]).filter(Boolean));
      const result = sanitize(r.value, map, opts);
      planned = result.screen;
      out = { screen: planned, detections: result.detections.length };
    } else if (r.op === "action") {
      await prime(r.current.elements.flatMap((e) => [e.name, e.text, e.value]).filter(Boolean));
      const current = sanitize(r.current, map, opts).screen;
      const verdict = validateAction(r.value, planned, current, map);
      if (!verdict.ok || verdict.needsConfirm) throw Error("action_guard_blocked");
      const expanded = rehydrate(r.value.text ?? "", map);
      if (expanded.unknown.length) throw Error("unknown_token");
      out = { text: expanded.text };
    } else throw Error("unknown_operation");
    console.log(JSON.stringify({ ok: true, ...out }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message === "non_text_content" ? "non_text_content" : "privacy_guard_blocked" }));
  }
}
