/** Device-local JSON-lines process. No HTTP, no provider credentials. */
import { createInterface } from 'node:readline';
import { webcrypto } from 'node:crypto';
import { PlaceholderMap, sanitize, leakGate, rehydrate, validateAction } from '../../packages/core/src/index';
import { NerDetector } from '../../packages/ner/src/index';
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const map = new PlaceholderMap();
const ner = await NerDetector.create({localModelPath: 'models/', types: 'all'});
const cache = new Map<string,any[]>();
async function prime(texts: string[]) {
  for(const text of new Set(texts)) {
    if(cache.has(text)) continue;
    const hits:any[]=[];
    for(let start=0; start<text.length; start+=700) {
      const chunk=text.slice(start,start+900);
      for(const m of await ner.detect(chunk)) hits.push({...m,start:m.start+start,end:m.end+start});
    }
    cache.set(text,hits);
  }
}
const opts = {extraDetectors: [(s:string)=>cache.get(s)??[]]};
let planned: any;
function textObs(text: string) { return {url:'http://localhost',viewport:{w:1,h:1},opaque:[],elements:[{nodeId:'text',tag:'div',role:'text',name:'',text,value:'',bbox:{x:0,y:0,w:1,h:1}}]}; }
async function mask(text: string) {
  await prime([text]);
  return sanitize(textObs(text),map,opts).screen.elements[0]?.label ?? '';
}
async function walk(x: any): Promise<any> {
  if (typeof x==='string') return mask(x);
  if (Array.isArray(x)) return Promise.all(x.map(walk));
  if (x && typeof x==='object') {
    if (x.type==='image_url' || 'image_url' in x || /image|audio|video|file/.test(x.type ?? '')) throw Error('non_text_content');
    const out: any={};
    for (const [k,v] of Object.entries(x)) out[k]=await walk(v);
    return out;
  }
  return x;
}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
for await (const line of lines) {
  try {
    const r=JSON.parse(line); let out:any;
    if(r.op==='messages') {
      const value=await walk(r.value);
      const gate=await leakGate(JSON.stringify(value),map,{canaries:r.canaries??[]});
      if(!gate.pass) throw Error('leak_gate_blocked');
      out={value,gate,legend:Object.fromEntries(map.values().map(v=>[v.token,v.type]))};
    } else if(r.op==='observe') {
      await prime(r.value.elements.flatMap((e:any)=>[e.name,e.text,e.value]).filter(Boolean));
      const result=sanitize(r.value,map,opts); planned=result.screen;
      out={screen:planned,detections:result.detections.length};
    } else if(r.op==='action') {
      await prime(r.current.elements.flatMap((e:any)=>[e.name,e.text,e.value]).filter(Boolean));
      const current=sanitize(r.current,map,opts).screen;
      const verdict=validateAction(r.value,planned,current,map);
      if(!verdict.ok || verdict.needsConfirm) throw Error('action_guard_blocked');
      const expanded=rehydrate(r.value.text??'',map);
      if(expanded.unknown.length) throw Error('unknown_token');
      out={text:expanded.text};
    } else throw Error('unknown_operation');
    console.log(JSON.stringify({ok:true,...out}));
  } catch(e) { console.log(JSON.stringify({ok:false,error:(e as Error).message==='non_text_content'?'non_text_content':'privacy_guard_blocked'})); }
}
