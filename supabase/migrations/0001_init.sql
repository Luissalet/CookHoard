-- CookHoard — core schema (PostgreSQL / Supabase). Pure Postgres: runs on Supabase, plain
-- Postgres, or self-hosted. RLS + social graph + triggers live in 0002_rls.sql.
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy title/ingredient search

-- ---------- identity ----------
-- On Supabase profiles.id = auth.users(id) (FK added in 0002 so this file also applies on plain PG).
create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  handle       text unique not null,
  display_name text,
  avatar_url   text,
  bio          text,
  locale       text not null default 'es',
  is_public    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------- ingredient dictionary (mirrors @cookhoard/core ids) ----------
create table if not exists ingredient (
  id           text primary key,          -- canonical slug, e.g. 'tomato'
  name         text not null,
  name_en      text,
  aliases      text[] default '{}',
  category     text,
  is_staple    boolean not null default false,
  default_unit text
);
create index if not exists ingredient_name_trgm on ingredient using gin (name gin_trgm_ops);

-- ---------- recipes (user-generated catalogue) ----------
create table if not exists recipe (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references profiles(id) on delete cascade,
  title         text not null,
  slug          text,
  description   text,
  image         text,
  servings      int,
  prep_min      int,
  cook_min      int,
  difficulty    smallint,
  cuisine       text,
  region_tags   text[] default '{}',
  season_affinity text[] default '{}',     -- {} = all year
  temperature   text,                      -- 'hot' | 'cold' | 'room'  (Signal B)
  heaviness     smallint,                  -- 1..3                     (Signal B)
  diet_flags    text[] default '{}',
  allergens     text[] default '{}',
  is_published  boolean not null default true,
  license       text,
  source_url    text,
  rating_avg    real,
  make_count    int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists recipe_title_trgm on recipe using gin (title gin_trgm_ops);
create index if not exists recipe_author_idx on recipe (author_id, created_at desc);

create table if not exists recipe_ingredient (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipe(id) on delete cascade,
  ingredient_id text references ingredient(id),
  free_text     text,
  quantity      numeric,
  unit          text,
  is_core       boolean not null default true,
  is_optional   boolean not null default false,
  section       text,
  ord           int not null default 0
);
create index if not exists recipe_ingredient_recipe_idx on recipe_ingredient (recipe_id, ord);

create table if not exists recipe_step (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipe(id) on delete cascade,
  ord        int not null,
  text       text not null,
  image      text,
  timer_sec  int
);

-- ---------- makes (Cults3D-style "I cooked it") ----------
create table if not exists recipe_make (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid not null references recipe(id) on delete cascade,
  author_id      uuid not null references profiles(id) on delete cascade,
  rating         smallint check (rating between 1 and 5),
  notes          text,
  images         text[] default '{}',
  servings_made  int,
  time_taken_min int,
  would_repeat   boolean,
  created_at     timestamptz not null default now()
);
create index if not exists recipe_make_recipe_idx on recipe_make (recipe_id, created_at desc);
create index if not exists recipe_make_author_idx on recipe_make (author_id, created_at desc);

create table if not exists make_likes (
  make_id    uuid not null references recipe_make(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (make_id, profile_id)
);

-- ---------- per-user private data ----------
create table if not exists pantry_item (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null default auth.uid() references profiles(id) on delete cascade,
  ingredient_id text,
  free_text     text,
  quantity      numeric,
  unit          text,
  expires_at    date,
  added_at      timestamptz not null default now()
);
create index if not exists pantry_profile_idx on pantry_item (profile_id);

create table if not exists saved_recipe (
  profile_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  recipe_id  uuid not null references recipe(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, recipe_id)
);

create table if not exists collection (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now()
);
create table if not exists collection_item (
  collection_id uuid not null references collection(id) on delete cascade,
  recipe_id     uuid not null references recipe(id) on delete cascade,
  ord           int not null default 0,
  primary key (collection_id, recipe_id)
);
