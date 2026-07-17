// Auth session for cloud mode (ported from WatchHoard). Wraps Supabase auth and loads the
// public.profiles row (the social identity) alongside the session. No-ops safely if the
// client is null (local mode).
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';
import { switchableAuthStorage } from './authStorage';
import i18n from '../i18n';

// The social identity (public.profiles) — what recipes/makes/reviews reference.
export type Account = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  locale: string;
  is_public: boolean;
  created_at: string;
};

export type AccountPatch = Partial<Pick<Account, 'display_name' | 'bio' | 'avatar_url' | 'is_public' | 'handle' | 'locale'>>;

type Ctx = {
  session: Session | null;
  account: Account | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  updateAccount: (patch: AccountPatch) => Promise<{ error?: string }>;
};

const SessionContext = createContext<Ctx>({
  session: null, account: null, loading: true,
  signOut: async () => {}, refreshAccount: async () => {}, updateAccount: async () => ({}),
});
export const useSession = () => useContext(SessionContext);

async function fetchAccount(userId: string): Promise<Account | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data as Account) ?? null;
}

function deriveHandle(session: Session): string {
  const md: any = session.user.user_metadata ?? {};
  const raw = String(md.handle ?? (session.user.email ?? 'user').split('@')[0] ?? 'user');
  const base = raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  return base.length >= 3 ? base : 'user' + session.user.id.replace(/-/g, '').slice(0, 8);
}

// Failsafe: read the persisted session straight from storage — no auth-js locks, no
// network. Used when getSession() itself is stuck (expired token + dead radio, or a
// lock deadlock) so the boot spinner is always bounded. A stale token here is fine:
// queries 401 until the refresh lands and onAuthStateChange delivers the fresh one.
async function readStoredSession(): Promise<Session | null> {
  try {
    const ref = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/^https?:\/\//, '').split('.')[0];
    if (!ref) return null;
    const raw = await switchableAuthStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const s = parsed?.currentSession ?? parsed; // v1 wrapped, v2 stores the session itself
    return s?.access_token && s?.user ? (s as Session) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  // Which user the current `account` belongs to — avoids refetching the profile on
  // every TOKEN_REFRESHED event.
  const accountFor = useRef<string | null>(null);

  async function loadAccount(s: Session | null) {
    if (!s?.user || !supabase) { setAccount(null); accountFor.current = null; return; }
    let acc = await fetchAccount(s.user.id);
    if (!acc) {
      // Fallback: the DB trigger normally makes this row at signup. If the schema was
      // applied after this user signed up, create it now from the auth metadata.
      const md: any = s.user.user_metadata ?? {};
      const base = deriveHandle(s);
      const { error } = await supabase.from('profiles').insert({ id: s.user.id, handle: base, display_name: md.display_name ?? null });
      if (error && /duplicate|unique/i.test(error.message)) {
        await supabase.from('profiles').insert({ id: s.user.id, handle: base.slice(0, 15) + Math.floor(Math.random() * 100000), display_name: md.display_name ?? null });
      }
      acc = await fetchAccount(s.user.id);
    }
    setAccount(acc);
    accountFor.current = acc ? s.user.id : null;
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const sb = supabase;
    let alive = true;
    let settled = false;
    // Unblock the UI as soon as the session is known. The account (profiles row) loads
    // in the background — the boot gate must NEVER wait on a network fetch.
    const finish = (s: Session | null) => {
      if (!alive || settled) return;
      settled = true;
      setSession(s);
      setLoading(false);
      void loadAccount(s).catch(() => {});
    };
    sb.auth.getSession().then(({ data }) => finish(data.session)).catch(() => finish(null));
    // If getSession() hasn't resolved shortly (it normally resolves from storage in
    // milliseconds), fall back to reading storage directly so the spinner is bounded.
    const failsafe = setTimeout(() => { void readStoredSession().then(finish); }, 4000);
    // IMPORTANT: this callback must stay synchronous. auth-js runs subscribers while
    // holding its internal lock; awaiting another supabase call here (which needs that
    // same lock for the auth header) deadlocks the client. Defer work to a fresh task.
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setTimeout(() => {
        if (!alive) return;
        settled = true;
        setSession(s);
        setLoading(false);
        if (event === 'SIGNED_OUT' || !s?.user) { setAccount(null); accountFor.current = null; return; }
        if (accountFor.current !== s.user.id) void loadAccount(s).catch(() => {});
      }, 0);
    });
    return () => { alive = false; clearTimeout(failsafe); sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { await supabase?.auth.signOut(); setAccount(null); accountFor.current = null; };
  const refreshAccount = async () => { if (session) await loadAccount(session); };
  const updateAccount = async (patch: AccountPatch): Promise<{ error?: string }> => {
    if (!session?.user || !supabase) return { error: i18n.t('auth.errGeneric') };
    const clean: AccountPatch = { ...patch };
    if (typeof clean.handle === 'string') clean.handle = clean.handle.trim().toLowerCase();
    const { error } = await supabase.from('profiles').update(clean).eq('id', session.user.id);
    if (error) return { error: /duplicate|unique/i.test(error.message) ? i18n.t('auth.hintTaken') : error.message };
    await loadAccount(session);
    return {};
  };

  return (
    <SessionContext.Provider value={{ session, account, loading, signOut, refreshAccount, updateAccount }}>
      {children}
    </SessionContext.Provider>
  );
}
