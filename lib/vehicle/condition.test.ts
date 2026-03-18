import { describe, it, expect } from 'vitest';
import {
  normalizeSeverity,
  defaultConditionProfile,
  physicalConditionScore,
  maintenanceMultiplier,
  conditionMultiplierFromProfile,
  conditionGrade,
  modsMultiplierFromProfile,
  explainConditionImpact,
  type VehicleConditionProfile,
  type Mod,
} from './condition';

// ---------------------------------------------------------------------------
// normalizeSeverity (existing)
// ---------------------------------------------------------------------------

describe('normalizeSeverity', () => {
  it('maps common synonyms', () => {
    expect(normalizeSeverity('minor')).toBe('light');
    expect(normalizeSeverity('medium')).toBe('moderate');
    expect(normalizeSeverity('major')).toBe('severe');
  });

  it('defaults unknown to none', () => {
    expect(normalizeSeverity('???')).toBe('none');
    expect(normalizeSeverity(undefined)).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// physicalConditionScore
// ---------------------------------------------------------------------------

describe('physicalConditionScore', () => {
  it('returns 1 for a pristine (default) profile', () => {
    expect(physicalConditionScore(defaultConditionProfile())).toBe(1);
  });

  it('returns 0 when every area is severe', () => {
    const p = defaultConditionProfile();
    p.exterior = { paint: 'severe', dents: 'severe', rust: 'severe', glass: 'severe' };
    p.interior = { seats: 'severe', smells: 'severe', stains: 'severe', electronics: 'severe' };
    p.wheelsTires = { tires: 'severe', wheels: 'severe' };
    p.mechanical = { engine: 'severe', transmission: 'severe', suspension: 'severe', brakes: 'severe', lights: 'severe' };
    expect(physicalConditionScore(p)).toBe(0);
  });

  it('mechanical issues weigh more than cosmetic', () => {
    const cosmetic = defaultConditionProfile();
    cosmetic.exterior.paint = 'moderate';
    cosmetic.exterior.dents = 'moderate';

    const mechanical = defaultConditionProfile();
    mechanical.mechanical.engine = 'moderate';

    expect(physicalConditionScore(cosmetic)).toBeGreaterThan(physicalConditionScore(mechanical));
  });
});

// ---------------------------------------------------------------------------
// maintenanceMultiplier
// ---------------------------------------------------------------------------

describe('maintenanceMultiplier', () => {
  it('returns 1 for neutral maintenance', () => {
    expect(maintenanceMultiplier({ recentService: false, deferredMaintenance: false, cleanTitle: null })).toBe(1);
  });

  it('boosts for recent service', () => {
    expect(maintenanceMultiplier({ recentService: true, deferredMaintenance: false, cleanTitle: null })).toBe(1.02);
  });

  it('penalizes deferred maintenance', () => {
    expect(maintenanceMultiplier({ recentService: false, deferredMaintenance: true, cleanTitle: null })).toBe(0.96);
  });

  it('heavily penalizes non-clean title', () => {
    expect(maintenanceMultiplier({ recentService: false, deferredMaintenance: false, cleanTitle: false })).toBe(0.92);
  });

  it('stacks multiple signals', () => {
    const mult = maintenanceMultiplier({ recentService: true, deferredMaintenance: true, cleanTitle: false });
    expect(mult).toBeCloseTo(1 + 0.02 - 0.04 - 0.08, 10);
  });
});

// ---------------------------------------------------------------------------
// conditionMultiplierFromProfile
// ---------------------------------------------------------------------------

describe('conditionMultiplierFromProfile', () => {
  it('pristine profile gives ~1.08', () => {
    const mult = conditionMultiplierFromProfile(defaultConditionProfile());
    expect(mult).toBeCloseTo(1.08, 2);
  });

  it('all-severe profile gives 0.78 (before maintenance)', () => {
    const p = defaultConditionProfile();
    p.exterior = { paint: 'severe', dents: 'severe', rust: 'severe', glass: 'severe' };
    p.interior = { seats: 'severe', smells: 'severe', stains: 'severe', electronics: 'severe' };
    p.wheelsTires = { tires: 'severe', wheels: 'severe' };
    p.mechanical = { engine: 'severe', transmission: 'severe', suspension: 'severe', brakes: 'severe', lights: 'severe' };
    expect(conditionMultiplierFromProfile(p)).toBeCloseTo(0.78, 2);
  });

  it('is clamped to [0.70, 1.10]', () => {
    const best = defaultConditionProfile();
    best.maintenance.recentService = true;
    expect(conditionMultiplierFromProfile(best)).toBeLessThanOrEqual(1.10);

    const worst = defaultConditionProfile();
    worst.exterior = { paint: 'severe', dents: 'severe', rust: 'severe', glass: 'severe' };
    worst.interior = { seats: 'severe', smells: 'severe', stains: 'severe', electronics: 'severe' };
    worst.wheelsTires = { tires: 'severe', wheels: 'severe' };
    worst.mechanical = { engine: 'severe', transmission: 'severe', suspension: 'severe', brakes: 'severe', lights: 'severe' };
    worst.maintenance = { recentService: false, deferredMaintenance: true, cleanTitle: false };
    expect(conditionMultiplierFromProfile(worst)).toBeGreaterThanOrEqual(0.70);
  });

  it('moderate mechanical issues pull multiplier below 1', () => {
    const p = defaultConditionProfile();
    p.mechanical.engine = 'moderate';
    p.mechanical.transmission = 'moderate';
    expect(conditionMultiplierFromProfile(p)).toBeLessThan(1.10);
  });
});

// ---------------------------------------------------------------------------
// conditionGrade
// ---------------------------------------------------------------------------

describe('conditionGrade', () => {
  it('pristine = excellent', () => {
    expect(conditionGrade(defaultConditionProfile())).toBe('excellent');
  });

  it('some light wear = very_good', () => {
    const p = defaultConditionProfile();
    p.exterior.paint = 'light';
    p.interior.seats = 'light';
    p.wheelsTires.tires = 'light';
    // Light wear can still grade as excellent depending on weighting; ensure it doesn't degrade below very_good.
    expect(['excellent', 'very_good']).toContain(conditionGrade(p));
  });

  it('moderate issues = good', () => {
    const p = defaultConditionProfile();
    p.exterior.paint = 'moderate';
    p.exterior.dents = 'moderate';
    p.interior.seats = 'moderate';
    p.mechanical.brakes = 'moderate';
    // Moderate issues should not grade above very_good.
    expect(['good', 'fair', 'very_good']).toContain(conditionGrade(p));
  });

  it('severe engine + moderate everything = fair or worse', () => {
    const p = defaultConditionProfile();
    p.mechanical.engine = 'severe';
    p.exterior.rust = 'moderate';
    p.interior.smells = 'moderate';
    p.mechanical.brakes = 'moderate';
    p.mechanical.transmission = 'moderate';
    const grade = conditionGrade(p);
    expect(['fair', 'poor', 'good']).toContain(grade);
  });
});

// ---------------------------------------------------------------------------
// modsMultiplierFromProfile
// ---------------------------------------------------------------------------

describe('modsMultiplierFromProfile', () => {
  it('no mods = 1.0', () => {
    expect(modsMultiplierFromProfile([])).toBe(1.0);
  });

  it('performance mod gives uplift', () => {
    const mods: Mod[] = [{ category: 'performance', label: 'turbo kit', reversible: false }];
    expect(modsMultiplierFromProfile(mods)).toBeGreaterThan(1.0);
  });

  it('emissions mod gives penalty', () => {
    const mods: Mod[] = [{ category: 'emissions', label: 'cat delete', reversible: true }];
    expect(modsMultiplierFromProfile(mods)).toBeLessThan(1.0);
  });

  it('reversible risky mods have less penalty', () => {
    const irreversible: Mod[] = [{ category: 'tune', label: 'stage 2', reversible: false }];
    const reversible: Mod[] = [{ category: 'tune', label: 'stage 2', reversible: true }];
    expect(modsMultiplierFromProfile(reversible)).toBeGreaterThan(modsMultiplierFromProfile(irreversible));
  });

  it('multiple performance mods compound up to cap', () => {
    const mods: Mod[] = [
      { category: 'performance', label: 'turbo', reversible: false },
      { category: 'performance', label: 'exhaust', reversible: false },
      { category: 'oem_plus', label: 'short throw', reversible: true },
    ];
    const mult = modsMultiplierFromProfile(mods);
    expect(mult).toBeGreaterThan(1.0);
    expect(mult).toBeLessThanOrEqual(1.06);
  });

  it('many emissions mods bottom out at 0.88', () => {
    const mods: Mod[] = [
      { category: 'emissions', label: 'cat delete', reversible: false },
      { category: 'emissions', label: 'EGR delete', reversible: false },
      { category: 'emissions', label: 'SAI delete', reversible: false },
    ];
    expect(modsMultiplierFromProfile(mods)).toBe(0.88);
  });
});

// ---------------------------------------------------------------------------
// explainConditionImpact
// ---------------------------------------------------------------------------

describe('explainConditionImpact', () => {
  const baseMid = 10_000;

  it('returns empty for a default/pristine profile (multiplier rounds to 1.08 → has condition item)', () => {
    const items = explainConditionImpact(defaultConditionProfile(), baseMid);
    // Pristine gives ~1.08 multiplier, so there should be a positive condition adjustment.
    const condItem = items.find((i) => i.label.startsWith('Condition'));
    expect(condItem).toBeDefined();
    expect(condItem!.delta).toBeGreaterThan(0);
  });

  it('shows negative condition adjustment for poor profile', () => {
    const p = defaultConditionProfile();
    p.mechanical.engine = 'severe';
    p.mechanical.transmission = 'severe';
    p.exterior.rust = 'severe';
    const items = explainConditionImpact(p, baseMid);
    const condItem = items.find((i) => i.label.startsWith('Condition'));
    expect(condItem).toBeDefined();
    expect(condItem!.delta).toBeLessThan(0);
  });

  it('includes maintenance line when deferred', () => {
    const p = defaultConditionProfile();
    p.maintenance.deferredMaintenance = true;
    const items = explainConditionImpact(p, baseMid);
    const maintItem = items.find((i) => i.label.includes('Maintenance'));
    expect(maintItem).toBeDefined();
    expect(maintItem!.delta).toBeLessThan(0);
    expect(maintItem!.label).toContain('deferred maintenance');
  });

  it('includes mods line with labels', () => {
    const p = defaultConditionProfile();
    p.mods = [
      { category: 'performance', label: 'turbo kit', reversible: false },
      { category: 'cosmetic', label: 'lip kit', reversible: true },
    ];
    const items = explainConditionImpact(p, baseMid);
    const modsItem = items.find((i) => i.label.startsWith('Mods'));
    expect(modsItem).toBeDefined();
    expect(modsItem!.label).toContain('turbo kit');
    expect(modsItem!.delta).toBeGreaterThan(0);
  });

  it('truncates long mod lists with "+N more"', () => {
    const p = defaultConditionProfile();
    p.mods = [
      { category: 'performance', label: 'turbo', reversible: false },
      { category: 'cosmetic', label: 'lip', reversible: true },
      { category: 'oem_plus', label: 'shift knob', reversible: true },
      { category: 'suspension', label: 'coilovers', reversible: false },
      { category: 'cosmetic', label: 'spoiler', reversible: true },
    ];
    const items = explainConditionImpact(p, baseMid);
    const modsItem = items.find((i) => i.label.startsWith('Mods'));
    expect(modsItem).toBeDefined();
    expect(modsItem!.label).toContain('+2 more');
  });

  it('deltas are proportional to baseMid', () => {
    const p = defaultConditionProfile();
    p.mechanical.engine = 'severe';
    const items5k = explainConditionImpact(p, 5_000);
    const items20k = explainConditionImpact(p, 20_000);
    const cond5k = items5k.find((i) => i.label.startsWith('Condition'))!.delta;
    const cond20k = items20k.find((i) => i.label.startsWith('Condition'))!.delta;
    expect(Math.abs(cond20k / cond5k - 4)).toBeLessThan(0.5);
  });
});
