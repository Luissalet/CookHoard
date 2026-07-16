// Which backend is active. Flip EXPO_PUBLIC_BACKEND=supabase (with URL + anon key) for cloud mode.
export type Backend = 'local' | 'supabase';
export const BACKEND: Backend = process.env.EXPO_PUBLIC_BACKEND === 'supabase' ? 'supabase' : 'local';
export const isCloud = BACKEND === 'supabase';
