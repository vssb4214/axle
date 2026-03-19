import { NextResponse } from 'next/server';
import { decodeVinNhtsa } from '@/lib/vin/nhtsa';
import { vehicleKeyFromDecode } from '@/lib/vin/vehicleKey';

function hasDecodeError(errorText?: string): boolean {
  if (!errorText) return false;
  // NHTSA often returns "0 - VIN decoded clean..." in Error Text on success.
  return !/^0\b/.test(errorText.trim());
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawVin = searchParams.get('vin') || '';
  const vin = rawVin.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!vin) {
    return NextResponse.json(
      { ok: false, vin, error: 'VIN is required.' },
      { status: 400 }
    );
  }

  try {
    const decoded = await decodeVinNhtsa(vin);
    const hasCore = Boolean(decoded.make && decoded.model && decoded.modelYear);
    const decodeErr = hasDecodeError(decoded.errorText);
    const vehicleKey = hasCore ? vehicleKeyFromDecode(decoded) : null;
    const ok = hasCore && !decodeErr;

    return NextResponse.json(
      {
        ok,
        vin,
        decoded,
        // Backward-compatibility for any older callers.
        data: decoded,
        vehicleKey,
        error: ok ? null : decoded.errorText ?? 'Could not decode VIN.'
      },
      { status: ok ? 200 : 422 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        vin,
        error: err instanceof Error ? err.message : 'VIN decode failed.'
      },
      { status: 502 }
    );
  }
}
