import { supabaseClient } from '@/lib/db/client';
import Link from 'next/link';

export default async function BrowsePage() {
  const { data: listings } = await supabaseClient
    .from('listings')
    .select('id, year, make, model, trim, mileage, city, state, intent')
    .order('created_at', { ascending: false })
    .limit(24);

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
          {listings.map((l) => (
            <Link
              key={l.id}
              href={`/listings/${l.id}`}
              className="card flex flex-col gap-3 p-3 hover:border-brand/60"
            >
              <div className="aspect-video w-full rounded-lg bg-slate-800/70" />
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
                <span>Valuation coming soon</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

