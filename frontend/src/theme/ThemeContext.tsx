import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// iOS-inspired soft dark palette
export type ThemeMode = 'auto' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  // Surfaces
  bg: string;              // App background
  card: string;            // Card / elevated surface
  cardAlt: string;         // Alternative card bg (for nested)
  input: string;           // Input field background
  modalBg: string;         // Modal overlay/sheet bg
  scrim: string;           // Semi-transparent overlay

  // Text
  text: string;            // Primary text
  textMuted: string;       // Secondary / placeholder
  textSubtle: string;      // Tertiary / hint
  textInverse: string;     // White on dark surfaces

  // Borders / dividers
  border: string;
  borderSubtle: string;

  // Brand (stays consistent across themes)
  primary: string;         // Teal 0891B2
  primaryHover: string;
  primarySoft: string;     // Tinted background for primary
  primarySoftText: string;

  // Status
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;

  // Special
  accent: string;          // Purple for campaigns
  accentSoft: string;
  shadow: string;
}

const light: ThemeColors = {
  bg: '#FAFAFA',
  card: '#FFFFFF',
  cardAlt: '#F9FAFB',
  input: '#FFFFFF',
  modalBg: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.45)',

  text: '#111827',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  textInverse: '#FFFFFF',

  border: '#E5E7EB',
  borderSubtle: '#F3F4F6',

  primary: '#0891B2',
  primaryHover: '#0E7490',
  primarySoft: '#ECFDF5',
  primarySoftText: '#0891B2',

  success: '#10B981',
  successSoft: '#D1FAE5',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  danger: '#EF4444',
  dangerSoft: '#FEE2E2',
  info: '#3B82F6',
  infoSoft: '#DBEAFE',

  accent: '#7C3AED',
  accentSoft: '#F5F3FF',
  shadow: 'rgba(0,0,0,0.08)',
};

// iOS-inspired soft dark (not pure black — feels premium, easier on eyes)
const dark: ThemeColors = {
  bg: '#000000',           // iOS uses pure black at the base
  card: '#1C1C1E',         // iOS systemGray6 dark equivalent
  cardAlt: '#2C2C2E',      // iOS systemGray5 dark
  input: '#2C2C2E',
  modalBg: '#1C1C1E',
  scrim: 'rgba(0,0,0,0.7)',

  text: '#F5F5F7',
  textMuted: '#9CA3AF',
  textSubtle: '#6B7280',
  textInverse: '#FFFFFF',

  border: '#38383A',
  borderSubtle: '#2C2C2E',

  primary: '#22D3EE',       // Brighter cyan pops on dark
  primaryHover: '#06B6D4',
  primarySoft: 'rgba(34,211,238,0.12)',
  primarySoftText: '#67E8F9',

  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.14)',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.14)',
  info: '#60A5FA',
  infoSoft: 'rgba(96,165,250,0.14)',

  accent: '#A78BFA',
  accentSoft: 'rgba(167,139,250,0.14)',
  shadow: 'rgba(0,0,0,0.4)',
};

const THEMES = { light, dark };
const STORAGE_KEY = '@crystaltask:theme_mode';

interface ThemeCtx {
  mode: ThemeMode;            // User preference (auto/light/dark)
  scheme: ColorScheme;        // Actual applied scheme (light or dark)
  colors: ThemeColors;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  mode: 'auto',
  scheme: 'light',
  colors: light,
  isDark: false,
  setMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme() as ColorScheme | null;
  // On web, read synchronously from localStorage to avoid flash of wrong theme
  const initialMode: ThemeMode = (() => {
    if (Platform.OS === 'web') {
      try {
        const v = typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem(STORAGE_KEY)
          : null;
        if (v === 'auto' || v === 'light' || v === 'dark') return v;
      } catch {}
    }
    return 'auto';
  })();
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  // On native, hydrate from AsyncStorage async
  useEffect(() => {
    if (Platform.OS === 'web') return; // already hydrated synchronously
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (v === 'auto' || v === 'light' || v === 'dark') {
          setModeState(v);
        }
      } catch {}
    })();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
    if (Platform.OS === 'web') {
      try { window.localStorage.setItem(STORAGE_KEY, m); } catch {}
    }
  }, []);

  const scheme: ColorScheme = useMemo(() => {
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    return (systemScheme === 'dark' ? 'dark' : 'light');
  }, [mode, systemScheme]);

  const colors = THEMES[scheme];
  const value: ThemeCtx = { mode, scheme, colors, isDark: scheme === 'dark', setMode };

  // Avoid flash on mount — render children anyway but with stored mode asap
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
