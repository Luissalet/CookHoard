import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  recommend, seasonForMonth, expiringSoon, useItUp,
  INGREDIENTS, INGREDIENT_BY_ID, DEFAULT_STAPLES, type Reason,
} from '@cookhoard/core';
import { useStore } from '../../src/store';
import { Screen, RecipeCard, Chip, SectionTitle, EmptyState, Card } from '../../src/ui';
import { colors, font, radius, space } from '../../src/theme';
import { ingredientName, ingredientNameFrom } from '../../src/format';
import { currentLanguage } from '../../src/i18n';
import { findByIngredients, hasSpoonacular } from '../../src/services/spoonacular';
import { byIngredient } from '../../src/services/themealdb';
import { lookupBarcode } from '../../src/services/openfoodfacts';

function monthShort(m: number): string {
  return new Date(2021, m - 1, 1)
    .toLocaleString(currentLanguage() === 'en' ? 'en' : 'es', { month: 'short' })
    .replace('.', '');
}
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export default function Fridge() {
  const { t } = useTranslation();
  const {
    recipes, pantry, pantryExpiry, addPantry, removePantry, clearPantry, setExpiry, pantryItems,
    month, setMonth, hemisphere, setHemisphere, addSessionRecipes,
  } = useStore();
  const [text, setText] = useState('');
  const [barcode, setBarcode] = useState('');
  const [loadingOnline, setLoadingOnline] = useState(false);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return INGREDIENTS
      .filter((i) => !i.isStaple && !pantry.includes(i.id) &&
        (i.name.toLowerCase().includes(q) || i.nameEn.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [text, pantry]);

  const scored = useMemo(
    () => recommend(recipes, { pantry, month, hemisphere, staples: DEFAULT_STAPLES }),
    [recipes, pantry, month, hemisphere],
  );
  const ready = scored.filter((s) => s.bucket === 'ready');
  const almost = scored.filter((s) => s.bucket === 'missing1' || s.bucket === 'missing2to3');
  const season = seasonForMonth(month, hemisphere);

  const expiring = expiringSoon(pantryItems(), 3);
  const expiringIds = expiring.map((e) => e.ingredientId);
  const useUp = expiringIds.length
    ? useItUp(recipes, expiringIds, { pantry, month, hemisphere, staples: DEFAULT_STAPLES }).slice(0, 1)
    : [];

  async function fetchOnline() {
    if (pantry.length === 0) return;
    setLoadingOnline(true);
    try {
      const names = pantry.map((id) => INGREDIENT_BY_ID[id]?.nameEn ?? id);
      const first = names[0] ?? '';
      const [sp, md] = await Promise.all([findByIngredients(names), byIngredient(first)]);
      addSessionRecipes([...sp, ...md]);
    } finally {
      setLoadingOnline(false);
    }
  }

  async function scan() {
    const code = barcode.trim();
    if (!code) return;
    const guess = await lookupBarcode(code);
    if (guess?.ingredientId) addPantry(guess.ingredientId);
    setBarcode('');
  }

  function reasonChips(reasons: Reason[]) {
    return reasons.map((r, idx) => {
      if (r.kind === 'ready') return <Chip key={idx} label={t('reason.ready')} tone="ready" icon="checkmark-circle" />;
      if (r.kind === 'missing') return <Chip key={idx} label={t('reason.missing', { count: r.count })} tone="warn" icon="cart-outline" />;
      if (r.kind === 'inSeason') return <Chip key={idx} label={t('reason.inSeason')} tone="ready" icon="leaf-outline" />;
      if (r.kind === 'outSeason') return <Chip key={idx} label={t('reason.outSeason')} tone="ghost" icon="snow-outline" />;
      return <Chip key={idx} label={t('reason.popular')} tone="accent" icon="star" />;
    });
  }
  const missLabel = (missing: string[]) =>
    missing.length ? `${t('recipe.miss')}: ${missing.map(ingredientName).join(', ')}` : undefined;

  return (
    <Screen title={t('fridge.title')}>
      <Text style={[font.muted, { marginTop: -space(1), marginBottom: space(3) }]}>{t('fridge.subtitle')}</Text>

      {/* Add ingredient */}
      <View style={styles.searchBox}>
        <Ionicons name="add" size={20} color={colors.accent} />
        <TextInput
          style={styles.searchInput}
          value={text}
          onChangeText={setText}
          placeholder={t('fridge.addPh')}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={() => { const m = suggestions[0]; if (m) { addPantry(m.id); setText(''); } }}
          returnKeyType="done"
        />
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestRow}>
          {suggestions.map((i) => (
            <Pressable key={i.id} style={styles.suggest} onPress={() => { addPantry(i.id); setText(''); }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{ingredientNameFrom(i)}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Barcode */}
      <View style={[styles.searchBox, { marginTop: space(2) }]}>
        <Ionicons name="barcode-outline" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={barcode}
          onChangeText={setBarcode}
          placeholder={t('fridge.barcodePh')}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          onSubmitEditing={scan}
          returnKeyType="search"
        />
        <Pressable onPress={scan}><Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{t('fridge.scan')}</Text></Pressable>
      </View>

      {/* Current pantry */}
      {pantry.length > 0 && (
        <>
          <SectionTitle right={
            <Pressable onPress={clearPantry}><Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('fridge.clear')}</Text></Pressable>
          }>{t('fridge.yourFridge')}</SectionTitle>
          <View style={styles.pantryRow}>
            {pantry.map((id) => {
              const expires = !!pantryExpiry[id];
              return (
                <View key={id} style={[styles.pantryChip, expires && { borderColor: colors.warn }]}>
                  <Pressable onPress={() => setExpiry(id, expires ? null : inDays(2))} hitSlop={4}>
                    <Ionicons name={expires ? 'time' : 'time-outline'} size={14} color={expires ? colors.warn : colors.textMuted} style={{ marginRight: 6 }} />
                  </Pressable>
                  <Pressable onPress={() => removePantry(id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.text, fontSize: 13, marginRight: 6 }}>{ingredientName(id)}</Text>
                    <Ionicons name="close" size={13} color={colors.textMuted} />
                  </Pressable>
                </View>
              );
            })}
          </View>
          <Text style={[font.tiny, { marginTop: space(1) }]}>{t('fridge.staplesNote')}</Text>

          <Pressable style={styles.online} onPress={fetchOnline} disabled={loadingOnline}>
            {loadingOnline ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="cloud-download-outline" size={16} color={colors.accent} />}
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>
              {t('fridge.getOnline')}{hasSpoonacular ? '' : ' · TheMealDB'}
            </Text>
          </Pressable>
        </>
      )}

      {/* Expiring soon */}
      {expiring.length > 0 && (
        <>
          <SectionTitle>{t('fridge.expiring')}</SectionTitle>
          <Card style={{ marginBottom: space(1) }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {expiringIds.map((id) => <Chip key={id} label={ingredientName(id)} tone="warn" icon="time" />)}
            </View>
          </Card>
          {useUp.map((sc) => <RecipeCard key={sc.recipe.id} recipe={sc.recipe} subtitle={missLabel(sc.missing)} />)}
        </>
      )}

      {/* Month + hemisphere */}
      <SectionTitle right={<Chip label={t(`season.${season}`)} tone="ready" icon="leaf-outline" />}>{t('fridge.month')}</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: space(4) }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <Pressable key={m} onPress={() => setMonth(m)} style={[styles.month, m === month && styles.monthOn]}>
            <Text style={{ color: m === month ? colors.accentInk : colors.textMuted, fontWeight: '700', fontSize: 13 }}>{monthShort(m)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', marginTop: space(2) }}>
        {(['N', 'S'] as const).map((h) => (
          <Pressable key={h} onPress={() => setHemisphere(h)} style={[styles.hemi, h === hemisphere && styles.hemiOn]}>
            <Text style={{ color: h === hemisphere ? colors.accentInk : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
              {h === 'N' ? t('fridge.north') : t('fridge.south')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Results */}
      {pantry.length === 0 ? (
        <EmptyState icon="snow-outline" text={t('fridge.empty')} />
      ) : (
        <>
          <SectionTitle>{t('fridge.cookNow')}</SectionTitle>
          {ready.length === 0 ? (
            <Text style={[font.muted, { marginBottom: space(2) }]}>—</Text>
          ) : (
            ready.map((sc) => <RecipeCard key={sc.recipe.id} recipe={sc.recipe} chips={reasonChips(sc.reasons)} />)
          )}
          {almost.length > 0 && (
            <>
              <SectionTitle>{t('fridge.results')}</SectionTitle>
              {almost.map((sc) => (
                <RecipeCard key={sc.recipe.id} recipe={sc.recipe} subtitle={missLabel(sc.missing)} chips={reasonChips(sc.reasons)} />
              ))}
            </>
          )}
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
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space(2) },
  suggest: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6 },
  pantryRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pantryChip: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong,
    paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6,
  },
  online: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: space(2), backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  month: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: 6 },
  monthOn: { backgroundColor: colors.accent },
  hemi: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: 6 },
  hemiOn: { backgroundColor: colors.ready },
});
                                 