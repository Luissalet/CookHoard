// @cookhoard/core — shared domain, Signal-B season engine, fridge recommender, seed data,
// plus Phase 2/4 brains (shopping, weekly menu, nutrition, expiry, badges, import) and the
// pure mappers for the external sources (TheMealDB, Spoonacular, Open Food Facts).
export * from './types';
export * from './season';
export * from './recommend';
export * from './seed';
export * from './tagging';
export * from './nutrition';
export * from './shopping';
export * from './menu';
export * from './expiry';
export * from './badges';
export * from './remix';
export * from './diagram';
export * from './timers';
export * from './importer';
export * from './sources/themealdb';
export * from './sources/spoonacular';
export * from './sources/openfoodfacts';
// CookHoard 0.2: dictionary and ingredient resolution, places and shelf life, text/video/ticket importers, prices, costs and "¿qué ceno?".
export * from './text';
export * from './units';
export * from './categories';
export * from './dictionary';
export * from './ingredients';
export * from './shelf';
export * from './kitchen';
export * from './pantry';
