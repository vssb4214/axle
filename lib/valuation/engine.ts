import { NormalizedComp, ValuationResult } from './types';
import {
  getCarSegment,
  getMileageDollarsPerMile,
  getAgeDepreciationPerYear,
  type CarSegment
} from './segments';
import type { VehicleConditionProfile } from '@/lib/vehicle/condition';
import {
  conditionMultiplierFromProfile,
  modsMultiplierFromProfile,
  explainConditionImpact,
} from '@/lib/vehicle/condition';

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
  wear_issues?: IssueCode[] | null;
  wear_costs?: { label: string; parts_cost: number; labor_hours: number; category: string }[] | null;
  /** Structured condition profile – single source of truth when present. */
  conditionProfile?: VehicleConditionProfile | null;
  /** Normalized vehicle key for variant-level matching (set when VIN-derived data is available). */
  vehicleKey?: string | null;
};

export type IssueCode =
  | 'tires'
  | 'brakes'
  | 'clutch'
  | 'head_light'
  | 'tail_light'
  | 'windshield'
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

function extractDisplacementLiters(text: string | null | undefined): number | null {
  const t = (text ?? '').toLowerCase();
  if (!t) return null;

  // "2.8", "3.0", "2.5i", etc.
  const m = t.match(/(^|[^0-9])([1-6]\.[0-9])([^0-9]|$)/);
  if (m?.[2]) {
    const v = parseFloat(m[2]);
    return Number.isFinite(v) ? v : null;
  }

  // "30i" / "3 0i" / "25i"
  const m2 = t.match(/(^|[^0-9])([1-6])\s?([0-9])\s?i([^a-z0-9]|$)/);
  if (m2?.[2] && m2?.[3]) {
    const v = parseFloat(`${m2[2]}.${m2[3]}`);
    return Number.isFinite(v) ? v : null;
  }

  return null;
}

function normalizeVehicleKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim().toLowerCase();
  return trimmed || null;
}

const SEGMENT_YEAR_WINDOW: Record<CarSegment, number> = {
  sports: 2,
  luxury_sports: 2,
  truck: 4,
  luxury: 3,
  economy: 3,
  other: 3
};

const SEGMENT_MILEAGE_WINDOW: Record<CarSegment, number> = {
  sports: 80_000,
  luxury_sports: 90_000,
  truck: 150_000,
  luxury: 110_000,
  economy: 110_000,
  other: 120_000
};

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

function isLikelyGenerationMismatch(listing: ListingInput, comp: NormalizedComp): boolean {
  const make = norm(listing.make);
  const model = norm(listing.model);
  const listingText = `${listing.model ?? ''} ${listing.trim ?? ''}`.toLowerCase();
  const compText = `${comp.model ?? ''} ${comp.trim ?? ''} ${comp.source_title ?? ''}`.toLowerCase();

  // BMW has several generation naming shifts (e.g. Z4 3.0i -> sDrive30i).
  // Use naming-family + year signal to avoid mixing clear cross-gen variants.
  if (make === 'bmw') {
    const listingHasDriveSuffix = /\b[is]?(x|s)?drive\d{2}i?\b|\bsdrive\b|\bxdrive\b/.test(listingText);
    const compHasDriveSuffix = /\b[is]?(x|s)?drive\d{2}i?\b|\bsdrive\b|\bxdrive\b/.test(compText);
    if (listingHasDriveSuffix !== compHasDriveSuffix && comp.year != null) {
      if (Math.abs(comp.year - listing.year) >= 3) return true;
    }

    if (model === 'z4') {
      // Extra protection for Z4: E85/E86 era vs later sDrive-era.
      if (listing.year <= 2008 && /\bsdrive\b|\bxdrive\b/.test(compText)) return true;
      if (listing.year >= 2009 && /\b2\.5i\b|\b3\.0i\b/.test(compText) && !/\bsdrive\b|\bxdrive\b/.test(compText)) {
        return true;
      }
    }
  }

  return false;
}

export function filterComparableComps(listing: ListingInput, comps: NormalizedComp[]): NormalizedComp[] {
  const listingText = `${listing.trim ?? ''} ${listing.mods ?? ''} ${listing.wear ?? ''}`.toLowerCase();
  const wantsMobility = /\bmobility\b|wheelchair|handicap|accessible/.test(listingText);
  const listingDisp = extractDisplacementLiters(`${listing.model ?? ''} ${listing.trim ?? ''}`);

  const segment = getCarSegment(listing.make, listing.model);
  const yearWindow = SEGMENT_YEAR_WINDOW[segment] ?? 3;
  const mileageWindow = SEGMENT_MILEAGE_WINDOW[segment] ?? 120_000;
  const listingVehicleKey = normalizeVehicleKey(listing.vehicleKey);
  const normalizedListingMake = norm(listing.make);
  const listingTrim = listing.trim ?? null;
  const TARGET_MIN_FILTERED = 6;

  const runPass = (opts: {
    yearWindow: number;
    mileageWindow: number;
    requireTrimCompat: boolean;
    displacementToleranceLiters: number;
  }) =>
    comps.filter((c) => {
    if (!c.asking_price || !c.year) return false;
    if (!c.make || norm(c.make) !== normalizedListingMake) return false;
    if (!c.model || !modelMatches(listing.model, c.model, listing.trim, c.trim)) return false;
    if (isLikelyGenerationMismatch(listing, c)) return false;

    const compVehicleKey = normalizeVehicleKey(c.vehicleKey);
    const keyMatch = Boolean(listingVehicleKey && compVehicleKey && listingVehicleKey === compVehicleKey);
    const trimCompatible = trimsAreCompatible(listingTrim, c.trim ?? null);
    if (opts.requireTrimCompat && !trimCompatible && !keyMatch) return false;

    if (Math.abs(c.year - listing.year) > opts.yearWindow) return false;
    if (c.mileage != null && Number.isFinite(c.mileage) && Math.abs(c.mileage - listing.mileage) > opts.mileageWindow) {
      return false;
    }

    // Mobility conversions can price far above standard trims; exclude unless listing indicates it.
    if (!wantsMobility) {
      const compText = `${c.trim ?? ''} ${c.source_title ?? ''}`.toLowerCase();
      if (/\bmobility\b|auto access|wheelchair|handicap|accessible/.test(compText)) return false;
    }
    // Generic engine-variant guard: when both imply a displacement, require close match.
    if (listingDisp != null) {
      const compDisp = extractDisplacementLiters(`${c.model ?? ''} ${c.trim ?? ''} ${c.source_title ?? ''}`);
      if (compDisp != null && Math.abs(compDisp - listingDisp) >= opts.displacementToleranceLiters) return false;
    }
    return true;
  });

  // Start strict, then relax in controlled steps if we are starving for comps.
  // This improves availability in thin markets without throwing away variant checks.
  let filtered = runPass({
    yearWindow,
    mileageWindow,
    requireTrimCompat: true,
    displacementToleranceLiters: 0.4
  });

  if (filtered.length < TARGET_MIN_FILTERED) {
    filtered = runPass({
      yearWindow: yearWindow + 1,
      mileageWindow: mileageWindow + 25_000,
      requireTrimCompat: false,
      displacementToleranceLiters: 0.4
    });
  }

  if (filtered.length < TARGET_MIN_FILTERED) {
    filtered = runPass({
      yearWindow: yearWindow + 2,
      mileageWindow: mileageWindow + 50_000,
      requireTrimCompat: false,
      displacementToleranceLiters: 0.4
    });
  }

  if (filtered.length < TARGET_MIN_FILTERED) {
    filtered = runPass({
      yearWindow: yearWindow + 4,
      mileageWindow: mileageWindow + 80_000,
      requireTrimCompat: false,
      displacementToleranceLiters: 0.4
    });
  }
  if (filtered.length < TARGET_MIN_FILTERED) {
    filtered = runPass({
      yearWindow: yearWindow + 8,
      mileageWindow: mileageWindow + 120_000,
      requireTrimCompat: false,
      displacementToleranceLiters: 0.4
    });
  }
  if (filtered.length < TARGET_MIN_FILTERED) {
    filtered = runPass({
      yearWindow: yearWindow + 12,
      mileageWindow: mileageWindow + 180_000,
      requireTrimCompat: false,
      displacementToleranceLiters: 0.4
    });
  }
  // Last resort for very thin markets: allow adjacent displacement variants only when we do not
  // have a VIN-derived vehicle key and we could not infer displacement from user input.
  if (filtered.length < 3 && !listingVehicleKey && listingDisp == null) {
    filtered = runPass({
      yearWindow: yearWindow + 12,
      mileageWindow: mileageWindow + 180_000,
      requireTrimCompat: false,
      displacementToleranceLiters: 0.8
    });
  }

  if (!listingVehicleKey) return filtered;

  return filtered.sort((a, b) => {
    const aMatch = normalizeVehicleKey(a.vehicleKey) === listingVehicleKey;
    const bMatch = normalizeVehicleKey(b.vehicleKey) === listingVehicleKey;
    if (aMatch === bMatch) return 0;
    return aMatch ? -1 : 1;
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
  if (diff === 0) return compPrice;
  const dollarsPerMile = getMileageDollarsPerMile(segment);
  // Prevent mileage math from crushing low-priced cars. When compPrice is low, a high $/mi
  // (e.g. sports segments) can over-penalize by thousands. Scale $/mi to the listing price.
  // Example: for a ~$7k comp, cap at about $0.04/mi.
  const dollarsPerMileCapped = Math.min(dollarsPerMile, compPrice / 180_000);
  // When the listing has *fewer* miles than the comp, allow an uplift, but cap it hard.
  // This fixes cases like low-mile minivans being undervalued vs high-mile dealer comps.
  if (diff < 0) {
    const milesBetter = Math.abs(diff);
    const rawBump = milesBetter * dollarsPerMileCapped * 1.0;
    const cap = (segment === 'sports' || segment === 'luxury_sports') ? compPrice * 0.20 : compPrice * 0.15;
    return compPrice + Math.min(rawBump, cap);
  }

  // Allow steeper mileage discounts for enthusiast cars where miles matter a lot.
  const baseCap = compPrice * 0.35;
  const cap =
    segment === 'sports' || segment === 'luxury_sports'
      ? compPrice * 0.5
      : baseCap;
  const deduction = Math.min(diff * dollarsPerMileCapped, cap);
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
  // Newer comp than listing: allow a bump, but cap it harder for mainstream cars.
  // This prevents a few high-priced newer comps from pulling the range up too much.
  const cap = segment === 'sports' || segment === 'luxury_sports' ? 0.12 : 0.07;
  const bump = Math.min(-yearDiff * depPerYear * 0.5, cap);
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

function trimTier(trim: string): number {
  const t = trim.toLowerCase();
  // Broad, cross-make heuristic tiers. Not perfect, but better than treating all mismatches equally.
  if (/\b(platinum|signature|black label|executive|lwb)\b/.test(t)) return 4;
  if (/\b(limited|touring|premier|ultimate|denali|sport\s?touring)\b/.test(t)) return 3;
  if (/\b(xle|se|sport|s\s?line|r\s?line|trd|sv|slt|lt|ex|sx)\b/.test(t)) return 2;
  if (/\b(le|lx|ls|base|l)\b/.test(t)) return 1;
  return 2;
}

/** Trim match: same trim boosts; different trims get tier-based normalization. */
function trimWeight(listingTrim: string | null, compTrim: string | null): number {
  if (!listingTrim || !compTrim) return 1.0;
  const lt = listingTrim.toLowerCase();
  const ct = compTrim.toLowerCase();
  if (ct.includes(lt) || lt.includes(ct)) return 1.10;
  const listingTier = trimTier(lt);
  const compTier = trimTier(ct);
  const diff = compTier - listingTier;
  // If comp is higher trim than listing, discount it more; if lower trim, uplift it modestly.
  // Clamp to keep it sane across unknown trim strings.
  const factor = 1 - diff * 0.07;
  return Math.max(0.82, Math.min(1.18, factor));
}

function trimsAreCompatible(listingTrim: string | null, compTrim: string | null): boolean {
  if (!listingTrim || !compTrim) return true;
  const lt = listingTrim.toLowerCase().trim();
  const ct = compTrim.toLowerCase().trim();
  if (!lt || !ct) return true;
  if (ct.includes(lt) || lt.includes(ct)) return true;
  const stop = new Set([
    'passenger',
    'seater',
    'van',
    'wagon',
    'sedan',
    'coupe',
    'hatch',
    'awd',
    'fwd',
    'rwd',
    '4dr',
    '2dr',
    '4x4',
    '4wd',
    '2wd',
    'base',
    'with',
    'pkg',
    'package'
  ]);
  const tokenize = (s: string) =>
    s
      .split(/[^a-z0-9]+/g)
      .map((t) => t.trim())
      .filter((t) => t && !stop.has(t) && !/^\d+$/.test(t));

  const ltTokens = new Set(tokenize(lt));
  const ctTokens = new Set(tokenize(ct));
  if (ltTokens.size === 0 || ctTokens.size === 0) return false;

  for (const t of ltTokens) {
    if (ctTokens.has(t)) return true;
  }
  return false;
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

function compSourceAskingAdjustment(comp: NormalizedComp): number {
  const source = (comp.source ?? '').toLowerCase();
  const title = (comp.source_title ?? '').toLowerCase();
  const combined = `${source} ${title}`;

  const looksDealer = /dealer|dealership|auto sales|motors|certified|cpo|warranty|inventory/.test(combined);
  if (looksDealer) return 0.94;

  if (source === 'autodev') return 0.95;
  if (source.includes('auction')) return 0.99;
  return 1.0;
}

// Approximate hard repair costs by segment (very rough, but segment-aware).
const SEGMENT_REPAIR_COSTS: Record<
  CarSegment,
  {
    tires: number;
    brakes: number;
    clutch: number;
    windshield: number;
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
    windshield: 700,
    minor_paint: 800,
    heavy_paint: 2500,
    convertible_top: 2000,
    major_mech: 2500
  },
  luxury_sports: {
    tires: 1400,
    brakes: 1300,
    clutch: 2600,
    windshield: 750,
    minor_paint: 1200,
    heavy_paint: 3500,
    convertible_top: 2600,
    major_mech: 4000
  },
  truck: {
    tires: 900,
    brakes: 800,
    clutch: 1800,
    windshield: 550,
    minor_paint: 900,
    heavy_paint: 2800,
    convertible_top: 0,
    major_mech: 2500
  },
  luxury: {
    tires: 1000,
    brakes: 900,
    clutch: 2200,
    windshield: 650,
    minor_paint: 1100,
    heavy_paint: 3200,
    convertible_top: 2300,
    major_mech: 3500
  },
  economy: {
    tires: 550,
    brakes: 500,
    clutch: 1300,
    windshield: 350,
    minor_paint: 600,
    heavy_paint: 2000,
    convertible_top: 1700,
    major_mech: 1800
  },
  other: {
    tires: 800,
    brakes: 700,
    clutch: 1900,
    windshield: 450,
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

  if (/(needs tires?|bad tires?|worn tires?|bald tires?|tires?\s+(soon|needed|shot|bad|worn))/.test(w)) issues.add('tires');
  if (/brakes? (soon|needed)|rotors?/.test(w)) issues.add('brakes');
  if (/clutch (soon|slipping|needed)/.test(w)) issues.add('clutch');
  if (/(windshield|windscreen).*(crack|cracked|chip|chipped)|crack(?:ed)?[^\n]{0,60}(windshield|windscreen)/.test(w)) {
    issues.add('windshield');
  }
  if (/(head ?light|headlight).*(crack|cracked|broken)|crack(?:ed)?[^\n]{0,40}(head ?light|headlight)/.test(w)) {
    issues.add('head_light');
  }
  if (/(tail ?light|taillight).*(crack|cracked|broken)|crack(?:ed)?[^\n]{0,40}(tail ?light|taillight)/.test(w)) {
    issues.add('tail_light');
  }

  if (/clear coat|peeling|oxidized|fading paint|hail|paint is gone|no paint/.test(w)) {
    issues.add('heavy_paint');
  } else if (/dents?|scratches?|paint chips?/.test(w)) {
    issues.add('minor_paint');
  }

  if (/convertible top|soft top/.test(w)) issues.add('convertible_top');
  if (/door cards?/.test(w)) issues.add('door_card');
  if (/window actuators?|window regulators?/.test(w)) issues.add('window_regulator');
  if (/interior (is a )?mess|interior shot|torn seats?/.test(w)) issues.add('interior_refresh');

  if (
    /check engine|misfire|overheat|oil leak|coolant leak|transmission (issue|slip)|diff (noise|whine)/.test(w) ||
    // Common phrasing: "oil pan leak", "transmission pan leak"
    /(oil|transmission)\s+pan\s+leak|pan\s+leak/.test(w)
  ) {
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

  // If LLM provided itemized costs, apply them directly so arbitrary wear text is valued.
  if (listing.wear_costs && listing.wear_costs.length > 0) {
    let eligible = 0;
    let alwaysExcess = 0;
    for (const it of listing.wear_costs) {
      const parts = typeof it.parts_cost === 'number' ? it.parts_cost : 0;
      const hours = typeof it.labor_hours === 'number' ? it.labor_hours : 0;
      const raw = parts + hours * laborRate;
      const cost = clampCost(raw, compPrice);
      if (!cost) continue;

      const cat = (it.category ?? '').toLowerCase();
      const label = (it.label ?? '').toLowerCase();
      const isImmediate =
        cat === 'safety' ||
        cat === 'mechanical' ||
        // Missing/broken items are not "expected wear" even on old cars.
        /\b(missing|broken|cracked|crack|shattered|not working|doesn'?t work|leak|leaking|oil leak|transmission leak|coolant leak|power steering leak)\b/.test(label);
      if (isImmediate) alwaysExcess += cost;
      else eligible += cost;
    }

    const totalCost = eligible + alwaysExcess;
    if (totalCost <= 0) return 1.0;

    const excessCost = alwaysExcess + Math.max(0, eligible - expectedCost);
    if (excessCost <= 0) return 1.0;

    const rawFactor = 1 - excessCost / compPrice;
    return Math.max(0.5, Math.min(1.0, rawFactor));
  }

  const issues = listing.wear_issues && listing.wear_issues.length > 0 ? listing.wear_issues : extractIssues(wear);
  let eligibleCost = 0;
  let alwaysExcessCost = 0;

  for (const issue of issues) {
    const override = platformOverrides[issue];
    if (override) {
      // Platform overrides are assumed "real" costs, not just background wear.
      alwaysExcessCost += override.parts + override.laborHours * laborRate;
      continue;
    }

    switch (issue) {
      case 'tires':
        // Safety item: treat as an immediate deduction, not "expected wear".
        alwaysExcessCost += clampCost(segmentCosts.tires + 1.0 * laborRate, compPrice);
        break;
      case 'brakes':
        // Safety item: treat as an immediate deduction, not "expected wear".
        alwaysExcessCost += clampCost(segmentCosts.brakes + 1.5 * laborRate, compPrice);
        break;
      case 'clutch':
        eligibleCost += clampCost(segmentCosts.clutch + 6.0 * laborRate, compPrice);
        break;
      case 'tail_light':
        // Safety/legality item: treat as immediate deduction.
        alwaysExcessCost += clampCost(250 + 0.5 * laborRate, compPrice);
        break;
      case 'head_light':
        // Safety/legality item: treat as immediate deduction.
        alwaysExcessCost += clampCost(350 + 0.5 * laborRate, compPrice);
        break;
      case 'windshield':
        // Visibility/safety item: treat as immediate deduction.
        alwaysExcessCost += clampCost(segmentCosts.windshield + 1.0 * laborRate, compPrice);
        break;
      case 'minor_paint':
        eligibleCost += clampCost(segmentCosts.minor_paint + 4.0 * laborRate, compPrice);
        break;
      case 'heavy_paint':
        eligibleCost += clampCost(segmentCosts.heavy_paint + 12.0 * laborRate, compPrice);
        break;
      case 'convertible_top':
        eligibleCost += clampCost(segmentCosts.convertible_top + 8.0 * laborRate, compPrice);
        break;
      case 'door_card':
      case 'window_regulator':
      case 'interior_refresh':
        eligibleCost += clampCost(segmentCosts.major_mech * 0.4 + 4.0 * laborRate, compPrice);
        break;
      case 'major_mech':
        alwaysExcessCost += clampCost(segmentCosts.major_mech + 6.0 * laborRate, compPrice);
        break;
      case 'title_structural':
        alwaysExcessCost += compPrice * 0.35;
        break;
      case 'rust_severe':
        alwaysExcessCost += compPrice * 0.2;
        break;
      default:
        break;
    }
  }

  const totalCost = eligibleCost + alwaysExcessCost;
  if (totalCost <= 0) return 1.0;

  const excessCost = alwaysExcessCost + Math.max(0, eligibleCost - expectedCost);
  if (excessCost <= 0) return 1.0;

  const rawFactor = 1 - excessCost / compPrice;
  // Heavily worn examples can legitimately sit at a much steeper discount,
  // but we don't want to crush normal old-car wear that's already priced in by age.
  return Math.max(0.5, Math.min(1.0, rawFactor));
}

function clampCost(cost: number, compPrice: number): number {
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  // Prevent the LLM from inventing absurd costs; still allow large deductions on high-value cars.
  const hardMax = Math.min(6500, compPrice * 0.22);
  return Math.max(0, Math.min(hardMax, cost));
}

export function computeDeterministicValuation(
  listing: ListingInput,
  comps: NormalizedComp[]
): ValuationResult | null {
  let filtered = filterComparableComps(listing, comps);
  if (!filtered.length) return null;

  const segment = getCarSegment(listing.make, listing.model);
  // When we have a lot of comps (especially after broadening location), keep the most similar.
  // This reduces outlier-driven ranges while still using real comps.
  if (filtered.length > 20) {
    const targetYear = listing.year;
    const targetMiles = listing.mileage;
    const targetTrim = listing.trim ?? null;
    filtered = [...filtered]
      .sort((a, b) => {
        const ay = a.year == null ? 999 : Math.abs(a.year - targetYear);
        const by = b.year == null ? 999 : Math.abs(b.year - targetYear);
        const am = a.mileage == null ? 999999 : Math.abs(a.mileage - targetMiles);
        const bm = b.mileage == null ? 999999 : Math.abs(b.mileage - targetMiles);
        const at = trimWeight(targetTrim, a.trim);
        const bt = trimWeight(targetTrim, b.trim);
        // Prefer closer year, closer mileage, and better trim match (higher weight).
        return ay - by || am - bm || bt - at;
      })
      .slice(0, 20);
  }

  const adjustedPrices: number[] = [];
  const keyFactors: string[] = [];

  for (const comp of filtered) {
    if (!comp.asking_price || !comp.year) continue;

    let price = comp.asking_price * compSourceAskingAdjustment(comp);

    if (comp.mileage != null && listing.mileage) {
      price = mileageAdjustment(comp.mileage, listing.mileage, price, segment);
    }
    price = ageAdjustment(comp.year, listing.year, price, segment);

    let weight = 1;
    weight *= trimWeight(listing.trim ?? null, comp.trim);
    if (listing.state && comp.state && listing.state.toUpperCase() === comp.state.toUpperCase()) {
      weight *= 1.05;
    }
    if (listing.conditionProfile) {
      weight *= conditionMultiplierFromProfile(listing.conditionProfile);
      weight *= modsMultiplierFromProfile(listing.conditionProfile.mods);
    } else {
      const condition = listing.condition ?? 'good';
      weight *= conditionMultiplier(condition);
      weight *= modsWeight(listing.mods ?? null);
    }
    weight *= transmissionWeight(listing.transmission ?? null, segment);
    weight *= wearFactorFromHardCosts(listing, segment, price);

    adjustedPrices.push(Math.round(price * weight));
  }

  if (!adjustedPrices.length) return null;

  // Outlier rejection (robust): drop points far from median using MAD.
  let usable = [...adjustedPrices];
  if (usable.length >= 8) {
    const med = median(usable);
    const absDevs = usable.map((v) => Math.abs(v - med));
    const mad = median(absDevs);
    const sigma = mad * 1.4826;
    const threshold = sigma > 0 ? 3.0 * sigma : Infinity;
    const pruned = usable.filter((v) => Math.abs(v - med) <= threshold);
    if (pruned.length >= Math.max(6, Math.floor(usable.length * 0.6))) {
      usable = pruned;
    }
  }

  const sorted = usable.sort((a, b) => a - b);
  const n = sorted.length;
  // Tighter percentiles once we have a decent sample.
  const low = sorted[Math.floor(n * (n >= 10 ? 0.2 : 0.12))] ?? sorted[0];
  const high = sorted[Math.floor(n * (n >= 10 ? 0.8 : 0.88))] ?? sorted[n - 1];
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
  keyFactors.push('Dealer asking prices are slightly discounted and outliers are trimmed for stability.');
  keyFactors.push(`Range is ${(relativeSpread * 100).toFixed(0)}% of mid; lower spread = higher confidence.`);

  // Approximate "what moved the needle" breakdown, using the final mid as a reference price.
  const base = mid;
  const adj: { label: string; delta: number }[] = [];

  if (listing.conditionProfile) {
    adj.push(...explainConditionImpact(listing.conditionProfile, base));
  } else {
    const condition = listing.condition ?? 'good';
    const conditionFactor = conditionMultiplier(condition);
    if (conditionFactor !== 1) adj.push({ label: `Condition (${condition})`, delta: Math.round(base * (conditionFactor - 1)) });

    const modsFactor = modsWeight(listing.mods ?? null);
    if (modsFactor !== 1) adj.push({ label: 'Mods / upgrades', delta: Math.round(base * (modsFactor - 1)) });
  }

  const transFactor = transmissionWeight(listing.transmission ?? null, segment);
  if (transFactor !== 1) adj.push({ label: `Transmission (${listing.transmission ?? 'n/a'})`, delta: Math.round(base * (transFactor - 1)) });

  const wearFactor = wearFactorFromHardCosts(listing, segment, base);
  if (wearFactor !== 1) adj.push({ label: 'Wear / repairs', delta: Math.round(base * (wearFactor - 1)) });

  const upkeepItems = estimateUpkeepAdjustments(listing, base);
  for (const it of upkeepItems) adj.push(it);

  const marketSignals = estimateMarketSignals(listing, filtered, segment);

  return {
    value_low: low,
    value_mid: mid,
    value_high: high,
    confidence,
    comp_count: compCount,
    key_factors: keyFactors,
    adjustments: adj,
    market_signals: marketSignals.length > 0 ? marketSignals : undefined
  };
}

function estimateUpkeepAdjustments(listing: ListingInput, baseMid: number): { label: string; delta: number }[] {
  const text = `${listing.mods ?? ''}\n${listing.wear ?? ''}`.toLowerCase();
  if (!text.trim()) return [];

  // Conservative percentage-based credits; cap total so we don't "pay full cost" of mods.
  const items: { label: string; re: RegExp; pct: number }[] = [
    { label: 'Cooling system refresh', re: /cooling system|radiator|expansion tank|thermostat|water pump|hoses?/i, pct: 0.015 },
    { label: 'Full brake service', re: /full brake service|brake service|zimmermann|akebono|rotors?|pads?|brake fluid/i, pct: 0.01 },
    { label: 'Suspension refresh (Bilstein / shocks / struts)', re: /bilstein|b6 struts?|struts?|shocks?/i, pct: 0.01 },
    { label: 'Engine & transmission mounts', re: /engine (and )?transmission mounts?|engine mounts?|transmission mounts?/i, pct: 0.008 },
    { label: 'Differential service', re: /diff(erential)? service/i, pct: 0.004 },
    { label: 'Steering refresh (tie-rod ends)', re: /tie[\s-]?rod/i, pct: 0.005 },
    { label: 'PCV/CCV service', re: /pcv|ccv/i, pct: 0.006 },
    { label: 'DISA service', re: /disa/i, pct: 0.004 },
    { label: 'Bluetooth integration (BlueBus)', re: /bluebus/i, pct: 0.004 },
    { label: 'Strut brace', re: /strut brace|ultraracing/i, pct: 0.003 },
    { label: 'Tint', re: /tinted|tint/i, pct: 0.002 },
    { label: 'LED lighting', re: /\bleds?\b/i, pct: 0.001 }
  ];

  const matched = items.filter((i) => i.re.test(text));
  if (matched.length === 0) return [];

  const deltas: { label: string; delta: number }[] = [];
  let total = 0;
  const cap = Math.min(baseMid * 0.06, 1200);

  for (const m of matched) {
    const raw = Math.round(baseMid * m.pct);
    if (raw <= 0) continue;
    const remaining = Math.max(0, cap - total);
    if (remaining <= 0) break;
    const applied = Math.min(raw, remaining);
    total += applied;
    deltas.push({ label: m.label, delta: applied });
  }

  return deltas;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

function estimateMarketSignals(
  listing: ListingInput,
  comps: NormalizedComp[],
  segment: CarSegment
): { label: string; delta: number; n_with: number; n_without: number }[] {
  // Learn approximate keyword uplifts from the comps we already fetched online.
  // This is intentionally conservative: only show signals when we have enough samples.
  const text = `${listing.mods ?? ''}\n${listing.wear ?? ''}`.toLowerCase();
  if (!text.trim()) return [];

  const KEYWORDS: { label: string; re: RegExp }[] = [
    { label: 'Cooling system refresh', re: /cooling system|radiator|expansion tank|thermostat|water pump/i },
    { label: 'Full brake service', re: /brake service|rotors?|pads?|brake fluid/i },
    { label: 'Struts / suspension refresh', re: /bilstein|b6 struts?|struts?|shocks?|coilovers?/i },
    { label: 'Engine / transmission mounts', re: /engine mounts?|transmission mounts?/i },
    { label: 'Differential service', re: /diff(erential)? service/i },
    { label: 'Tie-rod ends / steering refresh', re: /tie-rod|tie rod/i },
    { label: 'Bluetooth upgrade (e.g. BlueBus)', re: /bluebus|bluetooth/i }
  ];

  const requested = KEYWORDS.filter((k) => k.re.test(text));
  if (requested.length === 0) return [];

  // Normalize comp prices for year/mileage (so we compare like-to-like).
  // We don't apply listing wear/mods multipliers here; we're trying to infer uplift from comp text.
  const normalized = comps
    .map((c) => {
      if (!c.asking_price || !c.year) return null;
      let price = c.asking_price;
      if (c.mileage != null && listing.mileage) {
        price = mileageAdjustment(c.mileage, listing.mileage, price, segment);
      }
      price = ageAdjustment(c.year, listing.year, price, segment);
      price *= trimWeight(listing.trim ?? null, c.trim);
      const blob = `${c.source_title ?? ''}\n${c.mods ?? ''}`.toLowerCase();
      return { price: Math.round(price), blob };
    })
    .filter(Boolean) as { price: number; blob: string }[];

  const out: { label: string; delta: number; n_with: number; n_without: number }[] = [];

  for (const k of requested) {
    const withK = normalized.filter((n) => k.re.test(n.blob)).map((n) => n.price);
    const withoutK = normalized.filter((n) => !k.re.test(n.blob)).map((n) => n.price);
    if (withK.length < 3 || withoutK.length < 5) continue;
    const delta = Math.round(median(withK) - median(withoutK));
    // Ignore tiny or noisy effects.
    if (Math.abs(delta) < 150) continue;
    out.push({ label: k.label, delta, n_with: withK.length, n_without: withoutK.length });
  }

  // Sort by magnitude so the user sees the biggest signals first.
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out.slice(0, 6);
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
  if (listing.conditionProfile) {
    mid *= conditionMultiplierFromProfile(listing.conditionProfile);
    mid *= modsMultiplierFromProfile(listing.conditionProfile.mods);
  } else {
    const condition = listing.condition ?? 'good';
    mid *= conditionMultiplier(condition);
    mid *= modsWeight(listing.mods ?? null);
  }
  mid *= transmissionWeight(listing.transmission ?? null, segment);
  mid *= wearFactorFromHardCosts(listing, segment, mid);

  // Wide range due to lack of comps.
  const low = Math.max(500, Math.round(mid * 0.65));
  const high = Math.round(mid * 1.35);
  const valueMid = Math.max(500, Math.round(mid));

  const keyFactors: string[] = [];
  keyFactors.push('No verified comparables found; estimate uses depreciation + mileage + condition + wear.');
  keyFactors.push(`Segment: ${segment}. Mileage adjustment: $${dollarsPerMile.toFixed(2)}/mi (varies by segment).`);
  keyFactors.push('Wear/repairs are priced using platform + region heuristics when detected, otherwise segment defaults.');

  // Provide the same breakdown UI even without comps.
  const base = valueMid;
  const adj: { label: string; delta: number }[] = [];

  if (listing.conditionProfile) {
    adj.push(...explainConditionImpact(listing.conditionProfile, base));
  } else {
    const condition = listing.condition ?? 'good';
    const conditionFactor = conditionMultiplier(condition);
    if (conditionFactor !== 1) adj.push({ label: `Condition (${condition})`, delta: Math.round(base * (conditionFactor - 1)) });

    const modsFactor = modsWeight(listing.mods ?? null);
    if (modsFactor !== 1) adj.push({ label: 'Mods / upgrades', delta: Math.round(base * (modsFactor - 1)) });
  }

  const transFactor = transmissionWeight(listing.transmission ?? null, segment);
  if (transFactor !== 1) adj.push({ label: `Transmission (${listing.transmission ?? 'n/a'})`, delta: Math.round(base * (transFactor - 1)) });

  const wearFactor = wearFactorFromHardCosts(listing, segment, base);
  if (wearFactor !== 1) adj.push({ label: 'Wear / repairs', delta: Math.round(base * (wearFactor - 1)) });

  const upkeepItems = estimateUpkeepAdjustments(listing, base);
  for (const it of upkeepItems) adj.push(it);

  return {
    value_low: low,
    value_mid: valueMid,
    value_high: high,
    confidence: 0.25,
    comp_count: 0,
    key_factors: keyFactors,
    adjustments: adj.length > 0 ? adj : undefined
  };
}
