import { supabaseAdmin } from '@/lib/db/admin';
import type { NormalizedComp } from './types';

type ValuationResult = {
  value_low: number;
  value_mid: number;
  value_high: number;
  confidence: number;
  comp_count: number;
  key_factors: string[];
};

export async function saveValuation(
  listingId: string,
  valuation: ValuationResult,
  comps: NormalizedComp[],
  summary: string | null,
  reasoning: string[],
  warnings: string[]
) {
  const { data: valuationRow } = await supabaseAdmin
    .from('valuations')
    .insert({
      listing_id: listingId,
      value_low: valuation.value_low,
      value_mid: valuation.value_mid,
      value_high: valuation.value_high,
      confidence: valuation.confidence,
      comp_count: valuation.comp_count,
      summary,
      reasoning_json: reasoning,
      warnings_json: warnings
    })
    .select('id')
    .single();

  if (!valuationRow) return;

  await supabaseAdmin.from('comparables').delete().eq('listing_id', listingId);

  if (comps.length > 0) {
    await supabaseAdmin.from('comparables').insert(
      comps.slice(0, 15).map((c) => ({
        listing_id: listingId,
        source: c.source,
        source_url: c.source_url,
        source_title: c.source_title ?? null,
        year: c.year,
        make: c.make,
        model: c.model,
        trim: c.trim,
        mileage: c.mileage,
        asking_price: c.asking_price,
        city: c.city,
        state: c.state,
        excerpt: c.source_title ?? null,
        normalized_data_json: c as unknown as object
      }))
    );
  }
}
