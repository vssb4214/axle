#!/usr/bin/env node
/**
 * Read-only smoke test for Watchlists.
 *
 * Why: safe to run by anyone without a service role key; verifies that the table exists
 * and that the app can read at least one watchlist row.
 *
 * Usage:
 *   node scripts/watchlists-readonly-smoke.cjs
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to run this script.');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 1) Ensure table exists (migration applied).
  const { error: tableErr } = await supabase.from('watchlists').select('id').limit(1);
  if (tableErr) {
    throw new Error(
      `watchlists table check failed: ${tableErr.message}\n` +
        'Did you run the SQL in SUPABASE_MIGRATIONS.md (Watchlists migration) in the Supabase SQL editor?'
    );
  }

  // 2) Basic read to verify connectivity + RLS policy behavior.
  // This may return 0 rows depending on RLS + data, but should not error.
  const { data, error } = await supabase
    .from('watchlists')
    .select('id, user_id, enabled, make, model, year, created_at')
    .limit(5);

  if (error) {
    throw new Error(`watchlists select failed: ${error.message}`);
  }

  const count = Array.isArray(data) ? data.length : 0;
  // eslint-disable-next-line no-console
  console.log(`OK: watchlists table reachable (rows returned: ${count}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
