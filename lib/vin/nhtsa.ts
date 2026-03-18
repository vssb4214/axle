const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

export type NhtsaDecodeResult = {
  make?: string;
  model?: string;
  trim?: string;
  modelYear?: number;
  bodyClass?: string;
  vehicleType?: string;
  driveType?: string;
  engineCylinders?: number;
  engineDisplacementL?: number;
  fuelTypePrimary?: string;
  transmissionStyle?: string;
  errorText?: string;
};

function pickValue(items: any[], variable: string): string | undefined {
  const hit = items.find((x) => String(x?.Variable).toLowerCase() === variable.toLowerCase());
  const v = hit?.Value;
  if (!v || typeof v !== 'string') return undefined;
  const s = v.trim();
  return s && s !== 'Not Applicable' ? s : undefined;
}

export async function decodeVinNhtsa(vin: string): Promise<NhtsaDecodeResult> {
  const clean = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(clean)) {
    return { errorText: 'Invalid VIN format' };
  }

  const url = `${NHTSA_BASE}/DecodeVin/${encodeURIComponent(clean)}?format=json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    return { errorText: `NHTSA request failed (${res.status})` };
  }

  const json = (await res.json()) as any;
  const results = Array.isArray(json?.Results) ? json.Results : [];

  const modelYearStr = pickValue(results, 'Model Year');
  const modelYear = modelYearStr ? Number(modelYearStr) : undefined;

  const engineDisp = pickValue(results, 'Displacement (L)');
  const engineDisplacementL = engineDisp ? Number(engineDisp) : undefined;

  const cylStr = pickValue(results, 'Engine Number of Cylinders');
  const engineCylinders = cylStr ? Number(cylStr) : undefined;

  const errorText = pickValue(results, 'Error Text');

  return {
    make: pickValue(results, 'Make'),
    model: pickValue(results, 'Model'),
    trim: pickValue(results, 'Trim'),
    modelYear: Number.isFinite(modelYear) ? modelYear : undefined,
    bodyClass: pickValue(results, 'Body Class'),
    vehicleType: pickValue(results, 'Vehicle Type'),
    driveType: pickValue(results, 'Drive Type'),
    engineCylinders: Number.isFinite(engineCylinders) ? engineCylinders : undefined,
    engineDisplacementL: Number.isFinite(engineDisplacementL) ? engineDisplacementL : undefined,
    fuelTypePrimary: pickValue(results, 'Fuel Type - Primary'),
    transmissionStyle: pickValue(results, 'Transmission Style'),
    errorText
  };
}
