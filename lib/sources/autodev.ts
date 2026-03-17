import axios from 'axios';
import type { NormalizedComp } from '@/lib/valuation/types';

type ListingQuery = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
};

const AUTO_DEV_BASE_URL = process.env.AUTO_DEV_BASE_URL || 'https://api.auto.dev';
const AUTO_DEV_API_KEY = process.env.AUTO_DEV_API_KEY || '';

type AutoDevListing = {
  vin?: string | null;
  heading?: string | null;
  price?: number | null;
  miles?: number | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
  url?: string | null;
  exterior_color?: string | null;
  transmission?: string | null;
  condition?: string | null;
};

function toComp(l: AutoDevListing): NormalizedComp | null {
  const asking = typeof l.price === 'number' ? l.price : null;
  const year = typeof l.year === 'number' ? l.year : null;
  if (!asking || !year) return null;

  const make = l.make ?? null;
  const model = l.model ?? null;
  if (!make || !model) return null;

  const titleParts = [year, make, model, l.trim].filter(Boolean).join(' ');
  const modsHints = [l.exterior_color ? `color: ${l.exterior_color}` : null, l.transmission ? `trans: ${l.transmission}` : null]
    .filter(Boolean)
    .join(' · ');

  return {
    source: 'autodev',
    source_url: l.url || (l.vin ? `https://api.auto.dev/vin/${l.vin}` : '#'),
    source_title: l.heading || titleParts,
    year,
    make,
    model,
    trim: l.trim ?? null,
    mileage: typeof l.miles === 'number' ? l.miles : null,
    asking_price: asking,
    city: l.city ?? null,
    state: l.state ?? null,
    condition: l.condition ?? null,
    mods: modsHints || null
  };
}

/**
 * Auto.dev vehicle listings API.
 * Requires AUTO_DEV_API_KEY in env. If missing, returns [].
 */
export async function fetchAutoDevComps(listing: ListingQuery): Promise<NormalizedComp[]> {
  if (!AUTO_DEV_API_KEY) return [];

  const params: Record<string, string | number> = {
    // Per docs: use vehicle.* filters, not bare make/model.
    'vehicle.make': listing.make,
    'vehicle.model': listing.model,
    'vehicle.year': `${Math.max(1980, listing.year - 3)}-${listing.year + 3}`,
    limit: 50
  };

  const url = `${AUTO_DEV_BASE_URL.replace(/\/$/, '')}/listings`;
  const res = await axios.get(url, {
    params,
    headers: {
      Authorization: `Bearer ${AUTO_DEV_API_KEY}`
    },
    timeout: 20000,
    validateStatus: () => true
  });

  if (res.status !== 200) {
    throw new Error(`autodev returned ${res.status}`);
  }

  const raw = res.data;
  const arr: AutoDevListing[] = Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw)
      ? raw
      : [];

  const comps = arr.map(toComp).filter(Boolean) as NormalizedComp[];
  return comps;
}

