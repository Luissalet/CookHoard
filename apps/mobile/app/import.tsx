import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Recipe } from '@cookhoard/core';
import { useStore } from '../src/store';
import { Screen, Field, Btn, Card, EmptyState, SectionTitle } from '../src/ui';
import { colors, font, space } from '../src/theme';
import { Ionicons } from '@expo/vector-icons';
import { iconFor } from '../src/format';
import { importFromUrl, importFromJsonText } from '../src/services/importUrl';

export default function Import() {
  const { t } = useTranslation();
  const router = useRouter();
  const { addRecipe } = useStore();
  const [url, setUrl] = useState('');
  const [json, setJson] = useState('');
  const [preview, setPreview] = useState<Recipe | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr(false); setBusy(true);
    let r: Recipe | null = null;
    if (url.trim()) r = await importFromUrl(url.trim());
    if (!r && json.trim()) r = importFromJsonText(json.trim());
    setBusy(false);
    if (r) setPreview(r); else setErr(true);
  }

  function save() {
    if (!preview) return;
    addRecipe({ ...preview, authorName: 'Tú' });
    router.back();
  }

  return (
    <Screen title={t('import.title')}>
      <Field label={t('import.url')} value={url} onChangeText={setUrl} placeholder={t('import.urlPh')} />
      <Text style={[font.muted, { marginVertical: space(2) }]}>{t('import.or')}</Text>
      <Field value={json} onChangeText={setJson} placeholder={t('import.jsonPh')} multiline />
      <Btn label={busy ? '…' : t('import.go')} icon="download-outline" onPress={go} />

      {err ? <Text style={[font.muted, { color: colors.warn, marginTop: space(3) }]}>{t('import.fail')}</Text> : null}

      {preview ? (
        <>
          <SectionTitle>{t('import.title')}</SectionTitle>
          <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name={iconFor(preview)} size={30} color={colors.textMuted} />
            <View style={{ flex: 1, marginLeft: space(3) }}>
              <Text style={font.h3}>{preview.title}</Text>
              <Text style={font.tiny}>{preview.ingredients.length} ingredientes · {preview.steps.length} pasos</Text>
            </View>
          </Card>
          <Btn label={t('import.save')} icon="checkmark" onPress={save} style={{ marginTop: spac