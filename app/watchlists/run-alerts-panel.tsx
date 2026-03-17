'use client';

import { useMemo, useState } from 'react';

type RunnerResponse = {
  ok: boolean;
  watchlists_checked?: number;
  processed?: number;
  skipped?: number;
  results?: {
    watchlist_id: string;
    status: 'processed' | 'skipped';
    reason?: string;
    comp_count?: number;
    matches_under_target?: number;
    sample_matches?: { title: string; price: number | null; mileage: number | null; url: string }[];
  }[];
  error?: { message: string; code?: string; hint?: string };
};

function canShowRunner() {
  // Client-side safe check (also enforced server-side in the API route)
  const env = process.env.NEXT_PUBLIC_AXLE_ENV;
  return env === 'local' || env === 'dev';
}

export default function RunAlertsPanel() {
  const show = canShowRunner();
  const [pending, setPending] = useState(false);
  const [data, setData] = useState<RunnerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!data) return null;
    if (!data.ok) return null;
    return `${data.processed ?? 0} processed · ${data.skipped ?? 0} skipped`;
  }, [data]);

  if (!show) return null;

  async function run() {
    try {
      setPending(true);
      setError(null);
      setData(null);

      const res = await fetch('/api/watchlists/run-alerts', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      const json = (await res.json()) as RunnerResponse;
      setData(json);
      if (!res.ok || !json.ok) {
        setError(json?.error?.message ?? `Runner failed (HTTP ${res.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-200">Dev tools</div>
          <div className="mt-0.5 text-xs text-slate-400">
            Run the watchlists runner locally (no notifications are sent).
          </div>
        </div>
        <button className="btn-secondary" onClick={run} disabled={pending} type="button">
          {pending ? 'Running…' : 'Run alerts'}
        </button>
      </div>

      {summary ? <div className="mt-3 text-xs text-slate-300">{summary}</div> : null}

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-800/50 bg-rose-950/30 p-3 text-xs text-rose-200">
          {error}
          {data?.error?.hint ? <div className="mt-1 text-rose-200/80">Hint: {data.error.hint}</div> : null}
        </div>
      ) : null}

      {data?.ok && data.results?.length ? (
        <div className="mt-3 space-y-2">
          {data.results.slice(0, 5).map((r) => (
            <div key={r.watchlist_id} className="rounded-lg bg-slate-900/60 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono text-slate-300">{r.watchlist_id}</div>
                <div className={r.status === 'processed' ? 'text-emerald-300' : 'text-amber-200'}>
                  {r.status}
                </div>
              </div>
              {typeof r.comp_count === 'number' ? (
                <div className="mt-1 text-slate-300">
                  comps: {r.comp_count} · matches_under_target: {r.matches_under_target ?? 0}
                </div>
              ) : null}
              {r.reason ? <div className="mt-1 text-slate-400">{r.reason}</div> : null}
              {r.sample_matches?.length ? (
                <ul className="mt-2 space-y-1 text-slate-300">
                  {r.sample_matches.slice(0, 3).map((m) => (
                    <li key={m.url} className="truncate">
                      <a className="underline" href={m.url} target="_blank" rel="noreferrer">
                        {m.title}
                      </a>
                      {m.price != null ? ` · $${m.price.toLocaleString()}` : ''}
                      {m.mileage != null ? ` · ${m.mileage.toLocaleString()} mi` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {data?.ok && (data.results?.length ?? 0) > 5 ? (
        <div className="mt-2 text-[11px] text-slate-500">Showing first 5 watchlists.</div>
      ) : null}
    </div>
  );
}
