import Link from 'next/link';
import { getCurrentUser, getSupabaseServer } from '@/lib/auth/server';
import { createWatchlist, deleteWatchlist, toggleWatchlist } from './actions';

export const dynamic = 'force-dynamic';

export default async function WatchlistsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="w-full max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-white">Watchlists</h1>
        <div className="card p-4 text-sm text-slate-300">
          Sign in to create alerts for cars you&apos;re hunting.
        </div>
        <Link href="/auth" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  const supabase = await getSupabaseServer();
  const { data: watchlists } = await supabase
    .from('watchlists')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="w-full max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Watchlists</h1>
        <p className="mt-1 text-sm text-slate-400">
          Save a search and get notified when a listing shows up under your target price.
        </p>
      </div>

      <form action={createWatchlist} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-300">Make</label>
            <input name="make" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="e.g. Toyota" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300">Model</label>
            <input name="model" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="e.g. Tacoma" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-300">Year (optional)</label>
            <input name="year" type="number" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="2012" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300">Trim (optional)</label>
            <input name="trim" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="TRD Off-Road" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-300">Max mileage</label>
            <input name="max_mileage" type="number" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="120000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300">Max price ($)</label>
            <input name="max_price" type="number" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="18000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300">ZIP</label>
            <input name="zip" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="92101" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300">Radius (miles)</label>
          <input name="radius_miles" type="number" className="mt-1 w-40 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="200" />
        </div>

        <button type="submit" className="btn-primary">Create watchlist</button>
        <p className="text-xs text-slate-500">
          Note: database table must exist. If you haven&apos;t run the migration yet, this page will error.
        </p>
      </form>

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Your watchlists</h2>
          <span className="text-xs text-slate-400">{watchlists?.length ?? 0}</span>
        </div>

        {!watchlists?.length ? (
          <p className="mt-3 text-sm text-slate-400">No watchlists yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {watchlists.map((w: any) => (
              <li key={w.id} className="rounded-lg bg-slate-900/70 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-white">
                    {w.year ? `${w.year} ` : ''}{w.make ?? 'Any make'} {w.model ?? ''} {w.trim ?? ''}
                  </div>
                  <div className={w.enabled ? 'text-emerald-300 text-xs' : 'text-slate-400 text-xs'}>
                    {w.enabled ? 'Enabled' : 'Paused'}
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-300">
                  {w.max_mileage ? `≤ ${w.max_mileage.toLocaleString()} mi` : 'any mileage'}
                  {w.max_price ? ` · ≤ $${w.max_price.toLocaleString()}` : ''}
                  {w.zip ? ` · near ${w.zip}` : ''}
                  {w.radius_miles ? ` (${w.radius_miles}mi)` : ''}
                </div>

                <div className="mt-3 flex gap-2">
                  <form action={async () => toggleWatchlist(w.id, !w.enabled)}>
                    <button className="btn-secondary" type="submit">
                      {w.enabled ? 'Pause' : 'Enable'}
                    </button>
                  </form>
                  <form action={async () => deleteWatchlist(w.id)}>
                    <button className="btn-secondary" type="submit">Delete</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
