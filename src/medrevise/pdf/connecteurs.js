/* ============================================================
   MedRevise — CONNECTEURS D'UNE BOÎTE (20/10, docs/compte-rendu-pdfreader-v3.md).

   Une boîte a une LISTE de connecteurs (0 à n) : des flèches, toutes du même type, toutes
   sélectionnables et supprimables, la première comprise. Une boîte sans flèche est valide.

   Stockage historique (inchangé, rien n'est réécrit à la lecture) :
   - la flèche « principale » d'avant le 20/10 : `ancre` {x, y, texte} + `fleche: true`
     (+ `surlignageId` / `formeId` quand elle relie un surlignage ou une forme) ;
   - les flèches « supplémentaires » : `fleches` [{ id, x, y, texte, surlignageId?, formeId? }].
   CONVERSION À LA LECTURE (`connecteursDe`) : la principale devient le premier connecteur de la
   liste, les autres suivent. Pure et idempotente — lire deux fois donne la même liste, et une boîte
   qu'on ne touche pas garde exactement ses champs (donc son rendu). Les écritures vont au champ
   d'origine du connecteur visé (`patch…`) : retirer la principale efface `ancre`/`fleche`, retirer
   une autre filtre `fleches`, et toute nouvelle flèche s'ajoute à `fleches`.
   Une `ancre` SANS `fleche` (boîte seulement épinglée, avant le 20/10) n'est pas un connecteur :
   son repère rond reste affiché comme avant (`epingleSeule`) et se retire par sa croix.
   (20/10 soir) STYLE d'une flèche (dure / souple, points de contrôle, pointes, trait, épaisseur, couleur —
   pdf/flechesGeo.js) : sur l'entrée de `fleches`, ou dans `flechePrincipale` pour la principale ; absent =
   rendu d'avant à l'identique.
   ============================================================ */
import { GEO_CLASSIQUE, GEO_HARMONISE } from './flechesGeo.js';

export const ID_PRINCIPALE = 'principale';

const pointValide = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const idDe = (fl, i) => fl.id || `fl#${i}`;

/** la liste des connecteurs d'une boîte, dans l'ordre (principale d'abord) */
export function connecteursDe(boite) {
  if (!boite) return [];
  const out = [];
  if (boite.fleche && pointValide(boite.ancre)) {
    out.push({ ...(boite.flechePrincipale || {}), id: ID_PRINCIPALE, x: boite.ancre.x, y: boite.ancre.y, texte: boite.ancre.texte || null,
      surlignageId: boite.surlignageId || null, formeId: boite.formeId || null, principale: true });
  }
  (boite.fleches || []).forEach((fl, i) => { if (pointValide(fl)) out.push({ ...fl, id: idDe(fl, i), principale: false }); });
  return out;
}

/** boîte épinglée sans flèche (ancien modèle) : un repère rond, sans trait */
export const epingleSeule = (boite) => !!boite && !boite.fleche && pointValide(boite.ancre);

/** retire UN connecteur (n'importe lequel, la principale comprise) */
export function patchRetirer(boite, id) {
  if (id === ID_PRINCIPALE) return { ancre: null, fleche: false, surlignageId: null, formeId: null, ...(boite.flechePrincipale ? { flechePrincipale: null } : {}) };
  return { fleches: (boite.fleches || []).filter((fl, i) => idDe(fl, i) !== id) };
}
/** change le STYLE d'un connecteur (type, points, pointes, trait, epaisseur, couleur — fusionné). (21/10) Une flèche
    modifiée prend les proportions de pointe « classiques », celles de toutes les autres (flechesGeo.js#geoPointe). */
export function patchStyle(boite, id, style) {
  // une flèche harmonisée (21/10) le reste ; une flèche d'avant modifiée prend les proportions classiques
  const actuel = id === ID_PRINCIPALE ? boite.flechePrincipale : (boite.fleches || []).find((fl, i) => idDe(fl, i) === id);
  const s = { ...style, geo: actuel && actuel.geo === GEO_HARMONISE ? GEO_HARMONISE : GEO_CLASSIQUE };
  if (id === ID_PRINCIPALE) return { flechePrincipale: { ...(boite.flechePrincipale || {}), ...s } };
  return { fleches: (boite.fleches || []).map((fl, i) => (idDe(fl, i) === id ? { ...fl, ...s } : fl)) };
}

/** ajoute un connecteur vers `cible` ({ x, y, texte, surlignageId?, formeId?, boiteCible? }) — la 1re comme les
    suivantes ; (21/10) une nouvelle flèche a le dessin harmonisé (`geo: 3`, flechesGeo.js#geoPointe) */
export function patchAjouter(boite, cible) {
  const id = 'fl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { fleches: [...(boite.fleches || []), { id, geo: GEO_HARMONISE, ...cible }] };
}
/** un connecteur, tel que stocké (pour le recopier sur une autre boîte) */
export function connecteurStocke(boite, id) {
  if (id === ID_PRINCIPALE) return boite.fleche && pointValide(boite.ancre) ? { ...(boite.flechePrincipale || {}), x: boite.ancre.x, y: boite.ancre.y, texte: boite.ancre.texte || null } : null;
  const fl = (boite.fleches || []).find((f, i) => idDe(f, i) === id);
  return fl ? { ...fl } : null;
}
/** (21/10) déplace TOUTE la flèche de (dx, dy) (fractions de page) : ses points de contrôle et son bout — sauf un bout
    rattaché à une boîte, qui reste accroché ; le départ, sur la boîte source, ne bouge jamais */
export function patchTranslater(boite, id, dx, dy) {
  const xy = (p) => ({ x: +Math.max(0, Math.min(1, p.x + dx)).toFixed(5), y: +Math.max(0, Math.min(1, p.y + dy)).toFixed(5) });
  const t = (p) => ({ ...p, ...xy(p) });
  // le bout : ses seules coordonnées (recopier la flèche entière écraserait les points déjà déplacés)
  const appliquer = (fl, bout) => ({ ...fl, ...(Array.isArray(fl.points) && fl.points.length ? { points: fl.points.map(t) } : {}), ...(bout && !fl.boiteCible ? xy(bout) : {}) });
  if (id === ID_PRINCIPALE) {
    const fp = appliquer(boite.flechePrincipale || {}, null);
    const ancre = boite.flechePrincipale && boite.flechePrincipale.boiteCible ? boite.ancre : { ...boite.ancre, ...t(boite.ancre) };
    return { flechePrincipale: fp, ancre, surlignageId: null, formeId: null };
  }
  return { fleches: (boite.fleches || []).map((fl, i) => { if (idDe(fl, i) !== id) return fl; const { surlignageId, formeId, ...reste } = appliquer(fl, fl); return reste; }) };
}
/** (21/10) le bout d'un connecteur rattaché à une boîte (`boiteId`) ou détaché (null, au point `point`) */
export function patchRattacher(boite, id, boiteId, point) {
  if (id === ID_PRINCIPALE) return { ancre: { x: point.x, y: point.y, texte: point.texte || null }, surlignageId: null, formeId: null, flechePrincipale: { ...(boite.flechePrincipale || {}), boiteCible: boiteId || null } };
  return { fleches: (boite.fleches || []).map((fl, i) => { if (idDe(fl, i) !== id) return fl; const { surlignageId, formeId, ...reste } = fl; return { ...reste, id: fl.id || id, x: point.x, y: point.y, texte: point.texte || null, boiteCible: boiteId || null }; }) };
}

/** déplace le bout d'un connecteur : déplacé à la main, il n'est plus lié à un surlignage ou une forme */
export function patchDeplacer(boite, id, point) {
  if (id === ID_PRINCIPALE) return { ancre: { x: point.x, y: point.y, texte: point.texte || null }, surlignageId: null, formeId: null };
  // le style de la flèche (points de contrôle, pointes…) est gardé ; seul le lien au surlignage / à la forme part
  return { fleches: (boite.fleches || []).map((fl, i) => { if (idDe(fl, i) !== id) return fl; const { surlignageId, formeId, ...reste } = fl; return { ...reste, id: fl.id || id, x: point.x, y: point.y, texte: point.texte || null }; }) };
}
