// Seed data: a canonical ingredient dictionary + a handful of REAL recipes with structured
// ingredients and Signal-B tags (temperature/heaviness/seasonAffinity). This is what ships so
// the app and the recommender aren't empty on day 1, before any community recipe exists.

import type { Ingredient, Recipe } from './types';

export const INGREDIENTS: Ingredient[] = [
  { id: 'tomato', name: 'Tomate', nameEn: 'Tomato', category: 'verdura' },
  { id: 'cucumber', name: 'Pepino', nameEn: 'Cucumber', category: 'verdura' },
  { id: 'green_pepper', name: 'Pimiento verde', nameEn: 'Green pepper', category: 'verdura' },
  { id: 'onion', name: 'Cebolla', nameEn: 'Onion', category: 'verdura' },
  { id: 'garlic', name: 'Ajo', nameEn: 'Garlic', category: 'verdura' },
  { id: 'bread', name: 'Pan', nameEn: 'Bread', category: 'panadería' },
  { id: 'egg', name: 'Huevo', nameEn: 'Egg', category: 'huevo' },
  { id: 'potato', name: 'Patata', nameEn: 'Potato', category: 'verdura' },
  { id: 'lentil', name: 'Lentejas', nameEn: 'Lentils', category: 'legumbre' },
  { id: 'carrot', name: 'Zanahoria', nameEn: 'Carrot', category: 'verdura' },
  { id: 'chorizo', name: 'Chorizo', nameEn: 'Chorizo', category: 'carne' },
  { id: 'pumpkin', name: 'Calabaza', nameEn: 'Pumpkin', category: 'verdura' },
  { id: 'pasta', name: 'Pasta', nameEn: 'Pasta', category: 'pasta' },
  { id: 'basil', name: 'Albahaca', nameEn: 'Basil', category: 'hierba' },
  { id: 'parmesan', name: 'Parmesano', nameEn: 'Parmesan', category: 'lácteo' },
  { id: 'pine_nuts', name: 'Piñones', nameEn: 'Pine nuts', category: 'fruto seco' },
  { id: 'chicken', name: 'Pollo', nameEn: 'Chicken', category: 'carne' },
  { id: 'lemon', name: 'Limón', nameEn: 'Lemon', category: 'fruta' },
  { id: 'apple', name: 'Manzana', nameEn: 'Apple', category: 'fruta' },
  { id: 'banana', name: 'Plátano', nameEn: 'Banana', category: 'fruta' },
  { id: 'orange', name: 'Naranja', nameEn: 'Orange', category: 'fruta' },
  // Staples: assumed on-hand, never counted as "missing".
  { id: 'olive_oil', name: 'Aceite de oliva', nameEn: 'Olive oil', category: 'básico', isStaple: true },
  { id: 'salt', name: 'Sal', nameEn: 'Salt', category: 'básico', isStaple: true },
  { id: 'black_pepper', name: 'Pimienta negra', nameEn: 'Black pepper', category: 'básico', isStaple: true },
  { id: 'vinegar', name: 'Vinagre', nameEn: 'Vinegar', category: 'básico', isStaple: true },
  { id: 'water', name: 'Agua', nameEn: 'Water', category: 'básico', isStaple: true },
  { id: 'sugar', name: 'Azúcar', nameEn: 'Sugar', category: 'básico', isStaple: true },
];

export const INGREDIENT_BY_ID: Record<string, Ingredient> = Object.fromEntries(
  INGREDIENTS.map((i) => [i.id, i]),
);

/** Ids the recommender assumes you always have at home. */
export const DEFAULT_STAPLES: Set<string> = new Set(
  INGREDIENTS.filter((i) => i.isStaple).map((i) => i.id),
);

const CH = 'seed'; // author id for seed recipes

export const SEED_RECIPES: Recipe[] = [
  {
    id: 'gazpacho',
    authorId: CH, authorName: 'CookHoard',
    title: 'Gazpacho andaluz',
    description: 'Sopa fría de tomate, el clásico del verano. Se bate y a la nevera.',
    servings: 4, prepMin: 15, cookMin: 0, difficulty: 1,
    cuisine: 'española', seasonAffinity: ['summer'], temperature: 'cold', heaviness: 1,
    dietFlags: ['vegano', 'vegetariano', 'sin_gluten_opcional'], allergens: ['gluten'],
    ingredients: [
      { ingredientId: 'tomato', quantity: 1, unit: 'kg' },
      { ingredientId: 'cucumber', quantity: 1 },
      { ingredientId: 'green_pepper', quantity: 1 },
      { ingredientId: 'garlic', quantity: 1, unit: 'diente' },
      { ingredientId: 'bread', quantity: 50, unit: 'g', optional: true },
      { ingredientId: 'olive_oil' }, { ingredientId: 'vinegar' }, { ingredientId: 'salt' },
    ],
    steps: [
      { text: 'Trocea el tomate, el pepino y el pimiento.' },
      { text: 'Bate todo con el ajo, el aceite, el vinagre y la sal.' },
      { text: 'Cuela si lo quieres fino y enfría al menos 2 h.', timerSec: 7200 },
    ],
    createdAt: '2026-06-01T10:00:00Z', ratingAvg: 4.7, makeCount: 38,
  },
  {
    id: 'ensalada_tomate',
    authorId: CH, authorName: 'CookHoard',
    title: 'Ensalada de tomate y cebolla',
    description: 'Tres ingredientes, cinco minutos. Verano en un plato.',
    servings: 2, prepMin: 5, cookMin: 0, difficulty: 1,
    cuisine: 'española', seasonAffinity: ['summer'], temperature: 'cold', heaviness: 1,
    dietFlags: ['vegano', 'vegetariano', 'sin_gluten'],
    ingredients: [
      { ingredientId: 'tomato', quantity: 3 },
      { ingredientId: 'onion', quantity: 0.5 },
      { ingredientId: 'olive_oil' }, { ingredientId: 'salt' },
    ],
    steps: [
      { text: 'Corta el tomate y la cebolla en rodajas.' },
      { text: 'Aliña con aceite y sal. Listo.' },
    ],
    createdAt: '2026-06-10T10:00:00Z', ratingAvg: 4.2, makeCount: 12,
  },
  {
    id: 'tortilla_patatas',
    authorId: CH, authorName: 'CookHoard',
    title: 'Tortilla de patatas',
    description: 'La de siempre. Cuajado al gusto: aquí, jugosa.',
    servings: 4, prepMin: 15, cookMin: 25, difficulty: 2,
    cuisine: 'española', seasonAffinity: [], temperature: 'room', heaviness: 2,
    dietFlags: ['vegetariano', 'sin_gluten'], allergens: ['huevo'],
    ingredients: [
      { ingredientId: 'potato', quantity: 4 },
      { ingredientId: 'egg', quantity: 6 },
      { ingredientId: 'onion', quantity: 1, optional: true },
      { ingredientId: 'olive_oil' }, { ingredientId: 'salt' },
    ],
    steps: [
      { text: 'Pela y corta las patatas finas; fríelas a fuego suave.', timerSec: 1500 },
      { text: 'Bate los huevos, mezcla con la patata escurrida y sal.' },
      { text: 'Cuaja en la sartén por ambos lados.' },
    ],
    createdAt: '2026-03-02T10:00:00Z', ratingAvg: 4.8, makeCount: 64,
  },
  {
    id: 'lentejas',
    authorId: CH, authorName: 'CookHoard',
    title: 'Lentejas estofadas con chorizo',
    description: 'Guiso de cuchara contundente. Mejor de un día para otro.',
    servings: 4, prepMin: 15, cookMin: 45, difficulty: 2,
    cuisine: 'española', seasonAffinity: ['autumn', 'winter'], temperature: 'hot', heaviness: 3,
    dietFlags: [],
    ingredients: [
      { ingredientId: 'lentil', quantity: 400, unit: 'g' },
      { ingredientId: 'carrot', quantity: 2 },
      { ingredientId: 'onion', quantity: 1 },
      { ingredientId: 'garlic', quantity: 2, unit: 'dientes' },
      { ingredientId: 'potato', quantity: 1 },
      { ingredientId: 'chorizo', quantity: 1 },
      { ingredientId: 'olive_oil' }, { ingredientId: 'salt' },
    ],
    steps: [
      { text: 'Sofríe cebolla, ajo y zanahoria.' },
      { text: 'Añade lentejas, patata, chorizo y agua. Cuece a fuego lento.', timerSec: 2700 },
      { text: 'Rectifica de sal y reposa.' },
    ],
    createdAt: '2026-01-05T10:00:00Z', ratingAvg: 4.6, makeCount: 41,
  },
  {
    id: 'crema_calabaza',
    authorId: CH, authorName: 'CookHoard',
    title: 'Crema de calabaza',
    description: 'Reconfortante y de otoño. Textura aterciopelada.',
    servings: 4, prepMin: 10, cookMin: 30, difficulty: 1,
    cuisine: 'internacional', seasonAffinity: ['autumn', 'winter'], temperature: 'hot', heaviness: 2,
    dietFlags: ['vegano', 'vegetariano', 'sin_gluten'],
    ingredients: [
      { ingredientId: 'pumpkin', quantity: 800, unit: 'g' },
      { ingredientId: 'onion', quantity: 1 },
      { ingredientId: 'carrot', quantity: 1 },
      { ingredientId: 'potato', quantity: 1 },
      { ingredientId: 'olive_oil' }, { ingredientId: 'salt' },
    ],
    steps: [
      { text: 'Sofríe la cebolla; añade calabaza, zanahoria y patata en trozos.' },
      { text: 'Cubre con agua y cuece hasta que esté tierno.', timerSec: 1800 },
      { text: 'Tritura hasta que quede fino.' },
    ],
    createdAt: '2026-10-01T10:00:00Z', ratingAvg: 4.5, makeCount: 22,
  },
  {
    id: 'pasta_pesto',
    authorId: CH, authorName: 'CookHoard',
    title: 'Pasta al pesto',
    description: 'Pesto casero de albahaca. Rápida y para cualquier época.',
    servings: 2, prepMin: 10, cookMin: 12, difficulty: 1,
    cuisine: 'italiana', seasonAffinity: [], temperature: 'room', heaviness: 2,
    dietFlags: ['vegetariano'], allergens: ['gluten', 'lácteos', 'frutos_secos'],
    ingredients: [
      { ingredientId: 'pasta', quantity: 200, unit: 'g' },
      { ingredientId: 'basil', quantity: 1, unit: 'manojo' },
      { ingredientId: 'parmesan', quantity: 40, unit: 'g' },
      { ingredientId: 'pine_nuts', quantity: 30, unit: 'g' },
      { ingredientId: 'garlic', quantity: 1, unit: 'diente' },
      { ingredientId: 'olive_oil' }, { ingredientId: 'salt' },
    ],
    steps: [
      { text: 'Cuece la pasta al dente.', timerSec: 600 },
      { text: 'Tritura albahaca, parmesano, piñones, ajo y aceite.' },
      { text: 'Mezcla la pasta con el pesto.' },
    ],
    createdAt: '2026-04-12T10:00:00Z', ratingAvg: 4.4, makeCount: 30,
  },
  {
    id: 'pollo_horno',
    authorId: CH, authorName: 'CookHoard',
    title: 'Pollo al horno con limón',
    description: 'Un plato honesto de horno. Poco trabajo, mucho resultado.',
    servings: 4, prepMin: 10, cookMin: 50, difficulty: 1,
    cuisine: 'española', seasonAffinity: [], temperature: 'hot', heaviness: 2,
    dietFlags: ['sin_gluten'],
    ingredients: [
      { ingredientId: 'chicken', quantity: 1, unit: 'kg' },
      { ingredientId: 'potato', quantity: 3 },
      { ingredientId: 'onion', quantity: 1 },
      { ingredientId: 'lemon', quantity: 1 },
      { ingredientId: 'olive_oil' }, { ingredientId: 'salt' },
    ],
    steps: [
      { text: 'Coloca pollo, patata y cebolla en una bandeja.' },
      { text: 'Riega con aceite y limón, salpimenta.' },
      { text: 'Hornea a 200 ºC hasta dorar.', timerSec: 3000 },
    ],
    createdAt: '2026-02-20T10:00:00Z', ratingAvg: 4.3, makeCount: 18,
  },
  {
    id: 'macedonia',
    authorId: CH, authorName: 'CookHoard',
    title: 'Macedonia de frutas',
    description: 'Postre fresco. Cualquier fruta que tengas vale.',
    servings: 4, prepMin: 10, cookMin: 0, difficulty: 1,
    cuisine: 'internacional', seasonAffinity: ['summer'], temperature: 'cold', heaviness: 1,
    dietFlags: ['vegano', 'vegetariano', 'sin_gluten'],
    ingredients: [
      { ingredientId: 'apple', quantity: 1 },
      { ingredientId: 'banana', quantity: 1 },
      { ingredientId: 'orange', quantity: 2 },
      { ingredientId: 'lemon', quantity: 0.5, optional: true },
    ],
    steps: [
      { text: 'Trocea toda la fruta.' },
      { text: 'Exprime la naranja y el limón por encima y mezcla.' },
    ],
    createdAt: '2026-07-01T10:00:00Z', ratingAvg: 4.1, makeCount: 9,
  },
];
