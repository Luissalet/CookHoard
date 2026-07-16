# CookHoard 🍳

**Recetas de la comunidad + makes (estilo Cults3D) + un recomendador de nevera que tiene en
cuenta la temporada y tu zona.** Un clon de [Watch Hoard](../WatchHoard) para cocinar: misma
arquitectura (Expo / React Native + Expo Router, i18n ES/EN, local-first con salto a Supabase),
pero el objeto central es la **receta creada por el usuario**.

> Estado: **Fase 1 implementada y ejecutable** (local-first, sin backend). El motor de
> recomendación —la joya— está construido y **testeado**. Plan completo en
> [`COOKHOARD.md`](./COOKHOARD.md).

---

## Qué funciona ya (Fase 1)

- **Descubre** — buscar recetas por nombre, cocina o ingrediente; orden por populares.
- **🧊 Nevera (la estrella)** — añades lo que tienes (con autocompletado del diccionario de
  ingredientes), ajustas mes y hemisferio, y el motor agrupa las recetas en **"Puedes cocinar ya"**
  y **"Casi"** (te falta 1 / 2–3), con el **porqué** (de temporada, muy valorada, te falta X).
- **Ficha de receta** — ingredientes **cotejados contra tu nevera** (✓ tienes / ○ te falta; toca
  para marcar que lo tienes), pasos numerados, chips de temporada/carácter, y galería de **makes**.
- **La he hecho** — publica tu **make**: nota con estrellas, notas, tiempo real, "¿la repetirías?".
- **Publicar receta** — editor con ingredientes estructurados (cantidad + unidad), pasos, y las
  etiquetas que alimentan la Señal B (se sirve caliente/frío, contundencia, temporada).
- **Recetario** — tus recetas, las guardadas y tus makes.
- **Perfil** — stats + cambio de idioma (ES/EN), todo persistido en el dispositivo.

Todo corre **en local** (memoria + `AsyncStorage`), sembrado con 8 recetas reales. Sin cuentas,
sin red.

## El motor de recomendación (Señal B)

Vive en `packages/core` como **TypeScript puro y testeable** (sin React), listo para reutilizarse
en la app, en un importador o en el servidor. Resuelve *"las lentejas no entran en verano"* con
**el carácter del plato**: `temperature` (caliente/frío) + `heaviness` (ligero…contundente),
comparado con lo que "pide" la estación actual (mes + hemisferio), reforzado por la
`seasonAffinity` que fije el autor. No necesita tablas de producto de temporada.

```bash
npm install
npm run test:core     # ejecuta packages/core/test/run.ts
```

Salida (real):

```
✅ lentejas fuera de temporada en verano (fit=-1.00)
✅ lentejas en temporada en invierno (fit=1.00)
✅ gazpacho en temporada en verano (fit=1.00)

🧊 Nevera de julio: Tomate, Pepino, Pimiento verde, Ajo, Pan
     3.63  Gazpacho andaluz               [ready] falta: —
     ...
    -5.05  Lentejas estofadas con chorizo [missingMany] falta: Lentejas, Zanahoria, Cebolla…
🎉 Todos los tests pasan
```

## Arrancar la app

```bash
npm install
npm run mobile        # abre Expo: pulsa w (web), a (Android), i (iOS)
# o directamente la web:
npm run web
```

Copia `apps/mobile/.env.example` → `apps/mobile/.env` si quieres tocar la config (por defecto
`EXPO_PUBLIC_BACKEND=local`, no hace falta nada más). Verificación de tipos de la app:
`npm run typecheck --workspace @cookhoard/mobile`.

## Estructura

```
CookHoard/
├─ apps/mobile/                 App Expo (iOS · Android · web)
│  ├─ app/                      Rutas (expo-router)
│  │  ├─ (tabs)/                Descubre · Nevera · Recetario · Perfil
│  │  ├─ recipe/[id].tsx        Ficha + cotejo de nevera + makes
│  │  ├─ publish.tsx            Editor de publicar receta
│  │  └─ make/[id].tsx          Formulario de "make"
│  └─ src/                      theme · i18n (es/en) · store local · ui · format
├─ packages/core/               Dominio + motor Señal B + recomendador + semilla (TS puro)
│  ├─ src/{types,season,recommend,seed,index}.ts
│  └─ test/run.ts               Tests del motor (npm run test:core)
├─ COOKHOARD.md                 El plan completo (modelo de datos, APIs, roadmap, riesgos)
└─ README.md
```

## Fases 2–4 y nube: implementadas

Todas las fases están construidas y funcionan **en local sin keys**; las APIs y la nube se
**encienden solas** al poner las claves:

- **Fase 2** — lista de la compra, menú semanal, código de barras (Open Food Facts), y "buscar
  recetas online" (TheMealDB gratis + Spoonacular opcional).
- **Fase 3** — nube Supabase: migraciones (`supabase/migrations/`), auth, feed de makes, reviews;
  `EXPO_PUBLIC_BACKEND=supabase` la activa. Local sigue por defecto.
- **Fase 4** — importar recetas (URL/JSON-LD), nutrición por ración, insignias, caducidad.

Guía operativa completa (qué está activo en local vs. qué enciende cada key, cómo aplicar las
migraciones) en **[`PHASES.md`](./PHASES.md)**. Estrategia, licencias de APIs y modelo de datos en
[`COOKHOARD.md`](./COOKHOARD.md).

## Licencia

AGPL-3.0-or-later — como el resto de la familia Hoard.
