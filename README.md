# CookHoard

[Español](README.es.md)

CookHoard is a local kitchen for Faustus and the Hoard family: recipes, a pantry with expiry dates, a weekly menu, a shopping list, supermarket tickets and prices. It is a small web app (Express and React, default `http://127.0.0.1:5210`) plus an MCP server that Faustus starts. Both use the same tools and the same `kitchen.json`. Nothing needs an account or leaves the computer, except the video links you ask it to read.

## What it does

- **Recipes.** Search and filter by time, diet, source and saved. Scale servings, see the cost per serving, cooking history with ratings, approximate nutrition, print. Cooking mode shows one step at a time in large type, with timers (sound and vibration), the ingredient list on the side, keyboard navigation and a screen wake lock where the browser allows it.
- **Recipes from videos and reels.** Paste an Instagram, TikTok, YouTube or Facebook link. yt-dlp reads the caption and subtitles; if that is not enough the audio is transcribed by Funes (through the hub); with ffmpeg and a vision model the text on screen is read from a few key frames. Written text (captions, descriptions, on-screen text) goes through a list parser; speech (subtitles, transcript) is read as prose: ingredients are dictionary mentions with the nearest spoken amount ("3 patatas grandes", "4 ó 5 huevos", "una pizca"), steps are sentences grouped at "cuando", "después", "una vez"... with a timer when a duration is said, description text only supplies steps or ingredients when it has list form (a Preparación/Elaboración header, numbered or bulleted lines), otherwise what was said wins, a word followed by "de <ingredient>" ("un batido de huevo") is a preparation and not an ingredient, auto-subtitle "45 huevos" is read as 4–5 with a note, the video title always wins over anything said, and a draft built from speech alone is marked with lower confidence and a note to check quantities. A deterministic parser reads the text first and a local model fills gaps using a JSON schema. The result is always a draft: every ingredient and step shows the line it came from and whether the number was found in the source text, and nothing is saved until you accept it. The thumbnail is saved locally.
- **Recipes from text.** Paste a recipe in Spanish or English, with or without section headers, bullets or numbering.
- **Own ingredient dictionary.** Unknown ingredients are created on the fly. You can add ingredients with category, aliases and shelf life, and teach aliases such as a ticket abbreviation. Learned aliases apply to recipes and tickets from then on.
- **Pantry.** Items live in the fridge, the pantry or the freezer, with quantity, opened date and expiry. A date typed by you is exact; a date from general storage rules is estimated and always labelled `≈` with its basis. Cooked leftovers enter the fridge with a date.
- **Tickets and prices.** Paste ticket text, read a photo or PDF through Kafka (OCR), or import supermarket receipts found in the mail through Kafka. Food lines go to the pantry and the price book; lines it cannot recognise wait in a review queue where you say what they are (and it remembers), mark them as not food or ignore them for good. A model may suggest a match for a line; the suggestion is shown, never applied by itself. Pack sizes written in a product name ("3 KG", "500GR", "1,5L", "75 CL", "6 UDS", "PACK 6", "6X125G") set the pantry quantity and the price per kg, L or unit, multiplied by the line quantity. When no known supermarket matches, the store name is read from the ticket header. Duplicate tickets are detected.
- **Costs.** Cost of a recipe and of the weekly menu from your own prices (median of recent purchases), spending per week and month from tickets, and the food spending recorded in Ledger when it is running. Costs with missing prices are marked as partial.
- **What to cook.** Dinner ideas ranked by what you have, what is about to expire, the season and how recently you cooked each dish; leftovers appear as options.
- **Menu and shopping list.** A weekly menu with servings per day, ingredient totals for the week with stock subtracted, and a shopping list grouped by supermarket section in an order you choose. Copy as text or Markdown, print, mark items as bought (they move to the pantry).
- **Price watching.** `tantalus_watch_add` hands a product page to Tantalus.
- **Daily routine.** At 09:00 (and when the app starts after missing it) CookHoard sends `cookhoard.pantry.expiring` on the family bus when something expires within two days.
- **Interface.** Spanish first with an English toggle, dark by default with a light theme, installable as a web app, usable at phone width. Screens: Hoy, Recetas, Importar, Despensa, Menú, Compra, Precios, Ajustes.

When something cannot run, the answer says so: no yt-dlp, no ffmpeg, no local model, Funes, Kafka, Ledger or Tantalus unreachable. It never fills in data it did not read.

## Run it

Requires Node 22.13 or newer. yt-dlp and ffmpeg are optional (video links need yt-dlp; key frames need ffmpeg).

```sh
npm install
npm run build        # builds the web interface into apps/web/dist
npm start            # app on http://127.0.0.1:5210
```

With Faustus: register [`faustus-plugin.json`](faustus-plugin.json) and set `COOKHOARD_DIR` to this folder. Faustus launches `apps/mcp/bootstrap.mjs`; that bridge sends every tool call to the running app, starts the app if it is not answering, and runs the tools in the same process if the app cannot start. App and bridge write the same file under a lock, so neither loses the other's changes.

Windows setup for videos: `winget install yt-dlp.yt-dlp` and `winget install Gyan.FFmpeg`. Instagram and TikTok often refuse anonymous downloads: in Ajustes choose the browser whose cookies to use (Edge, Chrome or Firefox) or a `cookies.txt` file.

### Settings (Ajustes)

Language, theme (stored in the browser), weekly budget, default servings, shopping section order, supermarket names for mail tickets, yt-dlp path, cookies (browser or file), read on-screen text, transcribe audio with Funes, status of yt-dlp, ffmpeg, models, hub and the daily routine, backup download and restore, and the ingredient dictionary.

### Environment variables

| Variable | Meaning |
| --- | --- |
| `COOKHOARD_PORT` (or `PORT`) | Port, default 5210. With `PORT_STRICT=1` the app exits instead of choosing another port. |
| `COOKHOARD_DATA_DIR` | Data folder. Default `%LOCALAPPDATA%\CookHoard` on Windows, `~/.local/share/CookHoard` elsewhere. |
| `COOKHOARD_ALLOWED_HOSTS` | Extra host names allowed besides localhost. |
| `COOKHOARD_SCHEDULER=0` | Turn off the daily routine. |
| `COOKHOARD_YTDLP`, `COOKHOARD_FFMPEG`, `COOKHOARD_PYTHON` | Paths to yt-dlp, ffmpeg and Python (for `.py` scripts). |
| `COOKHOARD_URL`, `COOKHOARD_TOKEN`, `COOKHOARD_TOKEN_FILE` | Where the bridge finds the app and its token. |
| `COOKHOARD_AUTOSTART=0` | The bridge does not start the app. |
| `COOKHOARD_MODE=inprocess` | The bridge never proxies; it runs the tools itself. |

### Data

Everything is in the data folder: `kitchen.json` (recipes, pantry, shopping list, dictionary, tickets, price book, drafts, settings), `media/` (thumbnails), `mcp-token`, `app-url`, `app.pid`, `scheduler.json`. A kitchen written by version 0.1 is read as version 2 in memory; the first write stores version 2 and keeps the original as `kitchen.json.v1.bak`. `export_kitchen` and `import_kitchen` accept both versions.

## Interfaces

- Web app: the screens above. They call the same tools as the assistant through `POST /api/tools/:name`.
- Agent routes: `GET /api/health`, `GET /api/agent/tools`, `POST /api/agent/call` with `Authorization: Bearer <contents of mcp-token>`. Requests must come from the local machine.
- MCP: 55 tools (24 read-only). The full catalogue with arguments is in [docs/API.md](docs/API.md), generated from the code.
- Events: `cookhoard.recipe.imported`, `cookhoard.menu.planned`, `cookhoard.pantry.expiring`.

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

- Video import depends on the platform allowing the download. Without cookies, Instagram and TikTok often refuse; the draft then says so and uses whatever text you paste.
- Reading audio, key frames, photos and mail needs Funes, a vision model, Kafka and the hub to be running. Those paths are tested against mocks, not against the real apps.
- Expiry dates that are not typed by you are estimates from general rules, not the date printed on the package.
- Costs and spending are only as complete as your price book; incomplete totals are marked.
- Text coming from the server (reasons, notes) is Spanish in both interface languages.
- Recipes are not translated; a recipe stays in the language it was written in.

License: AGPL-3.0-or-later.
