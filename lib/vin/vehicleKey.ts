import type { NhtsaDecodeResult } from './nhtsa';

/**
 * A normalized composite key that uniquely identifies a vehicle variant
 * for comps-matching purposes. Built from NHTSA VIN decode data.
 *
 * Format: "make|model|trim|year|engine|drivetrain"
 * All segments are lowercased and whitespace-collapsed.
 * Missing segments are empty strings between delimiters.
 */
export type VehicleKey = string;

export type VehicleKeyParts = {
  make: string;
  model: string;
  trim: string;
  year: number | null;
  engine: string;
  drivetrain: string;
};

function tok(s: string | undefined | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeEngine(decoded: NhtsaDecodeResult): string {
  const parts: string[] = [];

  if (decoded.engineDisplacementL != null && Number.isFinite(decoded.engineDisplacementL)) {
    parts.push(`${decoded.engineDisplacementL.toFixed(1)}l`);
  }

  if (decoded.engineCylinders != null && Number.isFinite(decoded.engineCylinders)) {
    const n = decoded.engineCylinders;
    if (n === 4) parts.push('i4');
    else if (n === 6) parts.push('i6');
    else if (n === 8) parts.push('v8');
    else if (n === 10) parts.push('v10');
    else if (n === 12) parts.push('v12');
    else parts.push(`${n}cyl`);
  }

  if (decoded.fuelTypePrimary) {
    const f = tok(decoded.fuelTypePrimary);
    if (f.includes('electric')) parts.push('ev');
    else if (f.includes('diesel')) parts.push('diesel');
    else if (f.includes('flex') || f.includes('e85')) parts.push('flex');
    else if (f.includes('hybrid')) parts.push('hybrid');
  }

  if (decoded.transmissionStyle) {
    const t = tok(decoded.transmissionStyle);
    if (t.includes('manual')) parts.push('mt');
    else if (t.includes('cvt') || t.includes('continuously')) parts.push('cvt');
    else if (t.includes('dual') || t.includes('dct')) parts.push('dct');
    else if (t.includes('auto')) parts.push('at');
  }

  return parts.join('-');
}

function normalizeDrivetrain(decoded: NhtsaDecodeResult): string {
  const raw = tok(decoded.driveType);
  if (!raw) return '';
  if (/\b(awd|all\s*wheel)\b/.test(raw)) return 'awd';
  if (/\b(4wd|4x4|four\s*wheel)\b/.test(raw)) return '4wd';
  if (/\b(fwd|front\s*wheel)\b/.test(raw)) return 'fwd';
  if (/\b(rwd|rear\s*wheel)\b/.test(raw)) return 'rwd';
  return raw.replace(/\s+/g, '-');
}

/**
 * Derive structured key parts from NHTSA VIN decode output.
 */
export function deriveVehicleKeyParts(decoded: NhtsaDecodeResult): VehicleKeyParts {
  return {
    make: tok(decoded.make),
    model: tok(decoded.model),
    trim: tok(decoded.trim),
    year: decoded.modelYear != null && Number.isFinite(decoded.modelYear) ? decoded.modelYear : null,
    engine: normalizeEngine(decoded),
    drivetrain: normalizeDrivetrain(decoded),
  };
}

/**
 * Build the composite vehicleKey string from parts.
 */
export function buildVehicleKey(parts: VehicleKeyParts): VehicleKey {
  return [
    parts.make,
    parts.model,
    parts.trim,
    parts.year != null ? String(parts.year) : '',
    parts.engine,
    parts.drivetrain,
  ].join('|');
}

/**
 * One-shot: decode result → vehicleKey string.
 */
export function vehicleKeyFromDecode(decoded: NhtsaDecodeResult): VehicleKey {
  return buildVehicleKey(deriveVehicleKeyParts(decoded));
}

/**
 * Parse a vehicleKey string back into its constituent parts.
 */
export function parseVehicleKey(key: VehicleKey): VehicleKeyParts {
  const [make = '', model = '', trim = '', yearStr = '', engine = '', drivetrain = ''] = key.split('|');
  const year = yearStr ? Number(yearStr) : null;
  return { make, model, trim, year: Number.isFinite(year) ? year : null, engine, drivetrain };
}

/**
 * Score how well two vehicleKeys match. Returns 0-1 where 1 = perfect match.
 * Used for ranking/filtering comps against a VIN-decoded subject vehicle.
 */
export function vehicleKeyMatchScore(subjectKey: VehicleKey, compKey: VehicleKey): number {
  const s = parseVehicleKey(subjectKey);
  const c = parseVehicleKey(compKey);

  let score = 0;
  let weight = 0;

  // Make: required match
  weight += 3;
  if (s.make && c.make && s.make === c.make) score += 3;
  else if (s.make && c.make && (s.make.includes(c.make) || c.make.includes(s.make))) score += 2;

  // Model: required match
  weight += 3;
  if (s.model && c.model && s.model === c.model) score += 3;
  else if (s.model && c.model && (s.model.includes(c.model) || c.model.includes(s.model))) score += 2;

  // Year: close is fine
  weight += 2;
  if (s.year != null && c.year != null) {
    const diff = Math.abs(s.year - c.year);
    if (diff === 0) score += 2;
    else if (diff <= 2) score += 1.5;
    else if (diff <= 4) score += 1;
  }

  // Trim
  weight += 1.5;
  if (s.trim && c.trim) {
    if (s.trim === c.trim) score += 1.5;
    else if (s.trim.includes(c.trim) || c.trim.includes(s.trim)) score += 1;
  } else if (!s.trim && !c.trim) {
    score += 1;
  }

  // Engine: important for variant matching
  weight += 2;
  if (s.engine && c.engine) {
    if (s.engine === c.engine) score += 2;
    else {
      const sTokens = new Set(s.engine.split('-'));
      const cTokens = new Set(c.engine.split('-'));
      let overlap = 0;
      for (const t of sTokens) if (cTokens.has(t)) overlap++;
      score += Math.min(2, (overlap / Math.max(sTokens.size, cTokens.size)) * 2);
    }
  } else if (!s.engine && !c.engine) {
    score += 1;
  }

  // Drivetrain
  weight += 1;
  if (s.drivetrain && c.drivetrain) {
    if (s.drivetrain === c.drivetrain) score += 1;
    else if (
      (s.drivetrain === 'awd' && c.drivetrain === '4wd') ||
      (s.drivetrain === '4wd' && c.drivetrain === 'awd')
    ) {
      score += 0.7;
    }
  } else if (!s.drivetrain && !c.drivetrain) {
    score += 0.5;
  }

  return weight > 0 ? score / weight : 0;
}

/**
 * Build a vehicleKey from user-provided fields (without VIN decode).
 * Useful as a fallback when no VIN is available.
 */
export function vehicleKeyFromFields(fields: {
  make: string;
  model: string;
  trim?: string | null;
  year?: number | null;
}): VehicleKey {
  return buildVehicleKey({
    make: tok(fields.make),
    model: tok(fields.model),
    trim: tok(fields.trim),
    year: fields.year ?? null,
    engine: '',
    drivetrain: '',
  });
}
