# CookHoard API

Generated from the tool catalogue by `npm run docs:api` (version 0.2.0). Do not edit by hand: a test fails when this file is out of date.

CookHoard has 56 tools (25 read-only). The same catalogue is served three ways: the MCP bridge (`apps/mcp`), the agent routes of the app and the web interface.

## Endpoints

| Method and path | What it does |
| --- | --- |
| `GET /api/health` | `{ service: "cookhoard", version, ytdlp, ffmpeg, links_media, scheduler, tools, hoard_link }` (`links_media`: whether the Links media service is running) |
| `GET /api/agent/tools` | `{ instructions, tools: [{ name, description, annotations, inputSchema }], app }` |
| `POST /api/agent/call` | Body `{ name, arguments }`, header `Authorization: Bearer <token>` (the token is in `mcp-token` inside the data folder). Returns the tool result as JSON (over 100 KB the largest list is cut and a `truncated` block says what was left out); errors are `{ error, code? }` with 400, 401, 404, 409 or 500. |
| `POST /api/tools/:name` | Same tools for the web interface: body is the arguments, no token (local-only guard). |
| `GET /media/:file` | Thumbnails saved from imported videos (data folder, `media/`). |
| `GET /manifest.webmanifest`, `GET /sw.js` | Installable web app. |

Requests must come from `localhost`, `127.0.0.1` or `[::1]`, or from a host listed in `COOKHOARD_ALLOWED_HOSTS`.

## Events

| Event | Data |
| --- | --- |
| `cookhoard.recipe.imported` | `{ recipe_id, title, source }` |
| `cookhoard.menu.planned` | `{ week }` |
| `cookhoard.pantry.expiring` | `{ count, items: [{ id, name, days_left }] }` (at most 10 items; sent by the daily routine at 09:00 when something expires within two days) |

## Tools

- [`kitchen_state`](#kitchen_state)
- [`find_recipes`](#find_recipes)
- [`get_recipe`](#get_recipe)
- [`recipe_check`](#recipe_check)
- [`save_recipe`](#save_recipe)
- [`recommend_recipes`](#recommend_recipes)
- [`plan_week`](#plan_week)
- [`change_menu_day`](#change_menu_day)
- [`set_menu_day`](#set_menu_day)
- [`menu_ingredients`](#menu_ingredients)
- [`add_menu_missing`](#add_menu_missing)
- [`add_kitchen_item`](#add_kitchen_item)
- [`set_kitchen_item`](#set_kitchen_item)
- [`remove_kitchen_item`](#remove_kitchen_item)
- [`update_recipe`](#update_recipe)
- [`delete_recipe`](#delete_recipe)
- [`record_cooking`](#record_cooking)
- [`cooking_history`](#cooking_history)
- [`set_recipe_saved`](#set_recipe_saved)
- [`saved_recipes`](#saved_recipes)
- [`set_expiry`](#set_expiry)
- [`use_expiring`](#use_expiring)
- [`import_recipe_jsonld`](#import_recipe_jsonld)
- [`import_recipe_url`](#import_recipe_url)
- [`export_kitchen`](#export_kitchen)
- [`import_kitchen`](#import_kitchen)
- [`import_recipe_video`](#import_recipe_video)
- [`import_recipe_text`](#import_recipe_text)
- [`recipe_drafts_list`](#recipe_drafts_list)
- [`recipe_draft_get`](#recipe_draft_get)
- [`recipe_draft_accept`](#recipe_draft_accept)
- [`recipe_draft_discard`](#recipe_draft_discard)
- [`pantry_list`](#pantry_list)
- [`pantry_set`](#pantry_set)
- [`shopping_list`](#shopping_list)
- [`shopping_mark_bought`](#shopping_mark_bought)
- [`ingredients_search`](#ingredients_search)
- [`ingredient_add`](#ingredient_add)
- [`ingredient_alias_add`](#ingredient_alias_add)
- [`ticket_import_text`](#ticket_import_text)
- [`ticket_import_file`](#ticket_import_file)
- [`ticket_import_mail`](#ticket_import_mail)
- [`tickets_list`](#tickets_list)
- [`ticket_review_list`](#ticket_review_list)
- [`ticket_line_map`](#ticket_line_map)
- [`price_book`](#price_book)
- [`price_add`](#price_add)
- [`recipe_cost`](#recipe_cost)
- [`menu_cost`](#menu_cost)
- [`food_spending`](#food_spending)
- [`what_to_cook`](#what_to_cook)
- [`cookhoard_status`](#cookhoard_status)
- [`settings_get`](#settings_get)
- [`settings_set`](#settings_set)
- [`today_overview`](#today_overview)
- [`tantalus_watch_add`](#tantalus_watch_add)

### `kitchen_state`

Read the local fridge, pantry, shopping list and this week’s menu. Estado de la cocina.

Shopping items with checked: true are in the pantry (location, quantity, expiry exact or estimated); unchecked ones are still to buy.

*read-only*

No arguments.

Phrases: nevera, compra, menú, cocina, estado, qué tengo

### `find_recipes`

Search recipes by title, ingredient, time, diet, allergens, season or source. Buscar recetas.

Optional filters: max_minutes (prep + cook), diet (vegetariano, vegano, sin_gluten), exclude_allergens (gluten, lactosa, huevo…), season, source (own, seed, url, video, text) and saved_only. Diet and allergens come from the author or from the recognised ingredients.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `query` | string | no | `""` |
| `limit` | integer | no | `10` |
| `max_minutes` | integer | no |  |
| `diet` | string[] | no |  |
| `exclude_allergens` | string[] | no |  |
| `season` | "spring" \| "summer" \| "autumn" \| "winter" | no |  |
| `source` | "own" \| "seed" \| "url" \| "video" \| "text" \| "web" | no |  |
| `saved_only` | boolean | no |  |

Phrases: recetas, buscar plato, cocinar, ingredientes, recetas rápidas, recetas sin gluten

### `get_recipe`

Read a recipe with ingredients, steps, source, history and cost per serving. Receta completa.

Includes nutrition per serving (approximate), the cooking history of this recipe and a cost estimate from the learned price book (says which prices are missing).

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `recipe_id` | string | yes |  |

Phrases: receta completa, pasos, cómo cocinar, cuánto cuesta

### `recipe_check`

Check scaled ingredients and pantry deficits for one recipe. Raciones y existencias de una receta.

No weekly menu needed. Optional servings requires a known recipe yield. Keeps authored units; converts g/kg and ml/L. stock_sufficient is true for confirmed required quantities, false for known deficits, null for unknown amounts, incompatible units or assumed staples. Optional ingredients are separate; expiry is not checked. Nothing is saved or consumed.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `recipe_id` | string | yes |  |
| `servings` | integer | no |  |

Phrases: receta para cuatro, escalar receta, cuánto necesito, alcanza la despensa, cantidades receta, qué falta comprar

### `save_recipe`

Save a personal recipe with ingredients and steps. Guardar receta propia.

Ingredient names not in the dictionary become user ingredients automatically. Steps may carry timerSec and temperatureC.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `title` | string | yes |  |
| `description` | string | no | `""` |
| `ingredients` | string \| object[] | yes |  |
| `steps` | string \| object[] | yes |  |
| `cuisine` | string | no |  |
| `season` | "spring" \| "summer" \| "autumn" \| "winter" | no |  |
| `temperature` | "hot" \| "cold" \| "room" | no |  |
| `heaviness` | number \| number \| number | no |  |
| `difficulty` | number \| number \| number | no |  |
| `servings` | integer | no |  |
| `prepMin` | integer | no |  |
| `cookMin` | integer | no |  |
| `dietFlags` | string[] | no |  |
| `allergens` | string[] | no |  |
| `image` | string | no |  |

Phrases: guardar receta, crear plato, receta propia, apunta esta receta

### `recommend_recipes`

Rank recipes for the current pantry and season. Qué puedo cocinar con lo que tengo.

For a full dinner plan with filters, expiring food and leftovers use what_to_cook.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `month` | integer | no |  |
| `hemisphere` | "N" \| "S" | no | `"N"` |
| `limit` | integer | no | `8` |

Phrases: qué puedo cocinar, recomendar recetas, aprovechar nevera, ideas de comida

### `plan_week`

Save a seven-day menu from recipes, season and pantry; replaces this week’s menu. Planificar la semana.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `month` | integer | no |  |
| `hemisphere` | "N" \| "S" | no | `"N"` |

Phrases: planificar menú, menú semanal, qué comemos esta semana

### `change_menu_day`

Change one day’s recipe without touching the other six. Cambiar un día del menú.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `day` | integer | yes |  |

Phrases: cambiar un día, sustituir receta, variar menú, otro plato para el martes

### `set_menu_day`

Choose a recipe and servings for one day of this week’s menu (day 1 = Monday). Elegir plato y raciones.

Omit servings to use the recipe’s own yield; an explicit target needs known recipe servings.

*writes, idempotent*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `day` | integer | yes |  |
| `recipe_id` | string | yes |  |
| `servings` | integer | no |  |

Phrases: elegir plato, raciones, personas, corregir menú, pon la tortilla el lunes

### `menu_ingredients`

Menu quantities and exact shopping deficits from known pantry stock. Cantidades del menú y lo que falta.

Optional days selects Monday=1 … Sunday=7. Scales servings; converts g/kg and ml/L; marks unknown or incompatible stock for checking. Never changes anything.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `days` | integer[] | no |  |

Phrases: cantidades menú, cuánto falta comprar, raciones, calcular compra

### `add_menu_missing`

Add the menu’s missing ingredients to the shopping list without duplicates. Apuntar lo que falta del menú.

*writes, idempotent*

No arguments.

Phrases: comprar lo que falta, ingredientes del menú, lista de la compra del menú

### `add_kitchen_item`

Add an ingredient to the shopping list or pantry; unknown names are created. Añadir a la compra.

checked: true means you already have it (goes to the pantry with an estimated expiry); false means still to buy.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `checked` | boolean | no | `false` |
| `qty` | number | no |  |
| `unit` | "ud" \| "L" \| "kg" \| "g" \| "ml" \| "ración" | no |  |

Phrases: añadir compra, meter en nevera, comprar ingrediente, apunta leche

### `set_kitchen_item`

Update an existing item: have it or not, known quantity or unit. Cambiar existencias.

For a new item use add_kitchen_item; for place or expiry use pantry_set.

*writes, idempotent*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `ingredient_id` | string | yes |  |
| `checked` | boolean | no |  |
| `qty` | number | no |  |
| `unit` | "ud" \| "L" \| "kg" \| "g" \| "ml" \| "ración" | no |  |

Phrases: ya tengo, marcar comprado, corregir cantidad, existencias, se ha agotado

### `remove_kitchen_item`

Remove an ingredient from the shopping list and pantry. Quitar un ingrediente.

*writes, idempotent*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `ingredient_id` | string | yes |  |

Phrases: quitar ingrediente, borrar de compra, vaciar nevera

### `update_recipe`

Edit a personal recipe: quantities, servings, steps, season. Modificar una receta propia.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `recipe_id` | string | yes |  |
| `changes` | object | yes |  |

Phrases: modificar receta, corregir ingredientes, cambiar raciones

### `delete_recipe`

Delete a personal recipe; the cooking history stays. Borrar una receta propia.

*writes, destructive*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `recipe_id` | string | yes |  |

Phrases: borrar receta propia, eliminar receta

### `record_cooking`

Record that you cooked a recipe: rating, notes, time, portions eaten. La he hecho.

When servings_made is greater than servings_eaten the difference is added to the pantry as "Sobras: <recipe>" with an estimated 3-day expiry. The result returns the leftover item.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `recipe_id` | string | yes |  |
| `rating` | integer | no |  |
| `notes` | string | no |  |
| `servings_made` | integer | no |  |
| `servings_eaten` | number | no |  |
| `time_taken_min` | integer | no |  |
| `would_repeat` | boolean | no |  |

Phrases: la he hecho, cocinar, valorar receta, hemos comido, sobras

### `cooking_history`

Read the cooking history and badges. Historial de cocina.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `recipe_id` | string | no |  |
| `limit` | integer | no | `20` |

Phrases: qué he cocinado, valoraciones, actividad cocina, lo último que hice

### `set_recipe_saved`

Add or remove a recipe from your personal cookbook. Guardar en el recetario.

*writes, idempotent*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `recipe_id` | string | yes |  |
| `saved` | boolean | yes |  |

Phrases: guardar en recetario, favoritos, marcar como favorita

### `saved_recipes`

List the recipes in your personal cookbook. Mi recetario.

*read-only*

No arguments.

Phrases: mis recetas guardadas, recetario, favoritos

### `set_expiry`

Set or clear the exact expiry date of an ingredient in the pantry. Fijar caducidad.

A date typed here is marked exact; pantry_set can also ask for an estimate.

*writes, idempotent*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `ingredient_id` | string | yes |  |
| `expires_at` | string \| null | yes |  |

Phrases: caducidad, vence el, se estropea, caduca el

### `use_expiring`

Pantry items expiring soon and the recipes that use them up. Aprovechar lo que caduca.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `within_days` | integer | no | `3` |
| `month` | integer | no |  |
| `hemisphere` | "N" \| "S" | no | `"N"` |
| `limit` | integer | no | `8` |

Phrases: aprovechar antes de caducar, qué cocinar antes de que se estropee, caducidades

### `import_recipe_jsonld`

Import one schema.org Recipe JSON-LD object into the cookbook. Importar receta de JSON-LD.

Paste the JSON-LD; no web access is needed.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `json_ld` | string | yes |  |

Phrases: importar receta de web, pegar receta estructurada

### `import_recipe_url`

Save a recipe from a web page or video link; without structured data, a draft. Receta de un enlace.

Repeating the URL reuses the saved recipe. For Instagram, TikTok, YouTube or Facebook videos use import_recipe_video.

*writes, uses the network or other apps*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `url` | url | yes |  |

Phrases: importa esta receta, guardar receta de enlace, receta de esta página

### `export_kitchen`

Export the whole kitchen as JSON for a personal backup. Copia de seguridad.

*read-only*

No arguments.

Phrases: copia de seguridad, exportar cocina, backup

### `import_kitchen`

Merge an exported kitchen JSON (v1 or v2) without duplicating anything. Restaurar copia.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `snapshot_json` | string | yes |  |

Phrases: restaurar copia, importar cocina, recuperar backup

### `import_recipe_video`

Read a recipe from a video or reel link into a draft to review. Receta desde un vídeo o reel.

Reads the caption, subtitles, the spoken audio (transcribed by Funes) and text on screen, then structures it; every line keeps its evidence and nothing is saved until recipe_draft_accept. caption / transcript_text can supply text the platform did not give. Says exactly which step could not run (no yt-dlp, login needed, no model).

*writes, uses the network or other apps*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `url` | url | yes |  |
| `caption` | string | no |  |
| `transcript_text` | string | no |  |
| `use_model` | boolean | no | `true` |
| `force` | boolean | no | `false` |

Phrases: receta de este reel, receta de un vídeo, importar de Instagram, receta de TikTok, receta de YouTube

### `import_recipe_text`

Read a recipe from pasted text (Spanish or English) into a draft to review. Receta desde texto pegado.

Understands ingredient lists with quantities, numbered steps, times and servings; unclear parts are filled by the local model when available and flagged. Nothing is saved until recipe_draft_accept.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `text` | string | yes |  |
| `title` | string | no |  |
| `url` | string | no |  |
| `use_model` | boolean | no | `true` |

Phrases: pega esta receta, receta de un mensaje, apunta esta receta, receta del WhatsApp, copiar receta

### `recipe_drafts_list`

List recipe drafts waiting for review. Borradores de recetas pendientes.

*read-only*

No arguments.

Phrases: borradores, recetas por revisar, importaciones pendientes

### `recipe_draft_get`

One recipe draft with the evidence of every line and what is missing. Revisar un borrador.

Speech (subtitles, transcript) is read as prose and never as a list; drafts built from it carry a note to check quantities and a lower confidence. Description text only gives steps or ingredients when it has list form; otherwise what was said wins. Each ingredient and step says which text it was read from (caption, subtitles, transcript, screen, text) and whether the evidence was verified.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `draft_id` | string | yes |  |

Phrases: ver borrador, evidencia, de dónde sale, revisar importación

### `recipe_draft_accept`

Save a reviewed recipe draft as a recipe, with optional corrections. Guardar el borrador como receta.

New ingredient names join your dictionary. Returns the saved recipe; the draft is removed.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `draft_id` | string | yes |  |
| `edits` | object | no |  |

Phrases: guardar receta importada, aceptar borrador, confirmar receta, está bien así

### `recipe_draft_discard`

Discard a recipe draft. Descartar un borrador.

*writes, idempotent, destructive*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `draft_id` | string | yes |  |

Phrases: borrar borrador, descartar importación, no es una receta

### `pantry_list`

List the pantry by place with quantity and expiry (exact or estimated). Qué hay en la nevera.

Each item says whether its expiry date was typed (exact) or estimated from the shelf-life table and why. Optional place (nevera, despensa, congelador) and expiring_within_days.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `place` | "nevera" \| "despensa" \| "congelador" | no |  |
| `expiring_within_days` | integer | no |  |

Phrases: qué tengo, despensa, nevera, congelador, caducidades, qué caduca

### `pantry_set`

Put an ingredient in the pantry or change its place, quantity, opened state or expiry. Guardar.

A date in expires_at is exact; without it an estimate is made from the place (a change of place or opening restarts the clock). opened: true marks the pack as opened today. The result returns the item with its expiry kind and basis.

*writes, idempotent*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `ingredient` | string | yes |  |
| `place` | "nevera" \| "despensa" \| "congelador" | no |  |
| `qty` | number \| null | no |  |
| `unit` | "ud" \| "L" \| "kg" \| "g" \| "ml" \| "ración" | no |  |
| `expires_at` | string | no |  |
| `estimate_expiry` | boolean | no |  |
| `opened` | boolean | no |  |
| `clear_expiry` | boolean | no |  |
| `note` | string | no |  |

Phrases: guardar en el congelador, he abierto, abierto hoy, mover a la nevera, caduca el, cuánto dura

### `shopping_list`

The shopping list by supermarket section, with a price estimate and ready-to-copy text. Lista de la compra.

Sections follow the order set in Ajustes. Estimates use the learned price book and say when they are approximate or missing.

*read-only*

No arguments.

Phrases: lista de la compra, qué tengo que comprar, copiar la lista, lista por pasillos, cuánto costará la compra

### `shopping_mark_bought`

Mark shopping-list items as bought; they enter the pantry with an estimated expiry. Ya comprado.

qty and unit replace the list amount; price is the total paid for that line and feeds the price book.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `items` | object[] | yes |  |

Phrases: ya he comprado, marcar como comprado, tachar de la lista, llegué del súper

### `ingredients_search`

Look up an ingredient in the dictionary (including yours) and how a name is understood. Buscar ingrediente.

Returns candidates with category, place and shelf life, and which one a typed name resolves to.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `query` | string | yes |  |
| `limit` | integer | no | `10` |

Phrases: buscar ingrediente, qué es, cómo se llama, diccionario de ingredientes

### `ingredient_add`

Add an ingredient to your own dictionary with category, aliases and shelf life. Crear ingrediente propio.

Unknown names in recipes and tickets are created automatically; use this to choose the category or the days it lasts.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `category` | "fruta" \| "verdura" \| "hoja" \| "tuberculo" \| "hierba" \| "carne" \| "picada" \| "ave" \| "pescado" \| "marisco" \| "embutido" \| "fiambre" \| "queso" \| "quesofresco" \| "leche" \| "yogur" \| "lacteo" \| "huevo" \| "pan" \| "bolleria" \| "seco" \| "harina" \| "conserva" \| "frutoseco" \| "salsa" \| "aceite" \| "especia" \| "basico" \| "dulce" \| "desayuno" \| "bebida" \| "congelado" \| "refrigerado" \| "sobras" \| "limpieza" \| "otros" | no |  |
| `aliases` | string[] | no |  |
| `default_unit` | "ud" \| "L" \| "kg" \| "g" \| "ml" \| "ración" | no |  |
| `shelf_days` | object | no |  |

Phrases: nuevo ingrediente, añadir al diccionario, cuánto dura en la nevera, categoría de ingrediente

### `ingredient_alias_add`

Teach CookHoard that a word or ticket abbreviation means an ingredient. Enseñar un alias.

Future recipes and tickets with that text map to the ingredient without asking.

*writes, idempotent*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `alias` | string | yes |  |
| `ingredient` | string | yes |  |

Phrases: esto significa, enseñar abreviatura, alias de ingrediente, PECH POLLO es pechuga

### `ticket_import_text`

Import a supermarket ticket from text: food to the pantry, prices to the price book. Ticket de compra.

Lines it cannot recognise wait in the review queue (ticket_review_list); non-food lines are ignored. The local model may suggest a name for those but a person confirms it. The same ticket twice is imported once.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `text` | string | yes |  |
| `store` | string | no |  |
| `date` | string | no |  |
| `use_model` | boolean | no | `true` |

Phrases: pegar ticket, subir ticket, he comprado, importar compra, ticket del súper, ticket de Mercadona

### `ticket_import_file`

Import a ticket from a PDF or photo on this computer, read by Kafka (OCR). Ticket desde foto o PDF.

The file is filed in Kafka (absolute path), its text is read back and imported like ticket_import_text. Says so when Kafka is not reachable.

*writes, uses the network or other apps*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `path` | string | yes |  |
| `store` | string | no |  |
| `date` | string | no |  |

Phrases: ticket en foto, ticket en PDF, escanear ticket, subir foto del ticket

### `ticket_import_mail`

Import supermarket receipts that the paperwork app read from the mail account. Tickets del correo.

Only receipts from the supermarkets in Ajustes that were not imported yet. Says so when Kafka is not reachable.

*writes, uses the network or other apps*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `limit` | integer | no | `10` |
| `text` | string | no | `""` |

Phrases: tickets del correo, pedidos online, recibos del súper, importar compras del email

### `tickets_list`

List imported tickets, or one ticket with every line and how it was matched. Tickets importados.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `ticket_id` | string | no |  |
| `limit` | integer | no | `20` |

Phrases: mis tickets, últimas compras, qué compré, detalle del ticket

### `ticket_review_list`

Ticket lines not matched to an ingredient, with the model’s suggestion. Líneas por revisar.

*read-only*

No arguments.

Phrases: tickets por revisar, líneas sin reconocer, qué no ha entendido, abreviaturas

### `ticket_line_map`

Resolve a ticket line: give its ingredient (and learn the abbreviation) or ignore it. Línea de ticket.

ignore_always keeps that text out of every future ticket. The result returns the updated ticket and how many lines are still to review.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `ticket_id` | string | yes |  |
| `line_id` | string | yes |  |
| `ingredient` | string | no |  |
| `ignore` | boolean | no |  |
| `ignore_always` | boolean | no |  |
| `learn` | boolean | no | `true` |

Phrases: esto es, esa línea es, ignorar línea, no es comida, enseñar abreviatura del ticket

### `price_book`

Prices learned from tickets: last, 90-day median and cheapest store per ingredient. Libro de precios.

Prices are normalised to €/kg, €/L or €/ud. Ingredients never bought have none.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `query` | string | no | `""` |

Phrases: precios, cuánto cuesta, dónde es más barato, histórico de precios, precio del aceite

### `price_add`

Record a price by hand (€/kg, €/L or €/ud) in the price book. Apuntar un precio.

*writes*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `ingredient` | string | yes |  |
| `unit_price` | number | yes |  |
| `price_unit` | "kg" \| "L" \| "ud" | yes |  |
| `store` | string | yes |  |
| `date` | string | no |  |

Phrases: apunta el precio, el aceite cuesta, precio manual, he visto a

### `recipe_cost`

Cost of a recipe from your price book: total, per serving, missing prices. Cuánto cuesta una receta.

Uses the median of the last 90 days (or the last price, or the price at one store). Never guesses a price: missing ones are listed.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `recipe_id` | string | yes |  |
| `servings` | number | no |  |
| `store` | string | no |  |
| `mode` | "median90" \| "last" | no | `"median90"` |

Phrases: coste de la receta, cuánto cuesta cocinar, precio por ración, receta barata

### `menu_cost`

Cost of this week’s menu by day, and against the weekly budget. Cuánto cuesta el menú.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `store` | string | no |  |

Phrases: coste del menú, presupuesto de la semana, cuánto gasto comiendo, menú barato

### `food_spending`

Food spending from tickets against the weekly budget, plus Ledger food categories. Gasto en comida.

If the finance app is not reachable only tickets are used (it says so).

*read-only, uses the network or other apps*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `month` | string | no |  |

Phrases: cuánto gasto en comida, presupuesto de la compra, gasto del súper, cuánto llevo esta semana

### `what_to_cook`

What to cook tonight from what you have, what expires, recent meals and ratings, plus leftovers. ¿Qué ceno?

Filters: max_minutes, diet, avoid_allergens, only_have, allow_missing, avoid_days (default 3). With servings, checks scaled required quantities and returns stock_sufficient, deficits and unconfirmed stock; only_have then requires confirmed quantity coverage. Recipes without known yield are excluded. Without servings, recommendations use ingredient presence. Use recipe_check for the full scaled list.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `max_minutes` | integer | no |  |
| `servings` | integer | no |  |
| `diet` | string[] | no |  |
| `avoid_allergens` | string[] | no |  |
| `only_have` | boolean | no |  |
| `allow_missing` | integer | no |  |
| `use_expiring` | boolean | no |  |
| `avoid_days` | integer | no |  |
| `expiring_within_days` | integer | no |  |
| `month` | integer | no |  |
| `hemisphere` | "N" \| "S" | no |  |
| `limit` | integer | no | `6` |

Phrases: qué ceno, qué cocino hoy, qué hago de cenar, qué puedo cocinar rápido, sin gluten, gasta lo que caduca, sobras

### `cookhoard_status`

CookHoard status: version, counts, yt-dlp, ffmpeg, local model, hub, daily routine. Estado de CookHoard.

Use it to find out why a video import or a ticket step could not run.

*read-only, uses the network or other apps*

No arguments.

Phrases: estado de cookhoard, funciona yt-dlp, hay modelo, qué falta instalar, diagnóstico

### `settings_get`

Read the settings: language, shopping sections order, weekly budget, supermarkets, video options. Ajustes.

*read-only*

No arguments.

Phrases: ajustes, configuración, presupuesto semanal, orden de la compra, cookies

### `settings_set`

Change settings (only the fields given): language, sections, budget, supermarkets, yt-dlp. Cambiar ajustes.

Returns the settings after the change.

*writes, idempotent*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `settings` | object | yes |  |

Phrases: cambia el presupuesto, presupuesto semanal de 80, ordena la compra, usar cookies de Edge, ruta de yt-dlp

### `today_overview`

What matters today: food about to expire, dinner ideas, menu, shopping, reviews. Resumen de hoy.

*read-only*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `dinners` | integer | no | `3` |

Phrases: qué hay hoy, qué toca hoy, resumen de la cocina, qué caduca y qué cenamos

### `tantalus_watch_add`

Watch the price of a product page with the price watcher app (Tantalus). Vigilar el precio de un producto.

Uses the watcher in Ajustes or a "CookHoard" watcher it creates. Says so when Tantalus is not reachable.

*writes, uses the network or other apps*

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `url` | url | yes |  |
| `label` | string | no |  |
| `watcher_id` | string | no |  |

Phrases: vigila el precio, avísame si baja, seguir precio, producto en oferta
