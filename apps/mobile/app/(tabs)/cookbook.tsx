import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { Screen, RecipeCard, Card, Btn, EmptyState, Stars } from '../../src/ui';
import { colors, font, radius, space } from '../../src/theme';
import { iconFor } from '../../src/format';

type Tab = 'mine' | 'saved' | 'makes';

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={qa.box} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export default function Cookbook() {
  const { t } = useTranslation();
  const router = useRouter();
  const { recipes, userRecipes, savedIds, makes, recipeById } = useStore();
  const [tab, setTab] = useState<Tab>('mine');

  const saved = recipes.filter((r) => savedIds.includes(r.id));

  return (
    <Screen title={t('cookbook.title')} headerRight={
      <Pressable onPress={() => router.push('/publish')} style={styles.plus}>
        <Text style={{ color: colors.accentInk, fontWeight: '800', fontSize: 20, lineHeight: 22 }}>+</Text>
      </Pressable>
    }>
      <View style={styles.quick}>
        <QuickAction icon="calendar-outline" label={t('cookbook.menu')} onPress={() => router.push('/menu')} />
        <QuickAction icon="cart-outline" label={t('cookbook.shopping')} onPress={() => router.push('/shopping')} />
        <QuickAction icon="download-outline" label={t('cookbook.importRecipe')} onPress={() => router.push('/import')} />
      </View>

      <View style={styles.seg}>
        {(['mine', 'saved', 'makes'] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.segItem, tab === k && styles.segOn]}>
            <Text style={{ color: tab === k ? colors.text : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
              {t(`cookbook.${k === 'makes' ? 'myMakes' : k}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'mine' && (
        userRecipes.length === 0
          ? <View style={{ marginTop: space(6) }}>
              <EmptyState icon="create-outline" text={t('cookbook.emptyMine')} />
              <Btn label={t('cookbook.publish')} icon="add" onPress={() => router.push('/publish')} style={{ marginTop: space(2) }} />
            </View>
          : userRecipes.map((r) => <RecipeCard key={r.id} recipe={{ ...r, saved: savedIds.includes(r.id) }} />)
      )}

      {tab === 'saved' && (
        saved.length === 0
          ? <EmptyState icon="bookmark-outline" text={t('cookbook.emptySaved')} />
          : saved.map((r) => <RecipeCard key={r.id} recipe={r} />)
      )}

      {tab === 'makes' && (
        makes.length === 0
          ? <EmptyState icon="camera-outline" text={t('cookbook.emptyMakes')} />
          : makes.map((m) => {
              const r = recipeById(m.recipeId);
              return (
                <Card key={m.id} style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => router.push(`/recipe/${m.recipeId}`)}>
                  <View style={styles.thumb}><Ionicons name={r ? iconFor(r) : 'restaurant-outline'} size={20} color={colors.textMuted} /></View>
                  <View style={{ flex: 1, marginLeft: space(3) }}>
                    <Text style={font.h3} numberOfLines={1}>{r?.title ?? m.recipeId}</Text>
                    {m.rating ? <Stars value={m.rating} size={14} /> : null}
                    {m.notes ? <Text style={[font.tiny, { marginTop: 2 }]} numberOfLines={2}>{m.notes}</Text> : null}
                  </View>
                </Card>
              );
            })
      )}
    </Screen>
  );
}

const qa = StyleSheet.create({
  box: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: 'center' },
});
const styles = StyleSheet.create({
  plus: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  quick: { flexDirection: 'row', gap: space(2), marginBottom: space(3) },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.border, marginBottom: space(3) },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  segOn: { backgroundColor: colors.surfaceAlt },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
