import Link from 'next/link';
import { headers } from 'next/headers';
import { supabaseClient } from '@/lib/db/client';
import { collectComparableListings } from '@/lib/comps/fetchComps';
import { filterComparableComps, type ListingInput } from '@/lib/valuation/engine';
import type { NormalizedComp } from '@/lib/valuation/types';
import { ollamaExplainText } from '@/lib/ollama/client';
import { CopyLinkButton } from '@/components/reports/CopyLinkButton';
import { vehicleKeyFromFields } from '@/lib/vin/vehicleKey';

export const dynamic = 'force-dynamic';

function formatMoney(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

function getAbsoluteUrl(pathname: string): string {
  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function buildFallbackExplanation(input: {
  title: string;
  confidence: number;
  compCount: number;
  valueLow: number;
  valueMid: number;
  valueHigh: number;
  segment?: string | null;
  hasLocation: boolean;
  hasTrim: boolean;
  hasCondition: boolean;
  hasTransmission: boolean;
  hasMods: boolean;
  hasWear: boolean;
}): { summary: string; bullets: string[]; warnings: string[] } {
  const spread = Math.max(0, input.valueHigh - input.valueLow);
  const relativeSpread = input.valueMid > 0 ? spread / input.valueMid : 0;
  const confidencePct = Math.round(input.confidence * 100);

  const bullets: string[] = [];
  bullets.push(`${input.compCount} comparable listing(s) inform this estimate (more comps generally increases reliability).`);
  bullets.push(`Range width: ${Math.round(relativeSpread * 100)}% of the mid estimate (tighter ranges usually mean higher confidence).`);
  if (input.segment) bullets.push(`Segment model: ${input.segment} (affects mileage + age curves).`);
  if (input.hasTrim) bullets.push('Trim was included to avoid mixing very different variants.');
  if (input.hasCondition) bullets.push('Condition was included as a multiplier on the comparable baseline.');
  if (input.hasTransmission) bullets.push('Transmission was included (some segments price manuals higher).');
  if (input.hasMods) bullets.push('Mods/upgrades were considered conservatively (not full “cost of parts”).');
  if (input.hasWear) bullets.push('Wear/repairs text can reduce value when it implies immediate costs.');
  if (input.hasLocation) bullets.push('Location can bias the comp set toward your region when available.');

  const warnings: string[] = [];
  warnings.push('Comps are asking prices, not closed sale prices — negotiation can land below asking.');
  warnings.push('Condition, title status, accident history, and maintenance records can swing value materially.');
  warnings.push('Thin markets (few comps) and wide ranges reduce confidence.');

  return {
    summary: `${input.title} is estimated at ${formatMoney(input.valueLow)}–${formatMoney(input.valueHigh)} (mid ${formatMoney(
      input.valueMid
    )}) with ${confidencePct}% confidence. This is designed to be shareable when pushing back on lowball offers.`,
    bullets,
    warnings
  };
}

export default async function ReportPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const { data, error } = await supabaseClient
    .from('manual_valuations')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return (
      <div className="w-full max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Valuation report</h1>
        <div className="card p-4 text-sm text-slate-300">
          Could not load this report. It may have expired or been deleted.
        </div>
        <Link href="/evaluate" className="text-brand hover:underline">
          Back to evaluator
        </Link>
      </div>
    );
  }

  const title = `${data.year} ${data.make} ${data.model}${data.trim ? ` ${data.trim}` : ''}`.trim();

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

  // Build a vehicleKey from stored report fields for variant-level comp matching.
  const reportVehicleKey = vehicleKeyFromFields({
    make: data.make,
    model: data.model,
    trim: data.trim ?? null,
    year: data.year,
  });

  // Fetch comps live for transparency. Keep it fast; degrade gracefully.
  let comps: NormalizedComp[] = [];
  let compErrors: { source: string; message: string }[] = [];
  try {
    const compResult = await withTimeout(
      collectComparableListings({
        year: data.year,
        make: data.make,
        model: data.model,
        trim: data.trim ?? null,
        mileage: data.mileage,
        city: null,
        state: null,
        zip: null,
        vehicleKey: reportVehicleKey,
      }),
      2800
    );
    comps = compResult.comps;
    compErrors = compResult.errors;
  } catch {
    comps = [];
    compErrors = [{ source: 'system', message: 'Comparable fetch timed out.' }];
  }

  const listingInput: ListingInput = {
    year: data.year,
    make: data.make,
    model: data.model,
    trim: data.trim ?? null,
    mileage: data.mileage,
    city: data.city ?? null,
    state: data.state ?? null,
    condition: data.condition ?? null,
    transmission: data.transmission ?? null,
    color: data.color ?? null,
    mods: data.mods ?? null,
    wear: data.wear ?? null,
    wear_issues: null,
    wear_costs: null,
    vehicleKey: reportVehicleKey,
  };

  const compsUsed = comps.length ? filterComparableComps(listingInput, comps).slice(0, 10) : [];

  const reportUrl = getAbsoluteUrl(`/reports/${id}`);

  const compsSummary =
    compsUsed
      .slice(0, 10)
      .map(
        (c) =>
          `${c.year ?? ''} ${c.make ?? ''} ${c.model ?? ''} - $${c.asking_price ?? 'n/a'} @ ${c.mileage ?? 'n/a'} mi (${c.city ?? ''}, ${c.state ?? ''})`
      )
      .join('\n') || 'No comp details.';

  let explanation: { summary: string; bullets: string[]; warnings: string[] } | null = null;
  try {
    explanation = await withTimeout(
      ollamaExplainText({
        title,
        valuation: {
          value_low: data.value_low,
          value_mid: data.value_mid,
          value_high: data.value_high,
          confidence: data.confidence
        },
        compsSummary
      }),
      2500
    );
  } catch {
    explanation = buildFallbackExplanation({
      title,
      confidence: data.confidence,
      compCount: data.comp_count,
      valueLow: data.value_low,
      valueMid: data.value_mid,
      valueHigh: data.value_high,
      segment: data.segment ?? null,
      hasLocation: Boolean(data.city || data.state),
      hasTrim: Boolean(data.trim),
      hasCondition: Boolean(data.condition),
      hasTransmission: Boolean(data.transmission),
      hasMods: Boolean(data.mods),
      hasWear: Boolean(data.wear)
    });
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-slate-400">Valuation report</div>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="text-sm text-slate-300">
          Private-party estimate generated by Axle. Share this link when negotiating.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Fair range</div>
          <div className="text-sm text-slate-300">
            {Math.round(data.confidence * 100)}% confidence · {data.comp_count} comps
          </div>
        </div>
        <div className="text-xl font-semibold text-emerald-400">
          {formatMoney(data.value_low)} – {formatMoney(data.value_high)}
        </div>
        <div className="text-sm text-slate-300">
          Mid: <span className="font-semibold text-white">{formatMoney(data.value_mid)}</span>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <CopyLinkButton url={reportUrl} />
          <Link href="/evaluate" className="btn-secondary">Run another</Link>
          <Link href="/browse" className="btn-secondary">Browse listings</Link>
        </div>
      </div>

      {explanation && (
        <div className="card p-4 space-y-3">
          <div className="text-sm font-semibold">Explanation</div>
          <p className="text-sm text-slate-300">{explanation.summary}</p>

          {explanation.bullets?.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Key factors</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
                {explanation.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg bg-slate-900/60 p-3 text-sm text-slate-200">
            <div className="font-medium">Confidence rationale</div>
            <p className="mt-1 text-xs text-slate-400">
              Confidence rises with more high-quality comps and a tighter range. This report shows {data.comp_count} comp(s) and a{' '}
              {Math.round(((data.value_high - data.value_low) / Math.max(1, data.value_mid)) * 100)}% range width vs mid.
            </p>
          </div>

          {explanation.warnings?.length > 0 && (
            <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
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

      <div className="card p-4">
        <div className="text-sm font-semibold">Inputs</div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-slate-300">
          <div><span className="text-slate-500">Mileage:</span> {data.mileage.toLocaleString()} mi</div>
          <div><span className="text-slate-500">Condition:</span> {data.condition ?? 'n/a'}</div>
          <div><span className="text-slate-500">Transmission:</span> {data.transmission ?? 'n/a'}</div>
          <div><span className="text-slate-500">Segment:</span> {data.segment ?? 'n/a'}</div>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold">Comparable listings (live)</div>
        <p className="mt-1 text-xs text-slate-400">Top matches we can find right now for transparency.</p>
        {compsUsed.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {compsUsed.slice(0, 10).map((c, idx) => (
              <li key={`${c.source}:${c.source_url}:${idx}`} className="rounded-lg bg-slate-900/70 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <a
                    className="font-medium text-white hover:underline"
                    href={c.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.year ?? ''} {c.make ?? ''} {c.model ?? ''}{c.trim ? ` ${c.trim}` : ''}
                  </a>
                  <div className="text-emerald-300">{c.asking_price != null ? formatMoney(c.asking_price) : '—'}</div>
                </div>
                <div className="mt-1 text-slate-400">
                  {c.mileage != null ? `${c.mileage.toLocaleString()} mi` : ''}
                  {c.city && c.state ? ` · ${c.city}, ${c.state}` : ''}
                  {c.source ? ` · ${c.source}` : ''}
                </div>
                {c.source_title ? (
                  <div className="mt-1 text-slate-500 line-clamp-2">{c.source_title}</div>
                ) : null}
                {c.source_url ? (
                  <a className="mt-1 inline-block text-brand hover:underline" href={c.source_url} target="_blank" rel="noreferrer">
                    View source
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 text-xs text-slate-300">No comps available right now.</div>
        )}
        {compErrors?.length ? (
          <div className="mt-3 text-[11px] text-slate-500">
            Some sources unavailable: {compErrors.map((e) => e.source).filter(Boolean).join(', ')}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">
        This report is an estimate. Always verify condition, title status, and local market dynamics.
      </p>
    </div>
  );
}
