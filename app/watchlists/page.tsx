import Link from 'next/link';
import { getCurrentUser, getSupabaseServer } from '@/lib/auth/server';
import { createWatchlist, deleteWatchlist, toggleWatchlist } from './actions';
import WatchlistCreateForm from './watchlist-create-form';
import RunAlertsPanel from './run-alerts-panel';

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
        <Link href="/auth" className="btn-primary">
          Sign in
        </Link>
      </div>
    );
  }

  const supabase = await getSupabaseServer();
  const { data: watchlists, error } = await supabase
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

      {error ? (
        <div className="card space-y-2 p-4 text-sm">
          <div className="rounded-lg border border-amber-700/60 bg-amber-900/20 p-3 text-xs text-amber-200">
            Watchlists aren’t set up yet (or Supabase is misconfigured). Create the <code>watchlists</code> table using
            SUPABASE_MIGRATIONS.md, then reload.
            <div className="mt-1 text-amber-300/80">Error: {error.message}</div>
          </div>
        </div>
      ) : null}

      <WatchlistCreateForm action={createWatchlist} disabled={!!error} />

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Your watchlists</h2>
          <span className="text-xs text-slate-400">{watchlists?.length ?? 0}</span>
        </div>

        <RunAlertsPanel />

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
                    <button
                      className="btn-secondary"
                      type="submit"
                      onClick={(e) => {
                        if (!confirm('Delete this watchlist?')) e.preventDefault();
                      }}
                    >
                      Delete
                    </button>
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
