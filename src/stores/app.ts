import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n';
import type { ColorMode, SupportedLocale, ThemeName } from '@/lib/types';

export type AppTheme = Exclude<ThemeName, 'dark'>;

interface AppState {
  sidebarCollapsed: boolean;
  theme: AppTheme;
  locale: SupportedLocale;
  compactMode: boolean;
  colorMode: ColorMode;
  isDark: boolean;
  toggleSidebar: () => void;
  setTheme: (t: ThemeName) => void;
  setColorMode: (m: ColorMode) => void;
  setLocale: (l: SupportedLocale) => void;
  setCompactMode: (enabled: boolean) => void;
  /** 应用启动时同步 DOM（持久化还原后不会触发 setter 副作用） */
  applyToDom: () => void;
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

function computeIsDark(theme: AppTheme, colorMode: ColorMode) {
  return colorMode === 'dark' || (colorMode === 'system' && media.matches);
}

/** 应用主题配色类到 <html>（与深浅色外观正交） */
function applyThemeClass(t: ThemeName) {
  const el = document.documentElement;
  el.classList.remove('theme-blue', 'theme-green', 'theme-purple', 'theme-macos');
  if (t === 'blue' || t === 'green' || t === 'purple' || t === 'macos') {
    el.classList.add(`theme-${t}`);
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      theme: 'light',
      locale: 'zh-CN',
      compactMode: false,
      colorMode: 'system',
      isDark: false,

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setTheme: (t) => {
        // 兼容历史 dark 主题：转为浅色配色 + 夜间外观
        if (t === 'dark') {
          applyThemeClass('light');
          set({ theme: 'light', colorMode: 'dark' });
        } else {
          applyThemeClass(t);
          set({ theme: t });
        }
        set({ isDark: computeIsDark(get().theme, get().colorMode) });
        document.documentElement.classList.toggle('dark', get().isDark);
      },

      setColorMode: (m) => {
        set({ colorMode: m });
        const dark = computeIsDark(get().theme, m);
        set({ isDark: dark });
        document.documentElement.classList.toggle('dark', dark);
      },

      setLocale: (l) => {
        set({ locale: l });
        i18n.changeLanguage(l);
        document.documentElement.lang = l;
      },

      setCompactMode: (enabled) => {
        set({ compactMode: enabled });
        document.documentElement.classList.toggle('compact-mode', enabled);
      },

      applyToDom: () => {
        const s = get();
        applyThemeClass(s.theme);
        document.documentElement.classList.toggle('dark', computeIsDark(s.theme, s.colorMode));
        document.documentElement.classList.toggle('compact-mode', s.compactMode);
        i18n.changeLanguage(s.locale);
        document.documentElement.lang = s.locale;
        set({ isDark: computeIsDark(s.theme, s.colorMode) });
      },
    }),
    {
      name: 'summit-okr-react-app',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
        locale: s.locale,
        compactMode: s.compactMode,
        colorMode: s.colorMode,
      }),
    },
  ),
);

// 系统深浅色变化时实时响应（跟随系统模式）
media.addEventListener('change', () => {
  const s = useAppStore.getState();
  const dark = computeIsDark(s.theme, s.colorMode);
  if (dark !== s.isDark) {
    useAppStore.setState({ isDark: dark });
    document.documentElement.classList.toggle('dark', dark);
  }
});
