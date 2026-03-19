import { describe, it, expect } from 'vitest';
import { filterComparableComps, type ListingInput } from './engine';
import type { NormalizedComp } from './types';

function buildComp(partial: Partial<NormalizedComp>): NormalizedComp {
  return {
    source: 'test',
    source_url: 'https://example.com/comp',
    source_title: partial.source_title ?? 'Test Listing',
    year: partial.year ?? 2020,
    make: partial.make ?? 'Honda',
    model: partial.model ?? 'Civic',
    trim: partial.trim ?? 'EX',
    mileage: partial.mileage ?? 50_000,
    asking_price: partial.asking_price ?? 10_000,
    city: partial.city ?? 'Los Angeles',
    state: partial.state ?? 'CA',
    condition: partial.condition ?? 'good',
    mods: partial.mods ?? null,
    posted_at: partial.posted_at ?? null,
    vehicleKey: partial.vehicleKey ?? null
  };
}

describe('filterComparableComps', () => {
  it('prioritizes matching vehicleKey and enforces trim compatibility on mismatches', () => {
    const listing: ListingInput = {
      year: 2019,
      make: 'Honda',
      model: 'Civic',
      trim: 'Si',
      mileage: 42_000,
      vehicleKey: 'honda_civic_si_coupe'
    };

    const comps: NormalizedComp[] = [
      buildComp({
        trim: 'Touring',
        vehicleKey: 'mismatched_key',
        asking_price: 19_000
      }),
      buildComp({
        trim: 'Si',
        vehicleKey: 'other_key',
        asking_price: 18_500
      }),
      buildComp({
        trim: 'Si',
        vehicleKey: 'honda_civic_si_coupe',
        asking_price: 18_250
      })
    ];

    const filtered = filterComparableComps(listing, comps);
    expect(filtered).toHaveLength(2);
    expect(filtered[0]?.vehicleKey).toBe('honda_civic_si_coupe');
    expect(filtered.some((comp) => comp.trim === 'Touring')).toBe(false);
  });

  it('applies segment-aware year and mileage windows', () => {
    const sportsListing: ListingInput = {
      year: 2003,
      make: 'Mazda',
      model: 'Miata',
      trim: 'LS',
      mileage: 70_000
    };

    const sportsComps: NormalizedComp[] = [
      buildComp({
        make: 'Mazda',
        model: 'Miata',
        trim: 'LS',
        year: 2006,
        mileage: 68_000,
        asking_price: 12_000
      }),
      buildComp({
        make: 'Mazda',
        model: 'Miata',
        trim: 'LS',
        year: 2003,
        mileage: 210_000,
        asking_price: 8_500
      }),
      buildComp({
        make: 'Mazda',
        model: 'Miata',
        trim: 'LS',
        year: 2002,
        mileage: 90_000,
        asking_price: 11_000
      })
    ];

    const sportsFiltered = filterComparableComps(sportsListing, sportsComps);
    expect(sportsFiltered).toHaveLength(1);
    expect(sportsFiltered[0]?.year).toBe(2002);

    const truckListing: ListingInput = {
      year: 2018,
      make: 'Toyota',
      model: 'Tacoma',
      trim: 'TRD Off Road',
      mileage: 45_000
    };

    const truckComps: NormalizedComp[] = [
      buildComp({
        make: 'Toyota',
        model: 'Tacoma',
        trim: 'TRD Off Road',
        year: 2014,
        mileage: 60_000,
        asking_price: 28_000
      }),
      buildComp({
        make: 'Toyota',
        model: 'Tacoma',
        trim: 'TRD Off Road',
        year: 2018,
        mileage: 180_000,
        asking_price: 24_000
      }),
      buildComp({
        make: 'Toyota',
        model: 'Tacoma',
        trim: 'TRD Off Road',
        year: 2010,
        mileage: 40_000,
        asking_price: 23_000
      })
    ];

    const truckFiltered = filterComparableComps(truckListing, truckComps);
    expect(truckFiltered).toHaveLength(2);
    expect(truckFiltered.some((comp) => comp.year === 2010)).toBe(false);
  });
});
