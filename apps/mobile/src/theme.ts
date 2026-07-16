// CookHoard design tokens — utilitarian dark. Hard edges (radius 0 everywhere), 1px borders,
// monospaced data, and a single high-contrast bone accent. Status colours stay muted.
import { Platform } from 'react-native';

export const colors = {
  bg: '#0C0C0C',
  surface: '#131313',
  surfaceAlt: '#1A1A1A',
  border: '#2C2C2C',
  borderStrong: '#4A4A4A',
  text: '#E8E8E8',
  textMuted: '#8C8C8C',
  accent: '#E8E8E8',        // bone — primary action reads as white button / black label
  accentInk: '#0C0C0C',
  ready: '#8FAE7A',         // muted sage — "you can cook it now" / in season
  warn: '#C9971F',          // muted amber — "you're missing a few"
  danger: '#C24B4B',
  star: '#C9A227',
};

// All zero: the whole app snaps to hard corners without touching call sites.
export const radius = { sm: 0, md: 0, lg: 0, xl: 0, pill: 0 };
export const space = (n: number) => n * 4;

export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}) as string;

export const font = {
  display: { fontSize: 24, fontWeight: '700' as const, color: colors.text, letterSpacing: 1, textTransform: 'uppercase' as const },
  h1: { fontSize: 20, fontWeight: '700' as const, color: colors.text, letterSpacing: 0.5 },
  h2: { fontSize: 14, fontWeight: '700' as const, color: colors.text, letterSpacing: 1, textTransform: 'uppercase' as const },
  h3: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  tiny: { fontSize: 11, color: colors.textMuted, fontFamily: mono },
  label: { fontSize: 10, color: colors.textMuted, fontFamily: mono, letterSpacing: 1, textTransform: 'uppercase' as const },
  mono: { fontFamily: mono, color: colors.text },
};
