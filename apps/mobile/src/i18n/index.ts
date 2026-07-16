// i18next setup for CookHoard. Default Spanish (Luis' primary language); persisted in AsyncStorage.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import es from './es';
import en from './en';
import extraEs from './extra.es';
import extraEn from './extra.en';

export const LANGS = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
] as const;
export type LangCode = (typeof LANGS)[number]['code'];

const STORAGE_KEY = '@cookhoard/lang';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { es: { translation: es }, en: { translation: en } },
    lng: 'es',
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}
i18n.addResourceBundle('es', 'translation', es, true, true);
i18n.addResourceBundle('en', 'translation', en, true, true);
i18n.addResourceBundle('es', 'translation', extraEs, true, true);
i18n.addResourceBundle('en', 'translation', extraEn, true, true);

export async function loadStoredLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && saved !== i18n.language && LANGS.some((l) => l.code === saved)) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    /* keep default */
  }
}

export async function setLanguage(code: LangCode): Promise<void> {
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* non-fatal */
  }
}

export function currentLanguage(): LangCode {
  return i18n.language && i18n.language.startsWith('en') ? 'en' : 'es';
}

export default i18n;
