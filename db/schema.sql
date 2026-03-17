-- Core schema for Axle

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  avatar_url text,
  city text,
  state text,
  bio text,
  rating_avg numeric(3,2) default 0,
  rating_count integer default 0,
  completed_trade_count integer default 0,
  created_at timestamptz default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  year integer not null,
  make text not null,
  model text not null,
  trim text,
  mileage integer not null,
  transmission text,
  drivetrain text,
  condition text,
  title_status text,
  vin_private text,
  mods_text text,
  maintenance_text text,
  city text,
  state text,
  intent text not null,
  trade_preferences_text text,
  status text default 'active',
  created_at timestamptz default now()
);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  photo_url text not null,
  sort_order integer default 0
);

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  value_low integer not null,
  value_mid integer not null,
  value_high integer not null,
  confidence numeric(3,2) not null,
  comp_count integer not null,
  summary text,
  reasoning_json jsonb,
  warnings_json jsonb,
  created_at timestamptz default now()
);

create table public.comparables (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  source text not null,
  source_url text not null,
  source_title text,
  year integer,
  make text,
  model text,
  trim text,
  mileage integer,
  asking_price integer,
  city text,
  state text,
  excerpt text,
  similarity_score numeric(4,3),
  normalized_data_json jsonb,
  created_at timestamptz default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  offered_listing_id uuid not null references public.listings(id) on delete cascade,
  requested_listing_id uuid not null references public.listings(id) on delete cascade,
  cash_delta integer default 0,
  message text,
  status text default 'pending',
  created_at timestamptz default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  review text,
  created_at timestamptz default now()
);

-- Manual valuations run from /evaluate (not tied to a specific listing)
create table if not exists public.manual_valuations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  user_id uuid references public.users (id),

  year integer not null,
  make text not null,
  model text not null,
  trim text,
  mileage integer not null,
  condition text,
  transmission text,
  color text,
  mods text,
  wear text,
  city text,
  state text,

  value_low integer not null,
  value_mid integer not null,
  value_high integer not null,
  confidence real not null,
  comp_count integer not null,
  segment text
);

create index if not exists idx_manual_valuations_user_created
  on public.manual_valuations (user_id, created_at desc);

-- Optional cache of per-platform repair economics, keyed by a coarse platform identifier
-- (e.g. 'bmw_z3_e36-7', 'miata_na') plus a normalized issue code
-- (e.g. 'door_card', 'convertible_top'). The valuation engine can fall back to
-- segment-level defaults when a row does not exist, so this table can be populated
-- incrementally over time.
create table if not exists public.platform_repair_costs (
  platform_key text not null,
  issue_code text not null,
  parts_cost numeric(10,2) not null,
  labor_hours numeric(5,2) not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  primary key (platform_key, issue_code)
);

-- ----------------------------
-- Integrity + performance
-- ----------------------------

-- Prevent duplicate ratings per party per offer.
create unique index if not exists uniq_ratings_offer_from_user
  on public.ratings (offer_id, from_user_id);

create index if not exists idx_listings_status_created
  on public.listings (status, created_at desc);

create index if not exists idx_listings_user_created
  on public.listings (user_id, created_at desc);

create index if not exists idx_listing_photos_listing_sort
  on public.listing_photos (listing_id, sort_order asc);

create index if not exists idx_valuations_listing_created
  on public.valuations (listing_id, created_at desc);

create index if not exists idx_comparables_listing_created
  on public.comparables (listing_id, created_at desc);

create index if not exists idx_offers_to_user_created
  on public.offers (to_user_id, created_at desc);

create index if not exists idx_offers_from_user_created
  on public.offers (from_user_id, created_at desc);

create index if not exists idx_messages_offer_created
  on public.messages (offer_id, created_at asc);

-- ----------------------------
-- Row Level Security (RLS)
-- ----------------------------

alter table public.users enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.valuations enable row level security;
alter table public.comparables enable row level security;
alter table public.offers enable row level security;
alter table public.messages enable row level security;
alter table public.ratings enable row level security;
alter table public.manual_valuations enable row level security;
alter table public.platform_repair_costs enable row level security;

-- Users: public profiles readable; only self editable.
drop policy if exists "users_read_public" on public.users;
create policy "users_read_public"
  on public.users
  for select
  using (true);

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self"
  on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Listings: anyone can browse active listings; owners can manage their own.
drop policy if exists "listings_read_active" on public.listings;
create policy "listings_read_active"
  on public.listings
  for select
  using (status = 'active' or auth.uid() = user_id);

drop policy if exists "listings_insert_self" on public.listings;
create policy "listings_insert_self"
  on public.listings
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "listings_update_self" on public.listings;
create policy "listings_update_self"
  on public.listings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Photos: readable for active listings; owners can manage.
drop policy if exists "listing_photos_read_active" on public.listing_photos;
create policy "listing_photos_read_active"
  on public.listing_photos
  for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.status = 'active' or l.user_id = auth.uid())
    )
  );

drop policy if exists "listing_photos_write_owner" on public.listing_photos;
create policy "listing_photos_write_owner"
  on public.listing_photos
  for all
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.user_id = auth.uid()
    )
  );

-- Valuations/comparables: readable for active listings; write by owner only.
drop policy if exists "valuations_read_active" on public.valuations;
create policy "valuations_read_active"
  on public.valuations
  for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.status = 'active' or l.user_id = auth.uid())
    )
  );

drop policy if exists "valuations_write_owner" on public.valuations;
create policy "valuations_write_owner"
  on public.valuations
  for all
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.user_id = auth.uid()
    )
  );

drop policy if exists "comparables_read_active" on public.comparables;
create policy "comparables_read_active"
  on public.comparables
  for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.status = 'active' or l.user_id = auth.uid())
    )
  );

drop policy if exists "comparables_write_owner" on public.comparables;
create policy "comparables_write_owner"
  on public.comparables
  for all
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.user_id = auth.uid()
    )
  );

-- Offers: only involved users can read; offer creator can insert; recipient can update status.
drop policy if exists "offers_read_parties" on public.offers;
create policy "offers_read_parties"
  on public.offers
  for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "offers_insert_from_user" on public.offers;
create policy "offers_insert_from_user"
  on public.offers
  for insert
  with check (auth.uid() = from_user_id);

drop policy if exists "offers_update_parties" on public.offers;
create policy "offers_update_parties"
  on public.offers
  for update
  using (auth.uid() = to_user_id or auth.uid() = from_user_id)
  with check (auth.uid() = to_user_id or auth.uid() = from_user_id);

-- Messages: only involved users can read/write within an offer.
drop policy if exists "messages_read_parties" on public.messages;
create policy "messages_read_parties"
  on public.messages
  for select
  using (
    exists (
      select 1 from public.offers o
      where o.id = offer_id
        and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())
    )
  );

drop policy if exists "messages_insert_sender_in_offer" on public.messages;
create policy "messages_insert_sender_in_offer"
  on public.messages
  for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.offers o
      where o.id = offer_id
        and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())
    )
  );

-- Ratings: only involved users can read; only involved user can insert their rating.
drop policy if exists "ratings_read_public" on public.ratings;
create policy "ratings_read_public"
  on public.ratings
  for select
  using (true);

drop policy if exists "ratings_insert_self" on public.ratings;
create policy "ratings_insert_self"
  on public.ratings
  for insert
  with check (
    auth.uid() = from_user_id
    and exists (
      select 1 from public.offers o
      where o.id = offer_id
        and o.status = 'accepted'
        and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())
    )
  );

-- Manual valuations: only the user can read/write their rows.
drop policy if exists "manual_valuations_read_self" on public.manual_valuations;
create policy "manual_valuations_read_self"
  on public.manual_valuations
  for select
  using (auth.uid() = user_id);

drop policy if exists "manual_valuations_insert_self" on public.manual_valuations;
create policy "manual_valuations_insert_self"
  on public.manual_valuations
  for insert
  with check (auth.uid() = user_id);

-- Platform repair costs: allow read-only (writes should be via service role / admin tooling).
drop policy if exists "platform_repair_costs_read_all" on public.platform_repair_costs;
create policy "platform_repair_costs_read_all"
  on public.platform_repair_costs
  for select
  using (true);

