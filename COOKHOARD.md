# CookHoard 🍳

**El "Cults3D de las recetas" + "dime qué tienes en la nevera y te digo qué cocinar".**

Un clon de **Watch Hoard** para **recetas caseras**. Misma arquitectura (Expo / React Native +
Expo Router, SQLite local o Supabase, i18n ES/EN, capa social y de moderación ya hechas), pero
el catálogo lo **generan los usuarios**: la gente publica sus recetas, otros las cocinan y suben
su **"make"** (foto + valoración + notas, como cuando alguien imprime tu modelo en Cults3D), y un
**recomendador de nevera** propone qué cocinar con lo que tienes, teniendo en cuenta la **época del
año** y tu **zona geográfica**.

> Igual que Watch Hoard es el bote salvavidas de tus datos de TV, CookHoard es tu **recetario que
> es tuyo para siempre**: exportable, autoalojable, y con una comunidad que cocina de verdad.

---

## 1. El giro respecto a Watch Hoard / GamerHoard (importante)

Watch Hoard y GamerHoard giran alrededor de un **catálogo externo** (TMDB, RAWG) contra el que el
usuario *hace tracking*. **CookHoard se separa más**: aquí el objeto central —la receta— **lo crea
el usuario**, no se descarga de una API. Eso mueve el centro de gravedad de "tracking sobre un
catálogo ajeno" a "**red social de contenido propio**" (más parecido a Cookpad × Cults3D).

La buena noticia: casi toda la **infraestructura** de Watch Hoard sirve tal cual —cuentas, perfiles
públicos/privados, follows con solicitudes, feed, reviews con likes, listas/favoritos, moderación,
i18n, doble backend local↔nube, búsqueda difusa (`pg_trgm`)—. Lo que cambia es **el dominio** (la
ficha) y **dos features nuevas**: los *makes* y el *recomendador de nevera*.

| Watch Hoard | CookHoard |
|---|---|
| Catálogo TMDB (externo, cacheado) | **Recetas creadas por usuarios** (+ semilla de API para no arrancar vacío) |
| Ficha de serie/peli | **Ficha de receta** (ingredientes estructurados, pasos, tiempo, dificultad, nutrición) |
| Episodios marcables | **Pasos** de la receta (+ temporizadores por paso) |
| "Dónde ver" (streaming) | **"Qué tienes / qué te falta"** (cotejo contra tu nevera) |
| Reviews (nota + texto + spoiler) | **Reviews** (nota + texto) **+ Makes** (foto de que la cocinaste, el objeto estrella) |
| Director / creador | **Autor de la receta** (un cocinero, no un estudio) |
| Colección / saga | **Recetario** (colección de recetas: "Cenas de 15 min", "Batch cooking"…) |
| Nota TMDB/IMDb | **Valoración de la comunidad** (media de makes + reviews) + nutrición |
| Importar de TV Time | **Importar tus recetas** (Paprika/Cookpad/JSON‑LD de un blog) |
| Pestañas Series · Pelis · Explora · Perfil | **Descubre · Nevera · Recetario · Perfil** (+ botón Publicar) |
| — | 🌟 **Recomendador de nevera** (ingredientes + temporada + zona) |

---

## 2. Conceptos y objetos

- **Receta (`recipe`)** — el objeto central, creado por un usuario. Ingredientes *estructurados*
  (cantidad + unidad + ingrediente canónico), pasos, tiempos, dificultad, cocina/región, etiquetas
  de temporada y "carácter" del plato (ver §4), dieta, alérgenos, foto.
- **Make (`recipe_make`)** — *"yo la hice"*. El equivalente al *make* de Cults3D: foto(s) del
  resultado, nota (1–5), notas/tweaks ("le puse menos sal"), raciones, tiempo real, "¿la repetiría?".
  Es **prueba social** y el motor de popularidad ("las más cocinadas"). Aparece en la ficha (galería
  de makes) y en el perfil del que cocina (su diario de cocina).
- **Review (`content_reviews`)** — nota + texto sin foto. Más ligera que un make. *Reutiliza la tabla
  que ya existe* en la base (§4).
- **Nevera / despensa (`pantry_item`)** — lo que el usuario tiene ahora. Alimenta el recomendador.
- **Recetario (`collection`)** — colección temática de recetas (reutiliza el patrón de listas).
- **Ingrediente canónico (`ingredient`)** — diccionario normalizado (con alias/sinónimos) para que
  "tomate", "tomates" y "tomate maduro" cuenten como lo mismo al cotejar la nevera.

**Make vs Review:** recomiendo que el **make sea el objeto de primera clase** (como en Cults3D) y la
review sea "un make sin foto". Un make ya lleva nota + comentario, así que puede *también* contar
como review para la media. Los makes son los que dan vida a "trending", "más cocinadas" e insignias.

---

## 3. Reutilización de la base (qué toco y qué no)

| Pieza de Watch Hoard | En CookHoard |
|---|---|
| `profiles`, Supabase Auth, RLS | ✅ **Igual** |
| `user_follows` + RPCs (`follow_user`, solicitudes, contadores) | ✅ **Igual** (seguir cocineros) |
| `content_reviews` + `review_likes` + trigger de likes | ✅ **Reutilizar**: `entity_type='recipe'`, `entity_key=<uuid receta>` (el esquema ya es genérico por clave; solo hay que **ampliar el `CHECK` de `entity_type`** —hoy `('show','movie')`— para admitir `'recipe'`) |
| Listas / favoritos (`app_list_items`, `is_favorite`) | ✅ **Reutilizar** como *recetarios* y "guardar receta" |
| Moderación (migración 0012) + `ReportSheet` | ✅ **Clave** aquí (todo es contenido de usuario) |
| Feed / actividad (`social.ts` `logActivity`) | ✅ **Reutilizar**: feed = makes de a quién sigues |
| i18n EN/ES (`i18n/en.ts`, `es.ts`) | ✅ Reutilizar + ampliar strings |
| Doble backend local↔nube (contrato `DataSource`, `db/local.ts` / `db/supabase.ts`) | ✅ **Reutilizar el patrón** (mismas pantallas, dos implementaciones) |
| Motor de importación (`packages/importer`) | 🔁 **Repurposar**: "importa tus recetas" (Paprika/Cookpad/JSON‑LD) |
| Búsqueda difusa `pg_trgm` | ✅ Ya instalada: buscar recetas e ingredientes por nombre |
| `shows`/`episodes`/`movies` (catálogo TV) | ❌ **Se sustituyen** por tablas de receta (ver §4) |
| `tmdb.ts` (fuente de metadatos) | 🔁 Se sustituye por `recipes.ts` (comunidad) + `seed.ts` (API semilla) |

### Estrategia de nombres internos (mi recomendación)
GamerHoard reusó los nombres de tabla de Watch Hoard con otra semántica (`shows`=juego, `episode`=DLC)
para minimizar el diff. **Para CookHoard NO lo recomiendo**: las recetas divergen demasiado
(ingredientes, pasos, makes). Es más limpio **añadir tablas de dominio reales** (`recipe`,
`recipe_ingredient`, `recipe_step`, `recipe_make`, `pantry_item`) y **conservar tal cual** la
infra social (`profiles`, `user_follows`, `content_reviews`, moderación). Pagas un poco más de
trabajo de renombrado en las pantallas, pero el código queda legible y mantenible.

---

## 4. Modelo de datos (tablas nuevas)

Migraciones nuevas a partir de la **0013** (idempotentes, mismo estilo que la base). Bosquejo:

```sql
-- Diccionario de ingredientes (normaliza la nevera y el cotejo)
create table ingredient (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,              -- "tomate"
  aliases      text[] default '{}',        -- {"tomates","tomate maduro"}
  category     text,                        -- verdura, lácteo, legumbre, especia...
  is_staple    boolean not null default false, -- sal, agua, aceite → se asumen en casa
  default_unit text,
  off_barcode  text                         -- enlace opcional a Open Food Facts
);
create index ingredient_name_trgm on ingredient using gin (name gin_trgm_ops);

-- La receta (contenido del usuario)
create table recipe (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references profiles(id) on delete cascade,
  title        text not null,
  slug         text,
  description  text,
  servings     int,
  prep_min     int,
  cook_min     int,
  difficulty   smallint,                    -- 1..3
  cuisine      text,                        -- "española", "italiana"...
  region_tags  text[] default '{}',         -- zonas donde es típica
  season_affinity text[] default '{}',      -- {'verano'} | {'invierno'} | {} = todo el año
  dish_type    text,                        -- sopa, ensalada, guiso, postre...
  temperature  text,                        -- 'caliente' | 'frío' | 'templado'
  heaviness    smallint,                    -- 1 ligero .. 3 contundente (clave para "lentejas en verano")
  diet_flags   text[] default '{}',         -- vegano, vegetariano, sin_gluten...
  allergens    text[] default '{}',         -- gluten, lactosa, frutos_secos...
  hero_image   text,
  is_published boolean not null default false,
  license      text,                        -- del autor; ver §11 riesgos
  source_url   text,                        -- si se importó
  created_at   timestamptz not null default now()
);
create index recipe_title_trgm on recipe using gin (title gin_trgm_ops);

-- Ingredientes de una receta (estructurados)
create table recipe_ingredient (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    uuid not null references recipe(id) on delete cascade,
  ingredient_id uuid references ingredient(id),   -- canónico si se resolvió
  free_text    text,                               -- si no se resolvió aún
  quantity     numeric,
  unit         text,
  is_core      boolean not null default true,      -- ¿es imprescindible? (pesa en el cotejo)
  is_optional  boolean not null default false,
  section      text,                               -- "para la salsa"...
  ord          int not null default 0
);

create table recipe_step (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipe(id) on delete cascade,
  ord        int not null,
  text       text not null,
  image      text,
  timer_sec  int
);

-- El "make" (equivalente al make de Cults3D)
create table recipe_make (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipe(id) on delete cascade,
  author_id     uuid not null references profiles(id) on delete cascade,
  rating        smallint check (rating between 1 and 5),
  notes         text,
  images        text[] default '{}',
  servings_made int,
  time_taken_min int,
  would_repeat  boolean,
  created_at    timestamptz not null default now()
);
create index recipe_make_recipe_idx on recipe_make (recipe_id, created_at desc);
create index recipe_make_author_idx on recipe_make (author_id, created_at desc);
-- + make_likes (mismo patrón que review_likes)

-- La nevera del usuario
create table pantry_item (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null default auth.uid() references profiles(id) on delete cascade,
  ingredient_id uuid references ingredient(id),
  free_text    text,
  quantity     numeric,
  unit         text,
  expires_at   date,                        -- para "úsalo antes de que caduque"
  added_at     timestamptz not null default now()
);

-- Estacionalidad de producto por región (o servirla como JSON en la app; ver §5)
create table ingredient_seasonality (
  ingredient_id uuid references ingredient(id),
  region        text,                        -- 'ES', 'EU-sur', hemisferio...
  months        int[]                        -- {6,7,8} = jun–ago
);
```

Todas con **RLS igual que la base**: catálogo (recipe, ingredient) legible por todos; `pantry_item`
y borradores privados del dueño; makes/reviews visibles según perfil público/seguidores (misma
política que `content_reviews`).

---

## 5. 🌟 La feature estrella: el recomendador de nevera

**Entrada del usuario**
1. **Su nevera/despensa**: lista de ingredientes (texto con autocompletado contra `ingredient`;
   cantidad opcional; **escaneo de código de barras** vía **Open Food Facts** → producto → ingrediente).
2. **Contexto** (automático, editable):
   - **Temporada**: fecha del dispositivo → mes → estación, ajustada por **hemisferio** (de la zona).
   - **Zona**: del `locale`/ajuste → afinidad de cocina local + tabla de temporada local.
   - Opcionales: dieta, alérgenos a evitar, tiempo disponible, dificultad, raciones.

**Cotejo (por receta)**
- Normalizar a ingredientes canónicos (sinónimos/alias; ignorar *staples* como sal, agua, aceite,
  que se asumen en casa —conjunto configurable—).
- `tengo = receta.core ∩ (nevera ∪ staples)` ; `falta = receta.core − tengo`.
- `cobertura = |tengo| / |receta.core|`.
- **Cubos** para la UI: **"Puedes hacerla ya"** (falta 0), **"Te falta 1"**, **"Te falta 2–3"**.

**Dos señales de temporada** (así se resuelve lo de *"unas lentejas no entran en verano"*):
- **(a) Producto de temporada**: ¿los ingredientes protagonistas están de temporada en tu zona
  este mes? (tabla `ingredient_seasonality`). Sube el ranking si sí.
- **(b) Carácter del plato**: campos `season_affinity`, `temperature` y `heaviness` de la receta.
  Un guiso caliente y contundente (lentejas: `heaviness=3`, `temperature='caliente'`) se **penaliza
  en meses de verano**; ensaladas/gazpachos (`temperature='frío'`, `heaviness=1`) **suben**. Esto es
  lo que captura la intuición "en agosto apetece otra cosa".

**Puntuación** (ranking, no filtro duro):

```
score =  w1·cobertura
       − w2·nºfaltan
       + w3·temporadaProducto        // (a)
       + w4·encajeEstacionalDelPlato // (b) según mes/hemisferio
       + w5·afinidadZona/cocina
       + w6·valoración(makes+reviews)
       + w7·personalización(tus favoritos/histórico)
```

Pesos por defecto sugeridos: priorizar **poder cocinarla ya** (w1, w2 altos) y luego el encaje
estacional. Cada resultado muestra **el porqué**: *"Tienes 8/9 · de temporada en tu zona · plato de
verano"*, o *"Te falta: nata"* con botón para añadirla a la lista de la compra.

**Arranque en frío (sin recetas de comunidad todavía)**
- Sembrar un catálogo navegable con **TheMealDB** (gratis).
- Para la consulta viva de nevera, usar **Spoonacular "Find Recipes by Ingredients"** como
  *aumento/fallback* (ver §6 y el aviso de licencia).
- A medida que crece la comunidad, **priorizar recetas de usuarios** (llevan makes y reviews).

**Datos de estacionalidad**: no hay una API canónica limpia. Recomiendo **enviar una tabla JSON
curada** (producto × mes × región), empezando por **Europa** (referencia tipo **EUFIC**: 24 países,
6 regiones climáticas, 200+ productos) con *fallback* por hemisferio N/S, y dejar que la comunidad
la corrija. Es un ranking *suave* y siempre override‑able por el usuario.

```jsonc
// seasonality.json (ejemplo)
{
  "region": "ES",
  "produce": {
    "tomate":   { "months": [6,7,8,9] },
    "calabaza": { "months": [10,11,12,1] },
    "lenteja":  { "months": [1,2,3,10,11,12], "dish_bias": "invierno" }
  }
}
```

---

## 6. Fuente de datos: comunidad + API semilla

El catálogo duradero es **de la comunidad**. La API solo **siembra** y **aumenta** para que el día 1
no esté vacío y el recomendador tenga con qué trabajar.

| API | Coste (verificado jul‑2026) | Para qué sirve | Notas |
|---|---|---|---|
| **TheMealDB** | **Gratis** (test key `1`) | Sembrar catálogo navegable; filtrar por **1** ingrediente (`filter.php?i=`) | Multi‑ingrediente y límites mayores = clave *supporter* (donación). Pide atribución. Catálogo modesto (~cientos) |
| **Spoonacular** | **Freemium**: ~**150 puntos/día** gratis (1 pto/petición + 0,01/resultado); de pago desde **~99 $/mes** | **"Find Recipes by Ingredients"** (la nevera), nutrición, coste, sustituciones | El mejor para el recomendador. **Su ToS no permite almacenar/redistribuir su catálogo de forma permanente** → úsalo en vivo + atribución, no para poblar tu catálogo público |
| **Edamam** | Free tier, pero escala hasta **~999 $/mes**; la *Recipe Search* tuvo versión retirada | Nutrición / búsqueda | Más orientado a empresa; menos ideal para arrancar |
| **Open Food Facts** | **Gratis y abierto** | **Escaneo de código de barras** → producto → ingrediente para llenar la nevera | Base colaborativa; ideal para la entrada por cámara |

**Aviso de licencia (importante):** los datos de Spoonacular/Edamam **no** se pueden guardar como si
fueran tu catálogo. Trátalos como **inspiración/aumento en vivo** con atribución; el catálogo que
guardas y sobre el que construyes la comunidad debe ser **contenido de usuario** (o TheMealDB con su
atribución). Esto protege el modelo legal y de producto.

**Feature estrella heredada del ADN "Hoard": "importa tus recetas".** Igual que Watch Hoard importa
tu TV Time y GamerHoard tu Steam, CookHoard puede **importar tu recetario**: export de Paprika/Cookpad,
un JSON, o *scraping* del `Recipe` JSON‑LD (schema.org) de una URL de blog. Es el gancho de adquisición
y encaja con la familia.

---

## 7. Estructura de la app (pestañas y pantallas)

Se adapta el shell de 4 pestañas de Expo Router (`app/(tabs)/_layout.tsx`) + botón flotante de crear:

| Pestaña | Rol | Base de la que sale |
|---|---|---|
| **Descubre** | Buscar recetas; trending / **más cocinadas** / mejor valoradas / nuevas; filtrar por cocina, dieta, tipo de plato, temporada | `explore.tsx` |
| **Nevera** 🌟 | Editor de despensa + "**¿qué puedo cocinar?**" con los cubos "puedes ya / te falta 1…" | *nueva* |
| **Recetario** | Mis recetas publicadas, recetas guardadas, mis makes, mis colecciones | `index.tsx` (biblioteca) |
| **Perfil** | Stats (recetas, makes, seguidores), actividad, ajustes | `profile.tsx` |
| **＋ Publicar** | Editor de receta (ingredientes estructurados + pasos + fotos) | *nueva* (FAB) |

**Pantallas de detalle** (reutilizan rutas dinámicas `app/.../[id].tsx`):
- `recipe/[id]` — la ficha: ingredientes **cotejados contra tu nevera** (✓ tienes / ✗ te falta),
  pasos con temporizadores, nutrición, **galería de makes**, reviews, autor, "Guardar en recetario",
  botón **"La he hecho"** (crear make).
- `u/[handle]` — perfil de cocinero (sus recetas + sus makes).
- `ingredient/[id]` — recetas que lo usan + su calendario de temporada.
- `cuisine/[slug]` — recetas por cocina/región. `make/[id]` — un make a pantalla completa.

---

## 8. Roadmap por fases

- **Fase 1 — Recetario (núcleo, local‑first):** publicar recetas (editor con ingredientes
  estructurados + pasos + fotos), ver fichas, guardar, colecciones, **makes + reviews**, buscar,
  todo **local (SQLite) e i18n ES/EN**. *Ya funciona sin backend.*
- **Fase 2 — La nevera (el diferenciador):** despensa, **recomendador** (tengo/falta + temporada +
  zona), semilla **TheMealDB** (browse) + **Spoonacular** (find‑by‑ingredients), **escaneo de código
  de barras** (Open Food Facts), lista de la compra desde "te falta".
- **Fase 3 — Comunidad (nube):** Supabase, cuentas, follows + solicitudes, **feed de makes**, likes,
  **moderación** y reportes (ya construidos), share links.
- **Fase 4 — Ir más allá:** **importar tu recetario** (Paprika/Cookpad/JSON‑LD), **planificador de
  menú semanal**, lista de la compra consolidada, nutrición/alérgenos, insignias ("10 makes",
  "receta más cocinada del mes"), aviso *"tienes X a punto de caducar → cocina esto"*.
- **Fase 5 — Dinámica y social:** **remixes** con linaje y diff automático ("qué cambia"),
  **recetas como diagramas de flujo** (ramas paralelas + fusiones, inferidas del texto),
  **modo cocina** paso a paso con temporizadores, Descubre con carruseles vivos y filtros
  rápidos, y feed de actividad también en local. Ver `PHASES.md`.

---

## 9. Puesta en marcha (previsto, al estilo GamerHoard)

```bash
# 1) Clonar la base y renombrar el workspace a @cookhoard/*
cd apps/mobile && npm install
npx expo start          # w (web), a (Android), i (iOS)
# Por defecto EXPO_PUBLIC_BACKEND=local (recetario on-device, sin Supabase)
```

`.env` (todo opcional para empezar en local):
```
EXPO_PUBLIC_BACKEND=local            # o 'supabase'
EXPO_PUBLIC_THEMEALDB_KEY=1          # test key gratis para sembrar
EXPO_PUBLIC_SPOONACULAR_KEY=...      # opcional, recomendador de nevera (150/día gratis)
# Nube (cuando toque):
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

**Coste: arranca en 0 €.** Supabase free (Postgres + Auth + Storage para las fotos), TheMealDB
gratis, Spoonacular 150/día gratis, Open Food Facts gratis, web como estático (Vercel/Cloudflare
Pages). Solo el dominio (~12 €/año) es opcional. Escala igual que Watch Hoard (Supabase Pro ~25 $/mes
o autoalojado en Docker) cuando crezca.

---

## 10. Nombre e identidad

**CookHoard** (el elegido). Encaja con la familia (Watch/Game/Book‑Hoard), pone el foco en el
**acto de cocinar** y en los **makes**, y deja "hoard" = tu colección/acaparamiento de recetas.

- **Tagline:** *"Cocínala, compártela, y dime qué tienes en la nevera."*
- Alternativas de tagline: *"Tu recetario, para siempre tuyo"* · *"Recetas de verdad, cocinadas de verdad."*
- **Icono:** tienes `Icon foodhoard.png` ya hecho — se puede reusar/rebrandear a CookHoard (o dejar
  "foodhoard" como dominio/handle si te gusta). Handle sugerido de la familia: `@CookHoard`.

---

## 11. Riesgos y decisiones abiertas

- **Licencia de datos sembrados** *(alto)*: no almacenar el catálogo de Spoonacular/Edamam como
  propio. Catálogo duradero = usuarios (o TheMealDB con atribución). Ver §6.
- **Copyright de recetas de usuarios** *(medio)*: la *lista de ingredientes* no es protegible, pero
  el **texto expresivo y las fotos** sí. Pedir que suban recetas propias o con permiso; ToS claros.
- **Moderación de contenido (UGC)** *(medio)*: spam, fotos, seguridad. Ya tienes moderación 0012 +
  `ReportSheet`; hay que activarla desde el día 1.
- **Normalización de ingredientes** *(el reto técnico)*: empezar con diccionario canónico + alias +
  *fuzzy match* (`pg_trgm` ya está). Permitir texto libre y resolver luego.
- **Unidades y medidas** *(medio)*: métrico/imperial, "tazas" vs gramos → guardar cantidad+unidad y
  convertir en la UI según `locale`.
- **Alérgenos** *(cuidado)*: informar, nunca prometer seguridad médica; dejar claro que es orientativo.
- **Estacionalidad difusa** *(bajo)*: es regional y aproximada → ranking suave, editable, nunca filtro
  duro. Decisión abierta: ¿comunidad edita la tabla o la fijas tú al principio?

---

## 12. Resumen / próximos pasos

CookHoard = **Watch Hoard (infra social + doble backend + i18n + moderación) − catálogo TMDB +
recetas de usuario + makes + recomendador de nevera con temporada y zona**. Diverge más que
GamerHoard, pero reutiliza ~70% de la plataforma.

**Siguiente paso sugerido:** cuando quieras, clono la base a una carpeta `CookHoard/`, renombro el
workspace a `@cookhoard/*`, y monto la **Fase 1** (tablas `recipe`/`recipe_ingredient`/`recipe_step`
+ editor de publicar + ficha + makes, todo local‑first) para tenerlo corriendo en `npx expo start`.
