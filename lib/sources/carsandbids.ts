import { NormalizedComp } from '@/lib/valuation/types';

type ListingQuery = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  city?: string | null;
  state?: string | null;
};

export async function fetchCarsAndBidsComps(_listing: ListingQuery): Promise<NormalizedComp[]> {
  return [];
}

