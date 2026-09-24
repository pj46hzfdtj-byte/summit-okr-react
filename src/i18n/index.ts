import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';
import enUS from './locales/en-US';
import jaJP from './locales/ja-JP';
import type { SupportedLocale } from '@/lib/types';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'];

/** 默认语言：localStorage 上次选择 → 浏览器语言探测 → zh-CN */
function getDefaultLocale(): SupportedLocale {
  try {
    const raw = localStorage.getItem('summit-okr-react-app');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.state?.locale && SUPPORTED_LOCALES.includes(parsed.state.locale)) {
        return parsed.state.locale;
      }
    }
  } catch {
    // ignore
  }
  const browserLang = navigator.language;
  if (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-Hant')) return 'zh-TW';
  if (browserLang.startsWith('en')) return 'en-US';
  if (browserLang.startsWith('ja')) return 'ja-JP';
  return 'zh-CN';
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    'en-US': { translation: enUS },
    'ja-JP': { translation: jaJP },
  },
  lng: getDefaultLocale(),
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
});

export default i18n;
