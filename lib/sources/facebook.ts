import { NormalizedComp } from '@/lib/valuation/types';

type ListingQuery = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
};

// Experimental and fragile: this adapter should be treated as optional.
export async function fetchFacebookComps(_listing: ListingQuery): Promise<NormalizedComp[]> {
  return [];
}

