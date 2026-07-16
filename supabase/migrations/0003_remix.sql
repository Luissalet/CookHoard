-- CookHoard — Phase 5: remixes (Thingiverse-style lineage between recipes).
-- Idempotent: safe to run repeatedly. RLS is inherited from the recipe policies in 0002.

alter table recipe add column if not exists remix_of uuid references recipe(id) on delete set null;
create index if not exists recipe_remix_idx on recipe (remix_of) where remix_of is not null;

-- Convenience view: how many direct remixes each recipe has (for "N remixes" badges).
create or replace view recipe_remix_counts as
  select remix_of as recipe_id, count(*)::int as remix_count
  from recipe
  where remix_of is not null and is_published
  group by remix_of;
