/* ============================================================
   MedRevise — TABLEAU type Miro : modèle de données (04/10).
   Voir docs/mecanique-miro.md.

   Un enregistrement PAR ÉLÉMENT dans le store `tableau` (synchronisé) :
     carte : { id, ficheId, type:'carte', x, y, w, h, texte, couleur, z }
     lien  : { id, ficheId, type:'lien', de:{id,cote}, vers:{id,cote}, style, tete }
   Coordonnées du MONDE du tableau (px au zoom 1), illimitées. Déplacer une carte
   n'écrit qu'elle : last-write-wins par carte, pas par tableau.
   La caméra et la disposition sont des préférences d'affichage (localStorage).
   ============================================================ */
import { genId, getAll } from './storage.js';

export const CARTE_DEFAUT = { w: 220, h: 96 };
export const CARTE_MIN = { w: 90, h: 44 };
export const COTES = ['n', 'e', 's', 'o'];
export const STYLES_LIEN = [
  { id: 'droite', label: 'Droite' },
  { id: 'coudee', label: 'Coudée' },
  { id: 'courbe', label: 'Courbe' },
];

export function newCarte({ ficheId, x, y, w, h, texte, couleur, z }) {
  return {
    id: genId('tc'), ficheId, type: 'carte',
    x: Math.round(x), y: Math.round(y), w: Math.round(w || CARTE_DEFAUT.w), h: Math.round(h || CARTE_DEFAUT.h),
    texte: texte || '', couleur: couleur || 'jaune', z: Number.isFinite(z) ? z : 0,
    createdAt: new Date().toISOString(),
  };
}

export function newLien({ ficheId, de, vers, style, tete }) {
  return {
    id: genId('tl'), ficheId, type: 'lien',
    de: { id: de.id, cote: de.cote || 'auto' }, vers: { id: vers.id, cote: vers.cote || 'auto' },
    style: style || 'courbe', tete: tete || 'fin',
    createdAt: new Date().toISOString(),
  };
}

/** éléments du tableau d'une fiche (lecture seule) */
export async function elementsDuTableau(ficheId) {
  return ((await getAll('tableau')) || []).filter((e) => e && e.ficheId === ficheId);
}
