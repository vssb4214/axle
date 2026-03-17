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
  radius_miles?: number | null;
};

const MARKETCHECK_BASE_URL = process.env.MARKETCHECK_BASE_URL || 'https://api.marketcheck.com/v2';
const MARKETCHECK_API_KEY = process.env.MARKETCHECK_API_KEY || '';

type MarketCheckListing = {
  id?: string | null;
  vin?: string | null;
  // MarketCheck commonly returns "build" + "ref_*" fields on search endpoints.
  build?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
  } | null;
  ref_price?: number | null;
  ref_miles?: number | null;
  dealer?: {
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  seller_name?: string | null;
  dealer_name?: string | null;
  // Some endpoints may return top-level city/state.
  city?: string | null;
  state?: string | null;
  exterior_color?: string | null;
  transmission?: string | null;
  inventory_type?: string | null;
  vdp_url?: string | null;
  heading?: string | null;
};

function toComp(l: MarketCheckListing, source: string): NormalizedComp | null {
  const asking = typeof l.ref_price === 'number' ? l.ref_price : null;
  const year = typeof l.build?.year === 'number' ? l.build.year : null;
  if (!asking || !year) return null;

  const make = l.build?.make ?? null;
  const model = l.build?.model ?? null;
  if (!make || !model) return null;

  const titleParts = [year, make, model, l.build?.trim].filter(Boolean).join(' ');
  const modsHints = [
    l.exterior_color ? `color: ${l.exterior_color}` : null,
    l.transmission ? `trans: ${l.transmission}` : null,
    l.inventory_type ? `type: ${l.inventory_type}` : null
  ]
    .filter(Boolean)
    .join(' · ');

  const city = l.dealer?.city ?? l.city ?? null;
  const state = l.dealer?.state ?? l.state ?? null;

  return {
    source,
    source_url: l.vdp_url || (l.id ? `${MARKETCHECK_BASE_URL.replace(/\/$/, '')}/listing/${l.id}` : '#'),
    source_title: l.heading || titleParts,
    year,
    make,
    model,
    trim: l.build?.trim ?? null,
    mileage: typeof l.ref_miles === 'number' ? l.ref_miles : null,
    asking_price: asking,
    city,
    state,
    condition: null,
    mods: modsHints || null
  };
}

async function fetchMarketCheckEndpoint(
  endpointPath: string,
  listing: ListingQuery,
  sourceName: string
): Promise<NormalizedComp[]> {
  if (!MARKETCHECK_API_KEY) return [];

  const base = MARKETCHECK_BASE_URL.replace(/\/$/, '');
  const url = `${base}${endpointPath}`;

  // MarketCheck expects key as query param `api_key`
  const params: Record<string, string | number> = {
    api_key: MARKETCHECK_API_KEY,
    year: listing.year,
    make: listing.make,
    model: listing.model,
    rows: 50
  };
  if (listing.state) params.state = listing.state;
  if (listing.zip) params.zip = listing.zip;
  if (typeof listing.radius_miles === 'number' && Number.isFinite(listing.radius_miles)) {
    params.radius = listing.radius_miles;
  }

  const res = await axios.get(url, {
    params,
    timeout: 20000,
    validateStatus: () => true
  });

  if (res.status !== 200) {
    throw new Error(`${sourceName} returned ${res.status}`);
  }

  const raw = res.data;
  const arr: MarketCheckListing[] = Array.isArray(raw?.listings)
    ? raw.listings
    : Array.isArray(raw?.results)
      ? raw.results
      : Array.isArray(raw)
        ? raw
        : [];

  return arr.map((l) => toComp(l, sourceName)).filter(Boolean) as NormalizedComp[];
}

export async function fetchMarketCheckDealerComps(listing: ListingQuery): Promise<NormalizedComp[]> {
  return fetchMarketCheckEndpoint('/search/car/active', listing, 'marketcheck_dealer');
}

export async function fetchMarketCheckFsboComps(listing: ListingQuery): Promise<NormalizedComp[]> {
  return fetchMarketCheckEndpoint('/search/car/fsbo/active', listing, 'marketcheck_fsbo');
}

export async function fetchMarketCheckAuctionComps(listing: ListingQuery): Promise<NormalizedComp[]> {
  return fetchMarketCheckEndpoint('/search/car/auction/active', listing, 'marketcheck_auction');
}

