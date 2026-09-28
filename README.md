# CookHoard

CookHoard es una cocina personal **local** para Faustus. Funciona como servidor MCP por `stdio`: Faustus inicia el proceso cuando usa sus herramientas. No necesita web, dominio, cuenta, Supabase ni servidor permanente.

## Empezar

```bash
npm install
npm run mcp
```

Registra [`faustus-plugin.json`](./faustus-plugin.json) en Faustus y configura `COOKHOARD_DIR` con la ruta de este repositorio. El archivo de datos se crea en `%LOCALAPPDATA%\CookHoard\kitchen.json` en Windows o `~/.local/share/CookHoard/kitchen.json` en Linux/macOS. Para elegir otra ubicación, establece `COOKHOARD_DATA_DIR` con una carpeta local. Una sola cocina se comparte entre todos los chats de Faustus que utilicen esa ubicación.

## Capacidades

- Recetas iniciales y propias; búsqueda, pasos y edición de recetas con cantidades, raciones, tiempos, dieta y alérgenos.
- Recomendaciones según ingredientes disponibles, estación y carácter del plato.
- Menú semanal guardado, sustitución de un día y lista de compra sin duplicados.
- Elección de receta y raciones por día; cálculo agregado de ingredientes del menú o de días concretos.
- Nevera y compra en una lista: marcado significa que ya tienes el ingrediente. Fechas de caducidad y propuestas para aprovechar lo que vence.
- Recetario guardado, historial de platos cocinados con valoración y notas, insignias y nutrición orientativa.
- Importación de una receta pegando su JSON-LD `schema.org/Recipe`; copia y restauración completa de la cocina como JSON.

El motor reutilizable está en `packages/core`; las herramientas y el almacenamiento están en `apps/mcp`. Los datos se guardan en un único `kitchen.json` local. `export_kitchen` devuelve una copia completa que puedes conservar fuera de Faustus; `import_kitchen` la restaura sin duplicar recetas ni platos cocinados.

## Raciones del menú

Puedes pedir a Faustus: «Planifica la semana y pon mi tortilla el lunes para cuatro personas y el martes para dos. Calcula los ingredientes de esos dos días». Después: «Corrige el lunes a tres personas y vuelve a sumar».

`set_menu_day` modifica un solo día del menú actual (`day: 1` es lunes, `7` domingo), con `recipe_id` y `servings` opcional. Repetir la selección no añade días ni duplica cantidades. Omitir `servings` restaura el rendimiento original. Para escalar una receta deben conocerse sus raciones base; si faltan, se pueden añadir con `update_recipe`.

`menu_ingredients` calcula toda la semana o el subconjunto `days: [1, 2]`. Suma repeticiones y escala las cantidades con el factor raciones objetivo/raciones base. Incluye ingredientes no principales y básicos; los opcionales aparecen aparte. Agrupa solo unidades idénticas: gramos y kilogramos se mantienen separados. Un total `quantity: null` señala cantidades desconocidas; `known_quantity` es únicamente el subtotal conocido. La presencia en la nevera no acredita cantidad suficiente y no se descuenta. Esta consulta deja intactos el menú, las recetas y la lista de compra.

## Comprobar

```bash
npm run test:core
npm run test --workspace @cookhoard/mcp
```

La antigua aplicación Expo y el prototipo social de Supabase se retiraron del producto activo. Su código sigue recuperable en el historial de Git anterior a esta conversión. El usuario confirmó que solo contenían datos de prueba; no se modificó ni canceló ningún servicio remoto.

Licencia: AGPL-3.0-or-later.
