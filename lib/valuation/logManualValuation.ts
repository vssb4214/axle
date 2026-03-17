import { supabaseAdmin } from '@/lib/db/admin';
import { getCarSegment } from './segments';
import type { ValuationResult } from './types';

type ManualValuationInsert = {
  user_id: string | null;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  mileage: number;
  condition?: string | null;
  transmission?: string | null;
  color?: string | null;
  mods?: string | null;
  wear?: string | null;
  city?: string | null;
  state?: string | null;
  value_low: number;
  value_mid: number;
  value_high: number;
  confidence: number;
  comp_count: number;
  segment: string;
};

export async function logManualValuation(input: {
  user_id: string | null;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  mileage: number;
  condition?: string | null;
  transmission?: string | null;
  color?: string | null;
  mods?: string | null;
  wear?: string | null;
  city?: string | null;
  state?: string | null;
  valuation: ValuationResult;
}): Promise<{ id: string } | null> {
  try {
    const segment = getCarSegment(input.make, input.model);

    const row: ManualValuationInsert = {
      user_id: input.user_id,
      year: input.year,
      make: input.make,
      model: input.model,
      trim: input.trim ?? null,
      mileage: input.mileage,
      condition: input.condition ?? null,
      transmission: input.transmission ?? null,
      color: input.color ?? null,
      mods: input.mods ?? null,
      wear: input.wear ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      value_low: input.valuation.value_low,
      value_mid: input.valuation.value_mid,
      value_high: input.valuation.value_high,
      confidence: input.valuation.confidence,
      comp_count: input.valuation.comp_count,
      segment
    };

    const { data, error } = await supabaseAdmin
      .from('manual_valuations')
      .insert(row)
      .select('id')
      .single();

    if (error || !data?.id) return null;
    return { id: data.id };
  } catch {
    // Never break the page.
    return null;
  }
}

