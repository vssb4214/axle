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

