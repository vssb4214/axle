import { ollamaChatJSON } from './client';

export type WearCostItem = {
  label: string;
  parts_cost: number; // USD
  labor_hours: number;
  category: 'safety' | 'mechanical' | 'cosmetic' | 'interior' | 'unknown';
  confidence: number; // 0..1
};

export type ExtractedWearCosts = {
  items: WearCostItem[];
};

const cache = new Map<string, { at: number; value: ExtractedWearCosts | null }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function extractWearCostsFromText(input: {
  rawText: string;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  segment: string;
}): Promise<ExtractedWearCosts | null> {
  const key = `v3|${input.year}|${input.make}|${input.model}|${input.trim ?? ''}|${input.segment}|${input.rawText.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const systemPrompt = `
You estimate conservative repair costs from free-form car wear/issues text.

Return ONLY valid JSON:
{
  "items": [
    {
      "label": <short label>,
      "parts_cost": <number USD>,
      "labor_hours": <number>,
      "category": <category>,
      "confidence": <0..1>
    }
  ]
}

Allowed category values:
safety, mechanical, cosmetic, interior, unknown.

Rules:
- Include every distinct issue explicitly mentioned, even if minor (missing trim pieces, missing mirrors, broken latches, etc.).
- Costs must be realistic for the specific car and segment; be conservative (avoid over-penalizing).
- parts_cost must be >= 0; labor_hours must be >= 0.
- If a range is plausible, pick a midpoint estimate.
- For missing or broken components ("missing mirror", "broken tail light"), prefer category "safety" or "mechanical" over "interior" so they count as immediate deductions.
- For fluid leaks (oil leak, transmission leak, pan leak, power steering leak), ALWAYS include an item and use category "mechanical".
- If the text says "oil pan leak" or "transmission pan leak", include distinct items (they can have different costs/labor).
- If nothing actionable, return { "items": [] }.
`;

  const userPrompt = `Car: ${input.year} ${input.make} ${input.model}${input.trim ? ` ${input.trim}` : ''} (segment: ${input.segment})
Text:
${input.rawText.slice(0, 1200)}`;

  try {
    const out = await ollamaChatJSON<ExtractedWearCosts>({
      model: 'extraction',
      systemPrompt,
      userPrompt
    });

    const items = Array.isArray(out.items) ? out.items : [];
    const value: ExtractedWearCosts = {
      items: items
        .filter((i) => i && typeof i.label === 'string')
        .map((i) => ({
          label: typeof i.label === 'string' ? i.label : '',
          parts_cost: typeof i.parts_cost === 'number' ? i.parts_cost : 0,
          labor_hours: typeof i.labor_hours === 'number' ? i.labor_hours : 0,
          category:
            i.category === 'safety' || i.category === 'mechanical' || i.category === 'cosmetic' || i.category === 'interior'
              ? i.category
              : 'unknown',
          confidence: typeof i.confidence === 'number' ? i.confidence : 0.5
        }))
    };

    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    cache.set(key, { at: Date.now(), value: null });
    return null;
  }
}

