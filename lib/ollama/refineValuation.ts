import { ollamaChatJSON } from './client';
import type { NormalizedComp, ValuationResult } from '@/lib/valuation/types';

type ListingForRefine = {
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
};

type LLMRefinement = {
  value_low: number;
  value_mid: number;
  value_high: number;
  confidence: number;
  key_factors: string[];
  reasoning: string;
};

/**
 * Uses the LLM to refine the valuation within strict bounds. The model can narrow the range,
 * adjust mid within [min(comps), max(comps)], and add factors based on qualitative reasoning.
 * Requires OLLAMA_BASE_URL and a reasoning model (e.g. llama3.1) to be configured.
 */
export async function ollamaRefineValuation(
  listing: ListingForRefine,
  comps: NormalizedComp[],
  base: ValuationResult
): Promise<ValuationResult | null> {
  const compsList = comps
    .slice(0, 15)
    .map(
      (c) =>
        `${c.year} ${c.make} ${c.model}${c.trim ? ` ${c.trim}` : ''} — $${c.asking_price ?? '?'} @ ${c.mileage ?? '?'} mi, ${c.condition ?? '?'}${c.state ? `, ${c.state}` : ''}`
    )
    .join('\n');

  const absoluteMin = Math.min(base.value_low, ...comps.map((c) => c.asking_price ?? 0).filter(Boolean));
  const absoluteMax = Math.max(base.value_high, ...comps.map((c) => c.asking_price ?? 0).filter(Boolean));
  const boundsMin = Math.max(0, Math.floor(absoluteMin * 0.85));
  const boundsMax = Math.ceil(absoluteMax * 1.15);

  const systemPrompt = `You are a precise car valuation expert. You will receive:
1) A listing (year, make, model, trim, mileage, condition, transmission, color, mods, wear/issues, location)
2) Comparable sales/listings with prices and mileage
3) A baseline valuation range (value_low, value_mid, value_high) from a formula.

Your job: Refine the valuation to be more accurate. You MUST:
- Keep value_low, value_mid, value_high within the allowed bounds (${boundsMin} to ${boundsMax}). Do not invent numbers outside this range.
- value_low must be <= value_mid <= value_high.
- Consider: mileage consistency for this type of car (sports cars punish high miles more; trucks hold value), trim rarity, condition vs comps, transmission premium/discount, color desirability, regional demand, mods (positive for desirable, negative for questionable), and wear/issues (needed tires, clear coat, convertible top, etc.).
- Output confidence between 0.3 and 0.95 based on comp quality and how well they match the listing.
- Add 2-5 short key_factors explaining what drove your refinement (e.g. "Comps cluster lower; listing condition excellent so mid at upper end.").
- reasoning: 1-2 sentences on why this range is accurate.

Respond with ONLY valid JSON: { "value_low": number, "value_mid": number, "value_high": number, "confidence": number, "key_factors": string[], "reasoning": string }. No other text.`;

  const userPrompt = `Listing: ${listing.year} ${listing.make} ${listing.model}${listing.trim ? ` ${listing.trim}` : ''}, ${listing.mileage.toLocaleString()} mi, condition: ${listing.condition ?? 'unknown'}${listing.transmission ? `, transmission: ${listing.transmission}` : ''}${listing.color ? `, color: ${listing.color}` : ''}${listing.mods ? `, mods: ${listing.mods}` : ''}${listing.wear ? `, wear/issues: ${listing.wear}` : ''}${listing.city || listing.state ? `, ${[listing.city, listing.state].filter(Boolean).join(', ')}` : ''}

Baseline valuation: low=${base.value_low}, mid=${base.value_mid}, high=${base.value_high}, confidence=${base.confidence}

Comparables:
${compsList}

Return refined value_low, value_mid, value_high (within ${boundsMin}-${boundsMax}), confidence, key_factors, and reasoning as JSON only.`;

  try {
    const out = await ollamaChatJSON<LLMRefinement>({
      model: 'reasoning',
      systemPrompt,
      userPrompt
    });

    const low = Math.max(boundsMin, Math.min(boundsMax, Math.round(out.value_low)));
    const high = Math.max(boundsMin, Math.min(boundsMax, Math.round(out.value_high)));
    const mid = Math.max(low, Math.min(high, Math.round(out.value_mid)));
    const confidence = Math.max(0.3, Math.min(0.95, out.confidence));
    const key_factors = Array.isArray(out.key_factors) ? out.key_factors.slice(0, 6) : [out.reasoning || 'LLM refined range.'];

    return {
      value_low: low,
      value_mid: mid,
      value_high: high,
      confidence,
      comp_count: base.comp_count,
      key_factors: [...key_factors],
      llm_refined: true
    };
  } catch {
    return null;
  }
}
