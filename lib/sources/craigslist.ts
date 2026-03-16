import { NormalizedComp } from '@/lib/valuation/types';

type ListingQuery = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
};

export async function fetchCraigslistComps(_listing: ListingQuery): Promise<NormalizedComp[]> {
  // Placeholder: implement real scraping/integration later.
  // This adapter is intentionally isolated so that failures here do not affect other sources.
  return [];
}

