import type { NormalizedComp } from '@/lib/valuation/types';

type ListingQuery = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
};

/**
 * Demo comps for development and testing. Returns realistic-looking comparables
 * for common make/model so the evaluator produces a range without external APIs.
 * Replace or disable in production when real sources are wired.
 */
const DEMO_COMPS_BY_MAKE_MODEL: Record<string, NormalizedComp[]> = {
  'bmw 330ci': [
    { source: 'demo', source_url: '#', source_title: '2003 BMW 330Ci 5-speed', year: 2003, make: 'BMW', model: '330Ci', trim: 'Sport', mileage: 98000, asking_price: 7200, city: 'Austin', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2004 330Ci ZHP', year: 2004, make: 'BMW', model: '330Ci', trim: 'ZHP', mileage: 85000, asking_price: 10500, city: 'Dallas', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2002 330Ci manual', year: 2002, make: 'BMW', model: '330Ci', trim: null, mileage: 120000, asking_price: 5800, city: 'Houston', state: 'TX', condition: 'fair', mods: null },
    { source: 'demo', source_url: '#', source_title: '2005 330Ci ZHP low miles', year: 2005, make: 'BMW', model: '330Ci', trim: 'ZHP', mileage: 62000, asking_price: 12800, city: 'San Antonio', state: 'TX', condition: 'excellent', mods: null },
    { source: 'demo', source_url: '#', source_title: '2004 330Ci clean title', year: 2004, make: 'BMW', model: '330Ci', trim: null, mileage: 91000, asking_price: 7900, city: 'Austin', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2003 330Ci well maintained', year: 2003, make: 'BMW', model: '330Ci', trim: 'Sport', mileage: 110000, asking_price: 6500, city: 'Fort Worth', state: 'TX', condition: 'good', mods: null },
  ],
  'bmw z3': [
    { source: 'demo', source_url: '#', source_title: '1998 Z3 2.8 roadster', year: 1998, make: 'BMW', model: 'Z3', trim: '2.8', mileage: 88000, asking_price: 8500, city: 'Austin', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '1999 Z3 2.8', year: 1999, make: 'BMW', model: 'Z3', trim: '2.8 Roadster', mileage: 72000, asking_price: 9200, city: 'Dallas', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '1997 Z3 1.9', year: 1997, make: 'BMW', model: 'Z3', trim: '1.9', mileage: 95000, asking_price: 6800, city: 'Houston', state: 'TX', condition: 'fair', mods: null },
    { source: 'demo', source_url: '#', source_title: '2000 Z3 2.3', year: 2000, make: 'BMW', model: 'Z3', trim: '2.3', mileage: 81000, asking_price: 8800, city: 'Austin', state: 'TX', condition: 'good', mods: null },
  ],
  'bmw z4': [
    { source: 'demo', source_url: '#', source_title: '2004 Z4 3.0i 6MT', year: 2004, make: 'BMW', model: 'Z4 3.0', trim: '3.0i Roadster', mileage: 92000, asking_price: 11500, city: 'Austin', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2003 Z4 3.0i automatic', year: 2003, make: 'BMW', model: 'Z4 3.0', trim: '3.0i', mileage: 105000, asking_price: 9800, city: 'Dallas', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2005 Z4 3.0i sport package', year: 2005, make: 'BMW', model: 'Z4 3.0', trim: 'Sport', mileage: 78000, asking_price: 13800, city: 'Houston', state: 'TX', condition: 'excellent', mods: null },
    { source: 'demo', source_url: '#', source_title: '2004 Z4 2.5i roadster', year: 2004, make: 'BMW', model: 'Z4 2.5', trim: '2.5i', mileage: 112000, asking_price: 8900, city: 'San Antonio', state: 'TX', condition: 'good', mods: null },
  ],
  'toyota tacoma': [
    { source: 'demo', source_url: '#', source_title: '2012 Tacoma TRD Off-Road', year: 2012, make: 'Toyota', model: 'Tacoma', trim: 'TRD Off-Road', mileage: 115000, asking_price: 18500, city: 'Austin', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2011 Tacoma 4x4', year: 2011, make: 'Toyota', model: 'Tacoma', trim: 'TRD', mileage: 132000, asking_price: 16200, city: 'Dallas', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2013 Tacoma TRD', year: 2013, make: 'Toyota', model: 'Tacoma', trim: 'TRD Off-Road', mileage: 98000, asking_price: 21500, city: 'Houston', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2010 Tacoma access cab', year: 2010, make: 'Toyota', model: 'Tacoma', trim: null, mileage: 145000, asking_price: 14800, city: 'San Antonio', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2012 Tacoma double cab', year: 2012, make: 'Toyota', model: 'Tacoma', trim: 'TRD', mileage: 108000, asking_price: 19200, city: 'Austin', state: 'TX', condition: 'excellent', mods: null },
  ],
  'mazda miata': [
    { source: 'demo', source_url: '#', source_title: '1996 Miata NA', year: 1996, make: 'Mazda', model: 'Miata', trim: 'NA8', mileage: 125000, asking_price: 5200, city: 'Austin', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '1995 Miata M-Edition', year: 1995, make: 'Mazda', model: 'Miata', trim: 'M-Edition', mileage: 98000, asking_price: 6800, city: 'Dallas', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '1997 Miata', year: 1997, make: 'Mazda', model: 'Miata', trim: null, mileage: 118000, asking_price: 5500, city: 'Houston', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '1996 Miata low miles', year: 1996, make: 'Mazda', model: 'Miata', trim: 'NA8', mileage: 72000, asking_price: 7800, city: 'Austin', state: 'TX', condition: 'excellent', mods: null },
  ],
  'subaru wrx': [
    { source: 'demo', source_url: '#', source_title: '2015 WRX Premium', year: 2015, make: 'Subaru', model: 'WRX', trim: 'Premium', mileage: 82000, asking_price: 19500, city: 'Austin', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2014 WRX', year: 2014, make: 'Subaru', model: 'WRX', trim: null, mileage: 95000, asking_price: 17200, city: 'Dallas', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2016 WRX Limited', year: 2016, make: 'Subaru', model: 'WRX', trim: 'Limited', mileage: 68000, asking_price: 22800, city: 'Houston', state: 'TX', condition: 'excellent', mods: null },
    { source: 'demo', source_url: '#', source_title: '2015 WRX base', year: 2015, make: 'Subaru', model: 'WRX', trim: null, mileage: 88000, asking_price: 18200, city: 'Austin', state: 'TX', condition: 'good', mods: null },
  ],
  'toyota 4runner': [
    { source: 'demo', source_url: '#', source_title: '2010 4Runner Trail', year: 2010, make: 'Toyota', model: '4Runner', trim: 'Trail', mileage: 138000, asking_price: 18500, city: 'Austin', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2009 4Runner SR5', year: 2009, make: 'Toyota', model: '4Runner', trim: 'SR5', mileage: 152000, asking_price: 16200, city: 'Dallas', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2011 4Runner', year: 2011, make: 'Toyota', model: '4Runner', trim: 'Trail', mileage: 118000, asking_price: 21800, city: 'Houston', state: 'TX', condition: 'very_good', mods: null },
  ],
  'lexus gx470': [
    { source: 'demo', source_url: '#', source_title: '2006 GX470', year: 2006, make: 'Lexus', model: 'GX470', trim: null, mileage: 145000, asking_price: 14200, city: 'Austin', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2007 GX470', year: 2007, make: 'Lexus', model: 'GX470', trim: null, mileage: 128000, asking_price: 16800, city: 'Dallas', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2005 GX470', year: 2005, make: 'Lexus', model: 'GX470', trim: null, mileage: 162000, asking_price: 11800, city: 'Houston', state: 'TX', condition: 'good', mods: null },
  ],
  'lexus sc400': [
    { source: 'demo', source_url: '#', source_title: '1995 SC400', year: 1995, make: 'Lexus', model: 'SC400', trim: null, mileage: 132000, asking_price: 7200, city: 'Austin', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '1996 SC400', year: 1996, make: 'Lexus', model: 'SC400', trim: null, mileage: 118000, asking_price: 8500, city: 'Dallas', state: 'TX', condition: 'very_good', mods: null },
  ],
  'subaru brz': [
    { source: 'demo', source_url: '#', source_title: '2017 BRZ Limited', year: 2017, make: 'Subaru', model: 'BRZ', trim: 'Limited', mileage: 52000, asking_price: 19800, city: 'Austin', state: 'TX', condition: 'excellent', mods: null },
    { source: 'demo', source_url: '#', source_title: '2016 BRZ', year: 2016, make: 'Subaru', model: 'BRZ', trim: null, mileage: 68000, asking_price: 17200, city: 'Dallas', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2018 BRZ', year: 2018, make: 'Subaru', model: 'BRZ', trim: 'Limited', mileage: 42000, asking_price: 22800, city: 'Houston', state: 'TX', condition: 'excellent', mods: null },
  ],
  'ford mustang gt': [
    { source: 'demo', source_url: '#', source_title: '2014 Mustang GT', year: 2014, make: 'Ford', model: 'Mustang GT', trim: 'Track Pack', mileage: 72000, asking_price: 21500, city: 'Austin', state: 'TX', condition: 'very_good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2013 Mustang GT', year: 2013, make: 'Ford', model: 'Mustang GT', trim: null, mileage: 85000, asking_price: 18500, city: 'Dallas', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2015 Mustang GT', year: 2015, make: 'Ford', model: 'Mustang GT', trim: null, mileage: 62000, asking_price: 24800, city: 'Houston', state: 'TX', condition: 'excellent', mods: null },
  ],
  'honda civic': [
    { source: 'demo', source_url: '#', source_title: '2008 Civic Si', year: 2008, make: 'Honda', model: 'Civic Si', trim: 'FA5', mileage: 125000, asking_price: 9200, city: 'Austin', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2007 Civic Si', year: 2007, make: 'Honda', model: 'Civic Si', trim: null, mileage: 138000, asking_price: 7800, city: 'Dallas', state: 'TX', condition: 'fair', mods: null },
    { source: 'demo', source_url: '#', source_title: '2009 Civic Si', year: 2009, make: 'Honda', model: 'Civic Si', trim: 'FA5', mileage: 108000, asking_price: 10500, city: 'Houston', state: 'TX', condition: 'very_good', mods: null },
  ],
  'infiniti g35': [
    { source: 'demo', source_url: '#', source_title: '2005 G35 6MT', year: 2005, make: 'Infiniti', model: 'G35', trim: '6MT Coupe', mileage: 118000, asking_price: 8200, city: 'Austin', state: 'TX', condition: 'good', mods: null },
    { source: 'demo', source_url: '#', source_title: '2004 G35 coupe', year: 2004, make: 'Infiniti', model: 'G35', trim: null, mileage: 132000, asking_price: 6500, city: 'Dallas', state: 'TX', condition: 'fair', mods: null },
    { source: 'demo', source_url: '#', source_title: '2006 G35 6MT', year: 2006, make: 'Infiniti', model: 'G35', trim: '6MT Coupe', mileage: 95000, asking_price: 9800, city: 'Houston', state: 'TX', condition: 'very_good', mods: null },
  ],
};

function key(make: string, model: string): string {
  return `${make.toLowerCase().trim()} ${model.toLowerCase().trim()}`;
}

export async function fetchMockComps(listing: ListingQuery): Promise<NormalizedComp[]> {
  const k = key(listing.make, listing.model);
  const exact = DEMO_COMPS_BY_MAKE_MODEL[k];
  if (exact) return [...exact];

  const partialKey = listing.make.toLowerCase().trim();
  const modelLower = listing.model.toLowerCase().trim();
  for (const [dk, comps] of Object.entries(DEMO_COMPS_BY_MAKE_MODEL)) {
    if (dk.startsWith(partialKey)) {
      const modelMatch = comps.some((c) => c.model?.toLowerCase().includes(modelLower) || modelLower.includes(c.model?.toLowerCase() ?? ''));
      if (modelMatch) return [...comps];
    }
  }
  return [];
}
