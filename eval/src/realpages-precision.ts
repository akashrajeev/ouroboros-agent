/** Phase 12C: conservative real-page DOM precision probe. Seeded values, no form submission.
 * Unit = input field with known synthetic ground truth, not all PII on a site.
 * Unknown page text is reviewed separately; no auto FP claim for unknown labels.
 * Usage: npx tsx eval/src/realpages-precision.ts urls.txt [seed] [tag]
 */
import { fakerEN_IN as f } from '@faker-js/faker';
import { PlaceholderMap, normalizeValue, sanitize, wireScreenMap, type RawObservation, type TextMatch } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as id from './ids';
const M = new URL('../../models/', import.meta.url).pathname;
const [urlsFile='realpages-precision-30.txt',seedArg='12131',tag='realpages-precision-12131']=process.argv.slice(2);
f.seed(Number(seedArg));
const OUT=new URL(`../results/${tag}/`,import.meta.url).pathname; mkdirSync(OUT,{recursive:true});
const inpage=readFileSync('/tmp/rp-inpage.js','utf8');
const urls=readFileSync(urlsFile,'utf8').split('\n').map(x=>x.trim()).filter(x=>x.startsWith('https://'));
type T = 'NAME' | 'EMAIL' | 'PHONE' | 'AADHAAR' | 'PAN' | 'DOB' | 'PINCODE' | 'ADDRESS' | 'PASSWORD' | 'OTP' | 'ACCOUNT' | 'IFSC' | 'CARD';
function classify(e: RawObservation['elements'][number]): T | null {
  if (!['input', 'textarea'].includes(e.tag)) return null;
  const it = (e.inputType ?? 'text').toLowerCase();
  if (['checkbox', 'radio', 'submit', 'button', 'file', 'hidden', 'image', 'reset', 'range', 'color', 'search'].includes(it)) return null;
  if (e.disabled) return null;
  if (it === 'password') return 'PASSWORD';
  const s = [e.name, e.htmlName, e.htmlId, e.placeholder, e.autocomplete].filter(Boolean).join(' ').toLowerCase();
  if (/captcha|security code|verification code shown|search/.test(s)) return null;
  if (/e-?mail/.test(s) || it === 'email') return 'EMAIL';
  if (/aadha?ar|\buid\b|vid\b/.test(s)) return 'AADHAAR';
  if (/\bpan\b|pan card|pan number|pan no/.test(s)) return 'PAN';
  if (/ifsc/.test(s)) return 'IFSC';
  if (/card number|card no|cardnumber/.test(s)) return 'CARD';
  if (/account (number|no)|acc(ount)?_?no/.test(s)) return 'ACCOUNT';
  if (/\botp\b|one.time/.test(s)) return 'OTP';
  if (/mobile|phone|contact (number|no)|whatsapp|\btel\b/.test(s) || it === 'tel') return 'PHONE';
  if (/date of birth|\bdob\b|birth ?date|bday/.test(s)) return 'DOB';
  if (/pin ?code|postal|zip/.test(s)) return 'PINCODE';
  if (/address|street|locality|house|flat/.test(s)) return 'ADDRESS';
  if (/user ?name|login id|user id/.test(s)) return null;
  if (/name/.test(s)) return 'NAME';
  return null;
}
function valueFor(t: T, e: RawObservation['elements'][number]): string {
  const s = [e.name, e.htmlName, e.htmlId, e.placeholder].join(' ').toLowerCase();
  switch (t) {
    case 'NAME': return /first|given/.test(s) ? f.person.firstName() : /last|sur|family/.test(s) ? f.person.lastName() : `${f.person.firstName()} ${f.person.lastName()}`;
    case 'EMAIL': return `${f.person.firstName().toLowerCase()}.${f.number.int({ min: 10, max: 99 })}@gmail.com`;
    case 'PHONE': return id.mobile(f);
    case 'AADHAAR': return id.aadhaar(f);
    case 'PAN': return id.pan(f);
    case 'DOB': { const d = f.date.birthdate({ min: 18, max: 70, mode: 'age' }); return e.inputType === 'date' ? d.toISOString().slice(0, 10) : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
    case 'PINCODE': return String(f.number.int({ min: 110001, max: 855999 }));
    case 'ADDRESS': return `${f.location.buildingNumber()}, ${f.location.street()}`;
    case 'PASSWORD': return `Qx${f.string.alphanumeric(8)}#7`;
    case 'OTP': return String(f.number.int({ min: 100000, max: 999999 }));
    case 'ACCOUNT': return String(f.number.int({ min: 10000000000, max: 99999999999 }));
    case 'IFSC': return id.ifsc(f);
    case 'CARD': return id.card(f);
  }
}

const ner=await NerDetector.create({localModelPath:M});
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-gpu','--lang=en-IN']});
const result:any[]=[];
for(const [index,url] of urls.entries()) {
 const r:any={index,url}; const page=await browser.newPage(); await page.setViewport({width:1280,height:900});
 page.setDefaultTimeout(7000);
 try {
  const resp=await page.goto(url,{waitUntil:'domcontentloaded',timeout:12000}).catch(()=>null);r.status=resp?.status()??0;
  // Wait only on reachable 2xx pages whose first-step inputs may mount after DOMContentLoaded.
  // Observe a visible, enabled native input; do not click consent, authenticate, or bypass a wall.
  if (r.status>=200 && r.status<300) {
   await page.waitForFunction(() => Array.from(document.querySelectorAll('input,textarea')).some(e =>
    e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement ?
     e.getClientRects().length>0 && !e.disabled && !e.readOnly &&
     !['hidden','checkbox','radio','search','button','submit','file'].includes((e as HTMLInputElement).type) : false
   ), {timeout:8000,polling:250}).catch(()=>{});
  }
  r.finalUrl=page.url();r.title=(await page.title()).slice(0,90);
  await page.evaluate(inpage);const pre=await page.evaluate('window.__ouro.observe()') as RawObservation;
  r.inputs=pre.elements.filter(x=>x.tag==='input'||x.tag==='textarea').length;
  r.candidates=pre.elements.filter(x=>classify(x)).length;
  const truth:{type:T;value:string;nodeId:string;label:string}[]=[];
  for(const e of pre.elements) { const t=classify(e);if(!t)continue;const value=valueFor(t,e);
   if(await page.evaluate(`window.__ouro.fill(${JSON.stringify(e.nodeId)},${JSON.stringify(value)})`)) truth.push({type:t,value,nodeId:e.nodeId,label:e.name||e.placeholder||''});
  }
  const raw=await page.evaluate('window.__ouro.observe()') as RawObservation;
  await ner.prime(raw.elements.flatMap(e=>[e.name,e.text,e.value]).filter(Boolean));
  const {screen}=sanitize(raw,new PlaceholderMap(),{extraDetectors:[(s:string):TextMatch[]=>ner.lookup(s)]});
  const wire=JSON.stringify(wireScreenMap(screen)).replace(/"bbox":\[[^\]]*\]/g,'"bbox":[]');
  const normalized=normalizeValue(wire);r.filled=truth.length;
  r.fields=truth.map(x=>{const i=raw.elements.findIndex(e=>e.nodeId===x.nodeId);const se=screen.elements[i];return {type:x.type,label:x.label,found:raw.elements[i]?.value===x.value,masked:/<[A-Z_]+_\d+>/.test(se?.value??''),leaked:normalized.includes(normalizeValue(x.value))};});
  const filled=new Set(truth.map(x=>x.nodeId));
  r.otherPlaceholders=screen.elements.flatMap((se,i)=>filled.has(raw.elements[i]?.nodeId??'')?[]:[...(se.value??'').matchAll(/<[A-Z_]+_\d+>/g)].map(m=>({token:m[0],rawText:raw.elements[i]?.value??raw.elements[i]?.text??'',label:raw.elements[i]?.name??''})));
  r.result=truth.length?'scored':'no_persistent_fill';
  r.reason=truth.length?'filled':r.status===403?'access_denied':r.status===404?'not_found':r.inputs===0?'no_visible_inputs':r.candidates===0?'no_target_fields':'fill_rejected';
 } catch(e) {r.error=String(e).slice(0,180);r.result='unscored_error';}
 await page.close().catch(()=>{});result.push(r);console.log(JSON.stringify({index,url:r.finalUrl??url,status:r.status,result:r.result,fields:r.fields?.length??0,masked:r.fields?.filter((x:any)=>x.masked&&!x.leaked&&x.found).length??0,other:r.otherPlaceholders?.length??0,error:r.error}));
 writeFileSync(`${OUT}results.json`,JSON.stringify(result,null,2));
}
await browser.close();
