import {expect,it} from 'vitest';
import {evidenceText,runEvidence} from '../lib/runEvidence';
import type {StepRecord} from '@ouroboros/core';
it('reports only measured counts and marks ground-truth/resource gaps',()=>{
 const rows=[{bytes:100,placeholders:3,elements:12,image_sent:false,image_detections:0,outcome:'sent',ms_observe:1,ms_sanitize:2,ms_vision:0,ms_gate:1,ms_validate:1,ms_execute:3,ms_server:20}] as StepRecord[];
 const e=runEvidence(rows,1234);
 expect(e.bytes).toBe(100);expect(e.elapsedMs).toBe(1234);expect(e.localMs).toBe(8);
 expect(evidenceText(e)).toContain('CPU / RAM: not measured');expect(evidenceText(e)).toContain('Precision / recall: not measured');
});
it('empty runs do not invent counts',()=>{expect(runEvidence([],100).placeholders).toBe(0);expect(runEvidence([],100).sentSteps).toBe(0);});
