// What a building is used for, from what the map says (name, and the POI kind when the bake
// carried one). One classifier for every consumer — café terraces outside, interior archetypes
// inside, shop-window wares — so the whole country reads consistently. No town lists: just the
// words businesses everywhere use for themselves.
export type Use = 'cafe' | 'restaurant' | 'bar' | 'grocery' | 'shop' | 'office' | 'civic' | 'unknown';

const RULES: [Use, RegExp][] = [
  ['cafe', /\b(caf[eé]|coffee|espresso|bakery|bakeshop|donut|doughnut|bagel|ice cream|creamery|gelato|frozen yogurt|tea ?house|juice|smoothie|patisserie|pastry)\b/i],
  ['restaurant', /\b(restaurant|diner|grill|kitchen|pizza|pizzeria|trattoria|bistro|eatery|taqueria|sushi|burger|bbq|barbecue|steak|seafood|clam|crab|oyster|lobster|deli|sandwich|subs?|noodle|pho|ramen|thai|chinese|mexican|italian|indian|cantina|luncheonette|chowder|fish ?(house|market)?|shack)\b/i],
  ['bar', /\b(bar|pub|club|beach club|tavern|taproom|tap ?house|brewery|brewing|saloon|lounge|inn|wine|spirits|cocktail)\b/i],
  ['grocery', /\b(market|grocery|groceries|supermarket|food ?town|shop ?rite|acme|kroger|safeway|publix|wegmans|trader joe|whole foods|bodega|convenience|7-?eleven|wawa|quick ?chek|liquor)\b/i],
  ['office', /\b(bank|credit union|insurance|realty|real estate|realtors?|law|attorneys?|legal|accounting|cpa|dental|dentist|orthodont|medical|clinic|physicians?|chiropract|associates|agency|consult|architects?|engineering|financial|capital|partners|llc|group|services)\b/i],
  ['civic', /\b(library|post office|town hall|borough hall|city hall|municipal|police|fire (company|department|house)|school|academy|museum|court)\b/i],
];
const POI: Record<string, Use> = {
  cafe: 'cafe', ice_cream: 'cafe', bakery: 'cafe', restaurant: 'restaurant', fast_food: 'restaurant', deli: 'restaurant', food_court: 'restaurant',
  bar: 'bar', pub: 'bar', biergarten: 'bar', nightclub: 'bar', club: 'bar', beach_resort: 'bar', alcohol: 'grocery', supermarket: 'grocery', convenience: 'grocery', greengrocer: 'grocery',
  bank: 'office', office: 'office', insurance: 'office', estate_agent: 'office', dentist: 'office', doctors: 'office', clinic: 'office',
  library: 'civic', post_office: 'civic', townhall: 'civic', police: 'civic', fire_station: 'civic', school: 'civic', museum: 'civic', courthouse: 'civic',
};

export function useOf(name?: string, poiKind?: string): Use {
  if (poiKind && POI[poiKind]) return POI[poiKind];
  if (!name) return 'unknown';
  for (const [u, re] of RULES) if (re.test(name)) return u;
  return 'shop'; // a named ground-floor business we can't place is most often a shop
}
/** Places people sit outside of when the weather allows. */
export const terraceUse = (u: Use) => u === 'cafe' || u === 'restaurant' || u === 'bar';
