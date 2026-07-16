// Verifies the whole @cookhoard/core brain. Run with: npx tsx test/run.ts
import {
  recommend, scoreRecipe, seasonForMonth, dishSeasonFit,
  SEED_RECIPES, DEFAULT_STAPLES, INGREDIENT_BY_ID,
  inferTags, estimateRecipeNutrition, buildShoppingList, mergeShopping,
  planWeek, expiringSoon, useItUp, computeBadges, parseJsonLdRecipe, mealToRecipe,
  remixesOf, remixLineage, remixFamily, diffRecipes, buildDiagram, detectTimer, formatTimer,
  type Make, type Recipe,
} from '../src/index.ts';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failures++;
}
const R = (id: string) => SEED_RECIPES.find((r) => r.id === id)!;
const label = (ids: string[]) => ids.map((i) => INGREDIENT_BY_ID[i]?.name ?? i).join(', ') || '—';

console.log('— Signal B + recommender —');
ok(seasonForMonth(7, 'N') === 'summer', 'julio (N) = verano');
ok(seasonForMonth(1, 'N') === 'winter', 'enero (N) = invierno');
ok(seasonForMonth(7, 'S') === 'winter', 'julio (S) = invierno (sur)');
ok(dishSeasonFit(R('lentejas'), 'summer') < 0, 'lentejas fuera de temporada en verano');
ok(dishSeasonFit(R('lentejas'), 'winter') > 0.5, 'lentejas en temporada en invierno');
ok(dishSeasonFit(R('gazpacho'), 'summer') > 0.5, 'gazpacho en temporada en verano');

const julyFridge = ['tomato', 'cucumber', 'green_pepper', 'garlic', 'bread'];
const july = recommend(SEED_RECIPES, { pantry: julyFridge, month: 7, staples: DEFAULT_STAPLES });
ok(july[0]?.recipe.id === 'gazpacho', 'julio: top-1 gazpacho');
ok(scoreRecipe(R('gazpacho'), { pantry: julyFridge, month: 7, staples: DEFAULT_STAPLES }).bucket === 'ready', 'gazpacho ready en julio');
const lentRank = july.findIndex((s) => s.recipe.id === 'lentejas');
const gazpRank = july.findIndex((s) => s.recipe.id === 'gazpacho');
ok(gazpRank < lentRank, 'julio: gazpacho por encima de lentejas');

console.log('\n— Tag heuristics —');
ok(inferTags('Sopa de ajo caliente').temperature === 'hot', 'inferTags: sopa → caliente');
ok(inferTags('Sopa de ajo').heaviness === 3, 'inferTags: sopa → contundente');
ok(inferTags('Ensalada fresca de verano').temperature === 'cold', 'inferTags: ensalada → frío');
ok(inferTags('Pollo a la plancha').seasonAffinity.length === 0, 'inferTags: plato neutro → todo el año');

console.log('\n— Nutrition —');
const nut = estimateRecipeNutrition(R('gazpacho'));
ok(nut !== null && nut.kcal > 0, `gazpacho ≈ ${nut?.kcal} kcal/ración`);
ok(estimateRecipeNutrition(R('lentejas'))!.protein > 0, 'lentejas aportan proteína');

console.log('\n— Shopping list —');
const have = new Set([...julyFridge, ...DEFAULT_STAPLES]);
const list = buildShoppingList([R('lentejas'), R('gazpacho')], have);
const listIds = list.map((i) => i.ingredientId);
ok(listIds.includes('lentil'), 'compra incluye lentejas (no las tienes)');
ok(!listIds.includes('tomato'), 'compra NO incluye tomate (ya lo tienes)');
const merged = mergeShopping(list, [{ ingredientId: 'lentil', fromRecipes: ['x'] }]);
ok(merged.filter((i) => i.ingredientId === 'lentil').length === 1, 'mergeShopping deduplica');

console.log('\n— Weekly menu —');
const plan = planWeek(SEED_RECIPES, { month: 7 });
ok(plan.days.length === 7, `menú de 7 días (${plan.days.length})`);
ok(new Set(plan.days.map((d) => d.recipeId)).size >= 5, 'menú con variedad (≥5 recetas distintas)');
ok(plan.season === 'summer', 'menú de julio etiquetado como verano');

console.log('\n— Expiry —');
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const soon = expiringSoon([{ ingredientId: 'tomato', expiresAt: tomorrow }, { ingredientId: 'lentil' }], 3);
ok(soon.length === 1 && soon[0]?.ingredientId === 'tomato', 'caduca pronto: solo el tomate');
const useUp = useItUp(SEED_RECIPES, ['tomato'], { pantry: julyFridge, month: 7, staples: DEFAULT_STAPLES });
ok(useUp.length > 0 && useUp[0]!.recipe.ingredients.some((i) => i.ingredientId === 'tomato'), 'useItUp prioriza recetas con tomate');

console.log('\n— Badges —');
const makes: Make[] = [{ id: 'm1', recipeId: 'gazpacho', authorId: 'me', rating: 5, createdAt: new Date().toISOString() }];
const badges = computeBadges([], makes);
ok(badges.find((b) => b.id === 'first_make')?.earned === true, 'badge: primera receta cocinada');
ok(badges.find((b) => b.id === 'five_star')?.earned === true, 'badge: make de 5★');
ok(badges.find((b) => b.id === 'ten_makes')?.earned === false, 'badge: 10 makes aún no');

console.log('\n— Import (JSON-LD) —');
const parsed = parseJsonLdRecipe({
  name: 'Tarta de manzana',
  recipeIngredient: ['3 manzanas', '200 g harina', '2 huevos', '100 g azúcar'],
  recipeInstructions: ['Pelar las manzanas', 'Mezclar y hornear'],
  recipeYield: '6 raciones',
}, 'import:1');
ok(!!parsed && parsed.title === 'Tarta de manzana', 'import: título');
ok(!!parsed && parsed.ingredients.some((i) => i.ingredientId === 'apple'), 'import: resuelve manzana → apple');
ok(!!parsed && parsed.steps.length === 2, 'import: 2 pasos');
ok(!!parsed && parsed.servings === 6, 'import: 6 raciones');

console.log('\n— TheMealDB mapper —');
const meal = mealToRecipe({
  idMeal: '52772', strMeal: 'Teriyaki Chicken', strArea: 'Japanese',
  strInstructions: 'Cook the chicken.\nServe with rice.',
  strIngredient1: 'chicken', strMeasure1: '2', strIngredient2: 'onion', strMeasure2: '1',
  strMealThumb: 'http://img',
});
ok(meal.id === 'themealdb:52772', 'themealdb: id namespaced');
ok(meal.ingredients.length === 2 && meal.cuisine === 'japanese', 'themealdb: ingredientes + cocina');

console.log('\n— Remixes —');
const base = R('gazpacho');
const remix: Recipe = {
  ...base,
  id: 'gazpacho_picante', title: 'Gazpacho picante', remixOf: 'gazpacho',
  authorId: 'me', createdAt: '2026-07-01T10:00:00Z',
  ingredients: [
    ...base.ingredients.filter((i) => i.ingredientId !== 'bread'),          // quita el pan
    { ingredientId: 'chili', quantity: 1 },                                  // añade guindilla
  ].map((i) => (i.ingredientId === 'tomato' ? { ...i, quantity: 1.5 } : i)), // más tomate
  steps: [...base.steps, { text: 'Añade la guindilla picada al batir.' }],
};
const remix2: Recipe = { ...remix, id: 'gazpacho_x', remixOf: 'gazpacho_picante', title: 'X' };
const all = [...SEED_RECIPES, remix, remix2];
ok(remixesOf(all, 'gazpacho').length === 1 && remixesOf(all, 'gazpacho')[0]!.id === 'gazpacho_picante', 'remixesOf: hijo directo');
ok(remixLineage(all, remix2).map((r) => r.id).join(',') === 'gazpacho_picante,gazpacho', 'remixLineage: cadena hasta la raíz');
ok(remixFamily(all, 'gazpacho').length === 2, 'remixFamily: descendientes (2)');
const diff = diffRecipes(base, remix);
ok(diff.addedIngredients.some((i) => i.ingredientId === 'chili'), 'diff: guindilla añadida');
ok(diff.removedIngredients.some((i) => i.ingredientId === 'bread'), 'diff: pan quitado');
ok(diff.changedIngredients.some((c) => c.ingredientId === 'tomato'), 'diff: tomate cambia de cantidad');
ok(diff.addedSteps.length === 1 && !diff.identical, 'diff: 1 paso nuevo');
ok(diffRecipes(base, { ...base }).identical, 'diff: copia idéntica');

console.log('\n— Diagrama de flujo —');
const dGaz = buildDiagram(R('gazpacho'));
ok(dGaz.branchCount === 1, 'gazpacho: 1 rama (flujo lineal)');
ok(dGaz.rows[0]!.newIngredients.includes('tomato') && dGaz.rows[0]!.newIngredients.includes('green_pepper'), 'gazpacho: tomate y pimiento entran en el paso 1');
ok(dGaz.rows[1]!.newIngredients.includes('garlic'), 'gazpacho: el ajo entra en el paso 2');
const dPesto = buildDiagram(R('pasta_pesto'));
ok(dPesto.branchCount === 2, 'pesto: 2 ramas paralelas (pasta / pesto)');
ok(dPesto.rows[1]!.startsBranch === true, 'pesto: el paso 2 abre rama');
ok(dPesto.rows[2]!.mergesFrom.length === 1, 'pesto: el paso 3 fusiona las ramas');
const dLen = buildDiagram(R('lentejas'));
ok(dLen.branchCount === 1, 'lentejas: "añade" encadena, no abre rama');
ok(dLen.rows[1]!.newIngredients.includes('lentil'), 'lentejas: la lenteja entra en el paso 2');
ok(buildDiagram(R('tortilla_patatas')).finalBranches.length === 1, 'tortilla: converge en un solo flujo');

console.log('\n— Temporizadores (detectTimer) —');
ok(detectTimer('Hornea a 200 ºC durante 20 min.') === 1200,