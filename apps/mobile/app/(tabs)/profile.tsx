import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { computeBadges } from '@cookhoard/core';
import { useStore } from '../../src/store';
import { Screen, Card, Chip, Btn } from '../../src/ui';
import { colors, font, space } from '../../src/theme';
import { LANGS, setLanguage, currentLanguage } from '../../src/i18n';
import { isCloud } from '../../src/cloud/backend';
import { useSession } from '../../src/cloud/session';

function SignOut() {
  const { t } = useTranslation();
  const { signOut } = useSession();
  return <Btn label={t('common.signOut')} tone="ghost" icon="log-out-outline" onPress={() => signOut()} style={{ marginTop: space(3) }} />;
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { userRecipes, makes, savedIds } = useStore();
  const lang = currentLanguage();
  const badges = computeBadges(userRecipes, makes);

  const Stat = ({ n, label }: { n: number; label: string }) => (
    <View style={styles.stat}>
      <Text style={font.h1}>{n}</Text>
      <Text style={font.tiny}>{label}</Text>
    </View>
  );

  return (
    <Screen title={t('profile.title')}>
      <Card style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: space(4) }}>
        <Stat n={userRecipes.length} label={t('profile.recipes')} />
        <Stat n={makes.length} label={t('profile.makes')} />
        <Stat n={savedIds.length} label={t('profile.saved')} />
      </Card>

      <Card style={{ padding: 0, marginTop: space(1) }}>
        <Pressable style={styles.row} onPress={() => router.push('/feed')}>
          <Text style={font.body}>{t('feed.title')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </Card>

      <Text style={[font.h2, { marginTop: space(4), marginBottom: space(2) }]}>{t('profile.badges')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {badges.map((b) => (
          <Chip
            key={b.id}
            tone={b.earned ? 'ready' : 'ghost'}
            icon={b.earned ? 'ribbon' : 'ellipse-outline'}
            label={b.earned ? t(`badges.${b.id}`) : `${t(`badges.${b.id}`)} · ${b.progress}/${b.goal}`}
          />
        ))}
      </View>

      <Text style={[font.h2, { marginTop: space(4), marginBottom: space(2) }]}>{t('profile.language')}</Text>
      <Card style={{ padding: 0 }}>
        {LANGS.map((l, idx) => (
          <Pressable
            key={l.code}
            onPress={() => setLanguage(l.code).then(() => i18n.changeLanguage(l.code))}
            style={[styles.row, idx < LANGS.length - 1 && styles.rowBorder]}
          >
            <Text style={font.body}>{l.label}</Text>
            {lang === l.code ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
          </Pressable>
        ))}
      </Card>

      <Text style={[font.h2, { marginTop: space(4), marginBottom: space(2) }]}>{t('profile.about')}</Text>
      <Card><Text style={font.muted}>{t('profile.aboutText')}</Text></Card>

      {isCloud ? <SignOut /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stat: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(3), paddingVertical: space(3.5) },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
