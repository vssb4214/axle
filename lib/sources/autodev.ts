import axios from 'axios';
import type { NormalizedComp } from '@/lib/valuation/types';

type ListingQuery = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

const AUTO_DEV_BASE_URL = process.env.AUTO_DEV_BASE_URL || 'https://api.auto.dev';
const AUTO_DEV_API_KEY = process.env.AUTO_DEV_API_KEY || '';

type AutoDevListing = {
  '@id'?: string | null;
  vin?: string | null;
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    exteriorColor?: string | null;
    transmission?: string | null;
    series?: string | null;
  } | null;
  retailListing?: {
    price?: number | null;
    miles?: number | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    dealer?: string | null;
    vdp?: string | null;
    used?: boolean | null;
  } | null;
};

function normalizeTrim(trim: string | number | null | undefined): string | null {
  if (trim == null) return null;
  const t = String(trim);
  if (!t.trim()) return null;
  // Auto.dev often appends seating/capacity descriptors to trims (e.g. "XLE 7-Passenger").
  // These are not meaningful trim distinctions for valuation.
  return t
    // Handle hyphen and en-dash variants: "7-Passenger" / "7–Passenger"
    .replace(/\b(\d+)\s*[-–]\s*(passenger|seater)\b/gi, '')
    .replace(/\b(\d+)[-\s]?(passenger|seater)\b/gi, '')
    // Remove generic body descriptors that sometimes show up as "trim"
    .replace(/\bpassenger\s+van\b/gi, '')
    .replace(/\bpassenger\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function toComp(l: AutoDevListing): NormalizedComp | null {
  const asking = typeof l.retailListing?.price === 'number' ? l.retailListing.price : null;
  const year = typeof l.vehicle?.year === 'number' ? l.vehicle.year : null;
  if (!asking || !year) return null;

  const make = l.vehicle?.make ?? null;
  const model = l.vehicle?.model ?? null;
  if (!make || !model) return null;

  const cleanTrim = normalizeTrim(l.vehicle?.trim ?? null);
  const titleParts = [year, make, model, cleanTrim].filter(Boolean).join(' ');
  const modsHints = [
    l.vehicle?.exteriorColor ? `color: ${l.vehicle.exteriorColor}` : null,
    l.vehicle?.transmission ? `trans: ${l.vehicle.transmission}` : null,
    l.vehicle?.series ? `series: ${l.vehicle.series}` : null
  ]
    .filter(Boolean)
    .join(' · ');

  const isSC = make.toLowerCase() === 'lexus' && (l.vehicle?.model ?? '').toLowerCase() === 'sc';
  const listingTitle = titleParts.toLowerCase();
  // Auto.dev normalizes Lexus SC300/SC400 as model "SC" with trim "300"/"400" sometimes.
  // Promote those into the model field to keep matching stable.
  const normalizedModel =
    isSC && /\bsc\b/.test(listingTitle) && /\b400\b/.test(listingTitle)
      ? 'SC400'
      : isSC && /\bsc\b/.test(listingTitle) && /\b300\b/.test(listingTitle)
        ? 'SC300'
        : model;

  return {
    source: 'autodev',
    source_url: l['@id'] || (l.vin ? `https://api.auto.dev/listings/${l.vin}` : '#'),
    source_title: titleParts,
    year,
    make,
    model: normalizedModel,
    trim: cleanTrim,
    mileage: typeof l.retailListing?.miles === 'number' ? l.retailListing.miles : null,
    asking_price: asking,
    city: l.retailListing?.city ?? null,
    state: l.retailListing?.state ?? null,
    condition: null,
    mods: modsHints || null
  };
}

/**
 * Auto.dev vehicle listings API.
 * Requires AUTO_DEV_API_KEY in env. If missing, returns [].
 */
export async function fetchAutoDevComps(listing: ListingQuery): Promise<NormalizedComp[]> {
  if (!AUTO_DEV_API_KEY) {
    throw new Error('AUTO_DEV_API_KEY missing');
  }

  const make = (listing.make ?? '').trim();
  const modelRaw = (listing.model ?? '').trim();
  // Auto.dev expects some models as a "family" token. Example: Lexus SC400 is returned under model "SC".
  const model =
    make.toLowerCase() === 'lexus' && /^sc\s*400$/i.test(modelRaw)
      ? 'SC'
      : modelRaw;

  const params: Record<string, string | number> = {
    // Per docs: use vehicle.* filters, not bare make/model.
    'vehicle.make': make,
    'vehicle.model': model,
    'vehicle.year': `${Math.max(1980, listing.year - 3)}-${listing.year + 3}`,
    limit: 50
  };
  // Prefer some locality if zip is present (if the API supports it, it will help; otherwise ignored).
  if (listing.zip) params.zip = listing.zip;

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

