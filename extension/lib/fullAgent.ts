/** Loopback device IPC. Raw task stays local; server's Ouroboros gate owns provider egress. */
export interface AgentState {id:string;status:string;steps:number;actions:string[];gate:'pass'|'blocked'|null;bytes:number;model_calls:number;elapsed_ms:number;reason?:string;providers:{provider:string;stage:string;error_class?:string;status_code?:number}[]}
export function agentEvidence(s:AgentState):string {return ['FULL BROWSER-USE AGENT',`status: ${s.status} · ${s.steps} steps · ${s.actions.length} actions`, `provider attempts: ${s.providers.map(p=>p.provider+':'+p.stage+(p.error_class?' ('+p.error_class+')':'')).join(' -> ') || 'waiting'}`,`egress gate: ${s.gate??'not checked'} · ${s.model_calls} gated model calls · ${s.bytes} sanitized bytes`,`images: 0 · submit/download/upload/JS tools: disabled`,s.reason??'','Gate PASS covers this payload, not every possible private value.'].filter(Boolean).join('\n');}
export async function startFullAgent(server:string,request:{task:string;marker:string;url:string},update:(s:AgentState)=>void,fetcher:typeof fetch=fetch):Promise<AgentState>{
 const res=await fetcher(server+'/agent/run',{method:'POST',headers:{'content-type':'application/json','x-ouro-client':'extension'},body:JSON.stringify(request)});
 if(!res.ok)throw Error(`Full Agent start failed (${res.status}); check dedicated debug Chrome/local server.`);
 const {run_id}=await res.json();
 if(typeof run_id!=='string')throw Error('Invalid Agent run response');
 for(let n=0;n<3600;n++){
   const r=await fetcher(server+'/agent/status/'+encodeURIComponent(run_id),{headers:{'x-ouro-client':'extension'}});
   if(!r.ok)throw Error('Full Agent status unavailable; run outcome unknown. Do not restart blindly.');
   const state=await r.json() as AgentState;update(state);
   if(state.status!=='running')return state;
   await new Promise(resolve=>setTimeout(resolve,750));
 }
 throw Error('Full Agent status timed out; inspect current run before restarting.');
}
