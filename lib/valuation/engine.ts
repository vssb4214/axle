import { NormalizedComp, ValuationResult } from './types';

type ListingInput = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  mileage: number;
  city?: string | null;
  state?: string | null;
  condition?: string | null;
};

export function filterComparableComps(listing: ListingInput, comps: NormalizedComp[]): NormalizedComp[] {
  return comps.filter((c) => {
    if (!c.asking_price || !c.year) return false;
    if (c.make?.toLowerCase() !== listing.make.toLowerCase()) return false;
    if (c.model?.toLowerCase() !== listing.model.toLowerCase()) return false;
    if (Math.abs(c.year - listing.year) > 3) return false;
    if (c.mileage && Math.abs(c.mileage - listing.mileage) > 120_000) return false;
    return true;
  });
}

export function computeDeterministicValuation(
  listing: ListingInput,
  comps: NormalizedComp[]
): ValuationResult | null {
  const filtered = filterComparableComps(listing, comps);
  if (!filtered.length) return null;

  const weightedPrices: number[] = [];
  const keyFactors: string[] = [];

  for (const comp of filtered) {
    if (!comp.asking_price || !comp.year) continue;

    let weight = 1;

    if (comp.mileage && listing.mileage) {
      const diff = Math.abs(comp.mileage - listing.mileage);
      if (diff < 20000) weight *= 1.3;
      else if (diff < 60000) weight *= 1.1;
      else weight *= 0.8;
    }

    if (listing.trim && comp.trim) {
      const sameTrim = comp.trim.toLowerCase().includes(listing.trim.toLowerCase());
      weight *= sameTrim ? 1.15 : 0.95;
    }

    if (listing.city && listing.state && comp.city && comp.state) {
      const sameRegion = listing.state === comp.state;
      weight *= sameRegion ? 1.1 : 0.95;
    }

    const condition = listing.condition ?? 'unknown';
    if (condition === 'excellent') weight *= 1.05;
    else if (condition === 'fair') weight *= 0.95;

    weightedPrices.push(comp.asking_price * weight);
  }

  if (!weightedPrices.length) return null;

  const sorted = [...weightedPrices].sort((a, b) => a - b);
  const n = sorted.length;
  const low = Math.round(sorted[Math.floor(n * 0.2)] ?? sorted[0]);
  const high = Math.round(sorted[Math.floor(n * 0.8)] ?? sorted[n - 1]);
  const mid = Math.round(sorted.reduce((sum, p) => sum + p, 0) / n);

  const spread = high - low;
  const relativeSpread = spread / Math.max(mid, 1);
  const compCount = n;

  let confidence = 0.4;
  if (compCount >= 12 && relativeSpread < 0.3) confidence = 0.9;
  else if (compCount >= 8 && relativeSpread < 0.4) confidence = 0.75;
  else if (compCount >= 5) confidence = 0.6;

  keyFactors.push(`Used ${compCount} comparable listings after filtering by make/model/year.`);
  keyFactors.push('Adjusted for mileage, trim similarity, condition, and region with deterministic weights.');
  keyFactors.push(`Spread between low and high is ${(relativeSpread * 100).toFixed(1)}% of mid price.`);

  return {
    value_low: low,
    value_mid: mid,
    value_high: high,
    confidence,
    comp_count: compCount,
    key_factors: keyFactors
  };
}

