// Extra strings for Phase 2/4 + cloud + Phase 5 (remixes, cook mode, flow diagram, dynamic
// Discover), deep-merged onto es.ts (see i18n/index.ts).
export default {
  common: { online: 'Online', import: 'Importar', signIn: 'Entrar', signOut: 'Salir' },
  discover: {
    fromWeb: 'Traer de TheMealDB', online: 'Online',
    readyNow: 'Puedes cocinar ya', inSeason: 'De temporada ahora', popular: 'Más cocinadas',
    fresh: 'Recién publicadas', remixes: 'Remixes recientes', seeAll: 'Ver todas',
    fridgeCta: 'Di qué hay en tu nevera y te digo qué puedes cocinar ya mismo.',
    fridgeCtaBtn: 'Ir a la nevera',
    fAll: 'Todas', fQuick: 'Rápidas', fVeggie: 'Veggie', fLight: 'Ligeras', fHearty: 'De cuchara', fCold: 'Frías',
  },
  fridge: {
    barcode: 'Añadir por código de barras', barcodePh: 'Nº de código de barras', scan: 'Buscar',
    expiring: 'Caduca pronto — cocínalo ya', getOnline: 'Buscar recetas online', setExpiry: 'Caduca',
  },
  recipe: {
    nutrition: 'Nutrición (aprox. por ración)', nutriNote: 'Estimación orientativa, no consejo médico.',
    shop: 'Añadir lo que falta a la compra', addedShop: 'Añadido a la compra',
    cookedTimes: 'Cocinada {{n}} veces', cookMode: 'Cocinar',
  },
  remix: {
    badge: 'Remix', of: 'Remix de {{title}}', cta: 'Remezclar', remixes: 'Remixes',
    noRemixes: 'Nadie la ha remezclado aún. Tócala, cámbiala, hazla tuya.',
    whatChanged: 'Qué cambia', added: 'Añade', removed: 'Quita', changed: 'Ajusta',
    addedSteps: 'Pasos nuevos', removedSteps: 'Pasos que quita',
    identical: 'De momento es una copia fiel del original.',
    basedOn: 'Basada en', family: '{{n}} remixes',
  },
  cook: {
    stepOf: 'Paso {{n}} de {{total}}', inThisStep: 'En este paso',
    startTimer: 'Iniciar', pause: 'Pausa', reset: 'Reiniciar', restart: 'Otra vez',
    timerDone: '¡Tiempo!', timerChip: 'Paso {{n}}',
    next: 'Siguiente', prev: 'Anterior', finish: '¡Plato listo! Sube tu make', exit: 'Salir',
  },
  diagram: { flow: 'Flujo', list: 'Lista', dish: 'Plato listo', alsoNeeds: 'Y además', parallel: 'En paralelo' },
  cookbook: { shopping: 'Lista de la compra', menu: 'Menú semanal', importRecipe: 'Importar receta' },
  profile: { badges: 'Insignias', account: 'Cuenta' },
  shopping: { title: 'Lista de la compra', empty: 'Vacía. Añade lo que te falte desde una receta o el menú.', clear: 'Vaciar' },
  menu: { title: 'Menú semanal', generate: 'Generar menú', regen: 'Otro', addAll: 'Lo que falta → a la compra', day: 'Día {{n}}' },
  import: {
    title: 'Importar receta', url: 'URL de una receta (blog)', urlPh: 'https://…',
    or: 'o pega el JSON-LD de la receta', jsonPh: '{ "@type": "Recipe", … }', go: 'Importar',
    save: 'Guardar en mi recetario', fail: 'No encontré una receta ahí. Prueba con el JSON, o desde un dispositivo (en web hay CORS).',
  },
  badges: {
    first_make: 'Primera vez en los fogones', ten_makes: 'Cocinillas (10 makes)',
    first_recipe: 'Autor', five_recipes: 'Recetario propio (5)', five_star: 'Bordado (make de 5★)',
  },
  feed: {
    title: 'Actividad', empty: 'Sigue a cocineros para ver sus makes aquí.', cooked: 'cocinó',
    published: 'publicó', remixed: 'remezcló',
    emptyLocal: 'Tu diario de cocina: publica, cocina o remezcla algo y aparecerá aquí.',
  },
  auth: { title: 'CookHoard', subtitle: 'Entra para sincronizar y seguir a otros cocineros', email: 'Email', password: 'Contraseña', signIn: 'Entrar', signUp: 'Crear cuenta', toggleUp: '¿No tienes cuenta? Crea una', toggleIn: '¿Ya tienes cuenta? Entra' },
} as const;
