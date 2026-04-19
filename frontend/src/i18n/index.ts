import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import fr from './translations/fr.json';
import en from './translations/en.json';
import es from './translations/es.json';

const LANGUAGE_STORAGE_KEY = '@brightcalendar/language';

// Detect device language -> default to French if not supported
function detectInitialLanguage(): string {
  try {
    const locales = Localization.getLocales?.();
    const code = locales && locales.length > 0 ? locales[0].languageCode : null;
    if (code === 'en') return 'en';
    if (code === 'es') return 'es';
    return 'fr';
  } catch {
    return 'fr';
  }
}

export async function loadSavedLanguage(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && ['fr', 'en', 'es'].includes(saved)) return saved;
  } catch {}
  return detectInitialLanguage();
}

export async function saveLanguage(lang: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    await i18n.changeLanguage(lang);
  } catch (e) {
    console.error('Failed to save language', e);
  }
}

// Initialize i18n
i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      es: { translation: es },
    },
    lng: 'fr', // Default — will be overridden by loadSavedLanguage()
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    compatibilityJSON: 'v4',
  });

// Load saved language asynchronously
loadSavedLanguage().then((lang) => {
  if (lang !== i18n.language) {
    i18n.changeLanguage(lang);
  }
});

export default i18n;
export const SUPPORTED_LANGUAGES = [
  { code: 'fr', name: 'Français', nameEn: 'French', nameEs: 'Francés' },
  { code: 'en', name: 'English', nameFr: 'Anglais', nameEs: 'Inglés' },
  { code: 'es', name: 'Español', nameFr: 'Espagnol', nameEn: 'Spanish' },
];
