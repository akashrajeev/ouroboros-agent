import {it,expect} from 'vitest';
import {startFullAgent,agentEvidence} from '../lib/fullAgent';
it('polls full Agent status without substituting old planner and surfaces gate/provider',async()=>{
 const urls:string[]=[];
 const fake=(async(url:unknown)=>{urls.push(String(url));return new Response(JSON.stringify(urls.length===1?{run_id:'x'}:{id:'x',status:'done',steps:2,actions:['fill'],providers:[{provider:'cloudflare',stage:'failed',error_class:'ValueError'},{provider:'gemini',stage:'returned'}],gate:'pass',model_calls:2,bytes:10,elapsed_ms:10}));}) as typeof fetch;
 const state=await startFullAgent('http://localhost:8000',{task:'actual task',marker:'a'.repeat(32),url:'http://localhost'},()=>{},fake);
 expect(urls).toEqual(['http://localhost:8000/agent/run','http://localhost:8000/agent/status/x']);
 expect(agentEvidence(state)).toContain('cloudflare:failed');expect(agentEvidence(state)).toContain('gemini:returned');
});
