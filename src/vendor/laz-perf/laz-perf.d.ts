type Pointer = number;
declare class LASZip {
  constructor();
  delete(): void;
  open(data: Pointer, length: number): void;
  getPoint(dest: Pointer): void;
  getCount(): number;
  getPointLength(): number;
  getPointFormat(): number;
}
export interface LazPerf {
  LASZip: typeof LASZip;
  HEAPU8: Uint8Array;
  _malloc(n: number): Pointer;
  _free(p: Pointer): void;
}
declare const createLazPerf: (opts?: { wasmBinary?: ArrayBuffer; locateFile?: (f: string) => string }) => Promise<LazPerf>;
export default createLazPerf;
