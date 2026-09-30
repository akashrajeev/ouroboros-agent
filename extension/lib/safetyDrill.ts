import {leakGate,PlaceholderMap} from '@ouroboros/core';
/** Labeled synthetic drill. Deliberately bad payload is NEVER posted. */
export async function safetyDrill() {
 const payload=JSON.stringify({demo:'synthetic safety drill',pan:'BQKPS1234F'});
 const gate=await leakGate(payload,new PlaceholderMap());
 return {blocked:!gate.pass,hits:gate.hits.length,bytes:gate.bytes,sha256:gate.sha256,networkRequests:0};
}
