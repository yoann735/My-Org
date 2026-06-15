import { useState, useEffect, useRef } from 'react';

/**
 * State persisted to localStorage. All app persistence (checked items,
 * stock, current week, step checkboxes, banned/favorite recipes, theme…)
 * runs through this hook. Fully local — no backend.
 */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch (e) {
      /* corrupt / unavailable storage — fall back to initial */
    }
    return typeof initial === 'function' ? initial() : initial;
  });

  // avoid writing on the very first render if nothing changed
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage full / disabled — ignore */
    }
  }, [key, value]);

  return [value, setValue];
}
