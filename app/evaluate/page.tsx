import Link from 'next/link';
import { collectComparableListings } from '@/lib/comps/fetchComps';
import { computeDeterministicValuation, computeFallbackValuation } from '@/lib/valuation/engine';
import { ollamaExplainText } from '@/lib/ollama/client';
import { ollamaRefineValuation } from '@/lib/ollama/refineValuation';
import { logManualValuation } from '@/lib/valuation/logManualValuation';
import { getCurrentUser } from '@/lib/auth/server';
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
  radius_miles?: string;
};

export default async function EvaluatePage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const year = searchParams?.year ? parseInt(searchParams.year, 10) : 0;
  const make = (searchParams?.make ?? '').trim();
  const model = (searchParams?.model ?? '').trim();
  const mileage = searchParams?.mileage ? parseInt(searchParams.mileage, 10) : 0;

  const hasQuery = year > 0 && make && model && mileage > 0;

  let valuation: Awaited<ReturnType<typeof computeDeterministicValuation>> = null;
  let comps: Awaited<ReturnType<typeof collectComparableListings>>['comps'] = [];
  let errors: Awaited<ReturnType<typeof collectComparableListings>>['errors'] = [];
  let explanation: { summary: string; bullets: string[]; warnings: string[] } | null = null;

  if (hasQuery) {
    const query = {
      year,
      make,
      model,
      trim: searchParams?.trim?.trim() || null,
      city: null,
      state: null,
      zip: searchParams?.zip?.trim() || null,
      radius_miles: searchParams?.radius_miles ? parseInt(searchParams.radius_miles, 10) : null
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
      wear: searchParams?.wear?.trim() || null
    };

    const baseValuation = computeDeterministicValuation(listingInput, comps) ?? computeFallbackValuation(listingInput);

    if (baseValuation) {
      const compsSummary =
        comps
          .slice(0, 10)
          .map(
            (c) =>
              `${c.year ?? ''} ${c.make ?? ''} ${c.model ?? ''} - $${c.asking_price ?? 'n/a'} @ ${c.mileage ?? 'n/a'} mi (${c.city ?? ''}, ${c.state ?? ''})`
          )
          .join('\n') || 'No comp details.';

      // Only attempt LLM refinement/explanation when we have real comps.
      if (comps.length > 0) {
        const refinePromise = withTimeout(
          ollamaRefineValuation(listingInput, comps, baseValuation),
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

      // Fire-and-forget logging of this evaluation for the current user.
      const currentUser = await getCurrentUser();
      void logManualValuation({
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
        defaultYear={searchParams?.year}
        defaultMake={searchParams?.make}
        defaultModel={searchParams?.model}
        defaultTrim={searchParams?.trim}
        defaultMileage={searchParams?.mileage}
        defaultCondition={searchParams?.condition}
        defaultTransmission={searchParams?.transmission}
        defaultColor={searchParams?.color}
        defaultZip={searchParams?.zip}
        defaultRadiusMiles={searchParams?.radius_miles}
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
          comps={comps}
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
