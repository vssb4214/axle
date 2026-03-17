import { supabaseClient } from '@/lib/db/client';
import Link from 'next/link';

export default async function BrowsePage() {
  const { data: listings } = await supabaseClient
    .from('listings')
    .select('id, year, make, model, trim, mileage, city, state, intent')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(24);

  const listingIds = (listings ?? []).map((l) => l.id);
  const { data: photos } =
    listingIds.length > 0
      ? await supabaseClient
          .from('listing_photos')
          .select('listing_id, photo_url')
          .in('listing_id', listingIds)
          .order('sort_order', { ascending: true })
      : { data: [] };
  const firstPhotoByListing = new Map(
    (photos ?? []).map((p) => [p.listing_id, p.photo_url])
  );

  const { data: valuationRows } =
    listingIds.length > 0
      ? await supabaseClient
          .from('valuations')
          .select('listing_id, value_low, value_mid, value_high, confidence')
          .in('listing_id', listingIds)
          .order('created_at', { ascending: false })
      : { data: [] };
  const latestValuationByListing = new Map<string, { value_low: number; value_mid: number; value_high: number; confidence: number }>();
  for (const v of valuationRows ?? []) {
    if (!latestValuationByListing.has(v.listing_id)) {
      latestValuationByListing.set(v.listing_id, {
        value_low: v.value_low,
        value_mid: v.value_mid,
        value_high: v.value_high,
        confidence: v.confidence
      });
    }
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Browse listings</h1>
          <p className="text-xs text-slate-400">
            See enthusiast-owned cars with transparent, comps-based valuations.
          </p>
        </div>
        <Link href="/create-listing" className="btn-primary text-xs">
          List my car
        </Link>
      </div>
      {!listings?.length ? (
        <div className="card p-6 text-sm text-slate-300">
          No listings yet. Be the first to{' '}
          <Link href="/create-listing" className="text-brand hover:underline">
            list your car
          </Link>
          .
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {(listings ?? []).map((l) => (
            <Link
              key={l.id}
              href={`/listings/${l.id}`}
              className="card flex flex-col gap-3 p-3 hover:border-brand/60"
            >
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-slate-800/70">
                {firstPhotoByListing.get(l.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={firstPhotoByListing.get(l.id)!}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-white">
                  {l.year} {l.make} {l.model}
                  {l.trim ? ` ${l.trim}` : ''}
                </div>
                <div className="text-xs text-slate-400">
                  {l.mileage.toLocaleString()} mi • {l.city}, {l.state}
                </div>
                <div className="mt-1 inline-flex w-max items-center rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                  {l.intent?.replace(/_/g, ' ')}
                </div>
              </div>
              <div className="mt-auto flex justify-between text-[11px] text-slate-300">
                {latestValuationByListing.get(l.id) ? (
                  <span>
                    ${latestValuationByListing.get(l.id)!.value_low.toLocaleString()} – $
                    {latestValuationByListing.get(l.id)!.value_high.toLocaleString()} est.
                  </span>
                ) : (
                  <span>Valuation after viewing</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

