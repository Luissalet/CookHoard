// Shared UI kit: Screen, Card, Chip, Btn, Stars, Field, EmptyState, RecipeCard, RecipeTile,
// HScroll. Pressables give subtle opacity feedback so the app feels alive.
import React from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, StyleSheet, type ViewStyle, type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Recipe } from '@cookhoard/core';
import { colors, font, mono, radius, space } from './theme';
import { iconFor, totalMinutes } from './format';

export function Screen({
  children, scroll = true, title, headerRight,
}: { children: React.ReactNode; scroll?: boolean; title?: string; headerRight?: React.ReactNode }) {
  const body = title ? (
    <>
      <View style={s.header}>
        <Text style={font.display}>{title}</Text>
        {headerRight}
      </View>
      {children}
    </>
  ) : children;
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: space(24) }} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable style={({ pressed }) => [s.card, style, pressed && s.pressed]} onPress={onPress}>
      {children}
    </Pressable>
  );
}

type ChipTone = 'ghost' | 'accent' | 'ready' | 'warn' | 'solid';
export function Chip({ label, tone = 'ghost', icon, onPress }: {
  label: string; tone?: ChipTone; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void;
}) {
  // Utilitarian chips: square, 1px border in the status colour, transparent body.
  const map: Record<ChipTone, { bg: string; border: string; fg: string }> = {
    ghost: { bg: 'transparent', border: colors.border, fg: colors.textMuted },
    accent: { bg: 'transparent', border: colors.borderStrong, fg: colors.text },
    ready: { bg: 'transparent', border: colors.ready, fg: colors.ready },
    warn: { bg: 'transparent', border: colors.warn, fg: colors.warn },
    solid: { bg: colors.accent, border: colors.accent, fg: colors.accentInk },
  };
  const c = map[tone];
  const inner = (
    <>
      {icon ? <Ionicons name={icon} size={11} color={c.fg} style={{ marginRight: 4 }} /> : null}
      <Text style={{ color: c.fg, fontSize: 10, fontWeight: '600', fontFamily: mono, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [s.chip, { backgroundColor: c.bg, borderColor: c.border }, pressed && s.pressed]} onPress={onPress}>
        {inner}
      </Pressable>
    );
  }
  return <View style={[s.chip, { backgroundColor: c.bg, borderColor: c.border }]}>{inner}</View>;
}

export function Btn({
  label, onPress, tone = 'primary', icon, style,
}: { label: string; onPress: () => void; tone?: 'primary' | 'ghost' | 'danger'; icon?: keyof typeof Ionicons.glyphMap; style?: ViewStyle }) {
  const bg = tone === 'primary' ? colors.accent : 'transparent';
  const fg = tone === 'primary' ? colors.accentInk : tone === 'danger' ? colors.danger : colors.text;
  const bd = tone === 'primary' ? colors.accent : tone === 'danger' ? colors.danger : colors.borderStrong;
  return (
    <Pressable style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: bd }, style, pressed && s.pressed]} onPress={onPress}>
      {icon ? <Ionicons name={icon} size={16} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
    </Pressable>
  );
}

export function Stars({ value, onChange, size = 18 }: { value: number | null; onChange?: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={6}>
          <Ionicons
            name={(value ?? 0) >= n ? 'star' : 'star-outline'}
            size={size}
            color={colors.star}
            style={{ marginRight: 2 }}
          />
        </Pressable>
      ))}
    </View>
  );
}

export function Field({
  label, value, onChangeText, placeholder, multiline, keyboardType, style,
}: {
  label?: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  multiline?: boolean; keyboardType?: 'default' | 'numeric'; style?: ViewStyle;
}) {
  return (
    <View style={[{ marginBottom: space(3) }, style]}>
      {label ? <Text style={[font.muted, { marginBottom: 6 }]}>{label}</Text> : null}
      <TextInput
        style={[s.input, multiline && { height: 90, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export function EmptyState({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={40} color={colors.textMuted} />
      <Text style={[font.muted, { marginTop: space(2), textAlign: 'center', maxWidth: 260 }]}>{text}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={s.sectionTitle}>
      <Text style={font.h2}>{children}</Text>
      {right}
    </View>
  );
}

/** The recipe list tile used across Discover / Cookbook / Fridge. */
export function RecipeCard({
  recipe, chips, subtitle,
}: { recipe: Recipe; chips?: React.ReactNode; subtitle?: string }) {
  const router = useRouter();
  const meta = [
    recipe.cuisine,
    `${totalMinutes(recipe)} min`,
    recipe.ratingAvg ? `★ ${recipe.ratingAvg.toFixed(1)}` : null,
    recipe.makeCount ? `${recipe.makeCount} makes` : null,
  ].filter(Boolean).join(' / ');
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => router.push(`/recipe/${recipe.id}`)}>
      <View style={s.thumb}>
        <Ionicons name={iconFor(recipe)} size={22} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1, marginLeft: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {recipe.remixOf ? <Ionicons name="git-branch-outline" size={13} color={colors.accent} style={{ marginRight: 4 }} /> : null}
          <Text style={[font.h3, { flexShrink: 1 }]} numberOfLines={1}>{recipe.title}</Text>
        </View>
        <Text style={font.tiny} numberOfLines={1}>{meta}</Text>
        {subtitle ? <Text style={[font.tiny, { marginTop: 2 }]} numberOfLines={1}>{subtitle}</Text> : null}
        {chips ? <View style={s.chipRow}>{chips}</View> : null}
      </View>
      {recipe.saved ? <Ionicons name="bookmark" size={16} color={colors.accent} style={{ marginLeft: 6 }} /> : null}
    </Card>
  );
}

/** Compact square tile for horizontal carousels in Discover. */
export function RecipeTile({ recipe, badge }: { recipe: Recipe; badge?: React.ReactNode }) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [s.tile, pressed && s.pressed]}
      onPress={() => router.push(`/recipe/${recipe.id}`)}
    >
      <View style={s.tileThumb}>
        <Ionicons name={iconFor(recipe)} size={28} color={colors.textMuted} />
        {badge ? <View style={s.tileBadge}>{badge}</View> : null}
      </View>
      <Text style={[font.h3, { marginTop: 8 }]} numberOfLines={2}>{recipe.title}</Text>
      <Text style={font.tiny} numberOfLines={1}>
        {[`${totalMinutes(recipe)} min`, recipe.ratingAvg ? `★ ${recipe.ratingAvg.toFixed(1)}` : null].filter(Boolean).join(' · ')}
      </Text>
    </Pressable>
  );
}

/** Horizontal carousel row. */
export function HScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingRight: space(4) }}
      style={{ marginHorizontal: -space(4), paddingLeft: space(4) }}
    >
      {children}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space(4) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space(2), marginBottom: space(3) },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(3), marginBottom: space(2.5) },
  pressed: { opacity: 0.75 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, marginRight: 6, marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: -2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 18, borderWidth: 1 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, paddingHorizontal: space(3), paddingVertical: space(2.5), fontSize: 15 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: space(12) },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space(4), marginBottom: space(2) },
  thumb: { width: 58, height: 58, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 148, marginRight: space(2.5), backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: space(2.5) },
  tileThumb: { height: 76, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tileBadge: { position: 'absolute', top: 6, right: 6 },
});
