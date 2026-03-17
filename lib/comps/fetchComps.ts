import { NormalizedComp } from '@/lib/valuation/types';
import { fetchMockComps } from '@/lib/sources/mock';
import { fetchCraigslistComps } from '@/lib/sources/craigslist';
import { fetchForumComps } from '@/lib/sources/forums';
import { fetchBatComps } from '@/lib/sources/bat';
import { fetchCarsAndBidsComps } from '@/lib/sources/carsandbids';
import { fetchFacebookComps } from '@/lib/sources/facebook';
import { fetchAutoDevComps } from '@/lib/sources/autodev';
import {
  fetchMarketCheckAuctionComps,
  fetchMarketCheckDealerComps,
  fetchMarketCheckFsboComps
} from '@/lib/sources/marketcheck';

type ListingQuery = {
  year: number;
  make: string;
  model: string;
  mileage?: number | null;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
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
  const MIN_REAL_COMPS = 4;

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

  const results = await Promise.all(
    sources.map(async (src) => {
      try {
        const data = await withTimeout(src.fn(listing), 6000, src.name);
        return { source: src.name, data, error: null as null | string };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return { source: src.name, data: [] as NormalizedComp[], error: msg };
      }
    })
  );

  let allComps = results.flatMap((r) => r.data);
  const errors = results
    .filter((r) => r.error)
    .map((r) => ({ source: r.source, message: r.error ?? 'Unknown error' }));

  // De-dupe identical listings (Auto.dev can occasionally repeat results).
  const seen = new Set<string>();
  allComps = allComps.filter((c) => {
    const key = `${c.source}|${c.source_url}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // If we got too few real comps under a tight location filter, broaden MarketCheck by
  // dropping zip and retrying (and similarly for Auto.dev). We'll later keep the closest matches by mileage/year.
  const realCount = allComps.filter((c) => c.source !== 'demo').length;
  if (realCount < MIN_REAL_COMPS && (listing.zip || listing.city || listing.state)) {
    const broadened: ListingQuery = { ...listing, zip: null, city: null, state: null };
    const broadenedFns = [
      { name: 'autodev', fn: fetchAutoDevComps },
      { name: 'marketcheck_fsbo', fn: fetchMarketCheckFsboComps },
      { name: 'marketcheck_dealer', fn: fetchMarketCheckDealerComps },
      { name: 'marketcheck_auction', fn: fetchMarketCheckAuctionComps }
    ].filter((s) => ENABLED_SOURCES[s.name as keyof typeof ENABLED_SOURCES]);

    const more = await Promise.all(
      broadenedFns.map(async (src) => {
        try {
          const data = await withTimeout(src.fn(broadened), 6000, `${src.name}_broad`);
          return { source: src.name, data, error: null as null | string };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          return { source: src.name, data: [] as NormalizedComp[], error: msg };
        }
      })
    );

    for (const r of more) {
      if (r.error) errors.push({ source: r.source, message: r.error });
      allComps = allComps.concat(r.data);
    }
  }

  // Prefer real comps over demo comps whenever possible.
  const nonDemoComps = allComps.filter((c) => c.source !== 'demo');
  let comps = nonDemoComps.length > 0 ? nonDemoComps : allComps;

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

