/* ============================================================
   Shared theme — used by the hub and both apps so the theme and
   accent are consistent across the whole "univers" and persist
   (localStorage keys kept as `mw.*` for backward compatibility).
   themeMode: 'system' (follow OS) | 'light' | 'dark'.
   ============================================================ */
import { useEffect, useState } from 'react';
import { usePersistentState } from './hooks/usePersistentState.js';
import { ACCENTS } from './constants.js';

export function useSharedTheme() {
  const [themeMode, setThemeMode] = usePersistentState('mw.themeMode', 'system');
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );
  const [accent, setAccent] = usePersistentState('mw.accent', ACCENTS[0].v);

  const dark = themeMode === 'system' ? systemDark : themeMode === 'dark';
  const theme = dark ? 'dark' : 'light';

  // keep "system" mode in sync with the OS preference (e.g. phone day/night)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.style.setProperty('--accent', accent); }, [accent]);

  // migrate a legacy (non-pastel) saved accent to the current pastel palette
  useEffect(() => {
    if (!ACCENTS.some((a) => a.v === accent)) setAccent(ACCENTS[0].v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    theme, dark,
    themeMode, setThemeMode,
    toggleTheme: () => setThemeMode(dark ? 'light' : 'dark'),
    accent, setAccent,
    resetTheme: () => { setThemeMode('system'); setAccent(ACCENTS[0].v); },
  };
}
