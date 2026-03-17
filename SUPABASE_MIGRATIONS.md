## Supabase migrations (manual)

Axle stores migrations as `.sql` files under `db/migrations/`, but **they are not applied automatically**.

To apply a migration:

- Open **Supabase Dashboard → SQL Editor**
- Paste the SQL from the relevant section below
- Run it

## Watchlists migration

**File**: `db/migrations/2026-03-17_watchlists.sql`

```sql
-- Watchlists / alerts
-- Run this in Supabase SQL editor when ready.

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  -- Search inputs
  year integer,
  make text,
  model text,
  trim text,
  max_mileage integer,
  zip text,
  radius_miles integer,

  -- Alert condition
  max_price integer,

  enabled boolean not null default true
);

create index if not exists idx_watchlists_user_created
  on public.watchlists (user_id, created_at desc);

alter table public.watchlists enable row level security;

-- Users can CRUD their own watchlists.
create policy "watchlists_select_own" on public.watchlists
  for select using (auth.uid() = user_id);

create policy "watchlists_insert_own" on public.watchlists
  for insert with check (auth.uid() = user_id);

create policy "watchlists_update_own" on public.watchlists
  for update using (auth.uid() = user_id);

create policy "watchlists_delete_own" on public.watchlists
  for delete using (auth.uid() = user_id);
```

