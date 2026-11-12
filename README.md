# CookHoard

A local kitchen app: recipes, a pantry with expiry dates, a weekly menu, a shopping list, supermarket tickets and prices.

[Leer en español](README.es.md)

## What it is

CookHoard is a small web app (Express and React, default `http://127.0.0.1:5210`) plus an MCP server that Faustus starts. Both use the same tools and the same `kitchen.json`. Nothing needs an account or leaves the computer, except the video links you ask it to read. When something cannot run (no yt-dlp, no ffmpeg, no local model, Funes, Kafka, Ledger or Tantalus unreachable) the answer says so; it never fills in data it did not read.

## What it does

**Recipes**
- Search and filter by time, diet, source and saved. Scale servings, see cost per serving, approximate nutrition and print.
- Cooking history: rating, notes, servings made and eaten, minutes and whether you would make it again, with a view of the latest records of every recipe (deleted recipes keep their records).
- Cooking mode: one step at a time in large type, timers with sound and vibration, ingredient list on the side, keyboard navigation and a screen wake lock where the browser allows it.
- **Check quantities**: compares the selected servings with the pantry and shows required, covered and missing amounts, with optional ingredients and unconfirmed units separate. It does not reserve or consume anything. See [docs/RECIPE_CHECK.md](docs/RECIPE_CHECK.md).

**Importing recipes**
- From a video or reel (Instagram, TikTok, YouTube, Facebook): the link is read by Links Hoard through the hub when it is running, otherwise by the yt-dlp on this machine. It reads caption and subtitles; if that is not enough the audio is transcribed by Funes, and with ffmpeg and a vision model the on-screen text is read from key frames.
- From text, in Spanish or English, with or without section headers, bullets or numbering; from a recipe page (JSON-LD).
- A deterministic parser reads the text first and a local model fills gaps. Spoken text is read as prose (ingredients with the nearest spoken amount, steps grouped at "cuando", "después", "una vez", timers when a duration is said). The result is always a draft: every ingredient and step shows the line it came from and whether its number was found in the source, and nothing is saved until you accept it. The thumbnail is stored locally.

**Pantry and ingredients**
- Items live in the fridge, pantry or freezer, with quantity, opened date and expiry. A date you type is exact; one from general storage rules is estimated and always labelled `≈` with its basis. Cooked leftovers enter the fridge with a date.
- Own ingredient dictionary: unknown ingredients are created on the fly; add ingredients with category, aliases and shelf life, and teach aliases (for example a ticket abbreviation) that apply to recipes and tickets from then on.

**Tickets and prices**
- Paste ticket text, read a photo or PDF with Kafka's extractor (text layer, OCR for scans), or import supermarket receipts found in the mail through Kafka. Food lines go to the pantry and the price book; lines it cannot recognise wait in a review queue where you say what they are (and it remembers), mark them as not food or ignore them for good. A model may suggest a match, shown but never applied by itself.
- Pack sizes in product names ("3 KG", "500GR", "1,5L", "75 CL", "6 UDS", "6X125G") set the pantry quantity and the price per kg, L or unit. The store name is read from the ticket header when no known supermarket matches. Duplicate tickets are detected.
- Costs: recipe and weekly menu cost from your own prices (median of recent purchases), spending per week and month from tickets, and food spending recorded in Ledger when it is running. Costs with missing prices are marked partial.
- Price watching: `tantalus_watch_add` hands a product page to Tantalus.

**Menu, shopping and suggestions**
- Weekly menu with servings per day, ingredient totals with stock subtracted, and a shopping list grouped by supermarket section in an order you choose. Copy as text or Markdown, print, mark items as bought (they move to the pantry).
- What to cook: dinner ideas ranked by what you have, what is about to expire, the season and how recently you cooked each dish; leftovers appear as options. With a `servings` target, recommendations check required quantities and deficits.
- Daily routine: at 09:00 (and at startup if missed) CookHoard sends `cookhoard.pantry.expiring` on the family bus when something expires within two days.

**Interface.** Spanish first with an English toggle, dark by default with a light theme, installable as a web app, usable at phone width. Screens: Hoy, Recetas, Importar, Despensa, Menú, Compra, Precios, Ajustes.

## How to run it

Requires Node 22.13 or newer. Links Hoard, yt-dlp and ffmpeg are optional.

```sh
npm install
npm run build        # builds the web interface into apps/web/dist
npm start            # app on http://127.0.0.1:5210
```

For videos on Windows: `winget install yt-dlp.yt-dlp` and `winget install Gyan.FFmpeg`. Instagram and TikTok often refuse anonymous downloads: in Ajustes choose the browser whose cookies to use (Edge, Chrome or Firefox) or a `cookies.txt` file. A yt-dlp path or cookies set in Ajustes go first, and the family tools are asked only when there is none.

**Ajustes** covers language, theme, weekly budget, default servings, shopping section order, supermarket names for mail tickets, yt-dlp path, cookies, reading on-screen text, transcription with Funes, status of yt-dlp, ffmpeg, models, hub and the daily routine, backup download and restore, and the ingredient dictionary.

### Environment variables

| Variable | Meaning |
| --- | --- |
| `COOKHOARD_PORT` (or `PORT`) | Port, default 5210. With `PORT_STRICT=1` the app exits instead of choosing another port. |
| `COOKHOARD_DATA_DIR` | Data folder. Default `%LOCALAPPDATA%\CookHoard` on Windows, `~/.local/share/CookHoard` elsewhere. |
| `COOKHOARD_ALLOWED_HOSTS` | Extra host names allowed besides localhost. |
| `COOKHOARD_SCHEDULER=0` | Turn off the daily routine. |
| `COOKHOARD_YTDLP`, `COOKHOARD_FFMPEG`, `COOKHOARD_PYTHON` | Paths to yt-dlp and ffmpeg (a program, or a `.js`/`.mjs` script run with Node) and the Python that runs `python -m yt_dlp`. `HOARD_YTDLP`, `HOARD_FFMPEG` and the shared folder `$HOARD_HOME/bin` (default `~/.hoard/bin`) are found too. |
| `COOKHOARD_ALLOW_PRIVATE_URLS=1` | Allow recipe pages and thumbnails from the local network. By default only public addresses are opened (loopback, private, link-local and cloud-metadata addresses are refused, redirects included). |
| `COOKHOARD_URL`, `COOKHOARD_TOKEN`, `COOKHOARD_TOKEN_FILE` | Where the bridge finds the app and its token. |
| `COOKHOARD_AUTOSTART=0` | The bridge does not start the app. |
| `COOKHOARD_MODE=inprocess` | The bridge never proxies; it runs the tools itself. |
| `HOARD_FAUSTUS_URL`, `HOARD_COPILOT=0` | Faustus address (default `http://127.0.0.1:7000`); turn the copilot off. |

### Data

Everything is in the data folder: `kitchen.json` (recipes, pantry, shopping list, dictionary, tickets, price book, drafts, settings), `media/` (thumbnails), `mcp-token`, `app-url`, `app.pid`, `scheduler.json`. Older kitchen files are upgraded on first write, keeping the original as a `.bak`. `export_kitchen` and `import_kitchen` accept both versions.

## Connection with Faustus and the Hub

Register [`faustus-plugin.json`](faustus-plugin.json) and set `COOKHOARD_DIR` to this folder. Faustus launches `apps/mcp/bootstrap.mjs`; that bridge sends every tool call to the running app, starts the app if it is not answering, and runs the tools in the same process if the app cannot start. App and bridge write the same file under a lock.

- The web app calls the same tools as the assistant through `POST /api/tools/:name`. Agent routes: `GET /api/health`, `GET /api/agent/tools`, `POST /api/agent/call` with `Authorization: Bearer <contents of mcp-token>` (requests must come from the local machine; large results are cut with a `truncated` block). Errors share one envelope `{ error, code?, hint?, issues? }`.
- MCP tools, by group: recipes (`find_recipes`, `get_recipe`, `recipe_check`, `save_recipe`, `update_recipe`, `delete_recipe`, `set_recipe_saved`, `saved_recipes`, `record_cooking`, `cooking_history`), import (`import_recipe_url`, `import_recipe_jsonld`, `import_recipe_video`, `import_recipe_text`, the `recipe_draft_*` family), pantry and ingredients (`pantry_list`, `pantry_set`, `set_expiry`, `use_expiring`, `ingredients_search`, `ingredient_add`, `ingredient_alias_add`), menu and shopping (`recommend_recipes`, `plan_week`, `set_menu_day`, `change_menu_day`, `menu_ingredients`, `add_menu_missing`, `shopping_list`, `shopping_mark_bought`), tickets and prices (`ticket_import_text`, `ticket_import_file`, `ticket_import_mail`, `tickets_list`, `ticket_review_list`, `ticket_line_map`, `price_book`, `tantalus_watch_add`), and `kitchen_state`, `export_kitchen`, `import_kitchen`. The full catalogue with arguments is in [docs/API.md](docs/API.md), generated from the code.
- Events: `cookhoard.recipe.imported`, `cookhoard.menu.planned`, `cookhoard.pantry.expiring`.
- Optional services: Links Hoard (video links), Funes (audio transcription), Kafka (ticket documents and mail receipts), Ledger (food spending), Tantalus (price watching), all through the hub.

**Faustus copilot.** Every page has a floating **Faustus** button that opens the assistant in a side panel. Conversation, model, memory and tools live in Faustus; this app only relays the panel and keeps no history. Without Faustus the button explains that the copilot is unavailable and the rest of the app is unaffected. Relay routes: `GET /api/copilot/info`, `GET /api/copilot/panel.js`, `GET /api/copilot/launcher.js`, `POST /api/copilot/proxy` (only the copilot's own Faustus routes; the Faustus token never reaches the browser).

Each turn tells the assistant the current view (page, filters, servings of the open recipe, cooking step, import tab, pantry place, menu day, ticked shopping rows, price search), the active objects (open recipe, draft under review, pantry item being edited, this week's menu, ticked shopping rows, open price entry) and the fields typed in open forms and which changed. When the assistant finishes a turn the open views reload in place; forms keep what you typed. Saving sends only the fields you changed. The client is in `apps/web/src/copilot-context.js` and `apps/web/src/copilot-hooks.js`.

**Skills.** `faustus-plugin.json` names the procedures from the family's skill library that fit this app (`recipe-import-and-menu-planning`, `web-to-clean-markdown`); the hub's Skills tab shows and changes them.

## Project layout

| Path | Contents |
|---|---|
| `server/` | Express server, bootstrap, agent routes, scheduler |
| `server/hoard-link.js`, `server/hoard-commons/` | vendored family library (read-only; refresh from the Hoard Link repository, never edit) |
| `packages/core/` | recipe, pantry, ticket, price and menu logic, with its own subtitle parser (it also runs in the browser) |
| `apps/web/` | React interface |
| `apps/mcp/` | MCP bridge started by Faustus |
| `docs/` | `API.md` (generated), `RECIPE_CHECK.md` |
| `scripts/` | API documentation generator |

## Tests

```sh
npm test               # core, server, web and MCP bridge
npm run test:core
npm run test:server
npm run test:web
npm run docs:api       # regenerate docs/API.md (a test fails when it is stale)
```

Tests use invented recipes and tickets, a fake yt-dlp, a fake hub and an injectable clock.

## Limits

- Video import depends on the platform allowing the download. Without cookies Instagram and TikTok often refuse; the draft then says so and uses whatever text you paste.
- A receipt photo or PDF is read, not filed: Kafka keeps no copy of it.
- Reading audio, key frames, photos and mail needs Funes, a vision model, Kafka and the hub running.
- Expiry dates not typed by you are estimates from general rules, not the date printed on the package.
- Costs and spending are only as complete as your price book; incomplete totals are marked.
- Stock checks look at required quantities only, not expiry or food suitability. Conversions are g/kg and ml/L only; package sizes and densities are not inferred. Scaling requires a known recipe yield.
- Texts coming from the server (reasons, notes) are in Spanish in both interface languages. Recipes are not translated.

## Licence

AGPL-3.0-or-later.
