import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../src/store';
import { Screen, Card, EmptyState } from '../src/ui';
import { colors, font, space } from '../src/theme';
import { ingredientName } from '../src/format';

export default function Shopping() {
  const { t } = useTranslation();
  const { shopping, toggleShopping, removeShopping, clearShopping } = useStore();

  return (
    <Screen
      title={t('shopping.title')}
      headerRight={shopping.length ? (
        <Pressable onPress={clearShopping}><Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('shopping.clear')}</Text></Pressable>
      ) : undefined}
    >
      {shopping.length === 0 ? (
        <EmptyState icon="cart-outline" text={t('shopping.empty')} />
      ) : (
        <Card style={{ padding: 0 }}>
          {shopping.map((item, idx) => (
            <View key={item.ingredientId} style={[styles.row, idx < shopping.length - 1 && styles.border]}>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => toggleShopping(item.ingredientId)}>
                <Ionicons name={item.checked ? 'checkbox' : 'square-outline'} size={22} color={item.checked ? colors.ready : colors.textMuted} />
                <Text style={[font.body, { marginLeft: space(3) }, item.checked && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
                  {ingredientName(item.ingredientId)}
                </Text>
              </Pressable>
              <Pressable onPress={() => removeShopping(item.ingredientId)} hitSlop={8}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(3), paddingVertical: space(3) },
  border: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
