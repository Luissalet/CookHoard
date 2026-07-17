// Supabase client (cloud mode). Null when URL/key are missing so the app can degrade to local.
import 'react-native-url-polyfill/auto';
import { Platform, AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { switchableAuthStorage } from './authStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = !!(url && key);

// React Native's fetch has NO timeout: on a cold radio / stalled connection a request
// (including the auth token refresh at cold start) can hang forever, leaving the app
// stuck on the boot spinner. Give every request a hard deadline so failures are bounded.
const FETCH_TIMEOUT_MS = 20000;
const boundedFetch: typeof fetch = (input: any, init?: any) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const callerSignal: AbortSignal | undefined = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) ctrl.abort();
    else callerSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

// Session persistence goes through switchableAuthStorage, which honours the
// "Keep me signed in" choice: persistent storage when checked (localStorage /
// AsyncStorage), ephemeral when unchecked (sessionStorage / in-memory).
// detectSessionInUrl on web lets the password-recovery link (#access_token=…&type=recovery)
// become a session on /reset-password.
export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, key as string, {
      auth: {
        storage: switchableAuthStorage as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
      global: { fetch: boundedFetch },
    })
  : null;

// Native: run the token auto-refresh only while the app is foregrounded (the
// Supabase-recommended React Native pattern). Backgrounded timers on Android are
// unreliable and a refresh attempt racing a cold start can cause boot hangs.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
