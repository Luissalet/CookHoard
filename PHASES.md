# CookHoard — estado de las fases

Todo está construido. Funciona **en local sin ninguna key**; las APIs y la nube se **encienden
solas** cuando pones las claves. La lógica nueva de cada fase vive en `packages/core` (TS puro) y
está **testeada** (`npm run test:core`).

## Fase 1 — Recetario (local-first) ✅ activa siempre
Publicar recetas (editor con ingredientes estructurados + pasos + tags), fichas con cotejo de
nevera, makes, guardar, recetarios, buscar, i18n ES/EN. Sin backend.

## Fase 2 — La nevera 🌟 ✅ activa (mejora con keys)
- **Recomendador Señal B** (mes + hemisferio + carácter del plato) — local, testeado.
- **Lista de la compra** desde "te falta" (Recetario → Lista de la compra, o botón en la ficha).
- **Menú semanal** con variedad + temporada (Recetario → Menú semanal).
- **Código de barras** → ingrediente vía **Open Food Facts** (gratis, sin key) en la Nevera.
- **Buscar recetas online**:
  - **TheMealDB** — gratis con la key de prueba `1` (ya puesta). Botón "Traer de TheMealDB" en
    Descubre y "Buscar recetas online" en la Nevera.
  - **Spoonacular** (`find by ingredients`) — **opcional**: si defines `EXPO_PUBLIC_SPOONACULAR_KEY`
    se añade a los resultados de la nevera; si no, se ignora sin romper nada.

## Fase 3 — Comunidad (nube) ✅ construida, se activa con tu Supabase
Local por defecto. Para encender la nube:
1. Crea un proyecto en Supabase.
2. En el **SQL editor**, ejecuta en orden `supabase/migrations/0001_init.sql` y luego
   `0002_rls.sql` (esquema de recetas + RLS + grafo social + reviews + triggers + feed).
3. En `apps/mobile/.env`:
   ```
   EXPO_PUBLIC_BACKEND=supabase
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
   ```
4. Reinicia Expo. Aparece **login** (email/contraseña). Con sesión, la app hidrata recetas, nevera
   y guardados desde Supabase y **escribe en la nube** al publicar receta, hacer un make, tocar la
   nevera o guardar. Hay **feed** de makes de a quién sigues (Perfil → Actividad) y **reviews** en
   la ficha. Todo con RLS (catálogo público, datos personales privados, makes por perfil/seguidor).

Arquitectura: `src/cloud/` (`backend.ts` flag · `client.ts` · `session.tsx` auth · `source.ts`
CloudSource con el mismo contrato que el store local). El camino local queda **idéntico** cuando
`isCloud` es falso.

## Fase 4 — Ir más allá ✅ lo esencial construido
- **Importar recetas** (Recetario → Importar): pega una **URL** de blog (lee el `Recipe` JSON-LD de
  schema.org) o pega el **JSON-LD** directamente. Resuelve ingredientes al diccionario e infiere los
  tags de Señal B. *(En web puede haber CORS al leer una URL: usa el pegado de JSON o un dispositivo.)*
- **Nutrición** aproximada por ración en la ficha (orientativa, no consejo médico).
- **Insignias** en el Perfil (computadas desde tus makes/recetas).
- **Caducidad**: marca el reloj en un ingrediente de la nevera → aviso "caduca pronto — cocínalo"
  con la receta que más lo aprovecha.

## Fase 5 — Dinámica y social: remixes, diagramas y modo cocina ✅ construida
- **Remixes (estilo Thingiverse/Cults3D)** 🌟: botón **"Remezclar"** en cualquier ficha → abre el
  editor precargado con la receta base; al publicar queda el linaje (`remixOf`). La ficha muestra
  el badge "Remix de X" (navegable), la sección **"Qué cambia"** (diff automático: ingredientes que
  añade/quita/ajusta y pasos nuevos/quitados) y la galería de **remixes** de la receta. Descubre
  tiene sección "Remixes recientes". Core: `remix.ts` (`remixesOf`, `remixLineage`, `remixFamily`,
  `diffRecipes`) — testeado.
- **Recetas como diagramas de flujo** 🌟 (estilo *Cooking for Engineers*): `diagram.ts` infiere del
  texto de los pasos qué ingredientes entran en cada paso, qué pasos van **en paralelo** (cocer la
  pasta / triturar el pesto) y dónde se **fusionan** las ramas. Cero trabajo extra del autor: toda
  receta (propia, semilla o importada) tiene diagrama. La ficha tiene el toggle **Lista ⇄ Flujo**
  y se pinta como git-graph vertical con colores por rama (solo Views/flexbox, sin SVG). Testeado
  (gazpacho lineal, pesto 2 ramas + fusión, lentejas encadena con "añade").
- **Modo cocina** (`cook/[id]`): player a pantalla completa paso a paso — texto grande, barra de
  progreso, chips de "en este paso" (salen del diagrama), **temporizador con cuenta atrás** por
  paso (iniciar/pausa/reiniciar) y al acabar "¡Plato listo! → sube tu make".
- **Descubre dinámico**: carruseles "Puedes cocinar ya" (tu nevera + recomendador), "De temporada
  ahora", "Remixes recientes", "Más cocinadas" y "Recién publicadas"; chips de filtro rápido
  (rápidas/veggie/ligeras/de cuchara/frías); búsqueda con limpiar; CTA a la nevera si está vacía.
- **Actividad local**: el feed ahora también vive sin nube — tu diario (publicaste, remezclaste,
  cocinaste) ordenado por fecha. En nube sigue siendo el feed de makes de a quién sigues.
- **Pulido**: feedback de pulsación en tarjetas/botones/chips, "Cocinada N veces" en la ficha,
  badge de remix en las tarjetas, contador de makes en los metadatos.
- **Nube**: migración `0003_remix.sql` (columna `remix_of` + índice + vista `recipe_remix_counts`);
  `CloudSource` lee/escribe el linaje.

## Claves / .env (todas opcionales para empezar)
```
EXPO_PUBLIC_BACKEND=local            # 'supabase' para la nube
EXPO_PUBLIC_THEMEALDB_KEY=1          # gratis; ya vale para sembrar
# EXPO_PUBLIC_SPOONACULAR_KEY=...    # opcional (nevera online, 150/día gratis)
# EXPO_PUBLIC_SUPABASE_URL=...       # nube
# EXPO_PUBLIC_SUPABASE_ANON_KEY=...  # nube
```

## Verificado
- `npm run test:core` → **todo verde, 49 tests** (Señal B, recomendador, nutrición, compra, menú,
  caducidad, badges, import JSON-LD, los 3 mappers de API, **remixes + diff** y **diagrama de flujo**).
- El core compila con `tsc` estricto. La app necesita `npm install` para el typecheck completo
  (`npm run typecheck --workspace @cookhoard/mobile`), ya que arrastra los tipos de React Native.

## Notas / pendientes menores
- En modo nube, la galería de makes por receta muestra los makes de tu sesión; la hidratación
  completa de makes por receta desde el servidor (una llamada por ficha) es un pulido pendiente.
- Escaneo de código de barras: hoy se introduce el número (o pegas) y se resuelve por Open Food
  Facts; añadir la cámara (`expo-camera`) es un extra de Fase 2.
- La estacionalidad usa la **Señal B** (carácter del plato), no tablas de producto — por diseño.
