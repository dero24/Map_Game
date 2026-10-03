// What scripts/measure-cells.mjs loads through Vite's module runner: the runtime's own pure
// LiDAR code (no copies), so a precomputed record is exactly what a desktop's read would make.
export { cellPlan, cellRequest, foldRes, VER, INDEX_MADE, type Rec, type MeasuredFile } from '../../src/world/lidar';
export { measureCell, setCellLog } from '../../src/world/lidarCell';
export { validIndex, validFile, type MeasuredIndex } from '../../src/world/measured';
export { measuredText, fnv36 } from '../../src/world/measuredFile';
