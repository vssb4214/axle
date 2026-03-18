import { NextResponse } from 'next/server';
import { decodeVinNhtsa } from '@/lib/vin/nhtsa';
import { vehicleKeyFromDecode } from '@/lib/vin/vehicleKey';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vin = searchParams.get('vin') || '';

  const data = await decodeVinNhtsa(vin);
  const vehicleKey = data.errorText && !data.make ? null : vehicleKeyFromDecode(data);
  return NextResponse.json({ ok: !data.errorText, vin: vin.trim().toUpperCase(), data, vehicleKey });
}
