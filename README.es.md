# CookHoard

[English](README.md)

CookHoard es la cocina local de Faustus y de la familia Hoard: recetas, despensa con fechas de caducidad, menú semanal, lista de la compra, tickets del súper y precios. Es una pequeña aplicación web (Express y React, por defecto `http://127.0.0.1:5210`) más un servidor MCP que arranca Faustus. Ambos usan las mismas herramientas y el mismo `kitchen.json`. No necesita cuentas y nada sale del ordenador, salvo los enlaces de vídeo que le pidas leer.

## Qué hace

- **Recetas.** Búsqueda y filtros por tiempo, dieta, origen y guardadas. Escalado de raciones, coste por ración, historial con valoraciones, nutrición aproximada e impresión. El modo cocina muestra un paso cada vez en letra grande, con temporizadores (sonido y vibración), los ingredientes a un lado, navegación con teclado y pantalla siempre encendida si el navegador lo permite.
- **Recetas de vídeos y reels.** Pega un enlace de Instagram, TikTok, YouTube o Facebook. El enlace lo lee Links Hoard a través del centro de apps cuando está en marcha (un solo yt-dlp para toda la familia) y, si no, el yt-dlp de este equipo; lee la descripción y los subtítulos y, si no basta, Funes transcribe el audio (a través del centro de apps); con ffmpeg y un modelo de visión se lee el texto en pantalla de unos pocos fotogramas. Primero lee el texto un analizador determinista y después un modelo local rellena huecos con un esquema JSON. El resultado es siempre un borrador: cada ingrediente y cada paso muestra la línea de la que sale y si el número aparece en el texto original, y no se guarda nada hasta que lo aceptas. La miniatura se guarda en local.
- **Recetas desde texto.** Pega una receta en castellano o en inglés, con o sin encabezados, viñetas o numeración.
- **Diccionario propio de ingredientes.** Los ingredientes desconocidos se crean al vuelo. Puedes añadir ingredientes con categoría, alias y duración, y enseñar alias como la abreviatura de un ticket. Los alias aprendidos se aplican a recetas y tickets a partir de entonces.
- **Despensa.** Cada cosa está en la nevera, la despensa o el congelador, con cantidad, fecha de apertura y caducidad. La fecha que escribes tú es exacta; la que sale de reglas generales de conservación es estimada y siempre aparece con `≈` y su motivo. Las sobras de lo cocinado entran en la nevera con fecha.
- **Tickets y precios.** Pega el texto de un ticket, lee una foto o un PDF con el extractor de Kafka (capa de texto, OCR en los escaneos) o importa los recibos de supermercados que haya en el correo, también con Kafka. Las líneas de comida van a la despensa y al libro de precios; las que no reconoce esperan en una cola de revisión donde dices qué son (y lo recuerda), las marcas como no comida o las ignoras para siempre. Un modelo puede sugerir qué es una línea; la sugerencia se muestra, nunca se aplica sola. Los tickets repetidos se detectan.
- **Costes.** Coste de una receta y del menú semanal con tus propios precios (mediana de compras recientes), gasto por semana y por mes a partir de tickets, y el gasto en comida registrado en Ledger cuando está en marcha. Los costes con precios que faltan se marcan como parciales.
- **Qué cocinar.** Ideas para cenar ordenadas por lo que tienes, lo que va a caducar, la temporada y cuánto hace que cocinaste cada plato; las sobras aparecen como opciones.
- **Menú y lista de la compra.** Un menú semanal con raciones por día, totales de ingredientes de la semana descontando lo que hay, y una lista de la compra agrupada por secciones del súper en el orden que elijas. Copiar como texto o Markdown, imprimir y marcar como comprado (pasa a la despensa).
- **Vigilar precios.** `tantalus_watch_add` entrega la página de un producto a Tantalus.
- **Rutina diaria.** A las 09:00 (y al arrancar si se la saltó) CookHoard emite `cookhoard.pantry.expiring` en el bus de la familia cuando algo caduca en los próximos dos días.
- **Interfaz.** Castellano primero con selector de inglés, oscura por defecto con tema claro, instalable como aplicación web y usable en pantalla de móvil. Pantallas: Hoy, Recetas, Importar, Despensa, Menú, Compra, Precios, Ajustes.

Cuando algo no puede ejecutarse, la respuesta lo dice: falta yt-dlp, ffmpeg o un modelo local, o Funes, Kafka, Ledger o Tantalus no responden. Nunca rellena datos que no ha leído.

## Ponerlo en marcha

Requiere Node 22.13 o superior. Links Hoard, yt-dlp y ffmpeg son opcionales (los enlaces de vídeo necesitan Links Hoard en marcha o un yt-dlp en este equipo; los fotogramas, ffmpeg).

```sh
npm install
npm run build        # compila la interfaz web en apps/web/dist
npm start            # aplicación en http://127.0.0.1:5210
```

Con Faustus: registra [`faustus-plugin.json`](faustus-plugin.json) y pon `COOKHOARD_DIR` en esta carpeta. Faustus lanza `apps/mcp/bootstrap.mjs`; ese puente manda cada llamada a la aplicación en marcha, la arranca si no responde y ejecuta las herramientas en el mismo proceso si no consigue arrancarla. Aplicación y puente escriben el mismo archivo con un bloqueo, así que ninguno pierde los cambios del otro.

Preparación en Windows para los vídeos: `winget install yt-dlp.yt-dlp` y `winget install Gyan.FFmpeg`. Instagram y TikTok suelen rechazar descargas anónimas: en Ajustes elige el navegador del que tomar las cookies (Edge, Chrome o Firefox) o un archivo `cookies.txt`. La ruta de yt-dlp o las cookies de Ajustes son decisión tuya y van primero (las herramientas de la familia no pueden recibirlas): CookHoard usa entonces el yt-dlp de este equipo y solo pregunta a Links Hoard cuando no hay ninguno.

### Ajustes

Idioma, tema (se guarda en el navegador), presupuesto semanal, raciones por defecto, orden de las secciones de la compra, nombres de supermercados para los tickets del correo, ruta de yt-dlp, cookies (navegador o archivo), leer el texto en pantalla, transcribir el audio con Funes, estado de yt-dlp, ffmpeg, modelos, centro de apps y rutina diaria, descarga y restauración de la copia de seguridad, y el diccionario de ingredientes.

### Variables de entorno

| Variable | Significado |
| --- | --- |
| `COOKHOARD_PORT` (o `PORT`) | Puerto, por defecto 5210. Con `PORT_STRICT=1` la aplicación termina en lugar de elegir otro. |
| `COOKHOARD_DATA_DIR` | Carpeta de datos. Por defecto `%LOCALAPPDATA%\CookHoard` en Windows, `~/.local/share/CookHoard` en el resto. |
| `COOKHOARD_ALLOWED_HOSTS` | Nombres de host adicionales permitidos además de localhost. |
| `COOKHOARD_SCHEDULER=0` | Desactiva la rutina diaria. |
| `COOKHOARD_YTDLP`, `COOKHOARD_FFMPEG`, `COOKHOARD_PYTHON` | Rutas de yt-dlp y ffmpeg (un programa, o un script `.js`/`.mjs` que se ejecuta con Node) y el Python que ejecuta `python -m yt_dlp`. También se encuentran las variables de la familia `HOARD_YTDLP` y `HOARD_FFMPEG` y la carpeta compartida `$HOARD_HOME/bin` (por defecto `~/.hoard/bin`). Un script `.py` ya no se ejecuta directamente. |
| `COOKHOARD_ALLOW_PRIVATE_URLS=1` | Permite leer páginas de recetas y miniaturas de la red local. Por defecto solo se abren direcciones públicas (se rechazan las de loopback, privadas, de enlace local y de metadatos de la nube, también tras una redirección). |
| `COOKHOARD_URL`, `COOKHOARD_TOKEN`, `COOKHOARD_TOKEN_FILE` | Dónde encuentra el puente la aplicación y su token. |
| `COOKHOARD_AUTOSTART=0` | El puente no arranca la aplicación. |
| `COOKHOARD_MODE=inprocess` | El puente nunca hace de intermediario: ejecuta él las herramientas. |

### Datos

Todo está en la carpeta de datos: `kitchen.json` (recetas, despensa, lista de la compra, diccionario, tickets, libro de precios, borradores, ajustes), `media/` (miniaturas), `mcp-token`, `app-url`, `app.pid`, `scheduler.json`. Una cocina escrita por la versión 0.1 se lee como versión 2 en memoria; la primera escritura guarda la versión 2 y conserva el original como `kitchen.json.v1.bak`. `export_kitchen` e `import_kitchen` aceptan ambas versiones.

## Interfaces

- Aplicación web: las pantallas de arriba. Llaman a las mismas herramientas que el asistente mediante `POST /api/tools/:name`.
- Rutas de agente: `GET /api/health`, `GET /api/agent/tools`, `POST /api/agent/call` con `Authorization: Bearer <contenido de mcp-token>` (el token se crea una vez y se conserva entre arranques; los resultados de más de 100 KB se recortan con un bloque `truncated` que dice qué se quitó). Las peticiones deben venir de la propia máquina. Los errores comparten un solo formato `{ error, code?, hint?, issues? }`.
- MCP: 55 herramientas (24 de solo lectura). El catálogo completo con argumentos está en [docs/API.md](docs/API.md), generado a partir del código.
- Eventos: `cookhoard.recipe.imported`, `cookhoard.menu.planned`, `cookhoard.pantry.expiring`.

## Pruebas

```sh
npm test               # núcleo, servidor, web y puente MCP
npm run test:core
npm run test:server
npm run test:web
npm run docs:api       # regenera docs/API.md (una prueba falla si está desactualizado)
```

Las pruebas usan recetas y tickets inventados, un yt-dlp falso, un centro de apps falso (responde al proxy HTTP del centro dentro del proceso, de modo que las llamadas a Links, Funes y Kafka pasan por el mismo cliente que en producción) y un reloj inyectable.

## Código compartido

`server/hoard-link.js` y `server/hoard-commons/` son la biblioteca de la familia incluida tal cual (solo lectura: se refrescan desde el repositorio de Hoard Link, nunca se editan). De ahí vienen el filtro de peticiones, la búsqueda de puerto, el arranque, el archivo del token, las rutas de agente, el formato de errores, las escrituras atómicas, el lector de páginas con su política de direcciones, los lectores de JSON-LD y metadatos de página, el buscador y ejecutor de yt-dlp y ffmpeg, el analizador de subtítulos, las frases de fallo y los clientes de los servicios de Links, Funes y Kafka. `packages/core` conserva su propio analizador de subtítulos porque también se empaqueta para el navegador, donde no caben los módulos de la biblioteca (solo Node); el servidor usa el de la biblioteca.

## Límites

- La importación de vídeo depende de que la plataforma permita la descarga. Sin cookies, Instagram y TikTok suelen rechazarla; entonces el borrador lo dice y usa el texto que pegues. Links Hoard usa su propio ajuste de cookies, no el de CookHoard.
- Una foto o un PDF de un ticket se lee, no se archiva: el extractor de Kafka no guarda copia (los recibos que el lector de correo ya archivó siguen llevando su identificador de documento de Kafka).
- Leer audio, fotogramas, fotos y correo necesita que Funes, un modelo de visión, Kafka y el centro de apps estén en marcha. Esos caminos están probados con simulaciones, no con las aplicaciones reales.
- Las fechas de caducidad que no escribes tú son estimaciones de reglas generales, no la fecha impresa en el envase.
- Los costes y el gasto son tan completos como tu libro de precios; los totales incompletos se marcan.
- El texto que genera el servidor (motivos, notas) está en castellano en los dos idiomas de la interfaz.
- Las recetas no se traducen: cada una queda en el idioma en que se escribió.

Licencia: AGPL-3.0-or-later.
