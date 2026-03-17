import { supabaseAdmin } from '@/lib/db/admin';
import { collectComparableListings } from '@/lib/comps/fetchComps';
import { HttpError } from '@/lib/http/errors';
import { jsonError } from '@/lib/http/next';

export const dynamic = 'force-dynamic';

type WatchlistRow = {
  id: string;
  user_id: string;
  created_at: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  max_mileage: number | null;
  zip: string | null;
  radius_miles: number | null;
  max_price: number | null;
  enabled: boolean;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const watchlistId = url.searchParams.get('watchlistId');

    // NOTE: This is a stub runner for local/dev. It deliberately does NOT send notifications.
    // In production this should be protected (cron secret, internal auth, etc).
    // Safety: refuse to run unless explicitly in local/dev mode.
    const env = process.env.AXLE_ENV;
    if (env !== 'local' && env !== 'dev') {
      throw new HttpError(`Watchlists runner is disabled outside local/dev (AXLE_ENV=${env ?? 'unset'}).`, {
        status: 403,
        code: 'RUNNER_DISABLED'
      });
    }

    let q = supabaseAdmin.from('watchlists').select('*').eq('enabled', true);
    if (watchlistId) q = q.eq('id', watchlistId);

    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) {
      throw new HttpError(error.message, {
        status: 500,
        code: 'SUPABASE_QUERY_FAILED',
        cause: error
      });
    }

    const watchlists = (data ?? []) as WatchlistRow[];

    const results: {
      watchlist_id: string;
      status: 'processed' | 'skipped';
      reason?: string;
      comp_count?: number;
      matches_under_target?: number;
      sample_matches?: { title: string; price: number | null; mileage: number | null; url: string }[];
    }[] = [];

    for (const w of watchlists) {
      if (!w.make || !w.model || !w.year) {
        results.push({
          watchlist_id: w.id,
          status: 'skipped',
          reason: 'Watchlist missing year/make/model; runner requires those to fetch comps.'
        });
        continue;
      }

      try {
        const { comps, errors: compErrors } = await collectComparableListings({
          year: w.year,
          make: w.make,
          model: w.model,
          trim: w.trim,
          mileage: w.max_mileage ?? null,
          zip: w.zip,
          city: null,
          state: null
        });

        // Runner stub: "alert condition" is simply comps under max_price, optionally respecting max_mileage.
        const matches = (w.max_price ? comps.filter((c) => (c.asking_price ?? Infinity) <= w.max_price!) : []).filter((c) =>
          w.max_mileage && c.mileage != null ? c.mileage <= w.max_mileage : true
        );

        results.push({
          watchlist_id: w.id,
          status: 'processed',
          comp_count: comps.length,
          matches_under_target: matches.length,
          sample_matches: matches.slice(0, 5).map((c) => ({
            title: `${c.year ?? ''} ${c.make ?? ''} ${c.model ?? ''}${c.trim ? ` ${c.trim}` : ''}`.trim(),
            price: c.asking_price ?? null,
            mileage: c.mileage ?? null,
            url: c.source_url
          })),
          ...(compErrors.length > 0
            ? { reason: `Some comp sources errored: ${compErrors.map((e) => e.source).join(', ')}` }
            : {})
        });
      } catch (e) {
        // Per-watchlist isolation: one bad source/watchlist shouldn't fail the whole run.
        const msg = e instanceof Error ? e.message : 'Unknown error';
        results.push({ watchlist_id: w.id, status: 'skipped', reason: msg });
      }
    }

    return Response.json({
      ok: true,
      watchlists_checked: watchlists.length,
      processed: results.filter((r) => r.status === 'processed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      results
    });
  } catch (e) {
    return jsonError(e, {
      hint: 'Have you applied the watchlists migration in Supabase? See SUPABASE_MIGRATIONS.md and run the latest watchlists SQL.'
    });
  }
}
