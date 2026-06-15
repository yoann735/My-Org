import { useState, useEffect } from 'react';

/** subscribe to a CSS media query */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** the single mobile breakpoint used across the app (matches design.css) */
export const useIsMobile = () => useMediaQuery('(max-width: 760px)');
