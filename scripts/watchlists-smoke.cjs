require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireNoProd() {
  // Safety: never run smoke tests against prod.
  // Allow explicit override only if someone truly intends it.
  const allowProd = process.env.AXLE_ALLOW_PROD === '1';

  // Heuristics: Supabase project refs are typically the subdomain.
  // If you know your prod ref, add it here.
  const url = SUPABASE_URL ?? '';
  const looksLikeProd =
    /prod/i.test(process.env.NEXT_PUBLIC_APP_ENV ?? '') ||
    /prod/i.test(process.env.VERCEL_ENV ?? '') ||
    /prod/i.test(process.env.NODE_ENV ?? '') ||
    // If it's not a supabase.co project URL at all, it's suspicious (could be something else).
    /\.supabase\.co/.test(url) === false ||
    // If it *is* a supabase.co URL, treat it as potentially prod *unless* explicitly marked local/dev.
    // This script uses the service role key and performs writes.
    (/\.supabase\.co/.test(url) === true && process.env.AXLE_ENV !== 'local');

  if (allowProd) return;
  if (looksLikeProd) {
    throw new Error(
      'Refusing to run watchlists-smoke against a potentially production environment.\n' +
        'Set AXLE_ALLOW_PROD=1 to override (not recommended), or ensure .env.local points at a dev/staging Supabase project.'
    );
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local to run this script.');
  }

  requireNoProd();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1) Ensure the table exists (migration applied).
  const { error: tableErr } = await supabase.from('watchlists').select('id').limit(1);
  if (tableErr) {
    throw new Error(
      `watchlists table check failed: ${tableErr.message}\n` +
        'Did you run the SQL in SUPABASE_MIGRATIONS.md (Watchlists migration) in the Supabase SQL editor?'
    );
  }

  // 2) Find a user to attach the watchlist to (seed creates one).
  const { data: user, error: userErr } = await supabase.from('users').select('id,email').limit(1).maybeSingle();
  if (userErr) throw new Error(`users lookup failed: ${userErr.message}`);
  if (!user?.id) {
    throw new Error('No users found. Create a user (sign up) or run `pnpm seed`, then rerun this script.');
  }

  // 3) Insert a watchlist row.
  const insertRow = {
    user_id: user.id,
    year: 2012,
    make: 'Toyota',
    model: 'Tacoma',
    trim: 'TRD Off-Road',
    max_mileage: 140000,
    zip: '78701',
    radius_miles: 250,
    max_price: 18000,
    enabled: true
  };

  const { data: created, error: createErr } = await supabase.from('watchlists').insert(insertRow).select('*').single();

  if (createErr || !created?.id) {
    throw new Error(`watchlists insert failed: ${createErr?.message ?? 'unknown error'}`);
  }

  // 4) Toggle enabled.
  const { error: updateErr } = await supabase.from('watchlists').update({ enabled: false }).eq('id', created.id);
  if (updateErr) throw new Error(`watchlists update failed: ${updateErr.message}`);

  // 5) Read back.
  const { data: fetched, error: fetchErr } = await supabase.from('watchlists').select('*').eq('id', created.id).single();
  if (fetchErr) throw new Error(`watchlists readback failed: ${fetchErr.message}`);
  if (fetched.enabled !== false) throw new Error('watchlists enabled toggle did not persist');

  // 6) Delete.
  const { error: deleteErr } = await supabase.from('watchlists').delete().eq('id', created.id);
  if (deleteErr) throw new Error(`watchlists delete failed: ${deleteErr.message}`);

  // eslint-disable-next-line no-console
  console.log(`OK: watchlists CRUD works (user: ${user.email ?? user.id}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
