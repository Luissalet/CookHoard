// Time source for everything that depends on "now": tests replace it, the app uses the system clock.
let source = () => new Date();
export const now = () => source();
export const setClock = (fn) => { source = fn || (() => new Date()); };
export const isoDay = (date = now()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const today = () => isoDay(now());
export const nowIso = () => now().toISOString();
