// Local-first store with an optional cloud path. In local mode (default) everything lives in
// AsyncStorage. When EXPO_PUBLIC_BACKEND=supabase, the store hydrates from CloudSource and writes
// through to Supabase. The cloud branches are strictly guarded by isCloud, so local behaviour is
// unchanged when cloud is off.
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SEED_RECIPES, mergeShopping, manualShoppingItem, resolveIngredient, INGREDIENT_BY_ID,
  type Recipe, type Make, type Hemisphere, type ShoppingItem, type ShopUnit, type PantryItem,
  type MenuPlan,
  menuWeekKey,
} from '@cookhoard/core';
import { isCloud } from './cloud/backend';
import { CloudSource } from './cloud/source';
import { supabase } from './cloud/client';

const KEYS = {
  recipes: '@cookhoard/userRecipes', makes: '@cookhoard/makes', pantry: '@cookhoard/pantry',
  expiry: '@cookhoard/pantryExpiry', saved: '@cookhoard/saved', shopping: '@cookhoard/shopping', ctx: '@cookhoard/ctx',
  menu: '@cookhoard/weeklyMenu',
};

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

type Ctx = {
  ready: boolean; recipes: Recipe[]; userRecipes: Recipe[]; makes: Make[];
  pantry: string[]; pantryExpiry: Record<string, string>; savedIds: string[]; shopping: ShoppingItem[];
  month: number; hemisphere: Hemisphere;
  menuPlan: MenuPlan | null; setMenuPlan: (plan: MenuPlan | null) => void;
  recipeById: (id: string) => Recipe | undefined;
  makesFor: (id: string) => Make[];
  pantryItems: () => PantryItem[];
  addRecipe: (r: Recipe) => void; addMake: (m: Make) => void; addSessionRecipes: (rs: Recipe[]) => void;
  addPantry: (id: string) => void; removePantry: (id: string) => void; clearPantry: () => void;
  setExpiry: (id: string, date: string | null) => void; toggleSaved: (id: string) => void;
  addShopping: (items: ShoppingItem[]) => void; toggleShopping: (id: string) => void;
  removeShopping: (id: string) => void; clearShopping: () => void;
  // Unified list: add a manual item (resolves free text to a dictionary id when possible);
  // patch qty/unit/name of an existing item.
  addShoppingManual: (name: string, opts?: { qty?: number; unit?: ShopUnit; checked?: boolean }) => void;
  updateShopping: (id: string, patch: Partial<Pick<ShoppingItem, 'qty' | 'unit' | 'name'>>) => void;
  setMonth: (m: number) => void; setHemisphere: (h: Hemisphere) => void;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cloudUid, setCloudUid] = useState('');
  const [userRecipes, setUserRecipes] = useState<Recipe[]>([]);
  const [sessionRecipes, setSessionRecipes] = useState<Recipe[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [pantryExpiry, setPantryExpiry] = useState<Record<string, string>>({});
  const [savedIds, setSavedIds] = useState<string[]>([]);
  // Single source of truth for both the fridge and the shopping list. checked = you have it.
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  // The fridge/pantry is simply the checked items — derived, never stored separately.
  const pantry = useMemo(() => shopping.filter((i) => i.checked).map((i) => i.ingredientId), [shopping]);
  const [month, setMonthState] = useState<number>(new Date().getMonth() + 1);
  const [hemisphere, setHemisphereState] = useState<Hemisphere>('N');
  const [menuPlan, setMenuPlan] = useState<MenuPlan | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const ctxRaw = await AsyncStorage.getItem(KEYS.ctx);
        if (ctxRaw) { const c = JSON.parse(ctxRaw); if (c.month) setMonthState(c.month); if (c.hemisphere) setHemisphereState(c.hemisphere); }
        const menuRaw = await AsyncStorage.getItem(KEYS.menu);
        if (menuRaw) {
          const saved = JSON.parse(menuRaw);
          if (saved.week === menuWeekKey() && Array.isArray(saved.plan?.days)) setMenuPlan(saved.plan);
        }

        if (isCloud && supabase) {
          const { data } = await supabase.auth.getUser();
          setCloudUid(data.user?.id ?? '');
          const [rs, pan, sav] = await Promise.all([CloudSource.listRecipes(), CloudSource.getPantry(), CloudSource.getSaved()]);
          setSessionRecipes(rs); setSavedIds(sav);
          // Cloud pantry ids become checked items of the unified list.
          setShopping(pan.map((id) => manualShoppingItem(id, { checked: true })));
        } else {
          const got = await AsyncStorage.multiGet([KEYS.recipes, KEYS.makes, KEYS.pantry, KEYS.expiry, KEYS.saved, KEYS.shopping]);
          const map = Object.fromEntries(got);
          if (map[KEYS.recipes]) setUserRecipes(JSON.parse(map[KEYS.recipes]!));
          if (map[KEYS.makes]) setMakes(JSON.parse(map[KEYS.makes]!));
          if (map[KEYS.expiry]) setPantryExpiry(JSON.parse(map[KEYS.expiry]!));
          if (map[KEYS.saved]) setSavedIds(JSON.parse(map[KEYS.saved]!));
          // Migrate the old split model (separate pantry ids + shopping list) into the
          // unified list: shopping items keep their state, old pantry ids become checked.
          const oldShopping: ShoppingItem[] = map[KEYS.shopping] ? JSON.parse(map[KEYS.shopping]!) : [];
          const oldPantry: string[] = map[KEYS.pantry] ? JSON.parse(map[KEYS.pantry]!) : [];
          setShopping(mergeShopping(oldShopping, oldPantry.map((id) => manualShoppingItem(id, { checked: true }))));
        }
      } catch {
        /* fresh start */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Persist to AsyncStorage in local mode only (cloud is the source of truth in cloud mode).
  useEffect(() => { if (ready && !isCloud) AsyncStorage.setItem(KEYS.recipes, JSON.stringify(userRecipes)); }, [userRecipes, ready]);
  useEffect(() => { if (ready && !isCloud) AsyncStorage.setItem(KEYS.makes, JSON.stringify(makes)); }, [makes, ready]);
  useEffect(() => { if (ready && !isCloud) AsyncStorage.setItem(KEYS.saved, JSON.stringify(savedIds)); }, [savedIds, ready]);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEYS.expiry, JSON.stringify(pantryExpiry)); }, [pantryExpiry, ready]);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEYS.shopping, JSON.stringify(shopping)); }, [shopping, ready]);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEYS.ctx, JSON.stringify({ month, hemisphere })); }, [month, hemisphere, ready]);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEYS.menu, JSON.stringify({ week: menuWeekKey(), plan: menuPlan })); }, [menuPlan, ready]);

  const recipes = useMemo<Recipe[]>(() => {
    const savedSet = new Set(savedIds);
    const byId = new Map<string, Recipe>();
    for (const r of [...userRecipes, ...sessionRecipes, ...SEED_RECIPES]) if (!byId.has(r.id)) byId.set(r.id, { ...r, saved: savedSet.has(r.id) });
    return [...byId.values()];
  }, [userRecipes, sessionRecipes, savedIds]);

  const recipeById = useCallback((id: string) => recipes.find((r) => r.id === id), [recipes]);
  const makesFor = useCallback((id: string) => makes.filter((m) => m.recipeId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [makes]);
  const pantryItems = useCallback((): PantryItem[] => pantry.map((id) => ({ ingredientId: id, expiresAt: pantryExpiry[id] })), [pantry, pantryExpiry]);

  const addRecipe = useCallback((r: Recipe) => {
    setUserRecipes((p) => [r, ...p]);
    if (isCloud && cloudUid) CloudSource.createRecipe(r, cloudUid);
  }, [cloudUid]);
  const addMake = useCallback((m: Make) => {
    setMakes((p) => [m, ...p]);
    if (isCloud && cloudUid) CloudSource.addMake(m, cloudUid);
  }, [cloudUid]);
  const addSessionRecipes = useCallback((rs: Recipe[]) => setSessionRecipes((prev) => {
    const byId = new Map(prev.map((r) => [r.id, r]));
    for (const r of rs) byId.set(r.id, r);
    return [...byId.values()];
  }), []);
  // Add to the fridge = upsert an item and mark it as "have it" (checked).
  const addPantry = useCallback((id: string) => {
    setShopping((p) => (p.some((i) => i.ingredientId === id)
      ? p.map((i) => (i.ingredientId === id ? { ...i, checked: true } : i))
      : mergeShopping(p, [manualShoppingItem(id, { checked: true })])));
    if (isCloud && cloudUid) CloudSource.addPantry(id, cloudUid);
  }, [cloudUid]);
  // "Used it up": uncheck so it drops back onto the shopping list (kept, not deleted).
  const removePantry = useCallback((id: string) => {
    setShopping((p) => p.map((i) => (i.ingredientId === id ? { ...i, checked: false } : i)));
    setPantryExpiry((e) => { const n = { ...e }; delete n[id]; return n; });
    if (isCloud && cloudUid) CloudSource.removePantry(id, cloudUid);
  }, [cloudUid]);
  // Clear fridge = uncheck everything (all items move to the shopping list).
  const clearPantry = useCallback(() => {
    setShopping((p) => p.map((i) => ({ ...i, checked: false })));
    setPantryExpiry({});
    if (isCloud && cloudUid) pantry.forEach((id) => CloudSource.removePantry(id, cloudUid));
  }, [cloudUid, pantry]);
  const setExpiry = useCallback((id: string, date: string | null) => setPantryExpiry((e) => {
    const n = { ...e }; if (date) n[id] = date; else delete n[id]; return n;
  }), []);
  const toggleSaved = useCallback((id: string) => {
    setSavedIds((p) => {
      const on = !p.includes(id);
      if (isCloud && cloudUid) CloudSource.setSaved(id, on, cloudUid);
      return on ? [...p, id] : p.filter((x) => x !== id);
    });
  }, [cloudUid]);
  const addShopping = useCallback((items: ShoppingItem[]) => setShopping((prev) => mergeShopping(prev, items)), []);
  // Toggling an item's checkbox flips have/need; mirror to the cloud pantry.
  const toggleShopping = useCallback((id: string) => {
    setShopping((p) => p.map((i) => {
      if (i.ingredientId !== id) return i;
      const nowHave = !i.checked;
      if (isCloud && cloudUid) (nowHave ? CloudSource.addPantry : CloudSource.removePantry)(id, cloudUid);
      return { ...i, checked: nowHave };
    }));
  }, [cloudUid]);
  const removeShopping = useCallback((id: string) => {
    setShopping((p) => p.filter((i) => i.ingredientId !== id));
    setPantryExpiry((e) => { const n = { ...e }; delete n[id]; return n; });
    if (isCloud && cloudUid) CloudSource.removePantry(id, cloudUid);
  }, [cloudUid]);
  // Clear the shopping list = delete only the unchecked (to-buy) items; keep the fridge.
  const clearShopping = useCallback(() => setShopping((p) => p.filter((i) => i.checked)), []);
  // Manual add: resolve free text to a dictionary id when possible. If it's a real dictionary
  // ingredient we drop the typed label (so it localizes); if it's unknown we keep the label.
  const addShoppingManual = useCallback((name: string, opts?: { qty?: number; unit?: ShopUnit; checked?: boolean }) => {
    const raw = name.trim();
    if (!raw) return;
    const id = resolveIngredient(raw);
    if (!id) return;
    const isKnown = !!INGREDIENT_BY_ID[id];
    const item = manualShoppingItem(id, {
      qty: opts?.qty, unit: opts?.unit, checked: opts?.checked,
      name: isKnown ? undefined : raw,
    });
    setShopping((p) => mergeShopping(p, [item]));
  }, []);
  const updateShopping = useCallback((id: string, patch: Partial<Pick<ShoppingItem, 'qty' | 'unit' | 'name'>>) =>
    setShopping((p) => p.map((i) => (i.ingredientId === id ? { ...i, ...patch } : i))), []);
  const setMonth = useCallback((m: number) => setMonthState(m), []);
  const setHemisphere = useCallback((h: Hemisphere) => setHemisphereState(h), []);

  const value: Ctx = {
    ready, recipes, userRecipes, makes, pantry, pantryExpiry, savedIds, shopping, month, hemisphere, menuPlan, setMenuPlan,
    recipeById, makesFor, pantryItems, addRecipe, addMake, addSessionRecipes,
    addPantry, removePantry, clearPantry, setExpiry, toggleSaved,
    addShopping, toggleShopping, removeShopping, clearShopping,
    addShoppingManual, updateShopping, setMonth, setHemisphere,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
