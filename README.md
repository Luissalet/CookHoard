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
- Nevera y compra en una lista: marcado significa que ya tienes el ingrediente. Fechas de caducidad y propuestas para aprovechar lo que vence.
- Recetario guardado, historial de platos cocinados con valoración y notas, insignias y nutrición orientativa.
- Importación de una receta pegando su JSON-LD `schema.org/Recipe`; copia y restauración completa de la cocina como JSON.

El motor reutilizable está en `packages/core`; las herramientas y el almacenamiento están en `apps/mcp`. Los datos se guardan en un único `kitchen.json` local. `export_kitchen` devuelve una copia completa que puedes conservar fuera de Faustus; `import_kitchen` la restaura sin duplicar recetas ni platos cocinados.

## Comprobar

```bash
npm run test:core
npm run test --workspace @cookhoard/mcp
```

La antigua aplicación Expo y el prototipo social de Supabase se retiraron del producto activo. Su código sigue recuperable en el historial de Git anterior a esta conversión. El usuario confirmó que solo contenían datos de prueba; no se modificó ni canceló ningún servicio remoto.

Licencia: AGPL-3.0-or-later.
