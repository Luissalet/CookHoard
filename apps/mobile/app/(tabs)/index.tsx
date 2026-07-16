// Discover — the dynamic home: live search, quick filter chips, and stacked carousels
// ("cook right now" from your fridge, in season now, recent remixes, most cooked, fresh).
import React, { useMemo, useState } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  recommend, seasonForMonth, dishSeasonFit, DEFAULT_STAPLES, type Recipe,
} from '@cookhoard/core';
import { useStore } from '../../src/store';
import { Screen, RecipeCard, RecipeTile, HScroll, EmptyState, SectionTitle, Card, Btn } from '../../src/ui';
import { colors, font, radius, space } from '../../src/theme';
import { ingredientName, totalMinutes } from '../../src/format';
import { searchMeals, randomMeals } from '../../src/services/themealdb';

type Filter = 'all' | 'quick' | 'veggie' | 'light' | 'hearty' | 'cold';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'fAll' }, { key: 'quick', label: 'fQuick' }, { key: 'veggie', label: 'fVeggie' },
  { key: 'light', label: 'fLight' }, { key: 'hearty', label: 'fHearty' }, { key: 'cold', label: 'fCold' },
];

function matchesFilter(r: Recipe, f: Filter): boolean {
  switch (f) {
    case 'quick': return totalMinutes(r) > 0 && totalMinutes(r) <= 25;
    case 'veggie': return (r.dietFlags ?? []).some((d) => d.startsWith('vega') || d === 'vegetariano');
    case 'light': return r.heaviness === 1;
    case 'hearty': return r.heaviness === 3;
    case 'cold': return r.temperature === 'cold';
    default: return true;
  }
}

export default function Discover() {
  const { t } = useTranslation();
  const router = useRouter();
  const { recipes, addSessionRecipes, pantry, month, hemisphere, recipeById } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);

  const browsing = !q.trim() && filter === 'all';

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = recipes.filter((r) => matchesFilter(r, filter));
    if (query) {
      list = list.filter((r) => {
        const hay = [r.title, r.cuisine ?? '', ...r.ingredients.map((i) => ingredientName(i.ingredientId))].join(' ').toLowerCase();
        return hay.includes(query);
      });
    }
    return [...list].sort((a, b) => (b.makeCount ?? 0) - (a.makeCount ?? 0) || (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0));
  }, [recipes, q, filter]);

  const season = seasonForMonth(month, hemisphere);
  const readyNow = useMemo(() => {
    if (!pantry.length) return [];
    return recommend(recipes, { pantry, month, hemisphere, staples: DEFAULT_STAPLES })
      .filter((s) => s.bucket === 'ready').slice(0, 10).map((s) => s.recipe);
  }, [recipes, pantry, month, hemisphere]);
  const inSeason = useMemo(
    () => recipes
      .map((r) => ({ r, fit: dishSeasonFit(r, season) }))
      .filter((x) => x.fit >= 0.34)
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 10).map((x) => x.r),
    [recipes, season],
  );
  const recentRemixes = useMemo(
    () => recipes.filter((r) => r.remixOf).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [recipes],
  );
  const popular = useMemo(
    () => [...recipes].sort((a, b) => (b.makeCount ?? 0) - (a.makeCount ?? 0)).slice(0, 5),
    [recipes],
  );
  const fresh = useMemo(
    () => [...recipes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [recipes],
  );

  async function fetchWeb() {
    setLoading(true);
    try {
      const found = q.trim() ? await searchMeals(q.trim()) : await randomMeals(10);
      addSessionRecipes(found);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title={t('discover.title')}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder={t('discover.searchPh')}
          placeholderTextColor={colors.textMuted}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Quick filters */}
      <HScroll>
        <View style={{ flexDirection: 'row', marginTop: space(2.5) }}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.filter, on && styles.filterOn]}>
                <Text style={{ color: on ? colors.accentInk : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
                  {t(`discover.${f.label}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </HScroll>

      {browsing ? (
        <>
          {/* Cook right now (from your fridge) */}
          <SectionTitle right={
            <Pressable onPress={() => router.push('/fridge')} hitSlop={6}>
              <Ionicons name="arrow-forward" size={18} color={colors.accent} />
            </Pressable>
          }>{t('discover.readyNow')}</SectionTitle>
          {readyNow.length > 0 ? (
            <HScroll>{readyNow.map((r) => <RecipeTile key={r.id} recipe={r} />)}</HScroll>
          ) : (
            <Card>
              <Text style={font.muted}>{t('discover.fridgeCta')}</Text>
              <Btn label={t('discover.fridgeCtaBtn')} tone="ghost" icon="snow-outline" onPress={() => router.push('/fridge')} style={{ marginTop: space(2), alignSelf: 'flex-start' }} />
            </Card>
          )}

          {/* In season now */}
          {inSeason.length > 0 && (
            <>
              <SectionTitle right={<Text style={font.tiny}>{t(`season.${season}`)}</Text>}>{t('discover.inSeason')}</SectionTitle>
              <HScroll>{inSeason.map((r) => <RecipeTile key={r.id} recipe={r} />)}</HScroll>
            </>
          )}

          {/* Recent remixes */}
          {recentRemixes.length > 0 && (
            <>
              <SectionTitle>{t('discover.remixes')}</SectionTitle>
              {recentRemixes.map((r) => {
                const base = r.remixOf ? recipeById(r.remixOf) : undefined;
                return <RecipeCard key={r.id} recipe={r} subtitle={base ? t('remix.of', { title: base.title }) : undefined} />;
              })}
            </>
          )}

          {/* Most cooked + fresh */}
          <SectionTitle>{t('discover.popular')}</SectionTitle>
          {popular.map((r) => <RecipeCard key={r.id} recipe={r} />)}

          <SectionTitle>{t('discover.fresh')}</SectionTitle>
          {fresh.map((r) => <RecipeCard key={r.id} recipe={r} />)}

          <Pressable style={styles.web} onPress={fetchWeb} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="globe-outline" size={16} color={colors.accent} />}
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>{t('discover.fromWeb')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <SectionTitle>{t('discover.results', { n: filtered.length })}</SectionTitle>
          {filtered.length === 0 ? (
            <EmptyState icon="restaurant-outline" text={t('discover.empty')} />
          ) : (
            filtered.map((r) => <RecipeCard key={r.id} recipe={r} />)
          )}
          <Pressable style={styles.web} onPress={fetchWeb} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="globe-outline" size={16} color={colors.accent} />}
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>{t('discover.fromWeb')}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingHorizontal: space(4), height: 46,
  },
  searchInput: { flex: 1, marginLeft: space(2), color: colors.text, fontSize: 15 },
  filter: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, marginRight: 6 },
  filterOn: { backgroundColor: colors.accent },
  web: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: space(4), backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
});
