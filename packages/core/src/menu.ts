// Weekly menu planner: greedily pick season-fitting recipes with variety (limit repeats of the
// same cuisine / temperature). Optionally nudged by what's already in the pantry.
import type { Recipe, Hemisphere } from './types';
import { recommend } from './recommend';
import { seasonForMonth, dishSeasonFit } from './season';

export interface MenuDay { label: string; recipeId: string; title: string; }
export interface MenuPlan { days: MenuDay[]; season: string; }

/** Local Monday of the week, used to keep a saved menu attached to its week. */
export function menuWeekKey(date: Date = new Date()): string {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

/** Change one day's recipe without changing the rest of the menu. */
export function replaceMenuDay(plan: MenuPlan, recipes: Recipe[], index: number): MenuPlan {
  const current = plan.days[index];
  if (!current || recipes.length < 2) return plan;
  const usedElsewhere = new Set(plan.days.filter((_, i) => i !== index).map((d) => d.recipeId));
  const start = recipes.findIndex((r) => r.id === current.recipeId);
  for (let offset = 1; offset <= recipes.length; offset++) {
    const replacement = recipes[(start + offset + recipes.length) % recipes.length];
    if (replacement && replacement.id !== current.recipeId && !usedElsewhere.has(replacement.id)) {
      return { ...plan, days: plan.days.map((d, i) => i === index
        ? { ...d, recipeId: replacement.id, title: replacement.title } : d) };
    }
  }
  return plan;
}

export interface MenuContext {
  month?: number;
  hemisphere?: Hemisphere;
  pantry?: string[];
  staples?: Set<string>;
  days?: number;
}

export function planWeek(recipes: Recipe[], ctx: MenuContext = {}): MenuPlan {
  const month = ctx.month ?? new Date().getMonth() + 1;
  const hemi = ctx.hemisphere ?? 'N';
  const season = seasonForMonth(month, hemi);
  const days = ctx.days ?? 7;

  const base = ctx.pantry
    ? recommend(recipes, { pantry: ctx.pantry, month, hemisphere: hemi, staples: ctx.staples })
        .map((s) => ({ recipe: s.recipe, fit: dishSeasonFit(s.recipe, season) + s.coverage }))
    : recipes.map((r) => ({ recipe: r, fit: dishSeasonFit(r, season) }));

  let pool = [...base].sort((a, b) => b.fit - a.fit);
  const chosen: Recipe[] = [];
  const usedCuisine = new Map<string, number>();
  const usedTemp = new Map<string, number>();

  while (chosen.length < days) {
    if (pool.length === 0) pool = [...base].sort((a, b) => b.fit - a.fit); // allow repeats if exhausted
    if (pool.length === 0) break;
    let idx = pool.findIndex((p) => {
      const c = p.recipe.cuisine ?? '';
      const tmp = p.recipe.temperature ?? '';
      return (usedCuisine.get(c) ?? 0) < 2 && (usedTemp.get(tmp) ?? 0) < 3;
    });
    if (idx < 0) idx = 0;
    const picked = pool.splice(idx, 1)[0];
    if (!picked) break;
    chosen.push(picked.recipe);
    const c = picked.recipe.cuisine ?? '';
    const tmp = picked.recipe.temperature ?? '';
    usedCuisine.set(c, (usedCuisine.get(c) ?? 0) + 1);
    usedTemp.set(tmp, (usedTemp.get(tmp) ?? 0) + 1);
  }

  return {
    season,
    days: chosen.slice(0, days).map((r, i) => ({ label: `D${i + 1}`, recipeId: r.id, title: r.title })),
  };
}
