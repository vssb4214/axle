import { NextResponse } from 'next/server';
import { decodeVinNhtsa } from '@/lib/vin/nhtsa';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vin = searchParams.get('vin') || '';

  const data = await decodeVinNhtsa(vin);
  return NextResponse.json({ ok: !data.errorText, vin: vin.trim().toUpperCase(), data });
}
