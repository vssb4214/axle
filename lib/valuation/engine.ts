import { NormalizedComp, ValuationResult } from './types';
import {
  getCarSegment,
  getMileageDollarsPerMile,
  getAgeDepreciationPerYear,
  type CarSegment
} from './segments';

export type ListingInput = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  mileage: number;
  city?: string | null;
  state?: string | null;
  condition?: string | null;
  transmission?: string | null;
  color?: string | null;
  mods?: string | null;
  wear?: string | null;
};

type IssueCode =
  | 'tires'
  | 'brakes'
  | 'clutch'
  | 'heavy_paint'
  | 'minor_paint'
  | 'convertible_top'
  | 'door_card'
  | 'window_regulator'
  | 'interior_refresh'
  | 'major_mech'
  | 'rust_severe'
  | 'title_structural';

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function modelMatches(listingModel: string, compModel: string, listingTrim?: string | null, compTrim?: string | null): boolean {
  const lm = norm(listingModel);
  const cm = norm(compModel);
  if (!lm || !cm) return false;
  if (lm === cm) return true;

  // Allow partial matches (e.g. "z4" vs "z4 3 0i", "civic si" vs "civic").
  if (cm.includes(lm) || lm.includes(cm)) return true;

  // If model is close, use trim as a tie-breaker.
  const lt = norm(listingTrim ?? '');
  const ct = norm(compTrim ?? '');
  if (lt && ct && (ct.includes(lt) || lt.includes(ct))) {
    // Require at least one shared token between model strings.
    const lmTokens = new Set(lm.split(' ').filter(Boolean));
    const cmTokens = new Set(cm.split(' ').filter(Boolean));
    for (const t of lmTokens) {
      if (cmTokens.has(t)) return true;
    }
  }

  return false;
}

export function filterComparableComps(listing: ListingInput, comps: NormalizedComp[]): NormalizedComp[] {
  return comps.filter((c) => {
    if (!c.asking_price || !c.year) return false;
    if (!c.make || norm(c.make) !== norm(listing.make)) return false;
    if (!c.model || !modelMatches(listing.model, c.model, listing.trim, c.trim)) return false;
    if (Math.abs(c.year - listing.year) > 3) return false;
    if (c.mileage && Math.abs(c.mileage - listing.mileage) > 120_000) return false;
    return true;
  });
}

/**
 * Mileage adjustment using segment-specific $/mi. Sports/luxury depreciate more per mile; trucks less.
 */
function mileageAdjustment(
  compMileage: number,
  listingMileage: number,
  compPrice: number,
  segment: CarSegment
): number {
  const diff = listingMileage - compMileage;
  if (diff <= 0) return compPrice;
  const dollarsPerMile = getMileageDollarsPerMile(segment);
  // Allow steeper mileage discounts for enthusiast cars where miles matter a lot.
  const baseCap = compPrice * 0.35;
  const cap =
    segment === 'sports' || segment === 'luxury_sports'
      ? compPrice * 0.5
      : baseCap;
  const deduction = Math.min(diff * dollarsPerMile, cap);
  // For very high-mile enthusiast cars, allow a larger relative drop.
  const floor =
    segment === 'sports' || segment === 'luxury_sports'
      ? compPrice * 0.35
      : compPrice * 0.45;
  return Math.max(compPrice - deduction, floor);
}

/**
 * Age adjustment: listing older than comp gets a discount; newer gets a small bump.
 */
function ageAdjustment(compYear: number, listingYear: number, compPrice: number, segment: CarSegment): number {
  const yearDiff = listingYear - compYear;
  if (yearDiff === 0) return compPrice;
  const depPerYear = getAgeDepreciationPerYear(segment);
  if (yearDiff > 0) {
    const factor = Math.pow(1 - depPerYear, yearDiff);
    return compPrice * factor;
  }
  const bump = Math.min(-yearDiff * depPerYear * 0.5, 0.12);
  return compPrice * (1 + bump);
}

/** Condition multiplier (listing vs comp-implied). */
function conditionMultiplier(condition: string): number {
  switch (condition) {
    case 'excellent': return 1.08;
    case 'very_good': return 1.03;
    case 'good': return 1.0;
    case 'fair': return 0.90;
    case 'poor': return 0.78;
    default: return 1.0;
  }
}

/** Trim match: same trim boosts, different trim slight discount. */
function trimWeight(listingTrim: string | null, compTrim: string | null): number {
  if (!listingTrim || !compTrim) return 1.0;
  const lt = listingTrim.toLowerCase();
  const ct = compTrim.toLowerCase();
  if (ct.includes(lt) || lt.includes(ct)) return 1.10;
  return 0.96;
}

/** Optional mods: desirable keywords slight bump; "none" or empty neutral. */
function modsWeight(listingMods: string | null): number {
  if (!listingMods || !listingMods.trim()) return 1.0;
  const m = listingMods.toLowerCase();
  if (/none|stock|unmodified|original/i.test(m)) return 1.0;
  // Performance/enthusiast upgrades.
  if (/turbo|supercharger|coilover|ls swap|v8|built engine|big brake|coilovers?/i.test(m)) return 1.06;
  // Preventive maintenance and big recent services (slight positive signal vs neglected examples).
  if (/cooling system refresh|full brake service|bilstein|b6 struts|engine & transmission mounts|differential service|suspension refresh/i.test(m)) {
    return 1.03;
  }
  if (/rust|salvage|rebuilt|flood/i.test(m)) return 0.88;
  return 1.0;
}

function transmissionWeight(transmission: string | null, segment: CarSegment): number {
  if (!transmission) return 1.0;
  const t = transmission.toLowerCase();
  if (t === 'unknown') return 1.0;

  // Manual premium depends on segment; CVT penalty common.
  if (t === 'manual') {
    if (segment === 'sports' || segment === 'luxury_sports') return 1.06;
    if (segment === 'truck') return 1.02;
    return 1.03;
  }
  if (t === 'automatic') {
    if (segment === 'sports' || segment === 'luxury_sports') return 0.98;
    return 1.0;
  }
  if (t === 'dct') {
    if (segment === 'sports' || segment === 'luxury_sports') return 1.01;
    return 1.0;
  }
  if (t === 'cvt') return 0.94;
  return 1.0;
}

// Approximate hard repair costs by segment (very rough, but segment-aware).
const SEGMENT_REPAIR_COSTS: Record<
  CarSegment,
  {
    tires: number;
    brakes: number;
    clutch: number;
    minor_paint: number;
    heavy_paint: number;
    convertible_top: number;
    major_mech: number;
  }
> = {
  sports: {
    tires: 1100,
    brakes: 900,
    clutch: 1800,
    minor_paint: 800,
    heavy_paint: 2500,
    convertible_top: 2000,
    major_mech: 2500
  },
  luxury_sports: {
    tires: 1400,
    brakes: 1300,
    clutch: 2600,
    minor_paint: 1200,
    heavy_paint: 3500,
    convertible_top: 2600,
    major_mech: 4000
  },
  truck: {
    tires: 900,
    brakes: 800,
    clutch: 1800,
    minor_paint: 900,
    heavy_paint: 2800,
    convertible_top: 0,
    major_mech: 2500
  },
  luxury: {
    tires: 1000,
    brakes: 900,
    clutch: 2200,
    minor_paint: 1100,
    heavy_paint: 3200,
    convertible_top: 2300,
    major_mech: 3500
  },
  economy: {
    tires: 550,
    brakes: 500,
    clutch: 1300,
    minor_paint: 600,
    heavy_paint: 2000,
    convertible_top: 1700,
    major_mech: 1800
  },
  other: {
    tires: 800,
    brakes: 700,
    clutch: 1900,
    minor_paint: 800,
    heavy_paint: 2600,
    convertible_top: 2200,
    major_mech: 2600
  }
};

const PLATFORM_REPAIR_OVERRIDES: Record<
  string,
  Partial<Record<IssueCode, { parts: number; laborHours: number }>>
> = {
  'bmw_z3_e36-7': {
    door_card: { parts: 700, laborHours: 2 },
    window_regulator: { parts: 350, laborHours: 1.5 },
    convertible_top: { parts: 2500, laborHours: 9 },
    interior_refresh: { parts: 1200, laborHours: 10 }
  },
  bmw_e36: {
    door_card: { parts: 250, laborHours: 1.5 },
    window_regulator: { parts: 220, laborHours: 1.2 },
    interior_refresh: { parts: 800, laborHours: 8 }
  },
  miata_na: {
    convertible_top: { parts: 1700, laborHours: 8 },
    interior_refresh: { parts: 900, laborHours: 8 }
  },
  miata_nb: {
    convertible_top: { parts: 1800, laborHours: 8 },
    interior_refresh: { parts: 950, laborHours: 8 }
  },
  tacoma_2nd_gen: {
    rust_severe: { parts: 0, laborHours: 8 }
  }
};

function getPlatformKey(year: number, make: string, model: string, segment: CarSegment): string {
  const m = (make ?? '').toLowerCase().trim();
  const mo = (model ?? '').toLowerCase().trim();

  if (m === 'bmw' && /z3/.test(mo)) return 'bmw_z3_e36-7';
  if (m === 'bmw' && /z4/.test(mo)) return 'bmw_z4_e85';
  if (m === 'bmw' && /(3 series|e36|318|325|328|m3)/.test(mo)) return 'bmw_e36';

  if (m === 'mazda' && /(miata|mx-5)/.test(mo) && year <= 1997) return 'miata_na';
  if (m === 'mazda' && /(miata|mx-5)/.test(mo) && year >= 1998 && year <= 2005) return 'miata_nb';

  if (m === 'subaru' && /wrx/.test(mo) && year >= 2015 && year <= 2021) return 'wrx_va';

  if (m === 'toyota' && /tacoma/.test(mo) && year >= 2005 && year <= 2015) return 'tacoma_2nd_gen';

  return `segment_${segment}`;
}

function extractIssues(wear: string): IssueCode[] {
  const w = wear.toLowerCase();
  const issues = new Set<IssueCode>();

  if (/needs tires|tires? (soon|needed|shot)|bald tires?/.test(w)) issues.add('tires');
  if (/brakes? (soon|needed)|rotors?/.test(w)) issues.add('brakes');
  if (/clutch (soon|slipping|needed)/.test(w)) issues.add('clutch');

  if (/clear coat|peeling|oxidized|fading paint|hail|paint is gone|no paint/.test(w)) {
    issues.add('heavy_paint');
  } else if (/dents?|scratches?|paint chips?/.test(w)) {
    issues.add('minor_paint');
  }

  if (/convertible top|soft top/.test(w)) issues.add('convertible_top');
  if (/door cards?/.test(w)) issues.add('door_card');
  if (/window actuators?|window regulators?/.test(w)) issues.add('window_regulator');
  if (/interior (is a )?mess|interior shot|torn seats?/.test(w)) issues.add('interior_refresh');

  if (/check engine|misfire|overheat|oil leak|coolant leak|transmission (issue|slip)|diff (noise|whine)/.test(w)) {
    issues.add('major_mech');
  }

  if (/salvage|rebuilt|frame damage|flood/.test(w)) issues.add('title_structural');
  if (/rust (bad|through|severe)/.test(w)) issues.add('rust_severe');

  return [...issues];
}

function getLaborRateForRegion(state: string | null): number {
  if (!state) return 125;
  const s = state.toUpperCase();
  if (s === 'CA' || s === 'NY' || s === 'WA') return 160;
  if (s === 'TX' || s === 'AZ' || s === 'CO') return 130;
  if (s === 'FL' || s === 'GA' || s === 'NC') return 120;
  return 115;
}

function expectedWearFraction(ageYears: number): number {
  if (ageYears < 10) return 0.1;
  if (ageYears < 20) return 0.18;
  if (ageYears < 30) return 0.25;
  return 0.32;
}

function wearFactorFromHardCosts(
  listing: ListingInput,
  segment: CarSegment,
  compPrice: number
): number {
  const wear = listing.wear;
  if (!wear || !wear.trim()) return 1.0;
  if (compPrice <= 0) return 1.0;

  const currentYear = new Date().getFullYear();
  const ageYears = Math.max(0, currentYear - listing.year);
  const expectedCost = expectedWearFraction(ageYears) * compPrice;

  const platformKey = getPlatformKey(listing.year, listing.make, listing.model, segment);
  const platformOverrides = PLATFORM_REPAIR_OVERRIDES[platformKey] ?? {};
  const segmentCosts = SEGMENT_REPAIR_COSTS[segment] ?? SEGMENT_REPAIR_COSTS.other;
  const laborRate = getLaborRateForRegion(listing.state ?? null);

  const issues = extractIssues(wear);
  let totalCost = 0;

  for (const issue of issues) {
    const override = platformOverrides[issue];
    if (override) {
      totalCost += override.parts + override.laborHours * laborRate;
      continue;
    }

    switch (issue) {
      case 'tires':
        totalCost += segmentCosts.tires + 1.0 * laborRate;
        break;
      case 'brakes':
        totalCost += segmentCosts.brakes + 1.5 * laborRate;
        break;
      case 'clutch':
        totalCost += segmentCosts.clutch + 6.0 * laborRate;
        break;
      case 'minor_paint':
        totalCost += segmentCosts.minor_paint + 4.0 * laborRate;
        break;
      case 'heavy_paint':
        totalCost += segmentCosts.heavy_paint + 12.0 * laborRate;
        break;
      case 'convertible_top':
        totalCost += segmentCosts.convertible_top + 8.0 * laborRate;
        break;
      case 'door_card':
      case 'window_regulator':
      case 'interior_refresh':
        totalCost += segmentCosts.major_mech * 0.4 + 4.0 * laborRate;
        break;
      case 'major_mech':
        totalCost += segmentCosts.major_mech + 6.0 * laborRate;
        break;
      case 'title_structural':
        totalCost += compPrice * 0.35;
        break;
      case 'rust_severe':
        totalCost += compPrice * 0.2;
        break;
      default:
        break;
    }
  }

  if (totalCost <= 0) return 1.0;

  const excessCost = Math.max(0, totalCost - expectedCost);
  if (excessCost <= 0) return 1.0;

  const rawFactor = 1 - excessCost / compPrice;
  // Heavily worn examples can legitimately sit at a much steeper discount,
  // but we don't want to crush normal old-car wear that's already priced in by age.
  return Math.max(0.5, Math.min(1.0, rawFactor));
}

export function computeDeterministicValuation(
  listing: ListingInput,
  comps: NormalizedComp[]
): ValuationResult | null {
  const filtered = filterComparableComps(listing, comps);
  if (!filtered.length) return null;

  const segment = getCarSegment(listing.make, listing.model);
  const adjustedPrices: number[] = [];
  const keyFactors: string[] = [];

  for (const comp of filtered) {
    if (!comp.asking_price || !comp.year) continue;

    let price = comp.asking_price;

    if (comp.mileage != null && listing.mileage) {
      price = mileageAdjustment(comp.mileage, listing.mileage, price, segment);
    }
    price = ageAdjustment(comp.year, listing.year, price, segment);

    let weight = 1;
    weight *= trimWeight(listing.trim ?? null, comp.trim);
    if (listing.state && comp.state && listing.state.toUpperCase() === comp.state.toUpperCase()) {
      weight *= 1.05;
    }
    const condition = listing.condition ?? 'good';
    weight *= conditionMultiplier(condition);
    weight *= transmissionWeight(listing.transmission ?? null, segment);
    weight *= modsWeight(listing.mods ?? null);
    weight *= wearFactorFromHardCosts(listing, segment, price);

    adjustedPrices.push(Math.round(price * weight));
  }

  if (!adjustedPrices.length) return null;

  const sorted = [...adjustedPrices].sort((a, b) => a - b);
  const n = sorted.length;
  const low = sorted[Math.floor(n * 0.12)] ?? sorted[0];
  const high = sorted[Math.floor(n * 0.88)] ?? sorted[n - 1];
  const mid = Math.round(sorted.reduce((s, p) => s + p, 0) / n);

  const spread = high - low;
  const relativeSpread = mid > 0 ? spread / mid : 0;
  const compCount = n;

  let confidence = 0.48;
  if (compCount >= 10 && relativeSpread < 0.25) confidence = 0.88;
  else if (compCount >= 6 && relativeSpread < 0.32) confidence = 0.72;
  else if (compCount >= 4) confidence = 0.60;

  const dollarsPerMile = getMileageDollarsPerMile(segment);
  keyFactors.push(`${compCount} comparables (same make/model, ±3 years).`);
  keyFactors.push(`Segment: ${segment}. Mileage adjustment: $${dollarsPerMile.toFixed(2)}/mi (varies by segment).`);
  keyFactors.push('Age, trim, region, condition, transmission, mods, and wear/issues applied as weighted adjustments.');
  keyFactors.push(`Range is ${(relativeSpread * 100).toFixed(0)}% of mid; lower spread = higher confidence.`);

  return {
    value_low: low,
    value_mid: mid,
    value_high: high,
    confidence,
    comp_count: compCount,
    key_factors: keyFactors
  };
}

function baseNewValue(segment: CarSegment): number {
  switch (segment) {
    case 'economy':
      return 28000;
    case 'truck':
      return 38000;
    case 'sports':
      return 42000;
    case 'luxury_sports':
      return 65000;
    case 'luxury':
      return 55000;
    default:
      return 32000;
  }
}

/**
 * Fallback valuation when no comps are available. This intentionally has low confidence
 * and uses segment-level depreciation and mileage curves plus condition/wear adjustments.
 */
export function computeFallbackValuation(listing: ListingInput): ValuationResult {
  const segment = getCarSegment(listing.make, listing.model);
  const currentYear = new Date().getFullYear();
  const ageYears = Math.max(0, currentYear - listing.year);

  // Age depreciation from a segment baseline "new value".
  const depPerYear = getAgeDepreciationPerYear(segment);
  const ageFactor = Math.pow(1 - depPerYear, ageYears);
  let mid = baseNewValue(segment) * ageFactor;

  // Mileage adjustment relative to an expected baseline (12k miles/year).
  const expectedMiles = ageYears * 12000;
  const mileDiff = Math.max(0, listing.mileage - expectedMiles);
  const dollarsPerMile = getMileageDollarsPerMile(segment);
  mid = Math.max(800, mid - mileDiff * dollarsPerMile);

  // Apply the same multipliers used in the comp-based approach.
  const condition = listing.condition ?? 'good';
  mid *= conditionMultiplier(condition);
  mid *= transmissionWeight(listing.transmission ?? null, segment);
  mid *= modsWeight(listing.mods ?? null);
  mid *= wearFactorFromHardCosts(listing, segment, mid);

  // Wide range due to lack of comps.
  const low = Math.max(500, Math.round(mid * 0.65));
  const high = Math.round(mid * 1.35);
  const valueMid = Math.max(500, Math.round(mid));

  const keyFactors: string[] = [];
  keyFactors.push('No verified comparables found; estimate uses depreciation + mileage + condition + wear.');
  keyFactors.push(`Segment: ${segment}. Mileage adjustment: $${dollarsPerMile.toFixed(2)}/mi (varies by segment).`);
  keyFactors.push('Wear/repairs are priced using platform + region heuristics when detected, otherwise segment defaults.');

  return {
    value_low: low,
    value_mid: valueMid,
    value_high: high,
    confidence: 0.25,
    comp_count: 0,
    key_factors: keyFactors
  };
}
