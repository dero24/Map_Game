import { describe, expect, it } from 'vitest';
import { CREDITS, creditsHtml } from '../src/ui/credits';
import dataSources from '../docs/DATA_SOURCES.md?raw';

// Every outside host the game or its tile service names must have a licence record and a credit
// (src/ui/credits.ts, docs/DATA_SOURCES.md "Licences and services"); services that don't allow a
// commercial game never come back (docs/GAMEPLAY_VISION.md §17).
const code = import.meta.glob(['../src/**/*.ts', '../src/**/*.js', '../worker/src/*.js', '../index.html', '!../src/vendor/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// (hosts only ever written in comments or as reference links, never fetched)
const REFERENCE = new Set(['github.com', 'emscripten.org', 'threejs.org', 'www.usgs.gov', 'www.census.gov', 'www.epa.gov', 'www.cloudflare.com', 'registry.opendata.aws', 'naip-usdaonline.hub.arcgis.com']);
const LOCAL = /^(localhost|127\.0\.0\.1|x|svc\.example|[\w-]+\.invalid|[\w.-]+\.example)$/;

describe('licences: every source and service is recorded and credited', () => {
  const hosts = new Map<string, string[]>();
  for (const [file, src] of Object.entries(code))
    for (const m of src.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) {
      const h = m[1].replace(/\.$/, '');
      if (LOCAL.test(h)) continue;
      if (!hosts.has(h)) hosts.set(h, []);
      hosts.get(h)!.push(file.replace(/^\.\.\//, ''));
    }
  const credited = new Set(CREDITS.flatMap((c) => c.hosts ?? []));

  it('scans the code (the scan itself works)', () => {
    expect(Object.keys(code).length).toBeGreaterThan(100);
    expect(hosts.has('tiles.openfreemap.org')).toBe(true);
  });
  it('every host the code names is credited, or is a reference link', () => {
    const missing = [...hosts.keys()].filter((h) => !credited.has(h) && !REFERENCE.has(h)).map((h) => `${h} (${hosts.get(h)!.slice(0, 3).join(', ')})`);
    expect(missing).toEqual([]);
  });
  it('Photon and Open-Meteo are gone for good', () => {
    for (const [file, src] of Object.entries(code)) {
      expect(src.includes('photon.komoot'), file).toBe(false);
      expect(/open-meteo\.com/.test(src), file).toBe(false);
    }
  });
  it('every credit has its licence and a link, and the credits screen shows each', () => {
    const html = creditsHtml();
    for (const c of CREDITS) {
      expect(c.credit.length).toBeGreaterThan(5);
      expect(c.licence.length).toBeGreaterThan(2);
      expect(c.link).toMatch(/^https:\/\//);
      expect(html).toContain(c.link);
    }
    expect(html).toContain('OpenStreetMap contributors');
  });
  it('docs/DATA_SOURCES.md records the commercial-use check for every credited source', () => {
    const table = dataSources.slice(dataSources.indexOf('## 0. Licences and services'));
    expect(table.length).toBeGreaterThan(1000);
    for (const c of CREDITS) for (const h of c.hosts ?? []) if (!/openstreetmap\.org$|openmaptiles\.org$|^openfreemap\.org$|registry|hub\.arcgis|esa-worldcover\.org$|overturemaps\.org$/.test(h)) expect(table, h).toContain(h);
  });
  it("the ODbL credit stays in the HUD (AGENTS.md constraint 8)", () => {
    const html = code['../index.html'];
    expect(html).toMatch(/id="osm-credit"[^>]*>map data © <a href="https:\/\/www\.openstreetmap\.org\/copyright"/);
  });
});
