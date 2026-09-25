// Canvas creation that works both in the tile worker and on the main thread — including
// devices without OffscreenCanvas (older iOS). In a worker without it there is no document,
// which surfaces as a job failure and escalates to in-page builds (see TileStream).
export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export async function canvasBitmap(c: AnyCanvas): Promise<ImageBitmap> {
  if (c instanceof OffscreenCanvas) return c.transferToImageBitmap();
  return createImageBitmap(c);
}
