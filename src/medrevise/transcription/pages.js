/* ============================================================
   MedRevise — TRANSCRIPT ↔ PAGES DU COURS (20/10, docs/compte-rendu-pdfreader-v3.md).

   Chaque segment validé porte la page affichée à ce moment (engine.js#definirPageCourante) :
   `page` (n° de la page dans le lecteur), `pageCle` (sa clé : n° du PDF, ou id d'une page ajoutée)
   et `doc` ('original' | 'fiche' jumelle). Les sessions d'avant n'ont rien : elles s'affichent
   comme avant, sans numéro.

   SESSION DE RÉFÉRENCE des badges du lecteur (« 12 lignes » en haut d'une page) : la session en
   direct sur ce cours, sinon la plus récente qui porte des numéros de page. Le clic sur un badge
   ouvre CETTE session, filtrée sur la page.
   ============================================================ */
import { useEffect, useReducer } from 'react';
import { useTranscription } from './useTranscription.js';
import { sessionActive } from './engine.js';
import { sessionsDuCours } from './sessions.js';

export const aUnePage = (l) => !!l && Number.isFinite(l.page);
export const docDe = (l) => (l && l.doc) || 'original';
/** la ligne (segment ou note) est-elle sur cette page de ce document ? */
export const surPage = (l, page, doc) => aUnePage(l) && l.page === page && docDe(l) === (doc || 'original');
export const sessionAvecPages = (s) => !!s && (s.segments || []).some(aUnePage);

/* sessions passées par cours, relues à l'ouverture et à la fin de chaque session */
const cache = new Map(); // courseId → sessions (récentes d'abord)
const abonnes = new Set();
async function charger(courseId) {
  try { cache.set(courseId, await sessionsDuCours(courseId)); } catch (e) { cache.set(courseId, []); }
  abonnes.forEach((f) => f());
}
export const rafraichirSessionsPages = (courseId) => charger(courseId);

/** { session, live } : la session de référence des badges de ce cours (ou null) */
export function useSessionReference(courseId) {
  const e = useTranscription();
  const [, forcer] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    abonnes.add(forcer);
    if (!cache.has(courseId)) charger(courseId);
    return () => { abonnes.delete(forcer); };
  }, [courseId]);
  useEffect(() => { if (e.phase === 'idle' && e.derniereFinie && e.courseId === courseId) charger(courseId); }, [e.phase, e.derniereFinie, e.courseId, courseId]);
  const live = sessionActive() && e.courseId === courseId && e.session ? e.session : null;
  if (live) return { session: live, live: true };
  return { session: (cache.get(courseId) || []).find((s) => s.endedAt && sessionAvecPages(s)) || null, live: false };
}

/** nombre de lignes du transcript (session de référence) sur cette page */
export function compterLignes(session, page, doc) {
  if (!session) return 0;
  let n = 0;
  for (const s of session.segments || []) if (s.status !== 'gap' && surPage(s, page, doc)) n += 1;
  return n;
}
