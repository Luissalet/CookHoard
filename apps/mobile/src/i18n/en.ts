export default {
  tabs: { discover: 'Discover', fridge: 'Fridge', cookbook: 'Cookbook', profile: 'Profile' },
  common: {
    search: 'Search', save: 'Save', saved: 'Saved', cancel: 'Cancel', done: 'Done',
    min: '{{n}} min', servings: '{{n}} servings', by: 'by {{name}}', add: 'Add', remove: 'Remove',
    optional: 'optional', all: 'All',
  },
  discover: {
    title: 'Discover', trending: 'Popular', searchPh: 'Search recipes or ingredients…',
    empty: 'No recipes match.', results: '{{n}} recipes',
  },
  fridge: {
    title: 'Your fridge', subtitle: 'Tell me what you have, I’ll tell you what to cook',
    addPh: 'Add an ingredient…', yourFridge: 'In your fridge', clear: 'Clear',
    cookNow: 'Cook right now', results: 'What to cook', empty: 'Add ingredients to see suggestions.',
    month: 'Month', staplesNote: 'Salt, oil, water and spices are assumed on hand.',
    hemisphere: 'Hemisphere', north: 'North', south: 'South',
  },
  bucket: {
    ready: 'Ready to cook', missing1: 'Missing 1', missing2to3: 'Missing 2–3', missingMany: 'Missing several',
  },
  reason: {
    ready: 'You have it all', missing: 'Missing {{count}}', inSeason: 'In season',
    outSeason: 'Out of season', popular: 'Highly rated',
  },
  recipe: {
    ingredients: 'Ingredients', steps: 'Steps', have: 'Have', miss: 'Missing',
    makes: 'Makes', iMadeIt: 'I made it', noMakes: 'Be the first to cook it and post your make.',
    addShopping: 'Add missing to shopping list', min: 'min', difficulty: 'Difficulty',
  },
  publish: {
    title: 'Publish recipe', name: 'Recipe name', namePh: 'e.g. Grandma’s gazpacho',
    desc: 'Description', descPh: 'Tell us about the recipe…', cuisine: 'Cuisine', cuisinePh: 'e.g. Spanish',
    temperature: 'Served', heaviness: 'Heartiness', season: 'Season',
    ingredients: 'Ingredients', addIngredient: 'Add ingredient', ingredientPh: 'e.g. tomato',
    qty: 'Qty', unit: 'Unit', steps: 'Steps', addStep: 'Add step', stepPh: 'Describe the step…',
    stepMin: 'min', stepTimerHint: 'Steps with a time ("bake 20 min") get a timer automatically; you can also set it by hand in minutes.',
    saveCta: 'Publish', needTitle: 'Give the recipe a name', needIngredient: 'Add at least one ingredient',
    saved: 'Recipe published!',
  },
  make: {
    title: 'Your make', of: 'of {{title}}', rating: 'Your rating', notes: 'Notes', notesPh: 'How it turned out, what you changed…',
    wouldRepeat: 'Would you make it again?', time: 'Actual time (min)', saveCta: 'Post make', thanks: 'Thanks for cooking!',
    yes: 'Yes', no: 'No',
  },
  cookbook: {
    title: 'Your cookbook', mine: 'Mine', saved: 'Saved', myMakes: 'My makes', publish: 'Publish recipe',
    emptyMine: 'You haven’t published any recipes yet.', emptySaved: 'Save recipes to keep them handy.',
    emptyMakes: 'Cook a recipe and post your make.',
  },
  profile: {
    title: 'Profile', recipes: 'Recipes', makes: 'Makes', saved: 'Saved',
    language: 'Language', about: 'About', aboutText: 'CookHoard — community recipes, makes and a fridge recommender. Local-first.',
  },
  temp: { hot: 'Hot', cold: 'Cold', room: 'Room temp' },
  heavy: { 1: 'Light', 2: 'Medium', 3: 'Hearty' },
  season: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter', all: 'All year' },
} as const;
