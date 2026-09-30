import type { StepRecord } from '@ouroboros/core';

export interface RunEvidence { elapsedMs: number; steps: number; sentSteps: number; blocked: number; bytes: number; placeholders: number; elements: number; imageSteps: number; imageDetections: number; localMs: number; plannerMs: number }
export function runEvidence(rows: StepRecord[], elapsedMs: number): RunEvidence {
  const sum = (key: keyof StepRecord) => rows.reduce((n,r) => n + (Number(r[key]) || 0),0);
  return {elapsedMs,steps:rows.length,sentSteps:rows.filter(r=>r.bytes>0).length,blocked:rows.filter(r=>r.outcome==='blocked').length,
    bytes:sum('bytes'),placeholders:Math.max(0,...rows.map(r=>r.placeholders)),elements:Math.max(0,...rows.map(r=>r.elements)),
    imageSteps:rows.filter(r=>r.image_sent).length,imageDetections:sum('image_detections'),
    localMs:sum('ms_observe')+sum('ms_sanitize')+sum('ms_vision')+sum('ms_gate')+sum('ms_validate')+sum('ms_execute'),plannerMs:sum('ms_server')};
}
export function evidenceText(e:RunEvidence):string {
  const seconds=(ms:number)=>(ms/1000).toFixed(2)+' s';
  return [
    'RUN EVIDENCE - not an accuracy benchmark',
    `1 Visual context: up to ${e.elements} DOM elements; ${e.imageSteps} image steps. Accuracy: not measured.`,
    `2 PII detection: ${e.placeholders} distinct values tokenized. Precision / recall: not measured.`,
    `3 Redaction: ${e.sentSteps} gated payloads sent; ${e.blocked} blocked. Redaction accuracy: not measured.`,
    `4 Client resources: ${e.bytes.toLocaleString()} payload bytes; local work ${seconds(e.localMs)}. CPU / RAM: not measured.`,
    `5 Latency: ${seconds(e.elapsedMs)} end to end; planner/network ${seconds(e.plannerMs)}; ${e.steps} steps.`,
    'Zero blocked payloads is not proof that every private value was detected.',
  ].join('\n');
}
