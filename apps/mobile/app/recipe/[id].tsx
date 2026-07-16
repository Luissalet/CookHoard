import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_STAPLES, estimateRecipeNutrition, buildShoppingList,
  remixesOf, diffRecipes, type RecipeIngredient,
} from '@cookhoard/core';
import { useStore } from '../../src/store';
import { Screen, Card, Chip, Btn, Stars, SectionTitle, RecipeCard } from '../../src/ui';
import { DiagramView } from '../../src/DiagramView';
import { colors, font, radius, space } from '../../src/theme';
import { ingredientName, iconFor, totalMinutes } from '../../src/format';
import { isCloud } from '../../src/cloud/backend';
import { ReviewsSection } from '../../src/ReviewsSection';

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { recipes, recipeById, pantry, addPantry, removePantry, toggleSaved, makesFor, addShopping } = useStore();
  const [stepsView, setStepsView] = useState<'list' | 'flow'>('list');

  const recipe = recipeById(String(id));
  if (!recipe) return <Screen title="—"><Text style={font.muted}>404</Text></Screen>;

  const makes = makesFor(recipe.id);
  const has = (ingId: string) => pantry.includes(ingId) || DEFAULT_STAPLES.has(ingId);
  const isStaple = (ingId: string) => DEFAULT_STAPLES.has(ingId);
  const totalMakes = (recipe.makeCount ?? 0) + makes.length;

  const base = recipe.remixOf ? recipeById(recipe.remixOf) : undefined;
  const diff = useMemo(() => (base ? diffRecipes(base, recipe) : null), [base, recipe]);
  const remixes = useMemo(() => remixesOf(recipes, recipe.id), [recipes, recipe.id]);

  const ingLabel = (ri: RecipeIngredient) =>
    [ri.quantity, ri.unit, ingredientName(ri.ingredientId)].filter(Boolean).join(' ');

  return (
    <>
      <Stack.Screen options={{
        headerRight: () => (
          <Pressable onPress={() => toggleSaved(recipe.id)} hitSlop={10}>
            <Ionicons name={recipe.saved ? 'bookmark' : 'bookmark-outline'} size={22} color={colors.accent} />
          </Pressable>
        ),
      }} />
      <Screen>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroThumb}><Ionicons name={iconFor(recipe)} size={44} color={colors.textMuted} /></View>
          <Text style={[font.h1, { marginTop: space(2) }]}>{recipe.title}</Text>
          {base ? (
            <Pressable onPress={() => router.push(`/recipe/${base.id}`)} style={styles.remixOf}>
              <Ionicons name="git-branch-outline" size={14} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, marginLeft: 5 }}>
                {t('remix.of', { title: base.title })}
              </Text>
            </Pressable>
          ) : null}
          {recipe.description ? <Text style={[font.muted, { marginTop: 4 }]}>{recipe.description}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(2), flexWrap: 'wrap' }}>
            {recipe.ratingAvg ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: space(3) }}>
                <Stars value={Math.round(recipe.ratingAvg)} size={15} />
                <Text style={[font.tiny, { marginLeft: 6 }]}>{recipe.ratingAvg.toFixed(1)}</Text>
              </View>
            ) : null}
            <Text style={font.tiny}>{totalMinutes(recipe)} {t('recipe.min')}</Text>
            {totalMakes > 0 ? (
              <Text style={[font.tiny, { marginLeft: space(3) }]}>{t('recipe.cookedTimes', { n: totalMakes })}</Text>
            ) : null}
          </View>
        </View>

        {/* Primary actions */}
        <View style={{ flexDirection: 'row', gap: space(2), marginBottom: space(3) }}>
          <Btn label={t('recipe.cookMode')} icon="flame" onPress={() => router.push(`/cook/${recipe.id}`)} style={{ flex: 1 }} />
          <Btn label={t('remix.cta')} icon="git-branch-outline" tone="ghost" onPress={() => router.push(`/publish?remixOf=${recipe.id}`)} style={{ flex: 1 }} />
        </View>

        {/* Meta chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space(2) }}>
          {recipe.cuisine ? <Chip label={recipe.cuisine} /> : null}
          {recipe.temperature ? <Chip label={t(`temp.${recipe.temperature}`)} tone="accent" /> : null}
          {recipe.heaviness ? <Chip label={t(`heavy.${recipe.heaviness}`)} /> : null}
          {recipe.seasonAffinity && recipe.seasonAffinity.length
            ? recipe.seasonAffinity.map((sn) => <Chip key={sn} label={t(`season.${sn}`)} tone="ready" icon="leaf-outline" />)
            : <Chip label={t('season.all')} tone="ready" />}
          {(recipe.dietFlags ?? []).map((d) => <Chip key={d} label={d.replace(/_/g, ' ')} />)}
        </View>

        {/* Remix diff: what this remix changes vs its base */}
        {base && diff ? (
          <>
            <SectionTitle>{t('remix.whatChanged')}</SectionTitle>
            <Card>
              {diff.identical ? (
                <Text style={font.muted}>{t('remix.identical')}</Text>
              ) : (
                <>
                  {diff.addedIngredients.length > 0 && (
                    <View style={styles.diffRow}>
                      <Text style={[styles.diffTag, { color: colors.ready }]}>{t('remix.added')}</Text>
                      <Text style={[font.body, { flex: 1 }]}>{diff.addedIngredients.map(ingLabel).join(', ')}</Text>
                    </View>
                  )}
                  {diff.removedIngredients.length > 0 && (
                    <View style={styles.diffRow}>
                      <Text style={[styles.diffTag, { color: colors.danger }]}>{t('remix.removed')}</Text>
                      <Text style={[font.body, { flex: 1 }]}>{diff.removedIngredients.map((i) => ingredientName(i.ingredientId)).join(', ')}</Text>
                    </View>
                  )}
                  {diff.changedIngredients.length > 0 && (
                    <View style={styles.diffRow}>
                      <Text style={[styles.diffTag, { color: colors.warn }]}>{t('remix.changed')}</Text>
                      <Text style={[font.body, { flex: 1 }]}>
                        {diff.changedIngredients.map((c) => `${ingredientName(c.ingredientId)} (${ingLabel(c.base)} → ${ingLabel(c.remix)})`).join(', ')}
                      </Text>
                    </View>
                  )}
                  {diff.addedSteps.length > 0 && (
                    <View style={styles.diffRow}>
                      <Text style={[styles.diffTag, { color: colors.ready }]}>{t('remix.addedSteps')}</Text>
                      <Text style={[font.body, { flex: 1 }]}>{diff.addedSteps.join(' · ')}</Text>
                    </View>
                  )}
                  {diff.removedSteps.length > 0 && (
                    <View style={styles.diffRow}>
                      <Text style={[styles.diffTag, { color: colors.danger }]}>{t('remix.removedSteps')}</Text>
                      <Text style={[font.body, { flex: 1 }]}>{diff.removedSteps.join(' · ')}</Text>
                    </View>
                  )}
                </>
              )}
            </Card>
          </>
        ) : null}

        {/* Ingredients with fridge match */}
        <SectionTitle>{t('recipe.ingredients')}</SectionTitle>
        <Card style={{ padding: 0 }}>
          {recipe.ingredients.map((ing, idx) => {
            const have = has(ing.ingredientId);
            const staple = isStaple(ing.ingredientId);
            const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
            return (
              <Pressable
                key={idx}
                disabled={staple}
                onPress={() => (have ? removePantry(ing.ingredientId) : addPantry(ing.ingredientId))}
                style={[styles.ingRow, idx < recipe.ingredients.length - 1 && styles.rowBorder]}
              >
                <Ionicons
                  name={have ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={have ? colors.ready : colors.textMuted}
                />
                <Text style={[font.body, { flex: 1, marginLeft: space(2) }, !have && { color: colors.textMuted }]}>
                  {ingredientName(ing.ingredientId)}
                  {ing.optional ? ` · ${t('common.optional')}` : ''}
                </Text>
                {qty ? <Text style={font.tiny}>{qty}</Text> : null}
              </Pressable>
            );
          })}
        </Card>

        {(() => {
          const have = new Set<string>([...pantry, ...DEFAULT_STAPLES]);
          const list = buildShoppingList([recipe], have);
          return list.length ? (
            <Btn label={t('recipe.shop')} tone="ghost" icon="cart-outline" onPress={() => addShopping(list)} style={{ marginTop: space(2) }} />
          ) : null;
        })()}

        {(() => {
          const n = estimateRecipeNutrition(recipe);
          if (!n) return null;
          const cells: [string, string | number][] = [['kcal', n.kcal], ['P', `${n.protein}g`], ['C', `${n.carbs}g`], ['G', `${n.fat}g`]];
          return (
            <>
              <SectionTitle>{t('recipe.nutrition')}</SectionTitle>
              <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {cells.map(([k, v]) => (
                  <View key={k} style={{ alignItems: 'center' }}>
                    <Text style={font.h3}>{v}</Text>
                    <Text style={font.tiny}>{k}</Text>
                  </View>
                ))}
              </Card>
              <Text style={[font.tiny, { marginTop: 4 }]}>{t('recipe.nutriNote')}</Text>
            </>
          );
        })()}

        {/* Steps: list ⇄ flow diagram */}
        <SectionTitle right={
          <View style={styles.seg}>
            {(['list', 'flow'] as const).map((v) => (
              <Pressable key={v} onPress={() => setStepsView(v)} style={[styles.segItem, stepsView === v && styles.segOn]}>
                <Ionicons name={v === 'list' ? 'list' : 'git-network-outline'} size={14} color={stepsView === v ? colors.accentInk : colors.textMuted} />
                <Text style={{ color: stepsView === v ? colors.accentInk : colors.textMuted, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>
                  {t(`diagram.${v}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        }>{t('recipe.steps')}</SectionTitle>

        {stepsView === 'flow' ? (
          <DiagramView recipe={recipe} />
        ) : (
          recipe.steps.map((st, idx) => (
            <View key={idx} style={styles.step}>
              <View style={styles.stepNum}><Text style={{ color: colors.accentInk, fontWeight: '800' }}>{idx + 1}</Text></View>
              <Text style={[font.body, { flex: 1 }]}>{st.text}</Text>
            </View>
          ))
        )}

        <Btn label={t('recipe.iMadeIt')} icon="camera" onPress={() => router.push(`/make/${recipe.id}`)} style={{ marginTop: space(4) }} />

        {/* Remixes of this recipe */}
        <SectionTitle>{`${t('remix.remixes')} (${remixes.length})`}</SectionTitle>
        {remixes.length === 0 ? (
          <Text style={font.muted}>{t('remix.noRemixes')}</Text>
        ) : (
          remixes.map((r) => <RecipeCard key={r.id} recipe={r} subtitle={r.authorName ? t('common.by', { name: r.authorName }) : undefined} />)
        )}

        {/* Makes */}
        <SectionTitle>{`${t('recipe.makes')} (${makes.length})`}</SectionTitle>
        {makes.length === 0 ? (
          <Text style={font.muted}>{t('recipe.noMakes')}</Text>
        ) : (
          makes.map((m) => (
            <Card key={m.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={font.h3}>{m.authorName ?? 'Tú'}</Text>
                {m.rating ? <Stars value={m.rating} size={14} /> : null}
              </View>
              {m.notes ? <Text style={[font.muted, { marginTop: 6 }]}>{m.notes}</Text> : null}
              {(m.timeTakenMin || m.wouldRepeat != null) ? (
                <View style={{ flexDirection: 'row', marginTop: 8 }}>
                  {m.timeTakenMin ? <Chip label={`${m.timeTakenMin} min`} /> : null}
                  {m.wouldRepeat != null ? <Chip label={m.wouldRepeat ? '↻ ' + t('make.yes') : t('make.no')} tone={m.wouldRepeat ? 'ready' : 'ghost'} /> : null}
                </View>
              ) : null}
            </Card>
          ))
        )}

        {isCloud ? <ReviewsSection recipeId={recipe.id} /> : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'flex-start', marginBottom: space(3) },
  heroThumb: { width: 96, height: 96, borderRadius: radius.xl, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  remixOf: { flexDirection: 'row', alignItems: 'center', marginTop: 6, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 10, paddingVertical: 5 },
  diffRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  diffTag: { fontWeight: '800', fontSize: 13, width: 92 },
  ingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(3), paddingVertical: space(3) },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  step: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space(3) },
  stepNum: { width: 26, height: 26, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: space(2.5) },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.border },
  segItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.accent },
});
