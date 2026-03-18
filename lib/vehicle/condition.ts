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
