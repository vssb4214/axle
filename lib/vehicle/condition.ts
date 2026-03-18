export type Severity = 'none' | 'light' | 'moderate' | 'severe';

export type ExteriorCondition = {
  paint: Severity; // chips/scratches/fade
  dents: Severity;
  rust: Severity;
  glass: Severity; // cracks/chips
};

export type InteriorCondition = {
  seats: Severity; // tears/wear
  smells: Severity; // smoke/pets
  stains: Severity;
  electronics: Severity; // infotainment/windows/etc
};

export type WheelsTiresCondition = {
  tires: Severity; // tread life / needs tires
  wheels: Severity; // curb rash/bends
};

export type MechanicalCondition = {
  engine: Severity;
  transmission: Severity;
  suspension: Severity;
  brakes: Severity;
  lights: Severity; // warning lights
};

export type MaintenanceSignals = {
  recentService: boolean;
  deferredMaintenance: boolean;
  cleanTitle: boolean | null; // null if unknown
};

export type ModRisk = 'oem_plus' | 'cosmetic' | 'performance' | 'suspension' | 'tune' | 'emissions' | 'unknown';

export type Mod = {
  category: ModRisk;
  label: string; // e.g. "stage 1 tune", "coilovers"
  reversible: boolean | null;
};

export type VehicleConditionProfile = {
  exterior: ExteriorCondition;
  interior: InteriorCondition;
  wheelsTires: WheelsTiresCondition;
  mechanical: MechanicalCondition;
  maintenance: MaintenanceSignals;
  mods: Mod[];
};

export function defaultConditionProfile(): VehicleConditionProfile {
  const none: Severity = 'none';
  return {
    exterior: { paint: none, dents: none, rust: none, glass: none },
    interior: { seats: none, smells: none, stains: none, electronics: none },
    wheelsTires: { tires: none, wheels: none },
    mechanical: { engine: none, transmission: none, suspension: none, brakes: none, lights: none },
    maintenance: { recentService: false, deferredMaintenance: false, cleanTitle: null },
    mods: []
  };
}

export function normalizeSeverity(input: unknown): Severity {
  const s = String(input ?? '').trim().toLowerCase();
  if (!s) return 'none';
  if (s in { none: 1 }) return 'none';
  if (s in { light: 1, minor: 1, small: 1 }) return 'light';
  if (s in { moderate: 1, medium: 1 }) return 'moderate';
  if (s in { severe: 1, major: 1, heavy: 1 }) return 'severe';
  return 'none';
}

// ---------------------------------------------------------------------------
// Scoring: VehicleConditionProfile → numeric multipliers
// ---------------------------------------------------------------------------

const SEVERITY_PENALTY: Record<Severity, number> = {
  none: 0,
  light: 1,
  moderate: 2.5,
  severe: 4,
};

const AREA_WEIGHTS = {
  paint: 2, dents: 1.5, rust: 4, glass: 1.5,
  seats: 1.5, smells: 2.5, stains: 1, electronics: 2,
  tires: 1.5, wheels: 1,
  engine: 5, transmission: 5, suspension: 2, brakes: 2, lights: 1.5,
} as const;

type AreaKey = keyof typeof AREA_WEIGHTS;

const MAX_PENALTY = (Object.values(AREA_WEIGHTS) as number[]).reduce(
  (sum, w) => sum + w * SEVERITY_PENALTY.severe, 0
);

function allSeverities(profile: VehicleConditionProfile): [AreaKey, Severity][] {
  return [
    ['paint', profile.exterior.paint],
    ['dents', profile.exterior.dents],
    ['rust', profile.exterior.rust],
    ['glass', profile.exterior.glass],
    ['seats', profile.interior.seats],
    ['smells', profile.interior.smells],
    ['stains', profile.interior.stains],
    ['electronics', profile.interior.electronics],
    ['tires', profile.wheelsTires.tires],
    ['wheels', profile.wheelsTires.wheels],
    ['engine', profile.mechanical.engine],
    ['transmission', profile.mechanical.transmission],
    ['suspension', profile.mechanical.suspension],
    ['brakes', profile.mechanical.brakes],
    ['lights', profile.mechanical.lights],
  ];
}

/**
 * Physical condition score from 0 (everything severe) to 1 (everything none).
 */
export function physicalConditionScore(profile: VehicleConditionProfile): number {
  let penalty = 0;
  for (const [area, sev] of allSeverities(profile)) {
    penalty += SEVERITY_PENALTY[sev] * AREA_WEIGHTS[area];
  }
  return 1 - penalty / MAX_PENALTY;
}

/**
 * Maintenance-only multiplier derived from MaintenanceSignals.
 */
export function maintenanceMultiplier(m: MaintenanceSignals): number {
  let adj = 0;
  if (m.recentService) adj += 0.02;
  if (m.deferredMaintenance) adj -= 0.04;
  if (m.cleanTitle === false) adj -= 0.08;
  return 1 + adj;
}

/**
 * Combined condition multiplier (physical + maintenance). Range ≈ [0.70, 1.10].
 * Drop-in replacement for the string-based conditionMultiplier when a profile exists.
 */
export function conditionMultiplierFromProfile(profile: VehicleConditionProfile): number {
  const score = physicalConditionScore(profile);
  const base = 0.78 + score * 0.30;
  const maint = maintenanceMultiplier(profile.maintenance);
  return Math.max(0.70, Math.min(1.10, base + (maint - 1)));
}

/**
 * Human-readable grade derived from the physical condition score.
 */
export function conditionGrade(profile: VehicleConditionProfile): string {
  const score = physicalConditionScore(profile);
  if (score >= 0.95) return 'excellent';
  if (score >= 0.80) return 'very_good';
  if (score >= 0.60) return 'good';
  if (score >= 0.35) return 'fair';
  return 'poor';
}

// ---------------------------------------------------------------------------
// Mods scoring
// ---------------------------------------------------------------------------

const MOD_CATEGORY_SCORE: Record<ModRisk, number> = {
  oem_plus: 2,
  cosmetic: 1,
  performance: 3,
  suspension: 1,
  tune: -3,
  emissions: -6,
  unknown: -1,
};

/**
 * Mods multiplier from structured Mod[]. Range ≈ [0.88, 1.06].
 * Drop-in replacement for the string-based modsWeight when a profile exists.
 */
export function modsMultiplierFromProfile(mods: Mod[]): number {
  if (mods.length === 0) return 1.0;
  let total = 0;
  for (const mod of mods) {
    const base = MOD_CATEGORY_SCORE[mod.category] ?? 0;
    // Reversible risky mods are less harmful to resale.
    if (base < 0 && mod.reversible) total += base * 0.5;
    else total += base;
  }
  const clamped = Math.max(-12, Math.min(6, total));
  return 1 + clamped * 0.01;
}

// ---------------------------------------------------------------------------
// Explanation: break the profile impact into labeled adjustment line-items
// ---------------------------------------------------------------------------

export function explainConditionImpact(
  profile: VehicleConditionProfile,
  baseMid: number
): { label: string; delta: number }[] {
  const items: { label: string; delta: number }[] = [];

  // Physical condition
  const score = physicalConditionScore(profile);
  const physMult = 0.78 + score * 0.30;
  if (Math.abs(physMult - 1) > 0.005) {
    items.push({
      label: `Condition (${conditionGrade(profile)})`,
      delta: Math.round(baseMid * (physMult - 1)),
    });
  }

  // Maintenance signals
  const maint = maintenanceMultiplier(profile.maintenance);
  if (Math.abs(maint - 1) > 0.005) {
    const parts: string[] = [];
    if (profile.maintenance.recentService) parts.push('recent service');
    if (profile.maintenance.deferredMaintenance) parts.push('deferred maintenance');
    if (profile.maintenance.cleanTitle === false) parts.push('non-clean title');
    items.push({
      label: parts.length > 0 ? `Maintenance (${parts.join(', ')})` : 'Maintenance history',
      delta: Math.round(baseMid * (maint - 1)),
    });
  }

  // Mods
  if (profile.mods.length > 0) {
    const modsMult = modsMultiplierFromProfile(profile.mods);
    if (Math.abs(modsMult - 1) > 0.005) {
      const labels = profile.mods.slice(0, 3).map((m) => m.label).join(', ');
      const suffix = profile.mods.length > 3 ? ` +${profile.mods.length - 3} more` : '';
      items.push({
        label: `Mods (${labels}${suffix})`,
        delta: Math.round(baseMid * (modsMult - 1)),
      });
    }
  }

  return items;
}
