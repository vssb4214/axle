import Link from 'next/link';
import { collectComparableListings } from '@/lib/comps/fetchComps';
import { computeDeterministicValuation, computeFallbackValuation, filterComparableComps, type IssueCode } from '@/lib/valuation/engine';
import { getCarSegment } from '@/lib/valuation/segments';
import { ollamaExplainText } from '@/lib/ollama/client';
import { ollamaRefineValuation } from '@/lib/ollama/refineValuation';
import { extractIssuesFromText } from '@/lib/ollama/extractIssues';
import { extractWearCostsFromText } from '@/lib/ollama/extractWearCosts';
import { extractConditionProfile } from '@/lib/ollama/extractConditionProfile';
import { ollamaFilterCompatibleComps } from '@/lib/ollama/filterComps';
import { logManualValuation } from '@/lib/valuation/logManualValuation';
import { getCurrentUser } from '@/lib/auth/server';
import { decodeVinNhtsa } from '@/lib/vin/nhtsa';
import { vehicleKeyFromDecode } from '@/lib/vin/vehicleKey';
import { EvaluatorForm } from '@/components/evaluate/EvaluatorForm';
import { EvaluatorResults } from '@/components/evaluate/EvaluatorResults';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

type SearchParams = {
  vin?: string;
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: string;
  condition?: string;
  transmission?: string;
  color?: string;
  mods?: string;
  wear?: string;
  zip?: string;
};

export default async function EvaluatePage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const year = searchParams?.year ? parseInt(searchParams.year, 10) : 0;
  const vin = (searchParams?.vin ?? '').trim().toUpperCase();
  const make = (searchParams?.make ?? '').trim();
  const model = (searchParams?.model ?? '').trim();
  const mileage = searchParams?.mileage ? parseInt(searchParams.mileage, 10) : 0;

  const hasQuery = year > 0 && make && model && mileage > 0;

  let valuation: Awaited<ReturnType<typeof computeDeterministicValuation>> = null;
  let comps: Awaited<ReturnType<typeof collectComparableListings>>['comps'] = [];
  let compsUsedForValuation: Awaited<ReturnType<typeof collectComparableListings>>['comps'] = [];
  let errors: Awaited<ReturnType<typeof collectComparableListings>>['errors'] = [];
  let explanation: { summary: string; bullets: string[]; warnings: string[] } | null = null;

  if (hasQuery) {
    const query = {
      year,
      make,
      model,
      trim: searchParams?.trim?.trim() || null,
      mileage,
      city: null,
      state: null,
      zip: searchParams?.zip?.trim() || null,
      radius_miles: null
    };
    try {
      const compResult = await collectComparableListings(query);
      comps = compResult.comps;
      errors = compResult.errors;
    } catch {
      comps = [];
      errors = [{ source: 'system', message: 'Could not fetch comparables.' }];
    }

    const listingInput = {
      year,
      make,
      model,
      trim: searchParams?.trim?.trim() || null,
      mileage,
      city: null,
      state: null,
      condition: searchParams?.condition?.trim() || null,
      transmission: searchParams?.transmission?.trim() || null,
      color: searchParams?.color?.trim() || null,
      mods: searchParams?.mods?.trim() || null,
      wear: searchParams?.wear?.trim() || null,
      wear_issues: null as null | IssueCode[],
      wear_costs: null as null | { label: string; parts_cost: number; labor_hours: number; category: string }[],
      conditionProfile: null as null | Awaited<ReturnType<typeof extractConditionProfile>>,
      vehicleKey: null as string | null
    };

    if (vin) {
      try {
        const decoded = await withTimeout(decodeVinNhtsa(vin), 1800);
        if (decoded?.make && decoded?.model && decoded?.modelYear) {
          listingInput.vehicleKey = vehicleKeyFromDecode(decoded);
        }
      } catch {
        // VIN decode is optional; fall back to non-VIN matching.
      }
    }

    // Optional: use Ollama extraction model to map arbitrary wear text into standardized issues.
    // This keeps behavior robust even when regex rules don't cover a phrase like "cracked head light".
    if (listingInput.wear) {
      try {
        const parsed = await withTimeout(extractIssuesFromText(listingInput.wear), 1500);
        const codes = (parsed?.issues?.map((i) => i.code).filter(Boolean) ?? []) as IssueCode[];
        listingInput.wear_issues = codes.length > 0 ? codes : null;
      } catch {
        listingInput.wear_issues = null;
      }
    }

    // Optional: have the LLM estimate parts + labor hours per issue for this car.
    // Engine will clamp costs to avoid hallucinated extremes.
    if (listingInput.wear) {
      try {
        const segment = getCarSegment(make, model);
        const parsed = await withTimeout(
          extractWearCostsFromText({
            rawText: listingInput.wear,
            year,
            make,
            model,
            trim: listingInput.trim,
            segment
          }),
          2000
        );
        const items =
          parsed?.items
            ?.filter((i) => i && i.label)
            .map((i) => ({
              label: i.label,
              parts_cost: i.parts_cost,
              labor_hours: i.labor_hours,
              category: i.category
            })) ?? [];
        listingInput.wear_costs = items.length > 0 ? items : null;
      } catch {
        listingInput.wear_costs = null;
      }
    }

    // Extract structured condition profile from combined condition/wear/mods text.
    const profileText = [
      listingInput.condition ? `Overall condition: ${listingInput.condition}` : '',
      listingInput.wear ? `Wear/issues: ${listingInput.wear}` : '',
      listingInput.mods ? `Modifications: ${listingInput.mods}` : '',
    ].filter(Boolean).join('\n');

    if (profileText) {
      try {
        const profile = await withTimeout(
          extractConditionProfile({ rawText: profileText, year, make, model }),
          2000
        );
        if (profile) listingInput.conditionProfile = profile;
      } catch {
        // Profile extraction is optional; fall back to string-based scoring.
      }
    }

    let baseValuation = computeDeterministicValuation(listingInput, comps) ?? computeFallbackValuation(listingInput);
    compsUsedForValuation = comps.length > 0 ? filterComparableComps(listingInput, comps) : [];

    // Optional: let the LLM decide which comps are the same variant (engine/displacement/package),
    // to avoid hardcoding model-specific rules.
    if (compsUsedForValuation.length >= 6) {
      try {
        const title = `${year} ${make} ${model}${listingInput.trim ? ` ${listingInput.trim}` : ''}`.trim();
        const keep = await withTimeout(
          ollamaFilterCompatibleComps({
            listingTitle: title,
            listingTrim: listingInput.trim ?? null,
            comps: compsUsedForValuation
          }),
          1800
        );
        const minKeep = Math.max(3, Math.floor(compsUsedForValuation.length * 0.35));
        if (keep && keep.length >= minKeep) {
          compsUsedForValuation = keep.map((i) => compsUsedForValuation[i]!).filter(Boolean);
        }
      } catch {
        // ignore
      }
    }

    // If strict variant matching leaves us with very few comps, damp single-comp skew
    // by blending with formula fallback instead of trusting one listing too heavily.
    if (baseValuation && compsUsedForValuation.length > 0 && compsUsedForValuation.length < 3) {
      const fallback = computeFallbackValuation(listingInput);
      baseValuation = {
        ...baseValuation,
        value_low: Math.round(baseValuation.value_low * 0.7 + fallback.value_low * 0.3),
        value_mid: Math.round(baseValuation.value_mid * 0.7 + fallback.value_mid * 0.3),
        value_high: Math.round(baseValuation.value_high * 0.7 + fallback.value_high * 0.3),
        confidence: Math.max(0.25, Math.min(0.7, baseValuation.confidence * 0.85))
      };
    }

    if (baseValuation) {
      const compsSummary =
        compsUsedForValuation
          .slice(0, 10)
          .map(
            (c) =>
              `${c.year ?? ''} ${c.make ?? ''} ${c.model ?? ''} - $${c.asking_price ?? 'n/a'} @ ${c.mileage ?? 'n/a'} mi (${c.city ?? ''}, ${c.state ?? ''})`
          )
          .join('\n') || 'No comp details.';

      // Only attempt LLM refinement/explanation when we have real comps.
      if (compsUsedForValuation.length > 0) {
        const refinePromise = withTimeout(
          ollamaRefineValuation(listingInput, compsUsedForValuation, baseValuation),
          4000
        );

        const explainPromise = withTimeout(
          ollamaExplainText({
            title: `${year} ${make} ${model} ${searchParams?.trim ?? ''}`.trim(),
            valuation: {
              value_low: baseValuation.value_low,
              value_mid: baseValuation.value_mid,
              value_high: baseValuation.value_high,
              confidence: baseValuation.confidence
            },
            compsSummary
          }),
          2500
        );

        const [refinedRes, explainRes] = await Promise.allSettled([refinePromise, explainPromise]);
        const refined = refinedRes.status === 'fulfilled' ? refinedRes.value : null;
        valuation = refined ?? baseValuation;
        explanation = explainRes.status === 'fulfilled' ? explainRes.value : null;
      } else {
        valuation = baseValuation;
        explanation = null;
      }

      // Log this evaluation and create a shareable report link.
      const currentUser = await getCurrentUser();
      const report = await logManualValuation({
        user_id: currentUser?.id ?? null,
        year,
        make,
        model,
        trim: searchParams?.trim?.trim() || null,
        mileage,
        condition: searchParams?.condition?.trim() || null,
        transmission: searchParams?.transmission?.trim() || null,
        color: searchParams?.color?.trim() || null,
        mods: searchParams?.mods?.trim() || null,
        wear: searchParams?.wear?.trim() || null,
        city: null,
        state: null,
        valuation
      });

      // Attach report id to the valuation object for rendering a share link.
      if (report?.id) {
        (valuation as any).__report_id = report.id;
      }
    }
  }

  return (
    <div className="w-full max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Car evaluator</h1>
        <p className="mt-1 text-sm text-slate-400">
          Get a fair private-party value range based on comparable listings. No listing required.
        </p>
      </div>

      <EvaluatorForm
        defaultVin={searchParams?.vin}
        defaultYear={searchParams?.year}
        defaultMake={searchParams?.make}
        defaultModel={searchParams?.model}
        defaultTrim={searchParams?.trim}
        defaultMileage={searchParams?.mileage}
        defaultCondition={searchParams?.condition}
        defaultTransmission={searchParams?.transmission}
        defaultColor={searchParams?.color}
        defaultZip={searchParams?.zip}
        defaultMods={searchParams?.mods}
        defaultWear={searchParams?.wear}
      />

      {hasQuery && (
        <EvaluatorResults
          year={year}
          make={make}
          model={model}
          trim={searchParams?.trim}
          valuation={valuation}
          comps={compsUsedForValuation}
          errors={errors}
          explanation={explanation}
        />
      )}

      <p className="text-xs text-slate-500">
        Values are grounded in comparable listings. We use segment-specific mileage and age curves, then optionally an LLM to refine the range within those bounds when Ollama is configured.
        {' '}
        <Link href="/browse" className="text-brand hover:underline">Browse listings</Link>
        {' '}
        or{' '}
        <Link href="/create-listing" className="text-brand hover:underline">list your car</Link>.
      </p>
    </div>
  );
}
