import { supabaseClient } from '@/lib/db/client';
import { computeDeterministicValuation } from '@/lib/valuation/engine';
import { collectComparableListings } from '@/lib/comps/fetchComps';
import { ollamaExplainText } from '@/lib/ollama/client';

type Props = { params: { id: string } };

export default async function ListingDetailPage({ params }: Props) {
  const { data: listing } = await supabaseClient
    .from('listings')
    .select('*, users(id, display_name, city, state, rating_avg, rating_count)')
    .eq('id', params.id)
    .single();

  if (!listing) {
    return <div className="card w-full p-6 text-sm text-slate-300">Listing not found.</div>;
  }

  const query = {
    year: listing.year,
    make: listing.make,
    model: listing.model,
    trim: listing.trim,
    city: listing.city,
    state: listing.state
  };

  const { comps, errors } = await collectComparableListings(query);

  const valuation = computeDeterministicValuation(
    {
      year: listing.year,
      make: listing.make,
      model: listing.model,
      trim: listing.trim,
      mileage: listing.mileage,
      city: listing.city,
      state: listing.state,
      condition: listing.condition
    },
    comps
  );

  let explanation:
    | { summary: string; bullets: string[]; warnings: string[] }
    | null = null;

  if (valuation) {
    const compsSummary =
      comps
        .slice(0, 10)
        .map(
          (c) =>
            `${c.year ?? ''} ${c.make ?? ''} ${c.model ?? ''} ${c.trim ?? ''} - ${c.asking_price ?? 'n/a'} @ ${
              c.mileage ?? 'n/a'
            } mi (${c.city ?? ''}, ${c.state ?? ''})`
        )
        .join('\n') || 'No detailed comps available.';

    try {
      explanation = await ollamaExplainText({
        title: `${listing.year} ${listing.make} ${listing.model} ${listing.trim ?? ''}`,
        valuation: {
          value_low: valuation.value_low,
          value_mid: valuation.value_mid,
          value_high: valuation.value_high,
          confidence: valuation.confidence
        },
        compsSummary
      });
    } catch {
      explanation = null;
    }
  }

  const bestComps = comps.slice(0, 10);

  return (
    <div className="flex w-full flex-col gap-6 md:flex-row">
      <div className="flex-1 space-y-4">
        <div className="card overflow-hidden">
          <div className="aspect-video w-full bg-slate-800/70" />
        </div>
        <div className="card p-4">
          <h1 className="text-lg font-semibold text-white">
            {listing.year} {listing.make} {listing.model} {listing.trim}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {listing.mileage.toLocaleString()} mi • {listing.transmission} • {listing.drivetrain} •{' '}
            {listing.city}, {listing.state}
          </p>
          <p className="mt-2 text-xs text-slate-300">
            Condition: {listing.condition ?? 'unspecified'} • Title: {listing.title_status ?? 'unspecified'}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-white">Modifications</h2>
            <p className="mt-2 text-xs text-slate-300 whitespace-pre-wrap">
              {listing.mods_text || 'Seller has not added modification notes yet.'}
            </p>
          </div>
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-white">Maintenance</h2>
            <p className="mt-2 text-xs text-slate-300 whitespace-pre-wrap">
              {listing.maintenance_text || 'Seller has not added maintenance notes yet.'}
            </p>
          </div>
        </div>
      </div>
      <aside className="flex w-full max-w-xs flex-col gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white">Estimated fair value</h2>
          {valuation ? (
            <>
              <div className="mt-2 text-xl font-semibold text-emerald-300">
                ${valuation.value_low.toLocaleString()} – ${valuation.value_high.toLocaleString()}
              </div>
              <div className="text-xs text-slate-300">
                Mid: ${valuation.value_mid.toLocaleString()} • Confidence:{' '}
                {(valuation.confidence * 100).toFixed(0)}%
              </div>
              <div className="mt-2 inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200">
                {valuation.comp_count} comps used • deterministic logic
              </div>
              {explanation && (
                <div className="mt-3 space-y-2 text-xs text-slate-200">
                  <p>{explanation.summary}</p>
                  <ul className="list-disc space-y-1 pl-4">
                    {explanation.bullets.slice(0, 5).map((b, idx) => (
                      <li key={idx}>{b}</li>
                    ))}
                  </ul>
                  {explanation.warnings.length > 0 && (
                    <div className="rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-200">
                      <div className="font-semibold">Uncertainty & caveats</div>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {explanation.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-300">
              We could not find enough strong comps to produce a fair value range. This usually happens with very rare
              or heavily modified cars.
            </p>
          )}
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white">Owner</h2>
          <p className="mt-1 text-xs text-slate-300">
            {listing.users?.display_name ?? 'Enthusiast'} • {listing.users?.city}, {listing.users?.state}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Rating:{' '}
            {listing.users?.rating_count
              ? `${listing.users.rating_avg.toFixed(1)} / 5 (${listing.users.rating_count} reviews)`
              : 'No ratings yet'}
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary w-full text-xs">Offer Trade</button>
            <button className="btn-secondary w-full text-xs">Message</button>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white">Comparable listings</h2>
          {bestComps.length === 0 ? (
            <p className="mt-2 text-xs text-slate-300">
              No comparable listings were available from our sources. We prefer to show nothing instead of fabricating
              comps.
            </p>
          ) : (
            <ul className="mt-3 space-y-3 text-xs text-slate-200">
              {bestComps.map((c, idx) => (
                <li key={idx} className="rounded-md bg-slate-900/80 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">
                      {c.year} {c.make} {c.model} {c.trim}
                    </div>
                    <span className="text-emerald-300">
                      {c.asking_price ? `$${c.asking_price.toLocaleString()}` : 'n/a'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {c.mileage ? `${c.mileage.toLocaleString()} mi • ` : ''}
                    {c.city}, {c.state} • {c.source}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300 line-clamp-2">{c.source_title}</p>
                  <a
                    href={c.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex text-[11px] text-brand hover:underline"
                  >
                    View listing
                  </a>
                </li>
              ))}
            </ul>
          )}
          {errors.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-500">
              Some sources were unavailable ({errors.map((e) => e.source).join(', ')}). Valuation confidence reflects
              this.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

