import type { BBox } from '@ouroboros/core';
export function intersects(a:BBox,b:BBox):boolean {
  return a.w>0&&a.h>0&&b.w>0&&b.h>0&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
}
/** Preview only. Full safety observation is never pruned by viewport. */
export function inPreviewViewport(el:Element,box:BBox,win:Window):boolean {
  let clip:BBox={x:0,y:0,w:win.innerWidth,h:win.innerHeight};
  for(let a=el.parentElement;a;a=a.parentElement){
    const s=win.getComputedStyle(a),r=a.getBoundingClientRect();
    if(/hidden|clip|auto|scroll/.test(s.overflowX)) { const left=Math.max(clip.x,r.left),right=Math.min(clip.x+clip.w,r.right);clip.x=left;clip.w=Math.max(0,right-left); }
    if(/hidden|clip|auto|scroll/.test(s.overflowY)) { const top=Math.max(clip.y,r.top),bottom=Math.min(clip.y+clip.h,r.bottom);clip.y=top;clip.h=Math.max(0,bottom-top); }
  }
  return intersects(box,clip);
}
