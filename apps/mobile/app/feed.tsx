// Activity feed. Cloud mode: makes from the cooks you follow. Local mode: your own cooking
// diary — publishes, remixes and makes, newest first — so the screen is alive from day 1.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { Make } from '@cookhoard/core';
import { useStore } from '../src/store';
import { Screen, Card, Stars, EmptyState } from '../src/ui';
import { colors, font, space } from '../src/theme';
import { iconFor } from '../src/format';
import { isCloud } from '../src/cloud/backend';
import { CloudSource } from '../src/cloud/source';

type Item = {
  id: string; kind: 'make' | 'recipe' | 'remix'; recipeId: string;
  authorName?: string; rating?: number; createdAt: string;
};

export default function Feed() {
  const { t } = useTranslation();
  const router = useRouter();
  const { recipeById, makes, userRecipes } = useStore();
  const [cloudItems, setCloudItems] = useState<Make[] | null>(null);

  useEffect(() => {
    if (isCloud) CloudSource.feed().then(setCloudItems).catch(() => setCloudItems([]));
  }, []);

  const items: Item[] = isCloud
    ? (cloudItems ?? []).map((m) => ({ id: m.id, kind: 'make', recipeId: m.recipeId, authorName: m.authorName, rating: m.rating, createdAt: m.createdAt }))
    : [
        ...makes.map((m): Item => ({ id: `m:${m.id}`, kind: 'make', recipeId: m.recipeId, authorName: m.authorName, rating: m.rating, createdAt: m.createdAt })),
        ...userRecipes.map((r): Item => ({ id: `r:${r.id}`, kind: r.remixOf ? 'remix' : 'recipe', recipeId: r.id, authorName: r.authorName, createdAt: r.createdAt })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const verb = (k: Item['kind']) => (k === 'make' ? t('feed.cooked') : k === 'remix' ? t('feed.remixed') : t('feed.published'));
  const icon = (k: Item['kind']) => (k === 'make' ? 'flame' : k === 'remix' ? 'git-branch-outline' : 'create-outline');

  const pending = isCloud && cloudItems === null;

  return (
    <Screen title={t('feed.title')}>
      {pending ? null : items.length === 0 ? (
        <EmptyState icon="people-outline" text={isCloud ? t('feed.empty') : t('feed.emptyLocal')} />
      ) : (
        items.map((it) => {
          const r = recipeById(it.recipeId);
          return (
            <Card key={it.id} style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => router.push(`/recipe/${it.recipeId}`)}>
              <Ionicons name={r ? iconFor(r) : 'restaurant-outline'} size={22} color={colors.textMuted} />
              <View style={{ flex: 1, marginLeft: space(3) }}>
                <Text style={font.h3} numberOfLines={1}>{r?.title ?? it.recipeId}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <Ionicons name={icon(it.kind) as any} size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
                  <Text style={font.tiny}>{it.authorName ?? '—'} {verb(it.kind)}</Text>
                </View>
              </View>
              {it.rating ? <Stars value={it.rating} size={13} /> : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
