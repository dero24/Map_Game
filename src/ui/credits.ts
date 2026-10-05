// The credits screen: every data source and service the game uses, with the credit its licence asks
// for (docs/DATA_SOURCES.md "Licences and services"). One list, shown from the intro, the map and the
// HUD's credit line; tests/licences.test.ts fails on any outside host in the code that isn't here.
// The always-visible HUD line (index.html #osm-credit) carries the credits that must stay on screen.

export interface Credit {
  what: string; // what the game uses it for
  credit: string; // the credit as its licence asks (HTML-free)
  licence: string;
  link: string;
  hosts?: string[]; // the hosts the game (or its tile service) fetches from
}

export const CREDITS: Credit[] = [
  { what: 'Streets, buildings, land use, trees and everything mapped', credit: '© OpenStreetMap contributors', licence: 'ODbL 1.0', link: 'https://www.openstreetmap.org/copyright',
    hosts: ['www.openstreetmap.org', 'overpass-api.de', 'overpass.kumi.systems', 'overpass.private.coffee'] },
  { what: 'Vector tiles: the sea, and real streets while a cell loads', credit: 'OpenFreeMap © OpenMapTiles · data from OpenStreetMap', licence: 'OpenMapTiles CC BY 4.0 (design), ODbL (data)', link: 'https://openfreemap.org',
    hosts: ['tiles.openfreemap.org', 'openfreemap.org', 'www.openmaptiles.org', 'openmaptiles.org'] },
  { what: 'Buildings in the baked shore', credit: 'Overture Maps Foundation (buildings: OpenStreetMap, Microsoft ML Buildings, Esri Community Maps)', licence: 'ODbL 1.0', link: 'https://overturemaps.org', hosts: ['overturemaps.org'] },
  { what: 'Ground heights', credit: 'Terrain Tiles (Mapzen / Tilezen, on AWS Open Data): 3DEP, SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; ETOPO1 courtesy of NOAA NCEI', licence: 'public domain sources (US); MIT (tile code)', link: 'https://registry.opendata.aws/terrain-tiles/',
    hosts: ['s3.amazonaws.com', 'registry.opendata.aws'] },
  { what: 'Building heights and tree crowns, measured', credit: 'USGS 3D Elevation Program (3DEP) LiDAR', licence: 'public domain', link: 'https://www.usgs.gov/3d-elevation-program',
    hosts: ['s3-us-west-2.amazonaws.com', 'raw.githubusercontent.com'] },
  { what: 'Roof colours', credit: 'USDA NAIP imagery via the USGS National Map', licence: 'public domain', link: 'https://naip-usdaonline.hub.arcgis.com/',
    hosts: ['imagery.nationalmap.gov', 'naip-usdaonline.hub.arcgis.com'] },
  { what: 'Land cover in the baked shore', credit: '© ESA WorldCover project 2021 / contains modified Copernicus Sentinel data (2021) processed by the ESA WorldCover consortium', licence: 'CC BY 4.0', link: 'https://esa-worldcover.org',
    hosts: ['esa-worldcover.org', 'esa-worldcover.s3.eu-central-1.amazonaws.com'] },
  { what: 'Place names: the map search', credit: 'USGS Geographic Names Information System (GNIS)', licence: 'public domain', link: 'https://www.usgs.gov/us-board-on-geographic-names', hosts: ['prd-tnm.s3.amazonaws.com'] },
  { what: 'Towns and counties: search and arrival cards', credit: 'U.S. Census Bureau: gazetteer, cartographic boundaries, population estimates', licence: 'public domain', link: 'https://www.census.gov/geographies.html', hosts: ['www2.census.gov'] },
  { what: 'Which plants and animals belong where: the regions of the lower 48', credit: 'U.S. Environmental Protection Agency: Level III Ecoregions of the Continental United States', licence: 'public domain', link: 'https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-continental-united-states',
    hosts: ['dmap-prod-oms-edc.s3.us-east-1.amazonaws.com'] },
  { what: 'Hosting the tiles and the place index', credit: 'Cloudflare Workers and R2', licence: 'paid service', link: 'https://www.cloudflare.com', hosts: ['map-game-tiles.map-game-tiles.workers.dev'] },
  { what: 'Rendering and storage', credit: 'three.js (MIT) · lil-gui (MIT) · idb (ISC) · laz-perf (Apache 2.0)', licence: 'MIT, ISC, Apache 2.0', link: 'https://threejs.org' },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** The credits card's body. */
export function creditsHtml(): string {
  return `<h2>Credits</h2><p class="credits-lede">This painting is made from real, open data. Thank you to everyone who made it.</p><ul class="credits-list">`
    + CREDITS.map((c) => `<li><b>${esc(c.what)}</b><br><a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.credit)}</a> <span class="lic">· ${esc(c.licence)}</span></li>`).join('')
    + `</ul><p class="credits-lede">Weather is the game's own (seeded, the same for everyone). No street addresses and nothing about people are ever looked up.</p>`;
}
/** Fill the credits card and wire every link that opens it. */
export function initCredits(open: HTMLElement[]) {
  const box = document.getElementById('credits');
  const card = box?.querySelector('.card');
  if (!box || !card) return;
  const close = card.querySelector('#credits-close');
  card.innerHTML = creditsHtml();
  if (close) card.appendChild(close);
  const show = (e: Event) => { e.preventDefault(); e.stopPropagation(); box.classList.remove('hidden'); };
  for (const el of open) el.addEventListener('click', show);
  close?.addEventListener('click', () => box.classList.add('hidden'));
  box.addEventListener('click', (e) => { if (e.target === box) box.classList.add('hidden'); });
}
