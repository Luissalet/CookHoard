// Cloud reviews on a recipe (rating + text). Reuses content_reviews via CloudSource. Rendered
// only in cloud mode (see recipe/[id].tsx).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Stars, Field, Btn, SectionTitle } from './ui';
import { font, space } from './theme';
import { CloudSource } from './cloud/source';
import { supabase } from './cloud/client';

type Row = { id: string; rating: number | null; body: string | null; created_at: string };

export function ReviewsSection({ recipeId }: { recipeId: string }) {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Row[] | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setReviews((await CloudSource.listReviews(recipeId)) as Row[]);
  }, [recipeId]);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!supabase || (rating === null && !body.trim())) return;
    setBusy(true);
    const { data } = await supabase.auth.getUser();
    const me = data.user?.id;
    if (me) await CloudSource.upsertReview(recipeId, me, rating, body.trim());
    setBody(''); setBusy(false);
    load();
  }

  return (
    <>
      <SectionTitle>{`${t('recipe.makes')} · reviews`}</SectionTitle>
      <Card>
        <Stars value={rating} onChange={setRating} size={22} />
        <View style={{ marginTop: space(2) }}>
          <Field value={body} onChangeText={setBody} placeholder={t('make.notesPh')} multiline />
        </View>
        <Btn label={busy ? '…' : t('common.save')} icon="chatbubble-outline" onPress={submit} />
      </Card>
      {(reviews ?? []).map((r) => (
        <Card key={r.id}>
          {r.rating ? <Stars value={r.rating} size={14} /> : null}
          {r.body ? <Text style={[font.body, { marginTop: 4 }]}>{r.body}</Text> : null}
        </Card>
      ))}
    </>
  );
}
