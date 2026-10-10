/* ============================================================
   MedRevise — REPASSER AU SURLIGNEUR SUR DES MOTS D'IMAGE (10/10,
   docs/compte-rendu-images-surlignage-json.md).

   Même règle que sur le texte (pdf/pdfShared.js#planSurlignage), mais sur des INDICES de
   mots OCR (image collée sur un PDF, image d'un document) :
   - même couleur sur des mots tous déjà surlignés de cette couleur → retirés de leur
     surlignage (qui peut être scindé en deux suites de mots) ;
   - sinon les mots choisis prennent la couleur : retirés des surlignages d'une autre
     couleur (une seule couche), fusionnés avec ceux de la même couleur qui les touchent
     ou les jouxtent (indice voisin).
   Fonction pure. `existants` : [{ id, mots: [indices], couleur }].
   @returns { retrait, garder: [{ id, mots }], supprimer: [id], creer: [{ mots, couleur, depuis? }] }
   ============================================================ */

/** suites d'indices consécutifs, dans l'ordre */
export function suites(indices) {
  const tri = [...new Set(indices)].sort((a, b) => a - b);
  const out = [];
  for (const i of tri) {
    const der = out[out.length - 1];
    if (der && i === der[der.length - 1] + 1) der.push(i); else out.push([i]);
  }
  return out;
}

export function planMots(choisis, existants, couleur) {
  const sel = new Set(choisis);
  const liste = (existants || []).filter((h) => h && Array.isArray(h.mots));
  const couleurDe = (h) => h.couleur || 'jaune';
  const touches = liste.filter((h) => h.mots.some((i) => sel.has(i)));
  const pris = new Set(touches.flatMap((h) => h.mots));
  const libres = [...sel].filter((i) => !pris.has(i));
  const retrait = !libres.length && touches.length > 0 && touches.every((h) => couleurDe(h) === couleur);
  const garder = [], supprimer = [], creer = [];
  const rogner = (h) => {
    const morceaux = suites(h.mots.filter((i) => !sel.has(i)));
    if (!morceaux.length) { supprimer.push(h.id); return; }
    garder.push({ id: h.id, mots: morceaux[0] });
    morceaux.slice(1).forEach((m) => creer.push({ mots: m, couleur: couleurDe(h), depuis: h.id }));
  };
  if (retrait) { touches.forEach(rogner); return { retrait, garder, supprimer, creer }; }
  touches.filter((h) => couleurDe(h) !== couleur).forEach(rogner);
  const fusion = touches.filter((h) => couleurDe(h) === couleur);
  const union = new Set([...sel, ...fusion.flatMap((h) => h.mots)]);
  let encore = true;
  while (encore) {
    encore = false;
    for (const h of liste) {
      if (couleurDe(h) !== couleur || fusion.includes(h) || touches.includes(h)) continue;
      if (!h.mots.some((i) => union.has(i - 1) || union.has(i + 1))) continue;
      fusion.push(h); h.mots.forEach((i) => union.add(i)); encore = true;
    }
  }
  const mots = [...union].sort((a, b) => a - b);
  if (fusion.length) {
    fusion.sort((a, b) => Math.min(...a.mots) - Math.min(...b.mots));
    garder.push({ id: fusion[0].id, mots });
    fusion.slice(1).forEach((h) => supprimer.push(h.id));
  } else creer.push({ mots, couleur });
  return { retrait, garder, supprimer, creer };
}

/* ---- ANCRES DE TEXTE { v, start: { item, char }, end } (pdf/pdfShared.js) ---- */
const cmpPos = (a, b) => (a.item - b.item) || (a.char - b.char);

/** [anchor] moins l'union des [existantes] → liste d'ancres disjointes, dans
    l'ordre du texte. Fonction pure. */
export function soustraireAncres(anchor, existantes) {
  if (!anchor || !anchor.start || !anchor.end) return [];
  const autres = (existantes || [])
    .filter((a) => a && a.start && a.end && cmpPos(a.end, anchor.start) > 0 && cmpPos(a.start, anchor.end) < 0)
    .sort((a, b) => cmpPos(a.start, b.start));
  const libres = [];
  let curseur = anchor.start;
  for (const a of autres) {
    if (cmpPos(a.start, curseur) > 0) libres.push({ v: 1, start: curseur, end: cmpPos(a.start, anchor.end) < 0 ? a.start : anchor.end });
    if (cmpPos(a.end, curseur) > 0) curseur = a.end;
    if (cmpPos(curseur, anchor.end) >= 0) break;
  }
  if (cmpPos(curseur, anchor.end) < 0) libres.push({ v: 1, start: curseur, end: anchor.end });
  return libres;
}

/* ============================================================
   REPASSER AU SURLIGNEUR (10/10, docs/compte-rendu-images-surlignage-json.md) — UNE SEULE
   COUCHE, à la portion près :
   - même couleur sur un passage entièrement déjà surligné de cette couleur → le surlignage
     est RETIRÉ sur la portion repassée (un surlignage peut être scindé en deux) ;
   - sinon la portion repassée prend la couleur choisie : les surlignages d'une autre
     couleur sont ROGNÉS (jamais deux couches superposées), ceux de la même couleur qui la
     touchent ou la jouxtent (seul un blanc les sépare) FUSIONNENT avec elle.
   Fonction pure, sur les ancres seulement. `aDuTexte(ancre)` : le passage contient-il une
   lettre ou un chiffre ; `blanc(ancre)` : n'est-il fait que de blancs. Les surlignages sans
   ancre (d'avant le 30/09) ne passent pas par ici (règle d'avant, PdfReader).
   @returns { retrait, garder: [{ id, anchor }], supprimer: [id], creer: [{ anchor, couleur, depuis? }] }
     `garder` : surlignage conservé (même id, donc même note et mêmes boîtes reliées) avec
     une nouvelle ancre ; `creer.depuis` : id du surlignage scindé dont le morceau provient.
   ============================================================ */
const vide = (a) => !a || cmpPos(a.end, a.start) <= 0;
const chevauche = (a, b) => cmpPos(a.end, b.start) > 0 && cmpPos(a.start, b.end) < 0;
export function planSurlignage(sel, existants, couleur, { aDuTexte = () => true, blanc = () => false } = {}) {
  const avecAncre = (existants || []).filter((h) => h && h.anchor && h.anchor.start && h.anchor.end);
  const touches = avecAncre.filter((h) => chevauche(h.anchor, sel));
  const libres = soustraireAncres(sel, touches.map((h) => h.anchor)).filter(aDuTexte);
  const retrait = !libres.length && touches.length > 0 && touches.every((h) => h.couleur === couleur);
  const garder = [], supprimer = [], creer = [];
  // un surlignage rogné par `zone` : ses morceaux (avec du texte) hors de la zone
  const rogner = (h, zone) => {
    const morceaux = soustraireAncres(h.anchor, [zone]).filter(aDuTexte);
    if (!morceaux.length) { supprimer.push(h.id); return; }
    garder.push({ id: h.id, anchor: morceaux[0] });
    morceaux.slice(1).forEach((m) => creer.push({ anchor: m, couleur: h.couleur, depuis: h.id }));
  };
  if (retrait) {
    touches.forEach((h) => rogner(h, sel));
    return { retrait, garder, supprimer, creer };
  }
  touches.filter((h) => h.couleur !== couleur).forEach((h) => rogner(h, sel));
  // union avec les surlignages de MÊME couleur qui touchent, puis qui jouxtent (blanc seul entre deux)
  let union = { v: 1, start: sel.start, end: sel.end };
  const fusion = touches.filter((h) => h.couleur === couleur);
  for (const h of fusion) {
    if (cmpPos(h.anchor.start, union.start) < 0) union = { ...union, start: h.anchor.start };
    if (cmpPos(h.anchor.end, union.end) > 0) union = { ...union, end: h.anchor.end };
  }
  let encore = true;
  while (encore) {
    encore = false;
    for (const h of avecAncre) {
      if (h.couleur !== couleur || fusion.includes(h) || touches.includes(h)) continue;
      const avant = cmpPos(h.anchor.end, union.start) <= 0 && (cmpPos(h.anchor.end, union.start) === 0 || blanc({ v: 1, start: h.anchor.end, end: union.start }));
      const apres = cmpPos(h.anchor.start, union.end) >= 0 && (cmpPos(h.anchor.start, union.end) === 0 || blanc({ v: 1, start: union.end, end: h.anchor.start }));
      if (!avant && !apres) continue;
      fusion.push(h);
      if (avant) union = { ...union, start: h.anchor.start }; else union = { ...union, end: h.anchor.end };
      encore = true;
    }
  }
  if (vide(union)) return { retrait, garder, supprimer, creer };
  fusion.sort((a, b) => cmpPos(a.anchor.start, b.anchor.start));
  if (fusion.length) {
    garder.push({ id: fusion[0].id, anchor: union });
    fusion.slice(1).forEach((h) => supprimer.push(h.id));
  } else creer.push({ anchor: union, couleur });
  return { retrait, garder, supprimer, creer };
}

