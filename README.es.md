# CookHoard

Aplicación local de cocina: recetas, despensa con caducidades, menú semanal, lista de la compra, tickets de supermercado y precios.

[Read in English](README.md)

## Qué es

CookHoard es una pequeña aplicación web (Express y React, por defecto `http://127.0.0.1:5210`) más un servidor MCP que arranca Faustus. Ambos usan las mismas herramientas y el mismo `kitchen.json`. Nada necesita cuenta ni sale del ordenador, salvo los enlaces de vídeo que le pidas leer. Cuando algo no puede ejecutarse (sin yt-dlp, sin ffmpeg, sin modelo local, Funes, Kafka, Ledger o Tantalus inalcanzables) la respuesta lo dice; nunca rellena datos que no ha leído.

## Qué hace

**Recetas**
- Busca y filtra por tiempo, dieta, origen y guardadas. Escala raciones, muestra el coste por ración, la nutrición aproximada e imprime.
- Historial de cocinado: valoración, notas, raciones hechas y comidas, minutos y si la repetirías, con una vista de los últimos registros de todas las recetas (las recetas borradas conservan sus registros).
- Modo cocina: un paso cada vez en letra grande, temporizadores con sonido y vibración, lista de ingredientes al lado, navegación con teclado y bloqueo de apagado de pantalla donde el navegador lo permite.
- **Comprobar cantidades**: compara las raciones elegidas con la despensa y muestra lo necesario, lo cubierto y lo que falta, con los ingredientes opcionales y las unidades sin confirmar aparte. No reserva ni consume nada. Véase [docs/RECIPE_CHECK.md](docs/RECIPE_CHECK.md).

**Importar recetas**
- Desde un vídeo o reel (Instagram, TikTok, YouTube, Facebook): el enlace lo lee Links Hoard a través del hub si está en marcha y, si no, el yt-dlp de este equipo. Lee la descripción y los subtítulos; si no basta, Funes transcribe el audio, y con ffmpeg y un modelo de visión se lee el texto en pantalla de algunos fotogramas clave.
- Desde texto, en español o inglés, con o sin encabezados de sección, viñetas o numeración; desde una página de receta (JSON-LD).
- Un analizador determinista lee primero el texto y un modelo local rellena los huecos. El texto hablado se lee como prosa (ingredientes con la cantidad dicha más cercana, pasos agrupados en «cuando», «después», «una vez», temporizadores cuando se dice una duración). El resultado es siempre un borrador: cada ingrediente y paso muestra la línea de la que salió y si su número aparece en el texto original, y nada se guarda hasta que lo aceptas. La miniatura se guarda en local.

**Despensa e ingredientes**
- Los artículos están en la nevera, la despensa o el congelador, con cantidad, fecha de apertura y caducidad. La fecha que escribes es exacta; la que sale de reglas generales de conservación es estimada y siempre se marca con `≈` y su base. Las sobras cocinadas entran en la nevera con fecha.
- Diccionario propio de ingredientes: los desconocidos se crean al vuelo; puedes añadir ingredientes con categoría, alias y vida útil, y enseñar alias (por ejemplo una abreviatura de ticket) que valen desde entonces para recetas y tickets.

**Tickets y precios**
- Pega el texto de un ticket, lee una foto o un PDF con el extractor de Kafka (capa de texto, OCR para escaneos) o importa los tickets de supermercado que haya en el correo a través de Kafka. Las líneas de comida van a la despensa y al libro de precios; las que no reconoce esperan en una cola de revisión donde dices qué son (y lo recuerda), las marcas como no comida o las ignoras para siempre. Un modelo puede sugerir una coincidencia, que se muestra pero nunca se aplica sola.
- Los formatos escritos en el nombre del producto («3 KG», «500GR», «1,5L», «75 CL», «6 UDS», «6X125G») fijan la cantidad de la despensa y el precio por kg, L o unidad. El nombre de la tienda se lee de la cabecera del ticket cuando ningún supermercado conocido coincide. Se detectan los tickets duplicados.
- Costes: coste de una receta y del menú semanal con tus propios precios (mediana de compras recientes), gasto por semana y mes desde los tickets, y el gasto en comida registrado en Ledger cuando está en marcha. Los costes con precios que faltan se marcan como parciales.
- Vigilancia de precios: `tantalus_watch_add` entrega la página de un producto a Tantalus.

**Menú, compra y sugerencias**
- Menú semanal con raciones por día, totales de ingredientes con el stock descontado y lista de la compra agrupada por sección del supermercado en el orden que elijas. Copia como texto o Markdown, imprime y marca lo comprado (pasa a la despensa).
- Qué cocinar: ideas de cena ordenadas por lo que tienes, lo que está a punto de caducar, la temporada y lo reciente que cocinaste cada plato; las sobras aparecen como opción. Con un objetivo de `servings`, las recomendaciones comprueban cantidades necesarias y déficits.
- Rutina diaria: a las 09:00 (y al arrancar si se perdió) CookHoard emite `cookhoard.pantry.expiring` en el bus de la familia cuando algo caduca en dos días.

**Interfaz.** Español primero con opción de inglés, oscura por defecto con tema claro, instalable como aplicación web y usable en ancho de móvil. Pantallas: Hoy, Recetas, Importar, Despensa, Menú, Compra, Precios, Ajustes.

## Cómo arrancarlo

Requiere Node 22.13 o superior. Links Hoard, yt-dlp y ffmpeg son opcionales.

```sh
npm install
npm run build        # compila la interfaz web en apps/web/dist
npm start            # aplicación en http://127.0.0.1:5210
```

Para vídeos en Windows: `winget install yt-dlp.yt-dlp` y `winget install Gyan.FFmpeg`. Instagram y TikTok suelen rechazar descargas anónimas: en Ajustes elige el navegador cuyas cookies usar (Edge, Chrome o Firefox) o un fichero `cookies.txt`. Una ruta de yt-dlp o unas cookies fijadas en Ajustes van primero, y solo se consultan las herramientas de la familia cuando no hay ninguna.

**Ajustes** incluye idioma, tema, presupuesto semanal, raciones por defecto, orden de las secciones de la compra, nombres de supermercados para tickets del correo, ruta de yt-dlp, cookies, lectura del texto en pantalla, transcripción con Funes, estado de yt-dlp, ffmpeg, modelos, hub y rutina diaria, descarga y restauración de copias de seguridad y el diccionario de ingredientes.

### Variables de entorno

| Variable | Significado |
| --- | --- |
| `COOKHOARD_PORT` (o `PORT`) | Puerto, por defecto 5210. Con `PORT_STRICT=1` la aplicación sale en lugar de elegir otro puerto. |
| `COOKHOARD_DATA_DIR` | Carpeta de datos. Por defecto `%LOCALAPPDATA%\CookHoard` en Windows, `~/.local/share/CookHoard` en el resto. |
| `COOKHOARD_ALLOWED_HOSTS` | Nombres de host adicionales permitidos además de localhost. |
| `COOKHOARD_SCHEDULER=0` | Desactiva la rutina diaria. |
| `COOKHOARD_YTDLP`, `COOKHOARD_FFMPEG`, `COOKHOARD_PYTHON` | Rutas de yt-dlp y ffmpeg (un programa, o un script `.js`/`.mjs` ejecutado con Node) y del Python que ejecuta `python -m yt_dlp`. También se encuentran `HOARD_YTDLP`, `HOARD_FFMPEG` y la carpeta compartida `$HOARD_HOME/bin` (por defecto `~/.hoard/bin`). |
| `COOKHOARD_ALLOW_PRIVATE_URLS=1` | Permite leer páginas de recetas y miniaturas de la red local. Por defecto solo se abren direcciones públicas (se rechazan las de bucle local, privadas, de enlace local y de metadatos de nube, incluidas las redirecciones). |
| `COOKHOARD_URL`, `COOKHOARD_TOKEN`, `COOKHOARD_TOKEN_FILE` | Dónde encuentra el puente la aplicación y su token. |
| `COOKHOARD_AUTOSTART=0` | El puente no arranca la aplicación. |
| `COOKHOARD_MODE=inprocess` | El puente nunca hace de proxy; ejecuta las herramientas él mismo. |
| `HOARD_FAUSTUS_URL`, `HOARD_COPILOT=0` | Dirección de Faustus (por defecto `http://127.0.0.1:7000`); desactiva el copiloto. |

### Datos

Todo está en la carpeta de datos: `kitchen.json` (recetas, despensa, lista de la compra, diccionario, tickets, libro de precios, borradores, ajustes), `media/` (miniaturas), `mcp-token`, `app-url`, `app.pid`, `scheduler.json`. Los ficheros de cocina antiguos se actualizan en la primera escritura, conservando el original como `.bak`. `export_kitchen` e `import_kitchen` aceptan ambas versiones.

## Conexión con Faustus y el Hub

Registra [`faustus-plugin.json`](faustus-plugin.json) y fija `COOKHOARD_DIR` en esta carpeta. Faustus lanza `apps/mcp/bootstrap.mjs`; ese puente envía cada llamada a la aplicación en marcha, la arranca si no responde y ejecuta las herramientas en el mismo proceso si no puede arrancar. Aplicación y puente escriben el mismo fichero bajo un bloqueo.

- La web llama a las mismas herramientas que el asistente mediante `POST /api/tools/:name`. Rutas para agentes: `GET /api/health`, `GET /api/agent/tools`, `POST /api/agent/call` con `Authorization: Bearer <contenido de mcp-token>` (las peticiones deben venir de la propia máquina; los resultados grandes se recortan con un bloque `truncated`). Los errores comparten un sobre `{ error, code?, hint?, issues? }`.
- Herramientas MCP, por grupos: recetas (`find_recipes`, `get_recipe`, `recipe_check`, `save_recipe`, `update_recipe`, `delete_recipe`, `set_recipe_saved`, `saved_recipes`, `record_cooking`, `cooking_history`), importación (`import_recipe_url`, `import_recipe_jsonld`, `import_recipe_video`, `import_recipe_text`, la familia `recipe_draft_*`), despensa e ingredientes (`pantry_list`, `pantry_set`, `set_expiry`, `use_expiring`, `ingredients_search`, `ingredient_add`, `ingredient_alias_add`), menú y compra (`recommend_recipes`, `plan_week`, `set_menu_day`, `change_menu_day`, `menu_ingredients`, `add_menu_missing`, `shopping_list`, `shopping_mark_bought`), tickets y precios (`ticket_import_text`, `ticket_import_file`, `ticket_import_mail`, `tickets_list`, `ticket_review_list`, `ticket_line_map`, `price_book`, `tantalus_watch_add`), y `kitchen_state`, `export_kitchen`, `import_kitchen`. El catálogo completo con argumentos está en [docs/API.md](docs/API.md), generado a partir del código.
- Eventos: `cookhoard.recipe.imported`, `cookhoard.menu.planned`, `cookhoard.pantry.expiring`.
- Servicios opcionales: Links Hoard (enlaces de vídeo), Funes (transcripción de audio), Kafka (documentos de tickets y recibos del correo), Ledger (gasto en comida), Tantalus (vigilancia de precios), todos a través del hub.

**Copiloto Faustus.** Cada página tiene un botón flotante de **Faustus** que abre el asistente en un panel lateral. La conversación, el modelo, la memoria y las herramientas viven en Faustus; esta aplicación solo retransmite el panel y no guarda historial. Sin Faustus el botón explica que el copiloto no está disponible y el resto de la aplicación no se ve afectado. Rutas de retransmisión: `GET /api/copilot/info`, `GET /api/copilot/panel.js`, `GET /api/copilot/launcher.js`, `POST /api/copilot/proxy` (solo las rutas propias del copiloto en Faustus; el token de Faustus nunca llega al navegador).

Cada turno informa al asistente de la vista actual (página, filtros, raciones de la receta abierta, paso del modo cocina, pestaña de importación, lugar de la despensa, día del menú, filas marcadas de la compra, búsqueda de precios), de los objetos activos (receta abierta, borrador en revisión, artículo de despensa en edición, menú de la semana, filas marcadas, entrada de precio abierta) y de los campos escritos en los formularios abiertos y cuáles cambiaron. Cuando el asistente termina un turno, las vistas abiertas se recargan en el sitio y los formularios conservan lo escrito. Al guardar solo se envían los campos que has cambiado. El cliente está en `apps/web/src/copilot-context.js` y `apps/web/src/copilot-hooks.js`.

**Skills.** `faustus-plugin.json` nombra los procedimientos de la biblioteca de skills de la familia que encajan con esta app (`recipe-import-and-menu-planning`, `web-to-clean-markdown`); la pestaña Skills del hub los muestra y los cambia.

## Estructura del proyecto

| Ruta | Contenido |
|---|---|
| `server/` | servidor Express, arranque, rutas para agentes, planificador |
| `server/hoard-link.js`, `server/hoard-commons/` | biblioteca de la familia incluida (solo lectura; se actualiza desde el repositorio de Hoard Link, nunca se edita) |
| `packages/core/` | lógica de recetas, despensa, tickets, precios y menú, con su propio analizador de subtítulos (también corre en el navegador) |
| `apps/web/` | interfaz React |
| `apps/mcp/` | puente MCP que arranca Faustus |
| `docs/` | `API.md` (generado), `RECIPE_CHECK.md` |
| `scripts/` | generador de la documentación de la API |

## Pruebas

```sh
npm test               # núcleo, servidor, web y puente MCP
npm run test:core
npm run test:server
npm run test:web
npm run docs:api       # regenera docs/API.md (una prueba falla si está desactualizado)
```

Las pruebas usan recetas y tickets inventados, un yt-dlp falso, un hub falso y un reloj inyectable.

## Límites

- La importación de vídeo depende de que la plataforma permita la descarga. Sin cookies, Instagram y TikTok suelen rechazarla; el borrador lo dice y usa el texto que pegues.
- Una foto o PDF de un ticket se lee, no se archiva: Kafka no guarda copia.
- Leer audio, fotogramas, fotos y correo requiere Funes, un modelo de visión, Kafka y el hub en marcha.
- Las caducidades que no escribes tú son estimaciones de reglas generales, no la fecha impresa en el envase.
- Los costes y el gasto son tan completos como tu libro de precios; los totales incompletos se marcan.
- Las comprobaciones de stock miran solo cantidades necesarias, no caducidad ni idoneidad del alimento. Las conversiones son solo g/kg y ml/L; no se deducen tamaños de envase ni densidades. Escalar exige un rendimiento de receta conocido.
- Los textos que vienen del servidor (motivos, notas) están en español en ambos idiomas de la interfaz. Las recetas no se traducen.

## Licencia

AGPL-3.0-or-later.
