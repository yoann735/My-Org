/* ============================================================
   MedRevise — TABLEAU (Miro) D'UNE FICHE : le modèle (22/10, docs/compte-rendu-tableau-flashcards.md §1).

   UN enregistrement par fiche, store `board` (synchronisé, type additionnel) :
     { id: 'board:' + ficheId, ficheId, kind: 'board', v: 1,
       objects: [ carte | image ], edges: [ flèche ], viewport: { x, y, z }, theme: 'sombre' | 'blanc', updatedAt }
   - carte : { id, type: 'carte', x, y, w, h, z, couleur, titre, corps, blobId?, groupe?, source? }
       `source` (carte venue d'une flashcard) : { flashcardId, sorte, muscle?, tableau?, molecule? } — une COPIE prise à
       l'import : modifier le tableau ne modifie jamais la flashcard ; le lien sert à rouvrir la carte d'origine.
   - image : { id, type: 'image', x, y, w, h, z, blobId, groupe? }
   - flèche : le MÊME modèle que les flèches du lecteur (pdf/flechesGeo.js, geo 3) — { id, de, vers?, x, y, points[],
       type, pointes, trait, epaisseur, couleur, geo: 3 } ; coordonnées du MONDE (px au zoom 1), `de` / `vers` : ids de
       cartes (le bout libre est en x, y).
   Coordonnées du monde : px au zoom 1, illimitées.
   L'ANCIEN TABLEAU (store `tableau`, un enregistrement par carte, 04/10) n'est jamais réécrit : à la première
   ouverture d'une fiche sans board, ses cartes et liens sont repris dans un board neuf (lecture seule de l'ancien).
   ============================================================ */
import { genId, getAll, getOne, put } from './storage.js';
import { GEO_HARMONISE } from '../pdf/flechesGeo.js';
import { estMuscle } from './muscle.js';
import { estTableau } from './carteTableau.js';
import { estMolecule } from '../molecule/carte.js';

export const idBoard = (ficheId) => 'board:' + ficheId;
export const CARTE_BOARD = { w: 240, h: 120, min: { w: 120, h: 56 } };
export const ZOOM_BOARD = { min: 0.15, max: 3 };

export function boardVide(ficheId) {
  return { id: idBoard(ficheId), ficheId, kind: 'board', v: 1, objects: [], edges: [], viewport: { x: 80, y: 80, z: 1 }, theme: 'sombre' };
}
export function nouvelleCarte({ x, y, w, h, titre = '', corps = '', couleur = 'jaune-franc', z = 0, ...rest }) {
  return { id: genId('bc'), type: 'carte', x: Math.round(x), y: Math.round(y), w: Math.round(w || CARTE_BOARD.w), h: Math.round(h || CARTE_BOARD.h), z, couleur, titre, corps, ...rest };
}
export function nouvelleImage({ x, y, w, h, blobId, z = 0 }) {
  return { id: genId('bi'), type: 'image', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, blobId };
}
/** une flèche (modèle unique du lecteur) partant de la carte `de` ; arrivée sur la carte `vers` ou au point x, y */
export function nouvelleFleche({ de, vers = null, x = 0, y = 0, couleur = null }) {
  return { id: genId('bf'), de, vers, x: Math.round(x), y: Math.round(y), points: [], type: 'dure', geo: GEO_HARMONISE, ...(couleur ? { couleur } : {}) };
}

/** le board d'une fiche ; sans board, un neuf, repris de l'ancien tableau s'il y en a un (rien n'est réécrit) */
export async function lireBoard(ficheId) {
  const r = await getOne('board', idBoard(ficheId));
  if (r) return r;
  const anciens = ((await getAll('tableau')) || []).filter((e) => e && e.ficheId === ficheId);
  const b = boardVide(ficheId);
  if (!anciens.length) return b;
  for (const c of anciens.filter((e) => e.type === 'carte')) {
    b.objects.push({ id: c.id, type: 'carte', x: c.x, y: c.y, w: c.w, h: c.h, z: c.z || 0, couleur: c.couleur || 'jaune', titre: '', corps: c.texte || '', depuis: 'tableau-v1' });
  }
  for (const l of anciens.filter((e) => e.type === 'lien')) {
    if (!l.de || !l.vers) continue;
    b.edges.push({ id: l.id, de: l.de.id, vers: l.vers.id, x: 0, y: 0, points: [], type: l.style === 'courbe' ? 'souple' : 'dure', geo: GEO_HARMONISE,
      pointes: { debut: l.tete === 'deux' ? 'pleine' : 'aucune', fin: l.tete === 'aucune' ? 'aucune' : 'pleine' } });
  }
  b.repris = anciens.length;
  return b;
}
export const ecrireBoard = (b) => put('board', { ...b, kind: 'board', v: 1 });

/* ---- flashcard → carte du tableau (copie indépendante, lien vers l'origine) ---- */
export const sorteFlashcard = (q) => (estMuscle(q) ? 'muscle' : estTableau(q) ? 'tableau' : estMolecule(q) ? 'molecule' : q && q.imageId ? 'image' : 'texte');
const sansTrous = (t) => String(t || '').replace(/\{\{([^{}]+)\}\}/g, '$1');
export function carteDepuisFlashcard(q, { x, y, couleur = 'jaune-franc', z = 0 }) {
  const sorte = sorteFlashcard(q);
  const base = { x, y, z, couleur, titre: sansTrous(q.recto).slice(0, 300), corps: String(q.verso || ''), source: { flashcardId: q.id, sorte } };
  if (sorte === 'muscle') return nouvelleCarte({ ...base, w: 300, h: 230, titre: (q.muscle && q.muscle.nom) || base.titre, corps: '', source: { ...base.source, muscle: JSON.parse(JSON.stringify(q.muscle)) } });
  if (sorte === 'tableau') return nouvelleCarte({ ...base, w: 320, h: 70 + 28 * Math.min(8, (q.tableau.lignes || []).length), corps: '', source: { ...base.source, tableau: JSON.parse(JSON.stringify(q.tableau)) } });
  if (sorte === 'molecule') return nouvelleCarte({ ...base, w: 240, h: 220, titre: (q.molecule && q.molecule.nom) || base.titre, corps: '', source: { ...base.source, molecule: { ...q.molecule } } });
  if (sorte === 'image') return nouvelleCarte({ ...base, w: 260, h: 220, blobId: q.imageId });
  return nouvelleCarte(base);
}
/** cartes posées en grille à partir du point x, y (monde) */
export function grilleDeCartes(questions, { x, y, colonnes = 3, ecart = 28, z = 0 }) {
  const out = [];
  let cx = x, cy = y, hLigne = 0;
  questions.forEach((q, i) => {
    if (i && i % colonnes === 0) { cx = x; cy += hLigne + ecart; hLigne = 0; }
    const c = carteDepuisFlashcard(q, { x: cx, y: cy, z: z + i + 1 });
    out.push(c);
    cx += c.w + ecart; hLigne = Math.max(hLigne, c.h);
  });
  return out;
}

/** une carte ajoutée au tableau d'une fiche sans l'ouvrir (sélection de texte du PDF, tableau masqué) */
export async function ajouterCarteAuBoard(ficheId, { titre = '', corps = '' }) {
  const b = await lireBoard(ficheId);
  const v = b.viewport || { x: 80, y: 80, z: 1 };
  const k = (b.objects.length % 6) * 26;
  const z = b.objects.reduce((m, o) => Math.max(m, o.z || 0), 0) + 1;
  const c = nouvelleCarte({ x: (400 - v.x) / v.z + k, y: (240 - v.y) / v.z + k, titre, corps, z });
  await ecrireBoard({ ...b, objects: [...b.objects, c] });
  return c;
}
