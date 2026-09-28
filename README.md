# CookHoard

[Español](README.es.md)

CookHoard is a **local personal kitchen** for Faustus. It runs as an MCP stdio server that Faustus starts when it needs a tool. It needs no website, domain, account, Supabase instance or permanent server.

## Start

```sh
npm install
npm run mcp
```

Register [`faustus-plugin.json`](faustus-plugin.json) in Faustus and set `COOKHOARD_DIR` to this repository. Data is stored in `%LOCALAPPDATA%\CookHoard\kitchen.json` on Windows or `~/.local/share/CookHoard/kitchen.json` on Linux/macOS. Set `COOKHOARD_DATA_DIR` to choose a different local directory. Chats using the same directory share one kitchen.

## Capabilities

- Starter and personal recipes, search, steps and editing with quantities, servings, times, diets and allergens.
- Recommendations based on available ingredients, season and the character of each dish.
- A saved weekly menu, individual day changes and a shopping list without duplicates.
- Recipe and serving selection per day, plus ingredient totals for the whole menu or selected days.
- A combined pantry and shopping list: a checked ingredient means you already have it. Expiration dates support suggestions for using food before it expires.
- Saved cookbook, cooking history with ratings and notes, badges and approximate nutrition.
- Import a recipe directly from a page containing `schema.org/Recipe` JSON-LD with `import_recipe_url`, or paste JSON-LD with `import_recipe_jsonld`. Repeating a page URL reuses its saved recipe. Full kitchen export and restore as JSON.

Reusable logic lives in `packages/core`; MCP tools and persistence live in `apps/mcp`. One local `kitchen.json` stores the data. `export_kitchen` returns a complete backup, and `import_kitchen` restores it without duplicating recipes or cooked dishes.

## Menu servings

You can ask Faustus: “Plan this week and put my tortilla on Monday for four and Tuesday for two. Add up the ingredients for those two days.” Then: “Change Monday to three servings and recalculate.”

`set_menu_day` modifies one day of the current menu (`day: 1` is Monday; `7` is Sunday). `recipe_id` and `servings` are optional. Repeating a selection does not add days or duplicate quantities. Omitting `servings` restores the recipe's base yield. A recipe needs a known base yield to scale; add it through `update_recipe` if missing.

`menu_ingredients` calculates the whole week or a subset such as `days: [1, 2]`. It sums repeated recipes and scales by selected servings divided by base servings. It includes non-main and staple ingredients; optional ingredients are listed separately. Only identical units are grouped: grams and kilograms remain separate. `quantity: null` marks an unknown total; `known_quantity` is the known subtotal. A checked pantry item does not establish that enough is available, so the tool does not subtract it. This query leaves the menu, recipes and shopping list unchanged.

## Verify

```sh
npm run test:core
npm run test --workspace @cookhoard/mcp
```

The former Expo app and social Supabase prototype were retired from the active product. Their source remains recoverable in older Git commits. The user confirmed they contained only test data; no remote service was modified or cancelled.

License: AGPL-3.0-or-later.
