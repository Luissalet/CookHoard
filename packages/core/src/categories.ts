// Ingredient categories: where they are bought (supermarket section), where they are kept, and how long.
// Every shelf-life figure here is an ESTIMATE (rules of thumb for home storage); the app always labels it as one.
import { fold } from './text';

export type Place = 'nevera' | 'despensa' | 'congelador';
export const PLACES: Place[] = ['nevera', 'despensa', 'congelador'];
export const PLACE_LABEL: Record<Place, string> = { nevera: 'Nevera', despensa: 'Despensa', congelador: 'Congelador' };

export interface Section { id: string; label: string; labelEn: string }

/** Default walking order of a supermarket. The user can reorder it in Ajustes. */
export const SECTIONS: Section[] = [
  { id: 'frutas_verduras', label: 'Frutas y verduras', labelEn: 'Fruit and vegetables' },
  { id: 'panaderia', label: 'Panadería', labelEn: 'Bakery' },
  { id: 'carne', label: 'Carnicería', labelEn: 'Butcher' },
  { id: 'pescado', label: 'Pescadería', labelEn: 'Fishmonger' },
  { id: 'charcuteria', label: 'Charcutería y quesos', labelEn: 'Deli and cheese' },
  { id: 'lacteos', label: 'Lácteos y huevos', labelEn: 'Dairy and eggs' },
  { id: 'despensa', label: 'Despensa: arroz, pasta, legumbres, conservas', labelEn: 'Pantry: rice, pasta, pulses, tins' },
  { id: 'aceites_salsas', label: 'Aceites, salsas y especias', labelEn: 'Oils, sauces and spices' },
  { id: 'desayuno_dulces', label: 'Desayuno y dulces', labelEn: 'Breakfast and sweets' },
  { id: 'bebidas', label: 'Bebidas', labelEn: 'Drinks' },
  { id: 'congelados', label: 'Congelados', labelEn: 'Frozen' },
  { id: 'limpieza_hogar', label: 'Limpieza y hogar', labelEn: 'Cleaning and home' },
  { id: 'otros', label: 'Otros', labelEn: 'Other' },
];
export const SECTION_IDS = SECTIONS.map((section) => section.id);
export const sectionLabel = (id: string, lang: 'es' | 'en' = 'es'): string => {
  const section = SECTIONS.find((item) => item.id === id);
  return section ? (lang === 'en' ? section.labelEn : section.label) : id;
};

export interface Category {
  id: string;
  label: string;
  section: string;
  /** Where it is normally kept. */
  place: Place;
  /** Days it lasts per place; absent = not advisable there. null days = no meaningful expiry. */
  shelf: Partial<Record<Place, number | null>>;
  /** Days left once opened (always in the fridge). */
  opened?: number;
  /** Human reason shown next to an estimated date. */
  basis: string;
}

const C = (id: string, label: string, section: string, place: Place, shelf: Category['shelf'], basis: string, opened?: number): Category =>
  ({ id, label, section, place, shelf, basis, ...(opened ? { opened } : {}) });

export const CATEGORIES: Category[] = [
  C('fruta', 'Fruta', 'frutas_verduras', 'nevera', { nevera: 7, despensa: 5, congelador: 240 }, 'Fruta fresca: unos 5-7 días', 3),
  C('verdura', 'Verdura', 'frutas_verduras', 'nevera', { nevera: 7, despensa: 4, congelador: 270 }, 'Verdura fresca: unos 7 días en nevera', 3),
  C('hoja', 'Verdura de hoja', 'frutas_verduras', 'nevera', { nevera: 4, congelador: 180 }, 'Hoja verde: 3-5 días en nevera', 2),
  C('tuberculo', 'Tubérculos, cebolla y ajo', 'frutas_verduras', 'despensa', { despensa: 30, nevera: 30, congelador: 240 }, 'Tubérculos, cebolla y ajo: unas 4 semanas en lugar fresco y seco'),
  C('hierba', 'Hierbas frescas', 'frutas_verduras', 'nevera', { nevera: 5, congelador: 180 }, 'Hierbas frescas: unos 5 días'),
  C('carne', 'Carne fresca', 'carne', 'nevera', { nevera: 2, congelador: 180 }, 'Carne fresca: 2 días en nevera', 1),
  C('picada', 'Carne picada', 'carne', 'nevera', { nevera: 1, congelador: 90 }, 'Carne picada: 1 día en nevera'),
  C('ave', 'Aves', 'carne', 'nevera', { nevera: 2, congelador: 270 }, 'Pollo y aves frescos: 2 días en nevera', 1),
  C('pescado', 'Pescado fresco', 'pescado', 'nevera', { nevera: 2, congelador: 90 }, 'Pescado fresco: 1-2 días en nevera', 1),
  C('marisco', 'Marisco', 'pescado', 'nevera', { nevera: 1, congelador: 90 }, 'Marisco fresco: 1 día en nevera'),
  C('embutido', 'Embutido curado', 'charcuteria', 'nevera', { nevera: 30, despensa: 30, congelador: 180 }, 'Embutido curado: unas 4 semanas', 14),
  C('fiambre', 'Fiambre y cocidos', 'charcuteria', 'nevera', { nevera: 5, congelador: 60 }, 'Fiambre envasado: 5 días una vez abierto, hasta la fecha del envase cerrado', 3),
  C('queso', 'Queso curado', 'charcuteria', 'nevera', { nevera: 45, congelador: 180 }, 'Queso curado: unas 6 semanas en nevera', 21),
  C('quesofresco', 'Queso fresco', 'lacteos', 'nevera', { nevera: 10, congelador: 90 }, 'Queso fresco: 7-10 días en nevera', 5),
  C('leche', 'Leche', 'lacteos', 'despensa', { despensa: 90, nevera: 7, congelador: 90 }, 'Leche UHT cerrada: unos 3 meses; abierta, 4 días en nevera', 4),
  C('yogur', 'Yogur y postres lácteos', 'lacteos', 'nevera', { nevera: 21, congelador: 60 }, 'Yogur: unas 3 semanas en nevera', 3),
  C('lacteo', 'Mantequilla y nata', 'lacteos', 'nevera', { nevera: 21, congelador: 180 }, 'Mantequilla y nata: unas 3 semanas en nevera', 7),
  C('huevo', 'Huevos', 'lacteos', 'nevera', { nevera: 21, despensa: 14, congelador: null }, 'Huevos: unas 3 semanas'),
  C('pan', 'Pan', 'panaderia', 'despensa', { despensa: 3, nevera: 5, congelador: 90 }, 'Pan: 3 días fuera de nevera, 3 meses congelado'),
  C('bolleria', 'Bollería y dulces frescos', 'panaderia', 'despensa', { despensa: 4, nevera: 7, congelador: 90 }, 'Bollería: unos 4 días'),
  C('seco', 'Arroz, pasta y legumbres secas', 'despensa', 'despensa', { despensa: 540 }, 'Pasta, arroz y legumbres secas: más de un año cerrado'),
  C('harina', 'Harina y cereales', 'despensa', 'despensa', { despensa: 180, congelador: 365 }, 'Harinas y cereales: unos 6 meses'),
  C('conserva', 'Conservas', 'despensa', 'despensa', { despensa: 730 }, 'Conservas cerradas: 2 años; abiertas, 3 días en nevera', 3),
  C('frutoseco', 'Frutos secos', 'despensa', 'despensa', { despensa: 180, congelador: 365 }, 'Frutos secos: unos 6 meses', 60),
  C('salsa', 'Salsas y bricks', 'aceites_salsas', 'despensa', { despensa: 365 }, 'Salsas y tomate triturado: 1 año cerrado; abiertos, 5 días en nevera', 5),
  C('aceite', 'Aceites y vinagres', 'aceites_salsas', 'despensa', { despensa: 540 }, 'Aceites: unos 18 meses'),
  C('especia', 'Especias y condimentos', 'aceites_salsas', 'despensa', { despensa: 720 }, 'Especias: unos 2 años (pierden aroma)'),
  C('basico', 'Básicos', 'aceites_salsas', 'despensa', { despensa: null }, 'Sin caducidad práctica'),
  C('dulce', 'Dulces, galletas y cacao', 'desayuno_dulces', 'despensa', { despensa: 180 }, 'Dulces y galletas: unos 6 meses', 30),
  C('desayuno', 'Cereales y desayuno', 'desayuno_dulces', 'despensa', { despensa: 270 }, 'Cereales y café: unos 9 meses cerrados'),
  C('bebida', 'Bebidas', 'bebidas', 'despensa', { despensa: 270, nevera: 270 }, 'Bebidas cerradas: unos 9 meses; abiertas, 5 días en nevera', 5),
  C('congelado', 'Congelados', 'congelados', 'congelador', { congelador: 180 }, 'Congelados: unos 6 meses'),
  C('refrigerado', 'Refrigerados', 'lacteos', 'nevera', { nevera: 10, congelador: 90 }, 'Refrigerados (tofu, masas frescas): 7-10 días', 3),
  C('sobras', 'Sobras', 'otros', 'nevera', { nevera: 3, congelador: 90 }, 'Comida cocinada: 3 días en nevera, 3 meses congelada'),
  C('limpieza', 'Limpieza y hogar', 'limpieza_hogar', 'despensa', { despensa: null }, 'No es comida'),
  C('otros', 'Otros', 'otros', 'despensa', { despensa: null }, 'Sin estimación'),
];
export const CATEGORY_BY_ID: Record<string, Category> = Object.fromEntries(CATEGORIES.map((category) => [category.id, category]));

/** Legacy labels of the starter dictionary ("verdura", "lácteo"…) → category id. */
const LEGACY: Record<string, string> = {
  verdura: 'verdura', legumbre: 'seco', carne: 'carne', 'lácteo': 'queso', 'panadería': 'pan', huevo: 'huevo', pasta: 'seco',
  hierba: 'hierba', 'fruto seco': 'frutoseco', fruta: 'fruta', 'básico': 'basico',
};
export function categoryId(value: string | undefined | null): string {
  const text = String(value ?? '').trim();
  if (CATEGORY_BY_ID[text]) return text;
  return LEGACY[text] ?? LEGACY[text.toLowerCase()] ?? 'otros';
}
export const categoryOf = (value: string | undefined | null): Category => CATEGORY_BY_ID[categoryId(value)]!;

/** Words that reveal a category when the ingredient is unknown. First match wins, so order matters. */
const KEYWORDS: Array<[string, RegExp]> = [
  ['limpieza', /\b(detergente|lejia|suavizante|lavavajillas|fregasuelos|limpiador|limpia|papel (?:higienico|cocina)|servilleta|bolsa (?:basura|plastico)|esponja|estropajo|champu|gel (?:ducha|bano)|jabon|desodorante|compresa|panal|pasta de dientes|dentifrico|cepillo|bayeta|insecticida|ambientador|film|aluminio|rollo)\b/],
  ['congelado', /\b(congelad[oa]s?|ultracongelad[oa]s?|helado|cong\.?)\b/],
  ['conserva', /\b(conserva|conservas|lata|latas|escabeche|en aceite|al natural|en salmuera|tarro|frasco|encurtidos?)\b/],
  ['marisco', /\b(gamba|langostino|mejillon|almeja|calamar|pulpo|sepia|chipiron|cangrejo|berberecho|marisco|navaja|vieira)\w*/],
  ['pescado', /\b(salmon|merluza|bacalao|atun|lubina|dorada|sardina|boqueron|anchoa|trucha|pescado|rape|lenguado|caballa|bonito|gallo|rodaballo|pescadilla|abadejo)\w*/],
  ['picada', /\b(carne picada|picada|hamburguesa)\b/],
  ['ave', /\b(pollo|pavo|pechuga|muslo|contramuslo|gallina|pato|codorniz)\w*/],
  ['carne', /\b(ternera|cerdo|cordero|lomo|solomillo|chuleta|filete|costilla|carne|conejo|entrecot|secreto|presa|panceta|bacon|butifarra|salchicha)\w*/],
  ['embutido', /\b(chorizo|salchichon|jamon|lomo embuchado|fuet|morcilla|sobrasada|cecina|embutido|longaniza|mortadela|paleta)\w*/],
  ['fiambre', /\b(fiambre|jamon cocido|jamon york|pavo cocido|lacon)\b/],
  ['quesofresco', /\b(queso fresco|requeson|burgos|mozzarella|ricotta|mascarpone|cottage|feta|cabra fresco)\w*/],
  ['queso', /\b(queso|parmesano|manchego|cheddar|gouda|emmental|cabrales|idiazabal|brie|camembert)\w*/],
  ['yogur', /\b(yogur|yogurt|kefir|natillas|flan|cuajada|skyr|petit suisse)\w*/],
  ['leche', /\b(leche|bebida (?:de )?(?:avena|soja|almendra|arroz))\w*/],
  ['lacteo', /\b(mantequilla|nata|margarina|crema de leche)\b/],
  ['huevo', /\b(huevo|huevos)\b/],
  ['harina', /\b(pan rallado|rebozador|harina|maizena|levadura|avena|copos|semola)\b/],
  ['pan', /\b(pan|baguette|barra|chapata|molde|tostadas?|pan de molde|bimbo|tortilla de trigo|wrap|pita|focaccia)\b/],
  ['bolleria', /\b(croissant|donut|napolitana|magdalena|bizcocho|ensaimada|palmera|bollo|muffin)\w*/],
  ['hoja', /\b(lechuga|espinaca|rucula|canonigos|acelga|escarola|endibia|repollo|berros|brotes|ensalada|mezclum|lollo)\w*/],
  ['hierba', /\b(perejil|cilantro|albahaca|menta|hierbabuena|eneldo|cebollino|romero|tomillo|oregano fresco|salvia)\b/],
  ['tuberculo', /\b(patata|cebolla|ajo|boniato|chalota|puerro seco|calabaza)\w*/],
  ['fruta', /\b(manzana|pera|platano|naranja|mandarina|limon|lima|uva|fresa|melon|sandia|melocoton|nectarina|ciruela|kiwi|pina|mango|aguacate|cereza|albaricoque|higo|granada|frambuesa|arandano|pomelo|fruta)\w*/],
  ['verdura', /\b(tomate|pepino|pimiento|zanahoria|calabacin|berenjena|brocoli|coliflor|judia|champin|seta|apio|esparrago|maiz|guisante|remolacha|nabo|rabano|alcachofa|verdura|hortaliza|cebolleta|puerro)\w*/],
  ['seco', /\b(arroz|pasta|macarron|espagueti|spaghetti|fideo|tallarin|lenteja|garbanzo|alubia|judion|cuscus|quinoa|legumbre|noodle|lasana|fusilli|penne|tortellini|canelon)\w*/],
  ['harina', /\b(harina|maizena|levadura|avena|copos|semola|pan rallado|rebozador|galleta maria)\b/],
  ['conserva', /\b(conserva|lata|bote|atun en|sardinillas|mejillones en|tomate frito|esparragos? en|pimientos? del piquillo|aceitunas?|pepinillos?|maiz dulce|garbanzos? cocidos?|legumbre cocida)\w*/],
  ['frutoseco', /\b(almendra|nuez|nueces|avellana|pistacho|anacardo|cacahuete|piñon|pinon|pipas|frutos secos|castana|datil|pasas|orejones|sesamo|chia|lino)\w*/],
  ['salsa', /\b(salsa|ketchup|mayonesa|mostaza|tomate triturado|tomate natural|pisto|sofrito|pesto|soja|worcestershire|caldo|brick)\w*/],
  ['aceite', /\b(aceite|vinagre|aove)\b/],
  ['especia', /\b(pimenton|comino|curry|canela|oregano|laurel|nuez moscada|azafran|pimienta|clavo|jengibre|cayena|especias?|sazonador|colorante|vainilla|tomillo seco|romero seco)\b/],
  ['dulce', /\b(chocolate|cacao|galleta|mermelada|miel|azucar|turron|caramelo|chicle|sirope|nutella|crema de cacao|snack|patatas fritas|chips|palomitas|gominola)\w*/],
  ['desayuno', /\b(cereales|cafe|te |infusion|manzanilla|colacao|nesquik|muesli|granola|cola cao)\w*/],
  ['bebida', /\b(agua|refresco|cola|zumo|cerveza|vino|cava|sidra|gaseosa|tonica|isotonica|licor|whisky|ginebra|ron|vodka|bebida)\w*/],
  ['refrigerado', /\b(tofu|tempeh|seitan|hummus|masa|hojaldre|pasta fresca|pizza fresca|gnocchi|empanadilla|lasaña fresca)\w*/],
];

/** Guess a category id from a name. Returns 'otros' when nothing matches. */
export function guessCategory(name: string): string {
  const text = ` ${fold(name)} `;
  for (const [id, rule] of KEYWORDS) if (rule.test(text.trim())) return id;
  return 'otros';
}

export interface ShelfEstimate {
  /** YYYY-MM-DD or null when there is no meaningful expiry. */
  date: string | null;
  days: number | null;
  kind: 'estimated';
  basis: string;
}
