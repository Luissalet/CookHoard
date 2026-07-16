// Extra strings for Phase 2/4 + cloud + Phase 5 (remixes, cook mode, flow diagram, dynamic
// Discover), deep-merged onto en.ts (see i18n/index.ts).
export default {
  common: { online: 'Online', import: 'Import', signIn: 'Sign in', signOut: 'Sign out' },
  discover: {
    fromWeb: 'Fetch from TheMealDB', online: 'Online',
    readyNow: 'Cook right now', inSeason: 'In season now', popular: 'Most cooked',
    fresh: 'Just published', remixes: 'Recent remixes', seeAll: 'See all',
    fridgeCta: 'Tell me what’s in your fridge and I’ll tell you what you can cook right now.',
    fridgeCtaBtn: 'Go to the fridge',
    fAll: 'All', fQuick: 'Quick', fVeggie: 'Veggie', fLight: 'Light', fHearty: 'Hearty', fCold: 'Cold',
  },
  fridge: {
    barcode: 'Add by barcode', barcodePh: 'Barcode number', scan: 'Look up',
    expiring: 'Expiring soon — cook it now', getOnline: 'Find recipes online', setExpiry: 'Expires',
  },
  recipe: {
    nutrition: 'Nutrition (approx. per serving)', nutriNote: 'Rough estimate, not medical advice.',
    shop: 'Add missing to shopping list', addedShop: 'Added to shopping list',
    cookedTimes: 'Cooked {{n}} times', cookMode: 'Cook',
  },
  remix: {
    badge: 'Remix', of: 'Remix of {{title}}', cta: 'Remix it', remixes: 'Remixes',
    noRemixes: 'No one has remixed it yet. Tweak it and make it yours.',
    whatChanged: 'What changed', added: 'Adds', removed: 'Removes', changed: 'Adjusts',
    addedSteps: 'New steps', removedSteps: 'Removed steps',
    identical: 'A faithful copy of the original (so far).',
    basedOn: 'Based on', family: '{{n}} remixes',
  },
  cook: {
    stepOf: 'Step {{n}} of {{total}}', inThisStep: 'In this step',
    startTimer: 'Start', pause: 'Pause', reset: 'Reset', restart: 'Again',
    timerDone: 'Time’s up!', timerChip: 'Step {{n}}',
    next: 'Next', prev: 'Back', finish: 'Dish done! Post your make', exit: 'Exit',
  },
  diagram: { flow: 'Flow', list: 'List', dish: 'Dish ready', alsoNeeds: 'Plus', parallel: 'In parallel' },
  cookbook: { shopping: 'Shopping list', menu: 'Weekly menu', importRecipe: 'Import recipe' },
  profile: { badges: 'Badges', account: 'Account' },
  shopping: { title: 'Shopping list', empty: 'Empty. Add what you’re missing from a recipe or the menu.', clear: 'Clear' },
  menu: { title: 'Weekly menu', generate: 'Generate menu', regen: 'Shuffle', addAll: 'Missing → shopping list', day: 'Day {{n}}' },
  import: {
    title: 'Import recipe', url: 'Recipe URL (blog)', urlPh: 'https://…',
    or: 'or paste the recipe JSON-LD', jsonPh: '{ "@type": "Recipe", … }', go: 'Import',
    save: 'Save to my cookbook', fail: 'Couldn’t find a recipe there. Try the JSON, or run on a device (web has CORS).',
  },
  badges: {
    first_make: 'First time at the stove', ten_makes: 'Home cook (10 makes)',
    first_recipe: 'Author', five_recipes: 'Own cookbook (5)', five_star: 'Nailed it (5★ make)',
  },
  feed: {
    title: 'Activity', empty: 'Follow cooks to see their makes here.', cooked: 'cooked',
    published: 'published', remixed: 'remixed',
    emptyLocal: 'Your cooking diary: publish, cook or remix something and it shows up here.',
  },
  auth: { title: 'CookHoard', subtitle: 'Sign in to sync and follow other cooks', email: 'Email', password: 'Password', signIn: 'Sign in', signUp: 'Sign up', toggleUp: 'No account? Create one', toggleIn: 'Have an account? Sign in' },
} as const;
