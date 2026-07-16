// Local-first store with an optional cloud path. In local mode (default) everything lives in
// AsyncStorage. When EXPO_PUBLIC_BACKEND=supabase, the store hydrates from CloudSource and writes
// through to Supabase. The cloud branches are strictly guarded by isCloud, so local behaviour is
// unchanged when cloud is off.
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SEED_RECIPES, mergeShopping, type Recipe, type Make, type Hemisphere,
  type ShoppingItem, type PantryItem,
} from '@cookhoard/core';
import { isCloud } from './cloud/backend';
import { CloudSource } from './cloud/source';
import { supabase } from './cloud/client';

const KEYS = {
  recipes: '@cookhoard/userRecipes', makes: '@cookhoard/makes', pantry: '@cookhoard/pantry',
  expiry: '@cookhoard/pantryExpiry', saved: '@cookhoard/saved', shopping: '@cookhoard/shopping', ctx: '@cookhoard/ctx',
};

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

type Ctx = {
  ready: boolean; recipes: Recipe[]; userRecipes: Recipe[]; makes: Make[];
  pantry: string[]; pantryExpiry: Record<string, string>; savedIds: string[]; shopping: ShoppingItem[];
  month: number; hemisphere: Hemisphere;
  recipeById: (id: string) => Recipe | undefined;
  makesFor: (id: string) => Make[];
  pantryItems: () => PantryItem[];
  addRecipe: (r: Recipe) => void; addMake: (m: Make) => void; addSessionRecipes: (rs: Recipe[]) => void;
  addPantry: (id: string) => void; removePantry: (id: string) => void; clearPantry: () => void;
  setExpiry: (id: string, date: string | null) => void; toggleSaved: (id: string) => void;
  addShopping: (items: ShoppingItem[]) => void; toggleShopping: (id: string) => void;
  removeShopping: (id: string) => void; clearShopping: () => void;
  setMonth: (m: number) => void; setHemisphere: (h: Hemisphere) => void;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cloudUid, setCloudUid] = useState('');
  const [userRecipes, setUserRecipes] = useState<Recipe[]>([]);
  const [sessionRecipes, setSessionRecipes] = useState<Recipe[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [pantry, setPantry] = useState<string[]>([]);
  const [pantryExpiry, setPantryExpiry] = useState<Record<string, string>>({});
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [month, setMonthState] = useState<number>(new Date().getMonth() + 1);
  const [hemisphere, setHemisphereState] = useState<Hemisphere>('N');

  useEffect(() => {
    (async () => {
      try {
        const ctxRaw = await AsyncStorage.getItem(KEYS.ctx);
        if (ctxRaw) { const c = JSON.parse(ctxRaw); if (c.month) setMonthState(c.month); if (c.hemisphere) setHemisphereState(c.hemisphere); }

        if (isCloud && supabase) {
          const { data } = await supabase.auth.getUser();
          setCloudUid(data.user?.id ?? '');
          const [rs, pan, sav] = await Promise.all([CloudSource.listRecipes(), CloudSource.getPantry(), CloudSource.getSaved()]);
          setSessionRecipes(rs); setPantry(pan); setSavedIds(sav);
        } else {
          const got = await AsyncStorage.multiGet([KEYS.recipes, KEYS.makes, KEYS.pantry, KEYS.expiry, KEYS.saved, KEYS.shopping]);
          const map = Object.fromEntries(got);
          if (map[KEYS.recipes]) setUserRecipes(JSON.parse(map[KEYS.recipes]!));
          if (map[KEYS.makes]) setMakes(JSON.parse(map[KEYS.makes]!));
          if (map[KEYS.pantry]) setPantry(JSON.parse(map[KEYS.pantry]!));
          if (map[KEYS.expiry]) setPantryExpiry(JSON.parse(map[KEYS.expiry]!));
          if (map[KEYS.saved]) setSavedIds(JSON.parse(map[KEYS.saved]!));
          if (map[KEYS.shopping]) setShopping(JSON.parse(map[KEYS.shopping]!));
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
  useEffect(() => { if (ready && !isCloud) AsyncStorage.setItem(KEYS.pantry, JSON.stringify(pantry)); }, [pantry, ready]);
  useEffect(() => { if (ready && !isCloud) AsyncStorage.setItem(KEYS.saved, JSON.stringify(savedIds)); }, [savedIds, ready]);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEYS.expiry, JSON.stringify(pantryExpiry)); }, [pantryExpiry, ready]);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEYS.shopping, JSON.stringify(shopping)); }, [shopping, ready]);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEYS.ctx, JSON.stringify({ month, hemisphere })); }, [month, hemisphere, ready]);

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
  const addPantry = useCallback((id: string) => {
    setPantry((p) => (p.includes(id) ? p : [...p, id]));
    if (isCloud && cloudUid) CloudSource.addPantry(id, cloudUid);
  }, [cloudUid]);
  const removePantry = useCallback((id: string) => {
    setPantry((p) => p.filter((x) => x !== id));
    setPantryExpiry((e) => { const n = { ...e }; delete n[id]; return n; });
    if (isCloud && cloudUid) CloudSource.removePantry(id, cloudUid);
  }, [cloudUid]);
  const clearPantry = useCallback(() => { setPantry([]); setPantryExpiry({}); }, []);
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
  const toggleShopping = useCallback((id: string) => setShopping((p) => p.map((i) => (i.ingredientId === id ? { ...i, checked: !i.checked } : i))), []);
  const removeShopping = useCallback((id: string) => setShopping((p) => p.filter((i) => i.ingredientId !== id)), []);
  const clearShopping = useCallback(() => setShopping([]), []);
  const setMonth = useCallback((m: number) => setMonthState(m), []);
  const setHemisphere = useCallback((h: Hemisphere) => setHemisphereState(h), []);

  const value: Ctx = {
    ready, recipes, userRecipes, makes, pantry, pantryExpiry, savedIds, shopping, month, hemisphere,
    recipeById, makesFor, pantryItems, addRecipe, addMake, addSessionRecipes,
    addPantry, removePantry, clearPantry, setExpiry, toggleSaved,
    addShopping, toggleShopping, removeShopping, clearShopping, setMonth, setHemisphere,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
