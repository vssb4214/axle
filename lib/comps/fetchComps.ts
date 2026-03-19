import { NormalizedComp } from '@/lib/valuation/types';
import { fetchMockComps } from '@/lib/sources/mock';
import { fetchCraigslistComps } from '@/lib/sources/craigslist';
import { fetchForumComps } from '@/lib/sources/forums';
import { fetchBatComps } from '@/lib/sources/bat';
import { fetchCarsAndBidsComps } from '@/lib/sources/carsandbids';
import { fetchFacebookComps } from '@/lib/sources/facebook';
import { fetchAutoDevComps } from '@/lib/sources/autodev';
import zipcodes from 'zipcodes';
import {
  fetchMarketCheckAuctionComps,
  fetchMarketCheckDealerComps,
  fetchMarketCheckFsboComps
} from '@/lib/sources/marketcheck';

type ListingQuery = {
  year: number;
  make: string;
  model: string;
  year_window?: number | null;
  mileage?: number | null;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  radius_miles?: number | null;
  /** VIN-derived normalized key for variant-level comp filtering. */
  vehicleKey?: string | null;
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function inferStateFromQuery(listing: ListingQuery): string | null {
  const explicit = (listing.state ?? '').trim().toUpperCase();
  if (explicit) return explicit;
  const zip = (listing.zip ?? '').trim();
  if (!zip) return null;
  const z = zipcodes.lookup(zip);
  const state = typeof z?.state === 'string' ? z.state.trim().toUpperCase() : '';
  return state || null;
}

const ENABLED_SOURCES = {
  demo: true,
  autodev: true,
  // MarketCheck free plans can rate-limit aggressively; prefer a single endpoint by default.
  marketcheck_fsbo: false,
  marketcheck_dealer: true,
  marketcheck_auction: false,
  craigslist: false,
  forums: false,
  bat: false,
  carsandbids: false,
  facebook: false
} as const;

export async function collectComparableListings(listing: ListingQuery): Promise<{
  comps: NormalizedComp[];
  errors: { source: string; message: string }[];
}> {
  const TARGET_REAL_COMPS = 6;

  const sources: {
    name: string;
    fn: (listing: ListingQuery) => Promise<NormalizedComp[]>;
    experimental?: boolean;
  }[] = [
    { name: 'demo', fn: fetchMockComps },
    { name: 'autodev', fn: fetchAutoDevComps },
    { name: 'marketcheck_fsbo', fn: fetchMarketCheckFsboComps },
    { name: 'marketcheck_dealer', fn: fetchMarketCheckDealerComps },
    { name: 'marketcheck_auction', fn: fetchMarketCheckAuctionComps },
    { name: 'craigslist', fn: fetchCraigslistComps },
    { name: 'forums', fn: fetchForumComps },
    { name: 'bat', fn: fetchBatComps },
    { name: 'carsandbids', fn: fetchCarsAndBidsComps },
    { name: 'facebook', fn: fetchFacebookComps, experimental: true }
  ].filter((src) => ENABLED_SOURCES[src.name as keyof typeof ENABLED_SOURCES]);

  async function runSources(
    runListing: ListingQuery,
    stageName: string
  ): Promise<{
    comps: NormalizedComp[];
    errors: { source: string; message: string }[];
  }> {
    const results = await Promise.all(
      sources.map(async (src) => {
        try {
          const data = await withTimeout(src.fn(runListing), 6000, `${src.name}_${stageName}`);
          return { source: src.name, data, error: null as null | string };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          return { source: src.name, data: [] as NormalizedComp[], error: msg };
        }
      })
    );
    return {
      comps: results.flatMap((r) => r.data),
      errors: results
        .filter((r) => r.error)
        .map((r) => ({ source: r.source, message: r.error ?? 'Unknown error' }))
    };
  }

  let allComps: NormalizedComp[] = [];
  const errors: { source: string; message: string }[] = [];

  // Stage strategy:
  // 1) If zip is present, keep widening radius until we hit a healthy floor.
  // 2) If still low, drop location filters and run national.
  // This keeps results available while preserving locality whenever possible.
  const stageQueries: { name: string; listing: ListingQuery }[] = [];
  if (listing.zip) {
    stageQueries.push({ name: 'zip_50_y3', listing: { ...listing, radius_miles: 50, year_window: 3 } });
    stageQueries.push({ name: 'zip_100_y5', listing: { ...listing, radius_miles: 100, year_window: 5 } });
    stageQueries.push({ name: 'zip_100_y8', listing: { ...listing, radius_miles: 100, year_window: 8 } });
  } else {
    stageQueries.push({
      name: 'local_y5',
      listing: { ...listing, year_window: 5 }
    });
  }
  stageQueries.push({
    name: 'national_y8',
    listing: { ...listing, zip: null, city: null, state: null, radius_miles: null, year_window: 8 }
  });
  stageQueries.push({
    name: 'national_y12',
    listing: { ...listing, zip: null, city: null, state: null, radius_miles: null, year_window: 12 }
  });
  stageQueries.push({
    name: 'national_any_year',
    listing: { ...listing, zip: null, city: null, state: null, radius_miles: null, year_window: null }
  });

  for (const stage of stageQueries) {
    const res = await runSources(stage.listing, stage.name);
    allComps = allComps.concat(res.comps);
    errors.push(...res.errors);

    // De-dupe identical listings (Auto.dev can occasionally repeat results).
    const seen = new Set<string>();
    allComps = allComps.filter((c) => {
      const key = `${c.source}|${c.source_url}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const realCount = allComps.filter((c) => c.source !== 'demo').length;
    if (realCount >= TARGET_REAL_COMPS) break;
  }

  // Final dedupe safety pass.
  const seen = new Set<string>();
  allComps = allComps.filter((c) => {
    const key = `${c.source}|${c.source_url}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Prefer real comps over demo comps whenever possible.
  const nonDemoComps = allComps.filter((c) => c.source !== 'demo');
  let comps = nonDemoComps.length > 0 ? nonDemoComps : allComps;

  const preferredState = inferStateFromQuery(listing);
  if (preferredState) {
    const sameState = comps.filter((c) => (c.state ?? '').trim().toUpperCase() === preferredState);
    const outState = comps.filter((c) => (c.state ?? '').trim().toUpperCase() !== preferredState);
    // If we have enough in-state comps, keep those only.
    if (sameState.length >= TARGET_REAL_COMPS) {
      comps = sameState;
    } else {
      // Otherwise prefer in-state first and only backfill with out-of-state.
      comps = [...sameState, ...outState];
    }
  }

  // When comps are abundant, keep the closest matches first (year and mileage proximity).
  if (comps.length > 10) {
    const targetYear = listing.year;
    const targetMiles = typeof listing.mileage === 'number' ? listing.mileage : null;
    comps = [...comps].sort((a, b) => {
      const ay = a.year == null ? 999 : Math.abs(a.year - targetYear);
      const by = b.year == null ? 999 : Math.abs(b.year - targetYear);
      const am = targetMiles != null && a.mileage != null ? Math.abs(a.mileage - targetMiles) : 999999;
      const bm = targetMiles != null && b.mileage != null ? Math.abs(b.mileage - targetMiles) : 999999;
      return ay - by || am - bm;
    });
  }

  return { comps, errors };
}

