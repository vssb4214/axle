import { ollamaChatJSON } from './client';

export type ExtractedIssueCode =
  | 'tires'
  | 'brakes'
  | 'clutch'
  | 'windshield'
  | 'head_light'
  | 'tail_light'
  | 'heavy_paint'
  | 'minor_paint'
  | 'convertible_top'
  | 'door_card'
  | 'window_regulator'
  | 'interior_refresh'
  | 'major_mech'
  | 'rust_severe'
  | 'title_structural';

export type ExtractedIssues = {
  issues: {
    code: ExtractedIssueCode;
    phrase: string;
    confidence: number; // 0..1
  }[];
};

const issueCache = new Map<string, { at: number; value: ExtractedIssues | null }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function extractIssuesFromText(rawText: string): Promise<ExtractedIssues | null> {
  const key = rawText.trim().toLowerCase();
  if (key) {
    const hit = issueCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  }

  const systemPrompt = `
You convert free-form car wear/issues text into a small set of standardized issue codes for valuation.

Return ONLY valid JSON:
{
  "issues": [
    { "code": <issue_code>, "phrase": <short phrase>, "confidence": <0..1> }
  ]
}

Allowed issue_code values:
tires, brakes, clutch, windshield, head_light, tail_light, heavy_paint, minor_paint, convertible_top,
door_card, window_regulator, interior_refresh, major_mech, rust_severe, title_structural.

Rules:
- Only include issues that are explicitly stated or strongly implied by the text.
- Prefer the closest allowed code (e.g. "cracked headlight" -> head_light).
- Keep phrase short (2-8 words).
- confidence must be a number between 0 and 1.
- If nothing actionable is present, return { "issues": [] }.
`;

  const userPrompt = `Text:\n${rawText.slice(0, 1200)}`;

  try {
    const out = await ollamaChatJSON<ExtractedIssues>({
      model: 'extraction',
      systemPrompt,
      userPrompt
    });

    const issues = Array.isArray(out.issues) ? out.issues : [];
    const value: ExtractedIssues = {
      issues: issues
        .filter((i) => i && typeof i.code === 'string')
        .map((i) => ({
          code: i.code as ExtractedIssueCode,
          phrase: typeof i.phrase === 'string' ? i.phrase : '',
          confidence: typeof i.confidence === 'number' ? i.confidence : 0.5
        }))
    };
    if (key) issueCache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    if (key) issueCache.set(key, { at: Date.now(), value: null });
    return null;
  }
}

