import Link from 'next/link';
import type { NormalizedComp } from '@/lib/valuation/types';
import type { ValuationResult } from '@/lib/valuation/types';

type Props = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  valuation: ValuationResult | null;
  comps: NormalizedComp[];
  errors: { source: string; message: string }[];
  explanation: { summary: string; bullets: string[]; warnings: string[] } | null;
};

export function EvaluatorResults({ year, make, model, trim, valuation, comps, errors, explanation }: Props) {
  const title = `${year} ${make} ${model}${trim ? ` ${trim}` : ''}`.trim();

  if (!valuation && comps.length === 0) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white">No comparables found</h2>
        <p className="mt-2 text-sm text-slate-400">
          We couldn&apos;t find enough similar listings for {title}. Try a more common make/model or check back later when we add more sources.
        </p>
        {errors.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Sources checked: {errors.map((e) => e.source).join(', ')}.
          </p>
        )}
      </div>
    );
  }

  if (!valuation) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white">Not enough data</h2>
        <p className="mt-2 text-sm text-slate-400">
          We found {comps.length} listing(s) but need more to produce a reliable range for {title}.
        </p>
      </div>
    );
  }

  const confidencePct = Math.round(valuation.confidence * 100);
  const confidenceLabel =
    confidencePct >= 75 ? 'High' : confidencePct >= 55 ? 'Medium' : 'Low';

  const uniqueSources = Array.from(new Set(comps.map((c) => c.source))).filter(Boolean);
  const isFallbackEstimate = valuation.comp_count === 0;

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="border-b border-slate-800 bg-slate-900/50 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-xs text-slate-400">
            {valuation.comp_count} comparables · {confidenceLabel} confidence
            {isFallbackEstimate && (
              <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-200">Estimate only</span>
            )}
            {valuation.llm_refined && (
              <span className="ml-2 rounded bg-brand/20 px-1.5 py-0.5 text-brand">LLM refined</span>
            )}
          </p>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-baseline gap-4">
            <div>
              <span className="text-3xl font-semibold text-emerald-400">
                ${valuation.value_low.toLocaleString()} – ${valuation.value_high.toLocaleString()}
              </span>
            </div>
            <div className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
              Mid: ${valuation.value_mid.toLocaleString()}
            </div>
            <div className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
              {confidencePct}% confidence
            </div>
          </div>

          <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
            {valuation.key_factors.map((f, i) => (
              <li key={i}>• {f}</li>
            ))}
          </ul>

          {isFallbackEstimate && (
            <div className="mt-4 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
              We didn&apos;t find verified comparables for this exact car yet. This range is computed from depreciation, mileage, condition, and detected wear/repairs. Expect wider error bars.
            </div>
          )}

          {uniqueSources.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Sources used: {uniqueSources.join(', ')}.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/create-listing?year=${year}&make=${encodeURIComponent(
                make
              )}&model=${encodeURIComponent(model)}${trim ? `&trim=${encodeURIComponent(
                trim
              )}` : ''}&suggested_price=${valuation.value_mid}`}
              className="btn-primary"
            >
              List this car with suggested price
            </Link>
          </div>

          {explanation && (
            <div className="mt-6 border-t border-slate-800 pt-6">
              <h3 className="text-sm font-semibold text-white">Explanation</h3>
              <p className="mt-2 text-sm text-slate-300">{explanation.summary}</p>
              {explanation.bullets.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
                  {explanation.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
              {explanation.warnings.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
                  <div className="font-medium">Caveats</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {explanation.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {comps.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-white">Comparables used</h3>
          <p className="mt-1 text-xs text-slate-400">
            These listings were used to compute the range. We do not fabricate comps.
          </p>
          <ul className="mt-4 space-y-3">
            {comps.slice(0, 10).map((c, i) => (
              <li key={i} className="rounded-lg bg-slate-900/80 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-white">
                    {c.year} {c.make} {c.model}
                    {c.trim ? ` ${c.trim}` : ''}
                  </span>
                  <span className="text-emerald-400">
                    {c.asking_price != null ? `$${c.asking_price.toLocaleString()}` : '—'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {c.mileage != null ? `${c.mileage.toLocaleString()} mi` : ''}
                  {c.source === 'demo'
                    ? ' · Demo dataset'
                    : c.city && c.state
                      ? ` · ${c.city}, ${c.state}`
                      : ''}
                  {c.source ? ` · ${c.source}` : ''}
                </div>
                {c.source_title && (
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{c.source_title}</p>
                )}
              </li>
            ))}
          </ul>
          {errors.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Some sources unavailable: {errors.map((e) => e.source).join(', ')}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
