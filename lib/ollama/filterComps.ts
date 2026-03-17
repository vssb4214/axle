import { ollamaChatJSON } from './client';
import type { NormalizedComp } from '@/lib/valuation/types';

type Resp = { keep_indices: number[] };

const cache = new Map<string, { at: number; keep: number[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function keyFor(listingTitle: string, comps: NormalizedComp[]): string {
  const compSig = comps
    .slice(0, 30)
    .map((c) => `${c.year ?? ''} ${c.make ?? ''} ${c.model ?? ''} ${c.trim ?? ''} ${c.source_title ?? ''}`.trim())
    .join('|')
    .toLowerCase();
  return `${listingTitle.toLowerCase()}|${compSig}`;
}

export async function ollamaFilterCompatibleComps(input: {
  listingTitle: string;
  listingTrim: string | null;
  comps: NormalizedComp[];
}): Promise<number[] | null> {
  const k = keyFor(input.listingTitle, input.comps);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.keep;

  const compsList = input.comps.slice(0, 30).map((c, i) => {
    const title = `${c.year ?? ''} ${c.make ?? ''} ${c.model ?? ''} ${c.trim ?? ''}`.trim();
    return `${i}: ${title} | ${c.source_title ?? ''}`;
  }).join('\n');

  const systemPrompt = `
You are filtering car comparables for valuation. Keep comps that are the same underlying variant as the listing.

Important:
- Do NOT filter by seating count wording (e.g. "7-passenger") unless it indicates a special conversion.
- DO filter out different engine/displacement variants when it changes the model meaningfully (e.g. BMW Z4 2.5 vs 3.0; BMW Z3 1.9 vs 2.8; Lexus SC300 vs SC400).
- If the listing trim implies displacement (e.g. "3.0", "2.5i", "SC400"), only keep comps matching that displacement family.
- DO filter out special conversions that massively change price (mobility / wheelchair / accessibility conversions).

Return ONLY JSON: { "keep_indices": number[] } where indices refer to the provided list.
If unsure, keep more rather than fewer, but remove clearly incompatible variants.
`;

  const userPrompt = `Listing: ${input.listingTitle}${input.listingTrim ? ` (trim: ${input.listingTrim})` : ''}

Comps:
${compsList}
`;

  try {
    const out = await ollamaChatJSON<Resp>({ model: 'extraction', systemPrompt, userPrompt });
    const keep = Array.isArray(out.keep_indices)
      ? out.keep_indices.filter((n) => Number.isInteger(n) && n >= 0 && n < Math.min(30, input.comps.length))
      : [];
    const uniq = [...new Set(keep)];
    const final = uniq.length > 0 ? uniq : null;
    cache.set(k, { at: Date.now(), keep: final ?? [] });
    return final;
  } catch {
    return null;
  }
}

