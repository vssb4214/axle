/**
 * Car segment affects how mileage and age impact value.
 * - Sports / luxury sports: higher mileage sensitivity, steeper depreciation.
 * - Trucks: lower $/mi, hold value better at high miles.
 * - Luxury: moderate-high sensitivity.
 * - Economy: moderate.
 */

export type CarSegment =
  | 'sports'
  | 'luxury_sports'
  | 'truck'
  | 'luxury'
  | 'economy'
  | 'other';

/** $ per mile adjustment (baseline). Segment multipliers applied in engine. */
export const BASE_CENTS_PER_MILE = 6;

/** Segment-specific mileage sensitivity (multiplier on baseline). Higher = more depreciation per mile. */
export const SEGMENT_MILEAGE_MULTIPLIER: Record<CarSegment, number> = {
  sports: 1.55,
  luxury_sports: 1.45,
  truck: 0.65,
  luxury: 1.15,
  economy: 0.95,
  other: 1.0
};

/** Typical annual depreciation by segment (as fraction of value per year older than comp). */
export const SEGMENT_AGE_DEPRECIATION: Record<CarSegment, number> = {
  sports: 0.07,
  luxury_sports: 0.065,
  truck: 0.05,
  luxury: 0.06,
  economy: 0.055,
  other: 0.06
};

const SEGMENT_PATTERNS: { pattern: RegExp | ((make: string, model: string) => boolean); segment: CarSegment }[] = [
  { pattern: (_m, mo) => /m3|m4|m5|m2|amg|rs[0-9]|c63|e63|gt[0-9]|911|cayman|boxster|supra|gtr|nsx/i.test(mo), segment: 'luxury_sports' },
  { pattern: (_m, mo) => /z3|z4|330ci|335i|135i|228i|miata|brz|frs|86|mustang|camaro|challenger|corvette|s2000|civic si|wrx|sti|gti|type r/i.test(mo), segment: 'sports' },
  { pattern: (_m, mo) => /tacoma|tundra|4runner|f-?150|silverado|sierra|ram|ranger|frontier|colorado|gladiator|wrangler|land cruiser|gx|lx|sequoia/i.test(mo), segment: 'truck' },
  { pattern: (m) => /^(bmw|porsche|audi|mercedes|lexus|infiniti|acura)$/i.test(m), segment: 'luxury' },
  { pattern: (_m, mo) => /civic|corolla|accord|camry|sentra|altima|elantra|forte|mazda3|focus|fusion|malibu|impala|sonata|optima/i.test(mo), segment: 'economy' },
];

export function getCarSegment(make: string, model: string): CarSegment {
  const m = (make ?? '').trim().toLowerCase();
  const mo = (model ?? '').trim().toLowerCase();
  const combined = `${m} ${mo}`;

  for (const { pattern, segment } of SEGMENT_PATTERNS) {
    if (typeof pattern === 'function') {
      if (pattern(make, model)) return segment;
    } else if (pattern.test(combined) || pattern.test(m)) {
      return segment;
    }
  }
  return 'other';
}

/** Returns dollars per mile for mileage-based adjustment (listing has more miles than comp = deduct). */
export function getMileageDollarsPerMile(segment: CarSegment): number {
  return (BASE_CENTS_PER_MILE * SEGMENT_MILEAGE_MULTIPLIER[segment]) / 100;
}

export function getAgeDepreciationPerYear(segment: CarSegment): number {
  return SEGMENT_AGE_DEPRECIATION[segment];
}
