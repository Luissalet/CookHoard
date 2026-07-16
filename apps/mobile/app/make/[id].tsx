import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Make } from '@cookhoard/core';
import { useStore, uid } from '../../src/store';
import { Screen, Field, Btn, Stars } from '../../src/ui';
import { colors, font, radius, space } from '../../src/theme';
import { currentLanguage } from '../../src/i18n';

export default function MakeForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { recipeById, addMake } = useStore();
  const recipe = recipeById(String(id));

  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState<boolean | null>(null);

  function save() {
    const make: Make = {
      id: uid(),
      recipeId: String(id),
      authorId: 'me',
      authorName: currentLanguage() === 'en' ? 'You' : 'Tú',
      rating: rating ?? undefined,
      notes: notes.trim() || undefined,
      timeTakenMin: time ? Number(time) : undefined,
      wouldRepeat: repeat ?? undefined,
      createdAt: new Date().toISOString(),
    };
    addMake(make);
    router.back();
  }

  return (
    <Screen title={t('make.title')}>
      {recipe ? <Text style={[font.muted, { marginTop: -space(1), marginBottom: space(3) }]}>{t('make.of', { title: recipe.title })}</Text> : null}

      <Text style={[font.muted, { marginBottom: 8 }]}>{t('make.rating')}</Text>
      <Stars value={rating} onChange={setRating} size={34} />

      <View style={{ marginTop: space(4) }}>
        <Field label={t('make.notes')} value={notes} onChangeText={setNotes} placeholder={t('make.notesPh')} multiline />
        <Field label={t('make.time')} value={time} onChangeText={setTime} placeholder="45" keyboardType="numeric" />
      </View>

      <Text style={[font.muted, { marginBottom: 8 }]}>{t('make.wouldRepeat')}</Text>
      <View style={{ flexDirection: 'row' }}>
        {[{ v: true, l: t('make.yes') }, { v: false, l: t('make.no') }].map(({ v, l }) => (
          <Pressable key={String(v)} onPress={() => setRepeat(v)} style={[styles.chip, repeat === v && (v ? styles.yes : styles.no)]}>
            <Text style={{ color: repeat === v ? colors.accentInk : colors.textMuted, fontWeight: '700' }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      <Btn label={t('make.saveCta')} icon="checkmark" onPress={save} style={{ marginTop: space(5) }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginRight: 8 },
  yes: { backgroundColor: colors.ready },
  no: { backgroundColor: colors.warn },
});
