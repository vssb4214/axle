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
  trim?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  radius_miles?: number | null;
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
  marketcheck_fsbo: true,
  marketcheck_dealer: true,
  marketcheck_auction: true,
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

  const comps = results.flatMap((r) => r.data);
  const errors = results
    .filter((r) => r.error)
    .map((r) => ({ source: r.source, message: r.error ?? 'Unknown error' }));

  return { comps, errors };
}

