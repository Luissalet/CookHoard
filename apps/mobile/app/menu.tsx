import React, { useMemo, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { planWeek, buildShoppingList, DEFAULT_STAPLES, type MenuPlan } from '@cookhoard/core';
import { useStore } from '../src/store';
import { Screen, RecipeCard, Btn, SectionTitle, EmptyState } from '../src/ui';
import { space } from '../src/theme';

export default function Menu() {
  const { t } = useTranslation();
  const { recipes, pantry, month, hemisphere, recipeById, addShopping } = useStore();
  const [plan, setPlan] = useState<MenuPlan | null>(null);

  const generate = useCallback(() => {
    setPlan(planWeek(recipes, { month, hemisphere, pantry, staples: DEFAULT_STAPLES }));
  }, [recipes, month, hemisphere, pantry]);

  const dayRecipes = useMemo(
    () => (plan ? plan.days.map((d) => recipeById(d.recipeId)).filter(Boolean) : []),
    [plan, recipeById],
  );

  const addAllMissing = () => {
    const have = new Set<string>([...pantry, ...DEFAULT_STAPLES]);
    addShopping(buildShoppingList(dayRecipes as NonNullable<typeof dayRecipes[number]>[], have));
  };

  return (
    <Screen title={t('menu.title')}>
      <View style={{ flexDirection: 'row', gap: space(2), marginBottom: space(2) }}>
        <Btn label={plan ? t('menu.regen') : t('menu.generate')} icon="sparkles-outline" onPress={generate} style={{ flex: 1 }} />
        {plan ? <Btn label={t('menu.addAll')} tone="ghost" icon="cart-outline" onPress={addAllMissing} style={{ flex: 1 }} /> : null}
      </View>

      {!plan ? (
        <EmptyState icon="calendar-outline" text={t('menu.title')} />
      ) : (
        <>
          {plan.days.map((d, i) => {
            const r = recipeById(d.recipeId);
            return (
              <View key={`${d.recipeId}-${i}`}>
                <SectionTitle>{t('menu.day', { n: i + 1 })}</SectionTitle>
                {r ? <RecipeCard recipe={r} /> : null}
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}
