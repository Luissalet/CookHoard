// Gamification: badges computed from the user's makes + published recipes. Labels are i18n keys
// (see badge.<id> in the app translations) so the UI can localize them.
import type { Recipe, Make } from './types';

export interface Badge { id: string; earned: boolean; progress: number; goal: number; }

export function computeBadges(userRecipes: Recipe[], makes: Make[]): Badge[] {
  const mk = makes.length;
  const rc = userRecipes.length;
  const fiveStar = makes.filter((m) => (m.rating ?? 0) === 5).length;
  const b = (id: string, n: number, goal: number): Badge => ({ id, earned: n >= goal, progress: Math.min(n, goal), goal });
  return [
    b('first_make', mk, 1),
    b('ten_makes', mk, 10),
    b('first_recipe', rc, 1),
    b('five_recipes', rc, 5),
    b('five_star', fiveStar, 1),
  ];
}
