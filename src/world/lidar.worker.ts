// The LiDAR worker: reads and analyses survey cells (lidarCell.ts) for the tile worker. The
// page spawns it and connects the two with a MessageChannel, so seconds of LAZ decode and
// raster passes never hold up a tile build.
import { measureCell, setCellLog } from './lidarCell';

interface Scope { onmessage: ((e: MessageEvent) => void) | null }
const ctx = self as unknown as Scope;
ctx.onmessage = (e: MessageEvent) => {
  if (e.data?.kind !== 'port') return;
  const port = e.data.port as MessagePort;
  setCellLog((msg) => port.postMessage({ kind: 'log', msg }));
  port.onmessage = (ev: MessageEvent) => {
    const m = ev.data;
    if (m.kind !== 'cell') return;
    measureCell(m.q).then(
      (res) => port.postMessage({ kind: 'done', id: m.id, res }),
      (err) => port.postMessage({ kind: 'error', id: m.id, message: String(err?.message ?? err) }),
    );
  };
};
