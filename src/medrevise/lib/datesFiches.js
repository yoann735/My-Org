/* ============================================================
   MedRevise — DATES D'UNE FICHE pour les tris de la Bibliothèque (15/10,
   docs/compte-rendu-bibliotheque-fichier.md). LECTURE SEULE : rien n'est écrit.

   - DATE D'AJOUT : l'instant de création, lu dans l'identifiant de la fiche
     (genId : préfixe + Date.now() en base 36) — `dateImport` ne garde que le jour,
     et deux fiches importées le même jour doivent rester départagées. Repli sur
     `dateImport` (midi) pour un identifiant qui ne porte pas d'instant.
   - DERNIÈRE MODIFICATION : le plus récent `updatedAt` des enregistrements qui
     appartiennent à la fiche — surlignages et annotations (fiche jumelle comprise :
     espace de noms `<cours>::fiche:<v>`), document et notes (`notes_doc`), texte d'un
     transcript (`docs`), sessions de transcription, fiche jumelle importée, tableau,
     dessins reçus — et la CRÉATION de ses cartes (une révision n'est pas une
     modification). Jamais `fiche.updatedAt` : un glisser-déposer réécrit l'ordre de
     toutes les fiches voisines, qui paraîtraient toutes « modifiées ». La position
     de lecture n'en fait pas partie non plus. Plancher : la date d'ajout.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { getAll } from './storage.js';

/* store → clé de la fiche de l'enregistrement (null = pas une fiche) */
const SOURCES = {
  highlights: (r) => r.ficheId,
  annotations: (r) => r.ficheId,
  notes_doc: (r) => r.id,
  docs: (r) => r.id,
  transcript_session: (r) => (r.kind === 'session' ? r.courseId : null),
  companion_pdf: (r) => r.courseId,
  tableau: (r) => r.ficheId,
  dessins: (r) => r.ficheId,
  questions: (r) => r.ficheId,
};
export const STORES_MODIF = Object.keys(SOURCES);

const MIN = Date.UTC(2020, 0, 1);
const plausible = (t) => Number.isFinite(t) && t > MIN && t < Date.now() + 864e5;
/** instant (ms) porté par un identifiant genId(prefixe) — préfixe + 8 caractères en base 36 —,
 *  ou null. Le préfixe est explicite : l'horodatage commence lui-même par une lettre (« mv9… »). */
export function instantId(id, prefixe) {
  const s = String(id || '');
  if (!s.startsWith(prefixe)) return null;
  const x = s.slice(prefixe.length, prefixe.length + 8);
  if (!/^[0-9a-z]{8}$/.test(x)) return null;
  const t = parseInt(x, 36);
  return plausible(t) ? t : null;
}
const jourMidi = (iso) => (iso ? Date.parse(String(iso).slice(0, 10) + 'T12:00:00') || null : null);

/** date d'ajout (ms) : instant de l'identifiant s'il tombe le jour de `dateImport`, sinon ce jour-là */
export function dateAjout(f) {
  if (!f) return 0;
  const t = instantId(f.id, 'f'), j = jourMidi(f.dateImport);
  if (t && (!j || Math.abs(t - j) < 36 * 3600e3)) return t;
  return j || t || 0;
}

const instantRec = (store, r) => (store === 'questions'
  ? instantId(r.id, 'q') || Date.parse(r.createdAt || '') || 0
  : Date.parse(r.updatedAt || r.createdAt || '') || 0);

/** Map(ficheId → ms) pour UN store */
export function datesDuStore(store, recs) {
  const cle = SOURCES[store], m = new Map();
  for (const r of recs || []) {
    if (!r) continue;
    const k = cle(r);
    if (!k) continue;
    const id = String(k).split('::')[0];
    const t = instantRec(store, r);
    if (t > (m.get(id) || 0)) m.set(id, t);
  }
  return m;
}
/** dernière modification (ms) d'une fiche, plancher = sa date d'ajout */
export const dateModif = (f, parStore) => {
  let t = dateAjout(f);
  for (const m of parStore.values()) { const x = m.get(f.id); if (x > t) t = x; }
  return t;
};

/* Les dates de modification de toutes les fiches, tenues à jour : chaque écriture locale
   (événement 'medrevise:ecriture' de lib/storage.js) relit le seul store touché ; une
   synchro ('medrevise:recharge') relit tout. `actif` = false : rien n'est lu. */
export function useDatesModif(actif) {
  const parStore = useRef(new Map());
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!actif) return undefined;
    let vivant = true;
    const relire = (stores) => Promise.all(stores.map((s) => getAll(s).then((l) => [s, datesDuStore(s, l)]).catch(() => [s, new Map()])))
      .then((paires) => { if (!vivant) return; paires.forEach(([s, m]) => parStore.current.set(s, m)); setVersion((v) => v + 1); });
    relire(STORES_MODIF);
    const enAttente = new Set();
    let minuteur = null;
    const ecriture = (e) => {
      const s = e && e.detail && e.detail.store;
      if (!SOURCES[s]) return;
      enAttente.add(s);
      if (!minuteur) minuteur = setTimeout(() => { minuteur = null; const l = [...enAttente]; enAttente.clear(); relire(l); }, 700);
    };
    const tout = () => relire(STORES_MODIF);
    window.addEventListener('medrevise:ecriture', ecriture);
    window.addEventListener('medrevise:recharge', tout);
    return () => {
      vivant = false; if (minuteur) clearTimeout(minuteur);
      window.removeEventListener('medrevise:ecriture', ecriture);
      window.removeEventListener('medrevise:recharge', tout);
    };
  }, [actif]);
  return { parStore: parStore.current, version };
}

/* ---- libellés ---- */
const MOIS = { day: 'numeric', month: 'short' };
/** « le 12 oct. » (année ajoutée si ce n'est pas l'année en cours) */
export function leJour(ms, maintenant = Date.now()) {
  const d = new Date(ms);
  const opts = d.getFullYear() === new Date(maintenant).getFullYear() ? MOIS : { ...MOIS, year: 'numeric' };
  return 'le ' + d.toLocaleDateString('fr-FR', opts);
}
/** « à l'instant », « il y a 5 min », « il y a 2 h », « hier », « il y a 3 j », puis « le 12 oct. » */
export function ilYa(ms, maintenant = Date.now()) {
  const s = Math.max(0, (maintenant - ms) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86400);
  if (j === 1) return 'hier';
  if (j < 7) return `il y a ${j} j`;
  return leJour(ms, maintenant);
}
