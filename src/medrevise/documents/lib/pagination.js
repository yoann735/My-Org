/* ============================================================
   MedRevise — PAGINATION DU DOCUMENT (cœur pur, sans DOM) — 08/10,
   docs/compte-rendu-document-engine.md.

   Le document est UN flux de blocs (paragraphes, titres, listes, tableaux, images,
   séparateurs, sauts de page). Les pages ne sont PAS des conteneurs : elles sont
   CALCULÉES ici, à partir des hauteurs mesurées sur le vrai rendu.

   Entrée :
     blocs : [{ h, type, garderAvecSuivant?, saut?, coupes?: [{ y, pos }] }]
       h      hauteur NATURELLE du bloc (unités de page, sans espaceur)
       coupes endroits où l'on peut couper le bloc (début d'une ligne, d'un élément de
              liste…) : y = décalage depuis le haut du bloc, pos = position ProseMirror
              où poser l'espaceur. Ordre croissant, sans la coupe 0.
       saut   saut de page : tout ce qui suit commence sur la page suivante
     geo   : { haut(k), zone } — haut(k) = y du haut de la zone d'écriture de la page k
             dans le repère du flux ; zone = hauteur utile d'une page
   Sortie : { espaceurs: [{ bloc, pos|null, h }], pages: [page de début de chaque bloc],
              nbPages }
     espaceur avant le bloc (pos null) ou à l'intérieur (pos = coupe) ; h = hauteur.

   RÈGLES (non négociables, comme un traitement de texte) :
   - un bloc qui ne tient pas dans l'espace restant passe ENTIER à la page suivante ;
   - un bloc coupable (paragraphe, liste…) se coupe entre deux lignes / éléments, avec
     au moins 2 lignes de chaque côté (veuves / orphelines) quand il en a 4 ou plus ;
   - « garder avec le suivant » (titres) : le titre passe à la page suivante si le début
     du bloc suivant n'y tient pas avec lui ;
   - rien n'est jamais coupé par le bas d'une page : un bloc insécable plus haut qu'une
     page (rare : grand tableau) commence en haut d'une page — les images, elles, sont
     déjà réduites à la hauteur utile par leur vue.
   Déterministe : mêmes hauteurs → mêmes pages.

   INCRÉMENTAL : `depuis = { bloc, page, espaceurs, pages }` reprend le calcul au bloc
   `bloc`, qui commence en HAUT de la page `page` (il y a été renvoyé) : tout ce qui précède
   est inchangé, ses espaceurs et ses pages sont repris tels quels.
   ============================================================ */
const EPS = 0.5;
const MIN_LIGNES = 2;

export function paginer(blocs, geo, depuis = null) {
  const { haut, zone } = geo;
  const espaceurs = depuis ? depuis.espaceurs.filter((e) => e.bloc < depuis.bloc || (e.bloc === depuis.bloc && e.pos === null)) : [];
  const pages = depuis ? depuis.pages.slice(0, depuis.bloc) : [];
  let page = depuis ? depuis.page : 0;
  let y = haut(page);
  const bas = () => haut(page) + zone;
  const enHaut = () => Math.abs(y - haut(page)) < EPS;
  const pageSuivante = (bloc, pos = null) => {
    const cible = haut(page + 1);
    espaceurs.push({ bloc, pos, h: Math.max(0, cible - y) });
    page += 1;
    y = cible;
  };
  // hauteur du « début » d'un bloc (pour garder un titre avec lui) : 2 lignes, ou tout
  const debut = (b) => {
    if (!b) return 0;
    if (b.coupes && b.coupes.length >= 2 * MIN_LIGNES - 1) return b.coupes[MIN_LIGNES - 1].y;
    return b.h;
  };

  for (let i = depuis ? depuis.bloc : 0; i < blocs.length; i++) {
    const b = blocs[i];
    if (b.saut) {
      pages[i] = page;
      y += b.h;
      pageSuivante(i + 1);
      continue;
    }
    // garder avec le suivant
    if (b.garderAvecSuivant && !enHaut() && i + 1 < blocs.length && !blocs[i + 1].saut) {
      const besoin = b.h + Math.min(debut(blocs[i + 1]), zone - b.h);
      if (y + besoin > bas() + EPS) pageSuivante(i);
    }
    if (y + b.h <= bas() + EPS) { pages[i] = page; y += b.h; continue; }
    const coupes = b.coupes || [];
    if (!coupes.length) { // insécable : entier à la page suivante
      if (!enHaut()) pageSuivante(i);
      pages[i] = page;
      y += b.h;
      continue;
    }
    // coupable : on remplit page après page
    pages[i] = page;
    let depart = 0; // y (dans le bloc) du début de la partie restante
    const lignes = [0, ...coupes.map((c) => c.y), b.h]; // bornes des lignes / éléments
    const nLignes = lignes.length - 1;
    let premiere = 0; // index de la première ligne de la partie restante
    for (;;) {
      const reste = b.h - depart;
      if (y + reste <= bas() + EPS) { y += reste; break; }
      // combien de lignes tiennent sur cette page ?
      let k = premiere;
      while (k < nLignes && y + (lignes[k + 1] - depart) <= bas() + EPS) k += 1;
      let n = k - premiere; // lignes qui tiennent
      const apres = nLignes - k; // lignes renvoyées
      const regle = nLignes >= 2 * MIN_LIGNES;
      if (regle && apres > 0 && apres < MIN_LIGNES) n -= (MIN_LIGNES - apres); // veuve : on renvoie de quoi en avoir 2
      if (regle && n > 0 && n < MIN_LIGNES && premiere === 0) n = 0; // orpheline : 1 seule ligne en bas, non
      if (n <= 0) {
        if (enHaut()) n = Math.max(1, k - premiere); // déjà en haut : il faut bien couper quelque part
        else { // rien ne tient : la partie restante commence à la page suivante
          if (premiere === 0) { pageSuivante(i); pages[i] = page; continue; }
          pageSuivante(i, coupes[premiere - 1].pos);
          continue;
        }
      }
      const coupe = premiere + n; // la ligne d'index `coupe` commence la page suivante
      if (coupe >= nLignes) { y += reste; break; }
      y += lignes[coupe] - depart;
      pageSuivante(i, coupes[coupe - 1].pos);
      depart = lignes[coupe];
      premiere = coupe;
    }
  }
  return { espaceurs, pages, nbPages: page + 1 };
}

/** point de reprise pour un changement au bloc `i` : le dernier bloc renvoyé en haut d'une
    page AVANT la page de `i` (tout ce qui le précède est inchangé), ou null (tout refaire). */
export function pointDeReprise(prec, i) {
  if (!prec || i <= 0) return null;
  const pageI = prec.pages[Math.min(i, prec.pages.length - 1)];
  let meilleur = null;
  for (const e of prec.espaceurs) {
    if (e.pos !== null || e.bloc >= i || e.bloc <= 0) continue;
    const p = prec.pages[e.bloc];
    if (p != null && p < pageI && (!meilleur || e.bloc > meilleur.bloc)) meilleur = { bloc: e.bloc, page: p };
  }
  return meilleur ? { ...meilleur, espaceurs: prec.espaceurs, pages: prec.pages } : null;
}
