-- CookHoard — security (RLS), social graph, reviews, and maintenance triggers.
-- Idempotent: safe to run repeatedly.

-- ============ auth wiring (Supabase) ============
-- Link profiles to auth.users and auto-create a profile row on sign-up.
do $$ begin
  alter table profiles add constraint profiles_auth_fk foreign key (id) references auth.users(id) on delete cascade;
exception when duplicate_object then null; when undefined_table then null; end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle, display_name)
  values (new.id, split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4), split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ enable RLS ============
alter table profiles          enable row level security;
alter table ingredient        enable row level security;
alter table recipe            enable row level security;
alter table recipe_ingredient enable row level security;
alter table recipe_step       enable row level security;
alter table recipe_make       enable row level security;
alter table make_likes        enable row level security;
alter table pantry_item       enable row level security;
alter table saved_recipe      enable row level security;
alter table collection        enable row level security;
alter table collection_item   enable row level security;

-- ============ profiles: public directory ============
drop policy if exists "profiles readable" on profiles;
create policy "profiles readable" on profiles for select using (auth.uid() is not null);
drop policy if exists "profiles update own" on profiles;
create policy "profiles update own" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ============ ingredient dictionary: public read, authenticated may extend ============
drop policy if exists "ingredient read" on ingredient;
create policy "ingredient read" on ingredient for select using (true);
drop policy if exists "ingredient insert" on ingredient;
create policy "ingredient insert" on ingredient for insert with check (auth.uid() is not null);

-- ============ recipes: public catalogue, author writes ============
drop policy if exists "recipe read" on recipe;
create policy "recipe read" on recipe for select using (is_published or author_id = auth.uid());
drop policy if exists "recipe write own" on recipe;
create policy "recipe write own" on recipe for all using (author_id = auth.uid()) with check (author_id = auth.uid());

-- child rows readable when the parent recipe is; writable by the recipe's author.
drop policy if exists "recipe_ingredient read" on recipe_ingredient;
create policy "recipe_ingredient read" on recipe_ingredient for select using (
  exists (select 1 from recipe r where r.id = recipe_id and (r.is_published or r.author_id = auth.uid())));
drop policy if exists "recipe_ingredient write" on recipe_ingredient;
create policy "recipe_ingredient write" on recipe_ingredient for all using (
  exists (select 1 from recipe r where r.id = recipe_id and r.author_id = auth.uid()))
  with check (exists (select 1 from recipe r where r.id = recipe_id and r.author_id = auth.uid()));

drop policy if exists "recipe_step read" on recipe_step;
create policy "recipe_step read" on recipe_step for select using (
  exists (select 1 from recipe r where r.id = recipe_id and (r.is_published or r.author_id = auth.uid())));
drop policy if exists "recipe_step write" on recipe_step;
create policy "recipe_step write" on recipe_step for all using (
  exists (select 1 from recipe r where r.id = recipe_id and r.author_id = auth.uid()))
  with check (exists (select 1 from recipe r where r.id = recipe_id and r.author_id = auth.uid()));

-- ============ makes: visible per author public/follower; author writes ============
drop policy if exists "make read" on recipe_make;
create policy "make read" on recipe_make for select using (
  author_id = auth.uid()
  or exists (select 1 from profiles p where p.id = author_id and p.is_public)
  or exists (select 1 from user_follows f where f.following_id = author_id and f.follower_id = auth.uid() and f.status = 'accepted'));
drop policy if exists "make insert own" on recipe_make;
create policy "make insert own" on recipe_make for insert with check (author_id = auth.uid());
drop policy if exists "make update own" on recipe_make;
create policy "make update own" on recipe_make for update using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "make delete own" on recipe_make;
create policy "make delete own" on recipe_make for delete using (author_id = auth.uid());

drop policy if exists "make_likes owner" on make_likes;
create policy "make_likes owner" on make_likes using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ============ private per-user tables: owner only ============
drop policy if exists "pantry owner" on pantry_item;
create policy "pantry owner" on pantry_item using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "saved owner" on saved_recipe;
create policy "saved owner" on saved_recipe using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "collection owner" on collection;
create policy "collection owner" on collection using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "collection_item owner" on collection_item;
create policy "collection_item owner" on collection_item using (
  exists (select 1 from collection c where c.id = collection_id and c.profile_id = auth.uid()))
  with check (exists (select 1 from collection c where c.id = collection_id and c.profile_id = auth.uid()));

-- ============ social graph (reused from the Hoard base) ============
create table if not exists user_follows (
  follower_id  uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  status       text not null default 'accepted' check (status in ('accepted','pending')),
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);
alter table user_follows enable row level security;
drop policy if exists "follows visible" on user_follows;
create policy "follows visible" on user_follows for select using (
  follower_id = auth.uid() or following_id = auth.uid()
  or exists (select 1 from profiles p where p.id = following_id and p.is_public));

create or replace function public.follow_user(target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); is_pub boolean; st text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target = me then raise exception 'cannot follow yourself'; end if;
  select is_public into is_pub from profiles where id = target;
  st := case when is_pub then 'accepted' else 'pending' end;
  insert into user_follows (follower_id, following_id, status) values (me, target, st)
    on conflict (follower_id, following_id) do nothing;
  return st;
end $$;
create or replace function public.unfollow_user(target uuid)
returns void language sql security definer set search_path = public as $$
  delete from user_follows where follower_id = auth.uid() and following_id = target;
$$;

-- ============ reviews (reused; entity_type extended to include 'recipe') ============
create table if not exists content_reviews (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references profiles(id) on delete cascade,
  entity_type      text not null check (entity_type in ('recipe')),
  entity_key       text not null,        -- recipe id (uuid as text)
  rating           smallint check (rating between 1 and 5),
  body             text,
  like_count       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (author_id, entity_type, entity_key),
  constraint review_not_empty check (rating is not null or (body is not null and length(trim(body)) > 0))
);
create index if not exists content_reviews_entity_idx on content_reviews (entity_type, entity_key, created_at desc);
alter table content_reviews enable row level security;
drop policy if exists "reviews visible" on content_reviews;
create policy "reviews visible" on content_reviews for select using (
  author_id = auth.uid()
  or exists (select 1 from profiles p where p.id = author_id and p.is_public)
  or exists (select 1 from user_follows f where f.following_id = author_id and f.follower_id = auth.uid() and f.status = 'accepted'));
drop policy if exists "reviews write own" on content_reviews;
create policy "reviews write own" on content_reviews for all using (author_id = auth.uid()) with check (author_id = auth.uid());

-- ============ keep recipe.make_count / rating_avg in sync ============
create or replace function public.refresh_recipe_stats(rid uuid)
returns void language sql security definer set search_path = public as $$
  update recipe set
    make_count = (select count(*) from recipe_make where recipe_id = rid),
    rating_avg = (select round(avg(rating)::numeric, 2) from recipe_make where recipe_id = rid and rating is not null)
  where id = rid;
$$;
create or replace function public.on_make_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_recipe_stats(coalesce(new.recipe_id, old.recipe_id));
  return null;
end $$;
drop trigger if exists make_stats on recipe_make;
create trigger make_stats after insert or update or delete on recipe_make
  for each row execute function public.on_make_change();

-- ============ feed: makes from people you follow ============
create or replace function public.following_feed(limit_n int default 50)
returns setof recipe_make language sql security definer set search_path = public as $$
  select m.* from recipe_make m
  join user_follows f on f.following_id = m.author_id
  where f.follower_id = auth.uid() and f.status = 'accepted'
  order by m.created_at desc
  limit limit_n;
$$;
