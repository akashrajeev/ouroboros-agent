import {describe,it,expect} from 'vitest';
import {intersects} from '../lib/viewport';
describe('preview viewport',()=>{it('excludes offscreen without pruning safety observation',()=>{
 const viewport={x:0,y:0,w:100,h:100};
 expect(intersects({x:0,y:-40,w:30,h:30},viewport)).toBe(false);
 expect(intersects({x:0,y:90,w:30,h:30},viewport)).toBe(true);
 expect(intersects({x:110,y:0,w:30,h:30},viewport)).toBe(false);
});});
