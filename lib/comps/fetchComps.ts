import { NormalizedComp } from '@/lib/valuation/types';
import { fetchCraigslistComps } from '@/lib/sources/craigslist';
import { fetchForumComps } from '@/lib/sources/forums';
import { fetchBatComps } from '@/lib/sources/bat';
import { fetchCarsAndBidsComps } from '@/lib/sources/carsandbids';
import { fetchFacebookComps } from '@/lib/sources/facebook';

type ListingQuery = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
};

export async function collectComparableListings(listing: ListingQuery): Promise<{
  comps: NormalizedComp[];
  errors: { source: string; message: string }[];
}> {
  const sources: {
    name: string;
    fn: (listing: ListingQuery) => Promise<NormalizedComp[]>;
    experimental?: boolean;
  }[] = [
    { name: 'craigslist', fn: fetchCraigslistComps },
    { name: 'forums', fn: fetchForumComps },
    { name: 'bat', fn: fetchBatComps },
    { name: 'carsandbids', fn: fetchCarsAndBidsComps },
    { name: 'facebook', fn: fetchFacebookComps, experimental: true }
  ];

  const results = await Promise.all(
    sources.map(async (src) => {
      try {
        const data = await src.fn(listing);
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

