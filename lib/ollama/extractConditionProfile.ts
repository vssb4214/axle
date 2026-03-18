import { ollamaChatJSON } from './client';
import type { VehicleConditionProfile, Severity, ModRisk, Mod } from '@/lib/vehicle/condition';
import { defaultConditionProfile, normalizeSeverity } from '@/lib/vehicle/condition';

type RawProfile = {
  exterior?: { paint?: string; dents?: string; rust?: string; glass?: string };
  interior?: { seats?: string; smells?: string; stains?: string; electronics?: string };
  wheelsTires?: { tires?: string; wheels?: string };
  mechanical?: { engine?: string; transmission?: string; suspension?: string; brakes?: string; lights?: string };
  maintenance?: { recentService?: boolean; deferredMaintenance?: boolean; cleanTitle?: boolean | null };
  mods?: { category?: string; label?: string; reversible?: boolean | null }[];
};

const VALID_MOD_RISKS = new Set<ModRisk>([
  'oem_plus', 'cosmetic', 'performance', 'suspension', 'tune', 'emissions', 'unknown'
]);

function normalizeModRisk(s: unknown): ModRisk {
  const v = String(s ?? '').trim().toLowerCase();
  return VALID_MOD_RISKS.has(v as ModRisk) ? (v as ModRisk) : 'unknown';
}

function normSev(v: unknown): Severity {
  return normalizeSeverity(v);
}

function sanitize(raw: RawProfile): VehicleConditionProfile {
  const base = defaultConditionProfile();
  if (raw.exterior) {
    base.exterior.paint = normSev(raw.exterior.paint);
    base.exterior.dents = normSev(raw.exterior.dents);
    base.exterior.rust = normSev(raw.exterior.rust);
    base.exterior.glass = normSev(raw.exterior.glass);
  }
  if (raw.interior) {
    base.interior.seats = normSev(raw.interior.seats);
    base.interior.smells = normSev(raw.interior.smells);
    base.interior.stains = normSev(raw.interior.stains);
    base.interior.electronics = normSev(raw.interior.electronics);
  }
  if (raw.wheelsTires) {
    base.wheelsTires.tires = normSev(raw.wheelsTires.tires);
    base.wheelsTires.wheels = normSev(raw.wheelsTires.wheels);
  }
  if (raw.mechanical) {
    base.mechanical.engine = normSev(raw.mechanical.engine);
    base.mechanical.transmission = normSev(raw.mechanical.transmission);
    base.mechanical.suspension = normSev(raw.mechanical.suspension);
    base.mechanical.brakes = normSev(raw.mechanical.brakes);
    base.mechanical.lights = normSev(raw.mechanical.lights);
  }
  if (raw.maintenance) {
    base.maintenance.recentService = !!raw.maintenance.recentService;
    base.maintenance.deferredMaintenance = !!raw.maintenance.deferredMaintenance;
    base.maintenance.cleanTitle = raw.maintenance.cleanTitle ?? null;
  }
  if (Array.isArray(raw.mods)) {
    base.mods = raw.mods
      .filter((m) => m && typeof m.label === 'string' && m.label.trim())
      .map((m): Mod => ({
        category: normalizeModRisk(m.category),
        label: String(m.label).trim(),
        reversible: typeof m.reversible === 'boolean' ? m.reversible : null,
      }));
  }
  return base;
}

const cache = new Map<string, { at: number; value: VehicleConditionProfile | null }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function extractConditionProfile(input: {
  rawText: string;
  year: number;
  make: string;
  model: string;
}): Promise<VehicleConditionProfile | null> {
  const key = `cp|${input.year}|${input.make}|${input.model}|${input.rawText.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const systemPrompt = `
You extract a structured vehicle condition profile from free-form text.
Return ONLY valid JSON matching this schema:
{
  "exterior": { "paint": <severity>, "dents": <severity>, "rust": <severity>, "glass": <severity> },
  "interior": { "seats": <severity>, "smells": <severity>, "stains": <severity>, "electronics": <severity> },
  "wheelsTires": { "tires": <severity>, "wheels": <severity> },
  "mechanical": { "engine": <severity>, "transmission": <severity>, "suspension": <severity>, "brakes": <severity>, "lights": <severity> },
  "maintenance": { "recentService": <bool>, "deferredMaintenance": <bool>, "cleanTitle": <bool|null> },
  "mods": [{ "category": <mod_risk>, "label": <string>, "reversible": <bool|null> }]
}

severity values: "none", "light", "moderate", "severe"
mod_risk values: "oem_plus", "cosmetic", "performance", "suspension", "tune", "emissions", "unknown"

Rules:
- Only flag issues explicitly mentioned. Default unmentioned areas to "none".
- Be conservative: "light" for minor mentions, "severe" only for clear major problems.
- For mods, include each distinct modification mentioned.
- If overall condition is stated (e.g. "excellent", "fair"), map it to appropriate severities.
`;

  const userPrompt = `Car: ${input.year} ${input.make} ${input.model}
Text:
${input.rawText.slice(0, 1500)}`;

  try {
    const raw = await ollamaChatJSON<RawProfile>({ model: 'extraction', systemPrompt, userPrompt });
    const value = sanitize(raw);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    cache.set(key, { at: Date.now(), value: null });
    return null;
  }
}
