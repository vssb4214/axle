import { ollamaChatJSON } from './client';
import type { NormalizedComp } from '@/lib/valuation/types';

/**
 * Extract structured listing data from raw scraped text using Ollama.
 * Use when a source gives you a block of text (e.g. title + description) and you need
 * year, make, model, mileage, price, etc. in a consistent format.
 */
export type ExtractedListing = {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  asking_price: number | null;
  city: string | null;
  state: string | null;
  condition: string | null;
};

export async function extractListingFromText(
  rawText: string,
  source: string,
  sourceUrl: string
): Promise<NormalizedComp | null> {
  const systemPrompt = `
You extract structured car listing data from raw text. Return ONLY valid JSON with these keys (use null if unknown):
year (number or null), make (string), model (string), trim (string or null), mileage (number or null),
asking_price (number or null), city (string or null), state (string or null), condition (string or null).
No other keys. Numbers must be integers.`;
  const userPrompt = `Extract from:\n${rawText.slice(0, 2000)}`;

  try {
    const out = await ollamaChatJSON<ExtractedListing>({
      model: 'extraction',
      systemPrompt,
      userPrompt
    });
    if (!out.make && !out.model) return null;
    return {
      source,
      source_url: sourceUrl,
      source_title: rawText.slice(0, 120),
      year: out.year,
      make: out.make,
      model: out.model,
      trim: out.trim,
      mileage: out.mileage,
      asking_price: out.asking_price,
      city: out.city,
      state: out.state,
      condition: out.condition,
      mods: null
    };
  } catch {
    return null;
  }
}
