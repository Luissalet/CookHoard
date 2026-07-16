import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  INGREDIENTS, detectTimer, type Recipe, type RecipeIngredient, type RecipeStep,
  type Season, type Temperature, type Heaviness,
} from '@cookhoard/core';
import { useStore, uid } from '../src/store';
import { Screen, Btn, Field, SectionTitle } from '../src/ui';
import { colors, font, radius, space } from '../src/theme';
import { currentLanguage } from '../src/i18n';

function resolveIngredientId(name: string): string {
  const q = name.trim().toLowerCase();
  const hit = INGREDIENTS.find((i) => i.name.toLowerCase() === q || i.nameEn.toLowerCase() === q);
  return hit ? hit.id : q.replace(/\s+/g, '_');
}

export default function Publish() {
  const { t } = useTranslation();
  const router = useRouter();
  const { remixOf } = useLocalSearchParams<{ remixOf?: string }>();
  const { addRecipe, recipeById } = useStore();
  const base = remixOf ? recipeById(String(remixOf)) : undefined;

  // Remixing pre-fills the whole editor with the base recipe (Thingiverse-style).
  const [title, setTitle] = useState(base ? `${base.title} — remix` : '');
  const [desc, setDesc] = useState(base?.description ?? '');
  const [cuisine, setCuisine] = useState(base?.cuisine ?? '');
  const [temperature, setTemperature] = useState<Temperature>(base?.temperature ?? 'hot');
  const [heaviness, setHeaviness] = useState<Heaviness>(base?.heaviness ?? 2);
  const [seasons, setSeasons] = useState<Season[]>(base?.seasonAffinity ?? []);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(base ? base.ingredients.map((i) => ({ ...i })) : []);
  const [steps, setSteps] = useState<RecipeStep[]>(base ? base.steps.map((s) => ({ ...s })) : []);
  const [ingText, setIngText] = useState('');
  const [ingQty, setIngQty] = useState('');
  const [ingUnit, setIngUnit] = useState('');
  const [stepText, setStepText] = useState('');
  const [stepMin, setStepMin] = useState('');

  const lang = currentLanguage();

  function addIngredient() {
    const name = ingText.trim();
    if (!name) return;
    setIngredients((p) => [...p, {
      ingredientId: resolveIngredientId(name),
      quantity: ingQty ? Number(ingQty) : undefined,
      unit: ingUnit || undefined,
    }]);
    setIngText(''); setIngQty(''); setIngUnit('');
  }
  function addStep() {
    const text = stepText.trim();
    if (!text) return;
    // Manual minutes win; otherwise sniff the text ("hornea 20 min" → 20:00 in cook mode).
    const manual = stepMin ? Math.round(Number(stepMin.replace(',', '.')) * 60) : undefined;
    const timerSec = manual && manual > 0 ? manual : detectTimer(text);
    setSteps((p) => [...p, { text, timerSec }]);
    setStepText(''); setStepMin('');
  }
  function labelOf(ri: RecipeIngredient) {
    const ing = INGREDIENTS.find((i) => i.id === ri.ingredientId);
    const nm = ing ? (lang === 'en' ? ing.nameEn : ing.name) : ri.ingredientId.replace(/_/g, ' ');
    return [ri.quantity, ri.unit, nm].filter(Boolean).join(' ');
  }

  function save() {
    if (!title.trim()) { Alert.alert(t('publish.needTitle')); return; }
    if (ingredients.length === 0) { Alert.alert(t('publish.needIngredient')); return; }
    const recipe: Recipe = {
      id: uid(),
      authorId: 'me',
      authorName: lang === 'en' ? 'You' : 'Tú',
      remixOf: base?.id,
      title: title.trim(),
      description: desc.trim() || undefined,
      cuisine: cuisine.trim() || undefined,
      servings: base?.servings,
      prepMin: base?.prepMin,
      cookMin: base?.cookMin,
      difficulty: base?.difficulty,
      dietFlags: base?.dietFlags,
      allergens: base?.allergens,
      temperature,
      heaviness,
      seasonAffinity: seasons,
      ingredients,
      steps,
      createdAt: new Date().toISOString(),
      makeCount: 0,
    };
    addRecipe(recipe);
    router.back();
  }

  const Seg = <T extends string | number>({ opts, value, onChange, labelFn }: {
    opts: T[]; value: T; onChange: (v: T) => void; labelFn: (v: T) => string;
  }) => (
    <View style={styles.seg}>
      {opts.map((o) => (
        <Pressable key={String(o)} onPress={() => onChange(o)} style={[styles.segItem, value === o && styles.segOn]}>
          <Text style={{ color: value === o ? colors.accentInk : colors.textMuted, fontWeight: '700', fontSize: 13 }}>{labelFn(o)}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Screen title={base ? t('remix.cta') : t('publish.title')}>
      {base ? (
        <View style={styles.remixBanner}>
          <Ionicons name="git-branch-outline" size={15} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, marginLeft: 6, flex: 1 }} numberOfLines={1}>
            {t('remix.of', { title: base.title })}
          </Text>
        </View>
      ) : null}

      <Field label={t('publish.name')} value={title} onChangeText={setTitle} placeholder={t('publish.namePh')} />
      <Field label={t('publish.desc')} value={desc} onChangeText={setDesc} placeholder={t('publish.descPh')} multiline />
      <Field label={t('publish.cuisine')} value={cuisine} onChangeText={setCuisine} placeholder={t('publish.cuisinePh')} />

      <Text style={[font.muted, { marginBottom: 6 }]}>{t('publish.temperature')}</Text>
      <Seg opts={['hot', 'cold', 'room'] as Temperature[]} value={temperature} onChange={setTemperature} labelFn={(o) => t(`temp.${o}`)} />

      <Text style={[font.muted, { marginTop: space(3), marginBottom: 6 }]}>{t('publish.heaviness')}</Text>
      <Seg opts={[1, 2, 3] as Heaviness[]} value={heaviness} onChange={setHeaviness} labelFn={(o) => t(`heavy.${o}`)} />

      <Text style={[font.muted, { marginTop: space(3), marginBottom: 6 }]}>{t('publish.season')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {(['spring', 'summer', 'autumn', 'winter'] as Season[]).map((sn) => {
          const on = seasons.includes(sn);
          return (
            <Pressable key={sn} onPress={() => setSeasons((p) => on ? p.filter((x) => x !== sn) : [...p, sn])}
              style={[styles.sChip, on && styles.sChipOn]}>
              <Text style={{ color: on ? colors.accentInk : colors.textMuted, fontWeight: '700', fontSize: 13 }}>{t(`season.${sn}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Ingredients */}
      <SectionTitle>{t('publish.ingredients')}</SectionTitle>
      {ingredients.map((ri, idx) => (
        <View key={idx} style={styles.listRow}>
          <Text style={[font.body, { flex: 1 }]}>{labelOf(ri)}</Text>
          <Pressable onPress={() => setIngredients((p) => p.filter((_, i) => i !== idx))} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput style={[styles.input, { flex: 2 }]} value={ingText} onChangeText={setIngText} placeholder={t('publish.ingredientPh')} placeholderTextColor={colors.textMuted} onSubmitEditing={addIngredient} />
        <TextInput style={[styles.input, { width: 52, marginLeft: 6, textAlign: 'center' }]} value={ingQty} onChangeText={setIngQty} placeholder={t('publish.qty')} placeholderTextColor={colors.textMuted} keyboardType="numeric" />
        <TextInput style={[styles.input, { width: 64, marginLeft: 6 }]} value={ingUnit} onChangeText={setIngUnit} placeholder={t('publish.unit')} placeholderTextColor={colors.textMuted} />
        <Pressable onPress={addIngredient} style={styles.addBtn}><Ionicons name="add" size={22} color={colors.accentInk} /></Pressable>
      </View>

      {/* Steps */}
      <SectionTitle>{t('publish.steps')}</SectionTitle>
      {steps.map((st, idx) => (
        <View key={idx} style={styles.listRow}>
          <Text style={{ color: colors.accent, fontWeight: '800', marginRight: 8 }}>{idx + 1}</Text>
          <Text style={[font.body, { flex: 1 }]}>{st.text}</Text>
          {st.timerSec ? (
            <Pressable
              onPress={() => setSteps((p) => p.map((x, i) => (i === idx ? { text: x.text } : x)))}
              hitSlop={8}
              style={styles.timerBadge}
            >
              <Ionicons name="timer-outline" size={13} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12, marginLeft: 3 }}>
                {st.timerSec >= 60 ? `${Math.round(st.timerSec / 60)} min` : `${st.timerSec} s`}
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setSteps((p) => p.filter((_, i) => i !== idx))} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput style={[styles.input, { flex: 1 }]} value={stepText} onChangeText={setStepText} placeholder={t('publish.stepPh')} placeholderTextColor={colors.textMuted} onSubmitEditing={addStep} />
        <TextInput style={[styles.input, { width: 58, marginLeft: 6, textAlign: 'center' }]} value={stepMin} onChangeText={setStepMin} placeholder={t('publish.stepMin')} placeholderTextColor={colors.textMuted} keyboardType="numeric" />
        <Pressable onPress={addStep} style={styles.addBtn}><Ionicons name="add" size={22} color={colors.accentInk} /></Pressable>
      </View>
      <Text style={[font.tiny, { marginTop: 6 }]}>{t('publish.stepTimerHint')}</Text>

      <Btn label={t('publish.saveCta')} icon="checkmark" onPress={save} style={{ marginTop: space(5) }} />
    </Screen>
  );
}

const styles = StyleSheet.creat