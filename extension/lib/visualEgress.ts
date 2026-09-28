/** Restrict image egress to already-redacted opaque regions; DOM pixels never leave. */
export function opaqueOnly(source: OffscreenCanvas, boxes: {x:number;y:number;w:number;h:number}[]): OffscreenCanvas {
  const result = new OffscreenCanvas(source.width, source.height);
  const ctx = result.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, source.width, source.height);
  for (const b of boxes) {
    const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
    const right = Math.min(source.width, Math.ceil(b.x + b.w)), bottom = Math.min(source.height, Math.ceil(b.y + b.h));
    if (right > x && bottom > y) ctx.drawImage(source, x, y, right - x, bottom - y, x, y, right - x, bottom - y);
  }
  return result;
}
