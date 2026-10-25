/* ============================================================
   MedRevise — TAGS « DÉBUT DE COURS » / « FIN DE COURS » SUR LES PAGES (25/10/2026,
   docs/compte-rendu-apprentissage-v2-recherche-tags.md). Fonctions pures (tests/tags/tagsPages.test.js) + lecture /
   écriture du type synchronisé `page_tag` (lib/storage.js).
   Un tag : { id, courseId, document: 'original' | 'fiche', page (n° affiché), pageCle (clé stable de la page : n° du PDF,
   ou id d'une page ajoutée / d'une page de document), kind: 'debut' | 'fin', date: 'AAAA-MM-JJ',
   transcriptSessionId: id d'une session de transcript | null }.
   Au plus UN tag de chaque sorte par page. Retirer = marquer `supprime: true` (jamais d'effacement, rien de destructif au
   cloud). Une SÉANCE = un début suivi de la fin la plus proche (même document, page ≥ début, avant le début suivant) ;
   les pages entre les deux reçoivent un liseré.
   ============================================================ */
import { useEffect, useState } from 'react';
import { getAll, put, genId } from './storage.js';

export const STORE = 'page_tag';
export const SORTES = { debut: { libelle: 'Début', menu: 'Marquer début de cours', symbole: '▶' }, fin: { libelle: 'Fin', menu: 'Marquer fin de cours', symbole: '■' } };

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 22 oct. » depuis 'AAAA-MM-JJ' */
export function dateCourte(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${+m[3]} ${MOIS[+m[2] - 1]}` : '';
}
/** aujourd'hui en 'AAAA-MM-JJ' (heure locale) */
export function aujourdhui(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** « ▶ Début · 22 oct. » */
export const libelleTag = (t) => `${SORTES[t.kind].symbole} ${SORTES[t.kind].libelle} · ${dateCourte(t.date)}`;

export const tagValide = (t) => !!t && !t.supprime && (t.kind === 'debut' || t.kind === 'fin') && Number.isFinite(+t.page);

/** tags vivants d'un cours (et d'un document), triés par page */
export function tagsDe(tous, courseId, document = null) {
  return (tous || []).filter((t) => tagValide(t) && t.courseId === courseId && (!document || (t.document || 'original') === document))
    .sort((a, b) => (+a.page - +b.page) || (a.kind === 'debut' ? -1 : 1));
}

/** page (n° affiché) d'un tag : sa clé stable si elle existe encore (pages ajoutées / déplacées), sinon son n° */
export function pageDuTag(t, pageSizes = null) {
  if (pageSizes && t.pageCle != null) { const i = pageSizes.findIndex((s) => String(s.cle) === String(t.pageCle)); if (i >= 0) return i + 1; }
  return +t.page;
}

/**
 * Séances d'un document : [{ debut, fin|null, date, de, a, transcriptSessionId }] — `de`…`a` = pages (n° affichés).
 * Un début sans fin reste une séance ouverte (a = null) ; une fin sans début est ignorée.
 */
export function seances(tags, pageSizes = null) {
  const l = [...(tags || [])].filter(tagValide).map((t) => ({ t, p: pageDuTag(t, pageSizes) })).sort((x, y) => (x.p - y.p) || (x.t.kind === 'debut' ? -1 : 1));
  const out = [];
  for (let i = 0; i < l.length; i++) {
    if (l[i].t.kind !== 'debut') continue;
    let fin = null;
    for (let k = i + 1; k < l.length; k++) {
      if (l[k].t.kind === 'debut') break;
      if (l[k].t.kind === 'fin') { fin = l[k]; break; }
    }
    // une fin posée sur la même page que le début compte aussi
    if (!fin) { const memePage = l.find((x) => x.t.kind === 'fin' && x.p === l[i].p); if (memePage) fin = memePage; }
    const d = l[i].t;
    out.push({ debut: d, fin: fin ? fin.t : null, date: d.date, de: l[i].p, a: fin ? fin.p : null, transcriptSessionId: d.transcriptSessionId || (fin && fin.t.transcriptSessionId) || null });
  }
  return out;
}

/** pages (n° affichés) couvertes par une séance complète → Set */
export function pagesEnSeance(listeSeances) {
  const s = new Set();
  for (const x of listeSeances || []) if (x.a != null) for (let p = x.de; p <= x.a; p++) s.add(p);
  return s;
}

/* ---- lecture / écriture ---- */
export const lireTags = async () => (await getAll(STORE)) || [];

/** pose (ou remplace) le tag `kind` de la page ; renvoie l'enregistrement */
export async function poserTag({ courseId, document = 'original', page, pageCle = null, kind, date = aujourdhui(), transcriptSessionId = null }, existants = null) {
  const tous = existants || await lireTags();
  const deja = tous.find((t) => tagValide(t) && t.courseId === courseId && (t.document || 'original') === document && t.kind === kind && (pageCle != null ? String(t.pageCle) === String(pageCle) : +t.page === +page));
  return put(STORE, { ...(deja || { id: genId('pt'), courseId, document, kind }), page: +page, pageCle: pageCle != null ? String(pageCle) : null, date, transcriptSessionId: transcriptSessionId || null });
}
export const modifierTag = (t, patch) => put(STORE, { ...t, ...patch });
/** retirer = marquer (aucune suppression ne part au cloud) */
export const retirerTag = (t) => put(STORE, { ...t, supprime: true });

/** tags d'un cours, tenus à jour (écriture locale, synchro d'un autre appareil) */
export function useTagsPages(courseId) {
  const [tags, setTags] = useState([]);
  useEffect(() => {
    if (!courseId) { setTags([]); return undefined; }
    let vivant = true;
    const lire = () => lireTags().then((l) => { if (!vivant) return; const n = tagsDe(l, courseId); setTags((o) => (JSON.stringify(o) === JSON.stringify(n) ? o : n)); }).catch(() => {});
    const ecriture = (e) => { if (!e.detail || e.detail.store === STORE) lire(); };
    lire();
    window.addEventListener('medrevise:ecriture', ecriture);
    window.addEventListener('medrevise:recharge', lire);
    return () => { vivant = false; window.removeEventListener('medrevise:ecriture', ecriture); window.removeEventListener('medrevise:recharge', lire); };
  }, [courseId]);
  return tags;
}
