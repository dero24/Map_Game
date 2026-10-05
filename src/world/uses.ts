// What a building is used for. One classifier for every consumer — café terraces outside,
// interior archetypes inside, shop-window wares — so the whole world reads consistently, with
// no town lists.
//
// The map's own tags come first: OSM's amenity / shop / office / craft values are the same
// words in every country ("cafe", "supermarket", "bank"), so a café in Tucson, Lyon or Osaka
// classifies alike. Only when a building carries no such tag do we read its name, with a small
// multilingual vocabulary (English, Spanish, French, Italian, German, Portuguese) — names are a
// hint, never the primary signal.
export type Use = 'cafe' | 'restaurant' | 'bar' | 'grocery' | 'shop' | 'office' | 'civic' | 'unknown';

// OSM tag values → use. Anything tagged shop=* / craft=* that isn't listed is a shop, office=*
// an office (see useOf).
const TAG: Record<string, Use> = {
  // amenity: food and drink
  cafe: 'cafe', ice_cream: 'cafe', bakery: 'cafe', coffee: 'cafe', tea: 'cafe', pastry: 'cafe', confectionery: 'cafe', juice_bar: 'cafe',
  restaurant: 'restaurant', fast_food: 'restaurant', food_court: 'restaurant', deli: 'restaurant', bbq: 'restaurant', seafood: 'restaurant',
  bar: 'bar', pub: 'bar', biergarten: 'bar', nightclub: 'bar', club: 'bar', beach_resort: 'bar', wine_bar: 'bar', brewery: 'bar', winery: 'bar',
  // shop: groceries
  supermarket: 'grocery', convenience: 'grocery', greengrocer: 'grocery', grocery: 'grocery', butcher: 'grocery', alcohol: 'grocery', beverages: 'grocery',
  wine: 'grocery', cheese: 'grocery', farm: 'grocery', frozen_food: 'grocery', health_food: 'grocery', kiosk: 'grocery', general: 'grocery', department_store: 'shop',
  // offices and services
  bank: 'office', office: 'office', insurance: 'office', estate_agent: 'office', lawyer: 'office', accountant: 'office', company: 'office', government: 'civic',
  dentist: 'office', doctors: 'office', clinic: 'office', veterinary: 'office', architect: 'office', financial: 'office', travel_agency: 'office', it: 'office',
  // civic
  library: 'civic', post_office: 'civic', townhall: 'civic', police: 'civic', fire_station: 'civic', school: 'civic', kindergarten: 'civic', college: 'civic',
  university: 'civic', museum: 'civic', courthouse: 'civic', community_centre: 'civic', arts_centre: 'civic', theatre: 'civic', cinema: 'civic', hospital: 'civic',
};

// Name hints, several languages. Order matters (a "café-bar" is a café; "pizza pub" a restaurant).
const RULES: [Use, RegExp][] = [
  ['cafe', /(caf[eé]|coffee|espresso|bakery|bake ?shop|donut|doughnut|bagel|ice ?cream|creamery|gelat[oe]ria?|frozen yogurt|tea ?(house|room)|juice|smoothie|p[aâ]tisserie|pastry|panader[ií]a|pasteler[ií]a|cafeter[ií]a|boulangerie|b[äa]ckerei|konditorei|pasticceria|padaria|confeitaria|kaffee)/i],
  ['restaurant', /(restaurant|restaurante|ristorante|trattoria|osteria|brasserie|bistro|gasthaus|gasthof|diner|grill|kitchen|cocina|cuisine|pizz|taquer[ií]a|tacos?|cantina|sushi|burger|bbq|barbecue|steak|seafood|mariscos|marisquer[ií]a|clam|crab|oyster|lobster|deli|sandwich|\bsubs?\b|noodle|pho\b|ramen|luncheonette|chowder|fish ?(house|market)|shack|comedor|churrascaria|imbiss|pollo)/i],
  ['bar', /(\bbar\b|\bpub\b|beach club|\bclub\b|tavern|taverna|taberna|cervecer[ií]a|brasserie|taproom|tap ?house|brewery|brewing|saloon|lounge|\binn\b|\bwine\b|spirits|cocktail|kneipe|bierstube|enoteca|vinoteca|botequim|cantina)/i],
  ['grocery', /(market|mercado|march[ée]|markt|mercato|grocery|groceries|supermarket|supermercado|supermarch[ée]|supermarkt|bodega|tienda|[ée]picerie|alimentari|mercearia|convenience|liquor|abarrotes)/i],
  ['office', /(\bbank\b|banco|banque|credit union|insurance|seguros|assurance|versicherung|realty|real estate|inmobiliaria|immobilier|immobili|realtors?|\blaw\b|attorneys?|abogados?|avocats?|legal|accounting|\bcpa\b|dental|dentist|dentista|orthodont|medical|m[ée]dic|clinic|cl[ií]nica|physicians?|chiropract|associates|agency|agencia|consult|architects?|arquitect|engineering|financial|capital|partners|\bllc\b|\binc\b|\bgmbh\b|s\.a\.|services)/i],
  ['civic', /(library|biblioteca|biblioth[èe]que|bibliothek|post office|correos|la poste|town hall|borough hall|city hall|ayuntamiento|mairie|rathaus|municipio|municipal|police|polic[ií]a|fire (company|department|house|station)|bomberos|school|escuela|[ée]cole|schule|scuola|academy|museum|museo|mus[ée]e|court)/i],
];

/** The use of a named / tagged business. `tag` is the building's OSM amenity / shop / office /
 *  craft value when the map has one (Building.u); `name` a fallback hint. */
export function useOf(name?: string, tag?: string): Use {
  if (tag) {
    if (TAG[tag]) return TAG[tag];
    // an unlisted shop=* / craft=* value is a shop; unknown amenity values fall through to the name
    if (/^(clothes|shoes|gift|books|hardware|furniture|jewelry|beauty|hairdresser|florist|toys|sports|electronics|mobile_phone|variety_store|second_hand|art|antiques|boutique|optician|pharmacy|chemist|bicycle|pet|stationery|music|surf|fishing|outdoor|car|car_repair|laundry|dry_cleaning|tailor|photo|tattoo|massage|cosmetics|interior_decoration|garden_centre|doityourself|mall|carpenter|shoemaker|jeweller|electrician|plumber)$/.test(tag)) return 'shop';
  }
  if (!name) return tag ? 'shop' : 'unknown';
  for (const [u, re] of RULES) if (re.test(name)) return u;
  return 'shop'; // a named ground-floor business we can't place is most often a shop
}
/** Places people sit outside of when the weather allows. */
export const terraceUse = (u: Use) => u === 'cafe' || u === 'restaurant' || u === 'bar';

// What a public building is inside (docs/INTERIORS_PLAN.md Slice 4): the archetypes whose rooms a
// visitor recognises — a supermarket's aisles and checkouts, a hotel's corridors of rooms, a
// school's classrooms, a library's stacks, a bank's counter. Finer than `useOf` (whose coarse uses
// the terraces and shop windows keep): null when the building's data doesn't say.
export type Place = 'supermarket' | 'hotel' | 'school' | 'library' | 'bank' | 'post' | 'pharmacy' | 'gym' | 'mosque';
const PLACE_TAG: Record<string, Place> = {
  supermarket: 'supermarket', hypermarket: 'supermarket', wholesale: 'supermarket',
  hotel: 'hotel', motel: 'hotel', hostel: 'hotel', guest_house: 'hotel', apartment_hotel: 'hotel',
  school: 'school', kindergarten: 'school', college: 'school', university: 'school', language_school: 'school', music_school: 'school', childcare: 'school', prep_school: 'school',
  library: 'library', bank: 'bank', bureau_de_change: 'bank', post_office: 'post', pharmacy: 'pharmacy', chemist: 'pharmacy',
  fitness_centre: 'gym', gym: 'gym', sports_centre: 'gym',
};
// Name hints, several languages; the order matters ("University Library" is a library, "Hotel
// Bank Street" a hotel only when nothing else in the name speaks first — so the specific ones go
// first). Words that name something else in another language stay out ("librería": a bookshop).
const HOTEL = /(\bhotel\b|h[oô]tel\b|\bmotel\b|\bhostel\b|\bhostal\b|\balbergo\b|\bpension\b|\bposada\b|guest ?house|bed (and|&) breakfast|\bb ?& ?b\b|\bsuites\b|\binn\b|\bresort\b|\blodging\b)/i;
const PLACE_NAME: [Place, RegExp][] = [
  ['library', /(library|biblioteca|biblioth[èe]que|bibliothek|bibliotheek)/i],
  ['post', /(post office|postamt|\bla poste\b|correos|correios|ufficio postale|postkantoor|bureau de poste)/i],
  ['bank', /(\bbank\b|\bbanco\b|\bbanque\b|\bbanca\b|sparkasse|volksbank|credit union|caja de ahorros|\bcaixa\b|savings (and|&) loan)/i],
  ['pharmacy', /(pharmacy|pharmacie|farmacia|farm[áa]cia|apotheke|apotheek|drug ?store|\bchemist)/i],
  ['school', /(school|escuela|[ée]cole|schule|scuola|escola|colegio|col[ée]gio|academy|academia|acad[ée]mie|kindergarten|preschool|pre-school|elementary|lyc[ée]e|\bcollege\b|coll[èe]ge|universit|learning cent(er|re)|early childhood|montessori)/i],
  ['gym', /(\bgym\b|fitness|crossfit|\byoga\b|pilates|health club|boxing|martial arts|karate|taekwondo|jiu.?jitsu|\bjudo\b|\bdojo\b|gimnasio)/i],
  ['mosque', /(mosque|masjid|mezquita|mosqu[ée]e|moschee|islamic cent(er|re)|\bjami\b|\bcami\b)/i],
];
/** The archetype a building's rooms follow, from its OSM amenity / shop / office / leisure value
 *  (`tag`, Building.u) or, failing that, its name. A tagged building takes its tag's archetype —
 *  a pub called "The Library" stays a pub — except that a hotel's name wins over the restaurant or
 *  bar mapped inside it. null: nothing says. */
export function placeOf(name?: string, tag?: string): Place | null {
  if (tag) return PLACE_TAG[tag] ?? (name && HOTEL.test(name) ? 'hotel' : null);
  if (!name) return null;
  if (HOTEL.test(name) && !PLACE_NAME.slice(0, 2).some(([, re]) => re.test(name))) return 'hotel';
  for (const [p, re] of PLACE_NAME) if (re.test(name)) return p;
  return null;
}
/** "Inn", "Lodging" and "Resort" name a pub or a club as often as a hotel: a hotel only with rooms
 *  upstairs (the plan's call, which knows the storeys). */
export const hotelOnlyUpstairs = (name?: string) => !!name && /\b(inn|resort|lodging)\b/i.test(name) && !/(\bhotel\b|h[oô]tel\b|\bmotel\b|\bhostel\b|\bsuites\b|guest ?house|bed (and|&) breakfast)/i.test(name);
