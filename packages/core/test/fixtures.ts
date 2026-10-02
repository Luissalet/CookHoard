// Invented tickets and recipe texts: no real shops' data, only the layouts they commonly print.
export const TICKET_ROWS = `SUPERMERCADO EJEMPLO, S.A.   A-00000000
C/ DE PRUEBA 1 00000 CIUDAD
04/09/2026 19:32  OP: 000001
FACTURA SIMPLIFICADA: 0000-000-000000
Descripción     P. Unit  Importe
1 LECHE SEMI DESN              0,89
2 YOGUR NATURAL    0,45        0,90
1 PLATANO
0,456 kg  2,99 €/kg           1,36
1 BOLSA PLASTICO               0,15
1 DETERGENTE ROPA              5,99
3 HUEVOS L 12                  2,59
1 TOMATE FRITO                 1,05
1 PAN RALLADO                  0,80
TOTAL (€)                     13,73
TARJETA BANCARIA
IVA  BASE IMPONIBLE  CUOTA
10%  10,00  1,00`;

export const TICKET_MERCADONA = TICKET_ROWS.replace('SUPERMERCADO EJEMPLO, S.A.', 'MERCADONA, S.A.');

export const TICKET_DISCOUNT = `LIDL SUPERMERCADOS
Fecha: 05.09.2026 18:10
LECHE ENTERA 1L 2,10 B
2 x 1,05
MANTEQUILLA 250G 2,35 B
PLATANOS 1,36 B
0,456 kg x 2,99 EUR/kg
AGUA MINERAL 6X1,5L 2,10 A
Descuento promocion -0,35
Total 7,56
Tarjeta`;

export const TICKET_WRAPPED = `CARREFOUR EXPRESS
06/09/26 11:05
PECHUGA POLLO
FILETES 1KG   5,50
ARROZ REDONDO 1KG  1,15
QUESO RALLADO 4Q 200G  1,89
SALMON FRESCO 0,500 kg x 14,90 €/kg  7,45
HELADO VAINILLA CONGELADO 3,20
TOTAL COMPRA 19,19`;

export const TICKET_QTY_LAST = `DIA
2026-09-07
LECHE SEMI 1L          3     2,67
ACEITE OLIVA VIRGEN EXTRA 1L  7,95
ZANAHORIA BOLSA 1KG    1,19
PAPEL COCINA 2 ROLLOS  2,10
SALSA XYZ RARA 250G    1,70
TOTAL                 15,61`;

export const RECIPE_BULLETS = `Tortilla de patatas 🥔

Para 4 personas
Ingredientes:
- 5 huevos
- 1 kg de patatas
- 1/2 cebolla
- Aceite de oliva
- Sal al gusto

Preparación:
1. Pela y corta las patatas en láminas finas.
2. Fríe las patatas a fuego medio durante 20 minutos.
3. Bate los huevos, mezcla y cuaja en la sartén 4 min por cada lado.
#tortilla #receta`;

export const RECIPE_CAPTION = `Os dejo la receta de hoy 😍
🔸 200 g de harina
🔸 1 y 1/2 tazas de leche
🔸 2 huevos
🔸 1 pizca de sal
🔸 Una cucharada de azúcar (opcional)
Mezcla todo en un bol. Calienta una sartén y vierte un cazo de masa. Cocina 2 minutos por cada lado.
Sírvelo con miel. Sígueme para más recetas`;

export const RECIPE_ENGLISH = `Pasta al pesto
Servings: 2
Ingredients
200g spaghetti
2 tbsp pesto
1 clove garlic, minced
Parmesan to taste
Method
Boil the pasta for 10-12 minutes. Drain and mix with pesto. Bake 5 min at 180ºC.`;

export const RECIPE_NUMBERED_NO_HEADERS = `Crema de calabacín
2 calabacines
1 cebolla
1 patata
750 ml de caldo
1. Pica la cebolla y sofríela 5 minutos.
2. Añade el calabacín y la patata en trozos.
3. Cubre con el caldo y cuece 25 minutos.
4. Tritura y sirve caliente.`;

// Auto-generated style subtitles of an invented tortilla video: speech without punctuation, cut where the caption line ends.
export const TORTILLA_CUES = [
  'vamos a preparar tortilla de patata los', 'ingredientes que necesitaremos son 3', 'patatas grandes una cebolla 4 ó 5 huevos', 'aceite de oliva virgen extra y sal',
  'comenzamos con las patatas ya peladas a', 'cortarlas en rodajas finas', 'hacemos lo mismo con la cebolla', 'y en una sartén grande echaremos',
  'abundante aceite de oliva virgen y', 'cuando esté caliente añadiremos las', 'patatas', 'y la cebolla', 'tenemos que cocer la patata en el',
  'aceite por lo que lo bajaremos a fuego', 'medio bajo', 'añadiremos sal', 'echamos los huevos en un bol grande y', 'una pizquita de sal en cada huevo',
  'y lo batimos', 'cuando lleve unos cinco minutos le', 'daremos la primera vuelta', 'otros 4 ó 5 minutos si nos gusta poco', 'cuajada',
];
/** A WebVTT file for `cues`, each lasting `length` seconds; `pauses` maps a cue index to the silence (seconds) before it. */
export function vttOf(cues: string[], pauses: Record<number, number> = {}, length = 2.4): string {
  const stamp = (x: number): string => `00:${String(Math.floor(x / 60)).padStart(2, '0')}:${(x % 60).toFixed(3).padStart(6, '0')}`;
  let t = 0;
  let out = 'WEBVTT\nKind: captions\nLanguage: es\n\n';
  cues.forEach((cue, i) => { t += pauses[i] ?? 0; out += `${stamp(t)} --> ${stamp(t + length)}\n${cue}\n\n`; t += length; });
  return out;
}
