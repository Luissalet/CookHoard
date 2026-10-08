# Check a recipe against pantry quantities

Use `recipe_check` to answer “Do I have enough for four?” without first saving
or replacing a weekly menu:

```json
{"recipe_id":"local-example","servings":4}
```

The tool reads one current kitchen snapshot. Quantities belong to the recipe's
full yield and scale by `servings / base_servings`. Omit `servings` to check the
original quantities; a target requires a known, positive base yield.

`required` and `optional` preserve authored units and list each demand,
allocated `covered_quantity`, `to_buy_quantity` and `stock_status`. Repeated
lines share the same stock. Required ingredients are allocated before optional
ones. g/kg and ml/L convert; other units compare only with the same exact unit.
There is no density or package-size inference. Tiny binary arithmetic noise
at the boundary is suppressed; real purchasing deficits are retained.

`stock_sufficient` concerns required quantities:

- `true`: all confirmed covered.
- `false`: at least one known deficit, even if other ingredients are uncertain.
- `null`: no known deficit, but some quantities or units are unknown or a basic
  ingredient is only assumed to be available.

`missing` lists known deficits. `needs_check` lists uncertainty reasons. Optional
deficits do not block required stock sufficiency. Unknown recipe quantities do
not become zero. Expiry is not evaluated by this quantity check.

The recipe, pantry, shopping list, menu and cooking history remain unchanged.
Invalid IDs, invalid targets and arithmetic overflow fail explicitly.

## Recommendations with a target yield

`what_to_cook(servings=4)` uses the same quantity calculation for each candidate,
adds `stock_sufficient`, `quantity_deficits` and `needs_check`, and scales the
cost estimate. Recipes without a known yield are counted under
`excluded.raciones_sin_base`. `only_have=true` requires confirmed quantities;
`allow_missing` counts distinct ingredients with known required deficits.
Filtering happens before the result limit, so unavailable top-ranked recipes do
not hide viable later candidates. Leftovers report whether their saved portions
reach the requested number; `only_have` filters insufficient portions.

Without `servings`, the existing presence-based recommendation remains.
Ranking still uses presence, expiry, season and recent cooking; it does not
optimise combinations of dishes sharing a pantry. Each recipe is checked
independently. The tool does not reserve or consume ingredients.

## Research references

- [Tandoor shopping lists](https://docs.tandoor.dev/features/shopping/): recipe
  quantities and shopping needs.
- [Mealie scaling and shopping discussion](https://github.com/mealie-recipes/mealie/discussions/2303):
  user friction when scaling and adding recipe ingredients via meal planning.

No upstream code was copied and no dependency was added. The implementation
reuses CookHoard's menu quantity and stock allocation functions. GitHub Trending
was inspected during research; no relevant recipe project was identified there.

## En español

`recipe_check` comprueba una receta y sus raciones contra las cantidades actuales
de la despensa, sin guardar un menú ni consumir ingredientes. Devuelve demandas,
cantidades cubiertas, faltantes y datos que falta confirmar. Los opcionales van
aparte. Solo convierte g/kg y ml/L; no inventa densidades ni tamaños de envase.

`stock_sufficient` es `true` si todas las cantidades obligatorias están cubiertas,
`false` si existe un déficit conocido y `null` si faltan datos para confirmarlo.
No comprueba caducidad. Para escalar se necesitan las raciones base de la receta.

Al pedir raciones a `what_to_cook`, se calculan déficits y coste escalado antes de
limitar los resultados. `only_have` exige cantidades confirmadas. Sin raciones
se mantiene la recomendación basada en presencia. Cada receta se comprueba de
forma independiente: no se reserva despensa entre varios platos.
