import { describe, it, expect } from 'vitest';
import { useOf, terraceUse } from '../src/world/uses';

describe('business use classifier', () => {
  it('reads the map tags first, the same in every language', () => {
    expect(useOf('Gracie and the Dudes', 'ice_cream')).toBe('cafe');
    expect(useOf('Chez Marcel', 'restaurant')).toBe('restaurant');
    expect(useOf('Kiosko Doña Rosa', 'convenience')).toBe('grocery');
    expect(useOf('Some Name', 'bank')).toBe('office');
    expect(useOf(undefined, 'clothes')).toBe('shop');
    expect(useOf(undefined, 'library')).toBe('civic');
    // a tag beats a misleading name
    expect(useOf('The Coffee Bank', 'bank')).toBe('office');
  });
  it('falls back to multilingual name hints', () => {
    expect(useOf('Blue Moon Diner')).toBe('restaurant');
    expect(useOf('Panadería La Esperanza')).toBe('cafe');
    expect(useOf('Taquería El Güero')).toBe('restaurant');
    expect(useOf('Boulangerie du Coin')).toBe('cafe');
    expect(useOf('Trattoria da Luigi')).toBe('restaurant');
    expect(useOf('Bäckerei Schmidt')).toBe('cafe');
    expect(useOf('Supermercado Central')).toBe('grocery');
    expect(useOf('Biblioteca Municipal')).toBe('civic');
    expect(useOf('The Anchor Tavern')).toBe('bar');
    expect(useOf('Ocean Realty')).toBe('office');
    expect(useOf('Surf Outpost')).toBe('shop');
    expect(useOf()).toBe('unknown');
  });
  it('terraces belong to cafés, restaurants and bars', () => {
    expect(terraceUse(useOf('x', 'cafe'))).toBe(true);
    expect(terraceUse(useOf('x', 'pub'))).toBe(true);
    expect(terraceUse(useOf('x', 'supermarket'))).toBe(false);
  });
});
