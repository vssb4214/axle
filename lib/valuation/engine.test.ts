import { describe, it, expect } from 'vitest';
import { filterComparableComps, computeDeterministicValuation, type ListingInput } from './engine';
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

  it('drops mismatched vehicle keys when there are ample exact matches', () => {
    const listing: ListingInput = {
      year: 2019,
      make: 'Honda',
      model: 'Civic',
      trim: 'Si',
      mileage: 40_000,
      vehicleKey: 'honda_civic_si_coupe'
    };

    const comps: NormalizedComp[] = [
      buildComp({ trim: 'Si', year: 2018, vehicleKey: 'honda_civic_si_coupe', asking_price: 18_300 }),
      buildComp({ trim: 'Si HPT', year: 2019, vehicleKey: 'honda_civic_si_coupe', asking_price: 18_900 }),
      buildComp({ trim: 'Si', year: 2020, vehicleKey: 'honda_civic_si_coupe', asking_price: 19_200 }),
      buildComp({ trim: 'Si', year: 2018, vehicleKey: 'another_key', asking_price: 18_400 })
    ];

    const filtered = filterComparableComps(listing, comps);
    expect(filtered).toHaveLength(3);
    expect(filtered.every((comp) => comp.vehicleKey === 'honda_civic_si_coupe')).toBe(true);
  });

  it('treats trims with only generic overlaps as incompatible when no vehicle key match', () => {
    const listing: ListingInput = {
      year: 2018,
      make: 'Toyota',
      model: 'Tacoma',
      trim: 'TRD Off Road',
      mileage: 48_000
    };

    const comps: NormalizedComp[] = [
      buildComp({
        make: 'Toyota',
        model: 'Tacoma',
        trim: 'TRD Off Road',
        year: 2017,
        mileage: 50_000,
        asking_price: 31_000
      }),
      buildComp({
        make: 'Toyota',
        model: 'Tacoma',
        trim: 'TRD Sport',
        year: 2017,
        mileage: 46_000,
        asking_price: 30_500
      })
    ];

    const filtered = filterComparableComps(listing, comps);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.trim).toBe('TRD Off Road');
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

describe('computeDeterministicValuation', () => {
  it('applies a confidence penalty when comps are sparse or vehicleKey is missing', () => {
    const listing: ListingInput = {
      year: 2018,
      make: 'Honda',
      model: 'Civic',
      trim: 'Si',
      mileage: 41_000,
      condition: 'good'
    };

    const comps: NormalizedComp[] = [
      buildComp({ year: 2017, mileage: 40_000, asking_price: 19_500, trim: 'Si' }),
      buildComp({ year: 2018, mileage: 45_000, asking_price: 19_200, trim: 'Si' }),
      buildComp({ year: 2019, mileage: 38_500, asking_price: 20_200, trim: 'Si' })
    ];

    const valuation = computeDeterministicValuation(listing, comps);
    expect(valuation).not.toBeNull();
    expect(valuation?.comp_count).toBe(3);
    expect(valuation?.confidence).toBeCloseTo(0.31, 2);
  });
});
