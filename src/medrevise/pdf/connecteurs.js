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
   ============================================================ */
export const ID_PRINCIPALE = 'principale';

const pointValide = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const idDe = (fl, i) => fl.id || `fl#${i}`;

/** la liste des connecteurs d'une boîte, dans l'ordre (principale d'abord) */
export function connecteursDe(boite) {
  if (!boite) return [];
  const out = [];
  if (boite.fleche && pointValide(boite.ancre)) {
    out.push({ id: ID_PRINCIPALE, x: boite.ancre.x, y: boite.ancre.y, texte: boite.ancre.texte || null,
      surlignageId: boite.surlignageId || null, formeId: boite.formeId || null, principale: true });
  }
  (boite.fleches || []).forEach((fl, i) => { if (pointValide(fl)) out.push({ ...fl, id: idDe(fl, i), principale: false }); });
  return out;
}

/** boîte épinglée sans flèche (ancien modèle) : un repère rond, sans trait */
export const epingleSeule = (boite) => !!boite && !boite.fleche && pointValide(boite.ancre);

/** retire UN connecteur (n'importe lequel, la principale comprise) */
export function patchRetirer(boite, id) {
  if (id === ID_PRINCIPALE) return { ancre: null, fleche: false, surlignageId: null, formeId: null };
  return { fleches: (boite.fleches || []).filter((fl, i) => idDe(fl, i) !== id) };
}

/** ajoute un connecteur vers `cible` ({ x, y, texte, surlignageId?, formeId? }) — la 1re comme les suivantes */
export function patchAjouter(boite, cible) {
  const id = 'fl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { fleches: [...(boite.fleches || []), { id, ...cible }] };
}

/** déplace le bout d'un connecteur : déplacé à la main, il n'est plus lié à un surlignage ou une forme */
export function patchDeplacer(boite, id, point) {
  if (id === ID_PRINCIPALE) return { ancre: { x: point.x, y: point.y, texte: point.texte || null }, surlignageId: null, formeId: null };
  return { fleches: (boite.fleches || []).map((fl, i) => (idDe(fl, i) === id ? { id: fl.id || id, x: point.x, y: point.y, texte: point.texte || null } : fl)) };
}
