import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { INGREDIENTS, SHOP_UNITS, type ShopUnit, type ShoppingItem } from '@cookhoard/core';
import { useStore } from '../src/store';
import { Screen, Card, EmptyState, SectionTitle } from '../src/ui';
import { colors, font, radius, space } from '../src/theme';
import { ingredientName, ingredientNameFrom } from '../src/format';

// Localized short label for a unit. The value stored stays canonical ('ud' | 'L' | 'kg').
function unitLabel(u: ShopUnit, en: boolean): string {
  if (u === 'ud') return en ? 'pcs' : 'ud';
  return u; // L, kg are the same in both languages
}

function qtyLabel(item: ShoppingItem, en: boolean): string | null {
  if (item.qty == null) return null;
  const n = Number.isInteger(item.qty) ? String(item.qty) : String(item.qty).replace('.', en ? '.' : ',');
  return item.unit ? `${n} ${unitLabel(item.unit, en)}` : n;
}

export default function Shopping() {
  const { t, i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  const { shopping, toggleShopping, removeShopping, clearShopping, addShoppingManual } = useStore();

  const [text, setText] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<ShopUnit>('ud');

  const toBuy = shopping.filter((i) => !i.checked);
  const have = shopping.filter((i) => i.checked);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return INGREDIENTS
      .filter((i) => !i.isStaple && (i.name.toLowerCase().includes(q) || i.nameEn.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [text]);

  function add(name?: string) {
    const label = (name ?? text).trim();
    if (!label) return;
    const n = qty.trim().replace(',', '.');
    const parsed = n ? Number(n) : undefined;
    addShoppingManual(label, {
      qty: parsed != null && !Number.isNaN(parsed) ? parsed : undefined,
      unit,
    });
    setText(''); setQty('');
  }

  const label = (item: ShoppingItem) => item.name ?? ingredientName(item.ingredientId);

  function Row({ item, last }: { item: ShoppingItem; last: boolean }) {
    const q = qtyLabel(item, en);
    return (
      <View style={[styles.row, !last && styles.border]}>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => toggleShopping(item.ingredientId)}>
          <Ionicons name={item.checked ? 'checkbox' : 'square-outline'} size={22} color={item.checked ? colors.ready : colors.textMuted} />
          <View style={{ marginLeft: space(3), flex: 1 }}>
            <Text style={[font.body, item.checked && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
              {label(item)}
            </Text>
            {item.fromRecipes.length > 0 && !item.checked && (
              <Text style={font.tiny}>{t('shopping.fromRecipe')}</Text>
            )}
          </View>
        </Pressable>
        {q && <Text style={[font.mono, { fontSize: 13, marginRight: space(3), color: colors.textMuted }]}>{q}</Text>}
        <Pressable onPress={() => removeShopping(item.ingredientId)} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  return (
    <Screen
      title={t('shopping.title')}
      headerRight={toBuy.length ? (
        <Pressable onPress={clearShopping}><Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('shopping.clear')}</Text></Pressable>
      ) : undefined}
    >
      {/* Add bar */}
      <View style={styles.addBox}>
        <Ionicons name="add" size={20} color={colors.accent} />
        <TextInput
          style={styles.addInput}
          value={text}
          onChangeText={setText}
          placeholder={t('shopping.addPh')}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={() => add(suggestions[0] ? ingredientNameFrom(suggestions[0]) : undefined)}
          returnKeyType="done"
        />
        <TextInput
          style={styles.qtyInput}
          value={qty}
          onChangeText={setQty}
          placeholder={t('shopping.qty')}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />
      </View>

      {/* Unit picker + add button */}
      <View style={styles.unitRow}>
        <View style={{ flexDirection: 'row' }}>
          {SHOP_UNITS.map((u) => (
            <Pressable key={u} onPress={() => setUnit(u)} style={[styles.unit, u === unit && styles.unitOn]}>
              <Text style={{ color: u === unit ? colors.accentInk : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
                {unitLabel(u, en)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => add()} style={styles.addBtn} disabled={!text.trim()}>
          <Text style={{ color: colors.accentInk, fontWeight: '800', fontSize: 14, opacity: text.trim() ? 1 : 0.5 }}>{t('common.add')}</Text>
        </Pressable>
      </View>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space(2) }} keyboardShouldPersistTaps="handled">
          {suggestions.map((i) => (
            <Pressable key={i.id} style={styles.suggest} onPress={() => add(ingredientNameFrom(i))}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{ingredientNameFrom(i)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {shopping.length === 0 ? (
        <EmptyState icon="cart-outline" text={t('shopping.empty')} />
      ) : (
        <>
          <SectionTitle>{t('shopping.toBuy')}</SectionTitle>
          {toBuy.length === 0 ? (
            <Text style={[font.muted, { marginBottom: space(2) }]}>{t('shopping.allBought')}</Text>
          ) : (
            <Card style={{ padding: 0 }}>
              {toBuy.map((item, idx) => <Row key={item.ingredientId} item={item} last={idx === toBuy.length - 1} />)}
            </Card>
          )}

          {have.length > 0 && (
            <>
              <SectionTitle>{t('shopping.haveIt')}</SectionTitle>
              <Card style={{ padding: 0 }}>
                {have.map((item, idx) => <Row key={item.ingredientId} item={item} last={idx === have.length - 1} />)}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: space(3), height: 46,
  },
  addInput: { flex: 1, marginLeft: space(2), color: colors.text, fontSize: 15 },
  qtyInput: { width: 56, marginLeft: space(2), color: colors.text, fontSize: 15, textAlign: 'right' },
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space(2) },
  unit: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surfaceAlt, marginRight: 6, borderRadius: radius.md },
  unitOn: { backgroundColor: colors.accent },
  addBtn: { paddingHorizontal: 18, paddingVertical: 9, backgroundColor: colors.accent, borderRadius: radius.md },
  suggest: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(3), paddingVertical: space(3) },
  border: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
