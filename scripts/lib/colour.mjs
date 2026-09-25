// Colour helpers for the bake: OSM/Overture colour values, materials, and aerial roof samples -> 0xRRGGBB.

// CSS-ish names mappers actually use in building:colour / roof:colour, nudged toward what the thing
// looks like outdoors (a "white" house is warm off-white, a "red" roof is weathered terracotta).
const NAMED = {
  white: 0xf2efe6, ivory: 0xf2ecd8, cream: 0xeee3c4, beige: 0xdccdb0, tan: 0xc8b08a, wheat: 0xe0cfa6, linen: 0xefe7d8,
  grey: 0x9a9a96, gray: 0x9a9a96, lightgrey: 0xc4c4c0, lightgray: 0xc4c4c0, silver: 0xbfc1c2, darkgrey: 0x5c5d5f, darkgray: 0x5c5d5f,
  black: 0x2f3032, charcoal: 0x3c3e41, slategray: 0x6e7880, slategrey: 0x6e7880,
  red: 0x9c4436, darkred: 0x6f2e28, maroon: 0x6a2f2a, brick: 0x9a5646, terracotta: 0xb4623f, orange: 0xc77a3e, salmon: 0xd9937c, pink: 0xe2b3ad,
  brown: 0x7a5a42, saddlebrown: 0x7c4f2e, sienna: 0x8f5a3c, chocolate: 0x7a4a2c, peru: 0xb98150,
  yellow: 0xe6cf7a, gold: 0xd9b54a, khaki: 0xcfc08a, olive: 0x7d7a48,
  green: 0x6b8a5a, darkgreen: 0x3f5a3a, lightgreen: 0xa9c79a, teal: 0x3f7f7a, turquoise: 0x6fb8b0,
  blue: 0x5a7fa6, lightblue: 0xaec6d8, navy: 0x2f3f5a, skyblue: 0x9cc2dc, steelblue: 0x5a7f9c, darkblue: 0x2c3e5c,
  purple: 0x6e5a82, lavender: 0xc9c0dc, copper: 0x5f8a7a,
};

export function parseColour(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/[\s_-]/g, '');
  const hex = s.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return parseInt(h, 16);
  }
  return NAMED[s] ?? null;
}

// Facade material -> a believable painted/natural colour (only used when no explicit colour is mapped).
const FACADE_MAT = {
  brick: 0x9a5a48, stone: 0xb6ad9c, concrete: 0xbdb8ae, plaster: 0xe6dfd0, stucco: 0xe6dccb, wood: 0xb58e64, timber_framing: 0xe8dfcc,
  metal: 0xa9adb0, glass: 0x8fa5b2, sandstone: 0xd2b98e, limestone: 0xd9d0bb, vinyl: 0xe8e4da, cement_block: 0xb9b5ab, clay: 0xb87a55,
};
export function materialColour(v) {
  if (!v) return null;
  return FACADE_MAT[String(v).toLowerCase().replace(/\s/g, '_')] ?? null;
}
const ROOF_MAT = {
  roof_tiles: 0xa85a3c, tile: 0xa85a3c, clay: 0xa85a3c, slate: 0x4f555c, metal: 0x8a9298, metal_sheet: 0x8a9298, copper: 0x5f8a7a,
  concrete: 0x9d9a92, asphalt_shingle: 0x5e5f61, asphalt: 0x5e5f61, tar_paper: 0x4a4b4d, wood: 0x7a6250, thatch: 0x9a8455,
  glass: 0x9ab3bf, stone: 0x77746e, gravel: 0x9a968c, grass: 0x6b7f4a, eternit: 0x8d8b86,
};
export function roofMaterialColour(v) {
  if (!v) return null;
  return ROOF_MAT[String(v).toLowerCase().replace(/\s/g, '_')] ?? null;
}

// Aerial photos are hazy and low-contrast; lift them toward what a painter would mix, keep the hue.
export function paintFromAerial(r, g, b) {
  const [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255);
  const s2 = Math.min(0.55, s * 1.3);
  const l2 = Math.max(0.16, Math.min(0.88, 0.5 + (l - 0.5) * 1.18));
  const [R, G, B] = hslToRgb(h, s2, l2);
  return (Math.round(R * 255) << 16) | (Math.round(G * 255) << 8) | Math.round(B * 255);
}

function rgbToHsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
