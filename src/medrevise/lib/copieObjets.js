/* ============================================================
   MedRevise — COPIER / COLLER / DUPLIQUER LES OBJETS D'ANNOTATION (20/11/2026,
   docs/compte-rendu-police-duplication-remplacement-pdf.md §2). Module PUR (testé dans tests/copie-objets).

   ⌘C / Ctrl+C : copie le ou les objets sélectionnés (boîte, post-it, boîte-tableau, texte libre, forme, flèche
   (forme), image, trait, « ? »). ⌘V / Ctrl+V : les colle à la position du pointeur s'il est sur une page, sinon
   décalés de 16 px — sur la même page, une autre page ou un autre document. ⌘D / Ctrl+D : duplique sur place,
   décalé de 16 px, et sélectionne la copie. En écrivant dans une boîte, les trois raccourcis restent ceux du texte.

   UNE COPIE = un NOUVEL objet : nouvel id, même contenu et même style. Elle n'est liée à rien de l'original :
   les flashcards désignent leur boîte par son id (`source.boiteId`) — la copie n'en a donc aucune ; les
   rattachements (légende d'une forme `formeId`, texte posé sur une image `imageId`, flèche reliée à un surlignage,
   une forme ou une boîte) sont retirés — ses flèches restent, au même endroit relatif, sans cible.
   Décalage : 16 px d'une page de référence de 1000 px de large (le même à tous les zooms).
   ============================================================ */
export const DECALAGE_PX1000 = 16;
const KINDS = new Set(['libre', 'texte', 'forme', 'image', 'trait', 'question']);

/** un enregistrement d'annotation peut-il être copié comme objet ? (pages, blocs de remplacement : non) */
export const copiable = (r) => !!(r && KINDS.has(r.kind) && r.type !== 'bloc');

const arr = (v) => +v.toFixed(5);
const borne = (v) => arr(Math.max(0, Math.min(1, v)));

/** rectangle englobant [0,1] d'un objet (traits : leurs points ; « ? » et points : un point) */
export function cadreDe(r) {
  if (r.kind === 'trait') {
    const ps = (r.points || []).filter((p) => Array.isArray(p));
    if (!ps.length) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: Number(r.x) || 0, y: Number(r.y) || 0, w: Number(r.width) || 0, h: Number(r.height) || 0 };
}
/** rectangle englobant d'un groupe d'objets */
export function cadreGroupe(recs) {
  const cs = recs.map(cadreDe);
  if (!cs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...cs.map((c) => c.x)), y0 = Math.min(...cs.map((c) => c.y));
  return { x: x0, y: y0, w: Math.max(...cs.map((c) => c.x + c.w)) - x0, h: Math.max(...cs.map((c) => c.y + c.h)) - y0 };
}

/** l'objet déplacé de (dx, dy) — géométrie, flèches (bout, points de contrôle) ; rattachements retirés */
export function translater(r, dx, dy) {
  const o = { ...r };
  const p = (q) => (q && Number.isFinite(q.x) && Number.isFinite(q.y) ? { ...q, x: borne(q.x + dx), y: borne(q.y + dy) } : q);
  if (r.kind === 'trait') o.points = (r.points || []).map((q) => (Array.isArray(q) ? [arr(q[0] + dx), arr(q[1] + dy), ...q.slice(2)] : q));
  else {
    if (Number.isFinite(r.x)) o.x = arr(Math.max(0, Math.min(1 - (Number(r.width) || 0), r.x + dx)));
    if (Number.isFinite(r.y)) o.y = arr(Math.max(0, Math.min(1 - (Number(r.height) || 0), r.y + dy)));
  }
  // flèches d'une boîte : bout et points de contrôle suivent ; plus de cible (surlignage, forme, boîte)
  if (r.ancre) o.ancre = p(r.ancre);
  if (r.flechePrincipale) { const { boiteCible, ...fp } = r.flechePrincipale; o.flechePrincipale = { ...fp, ...(Array.isArray(fp.points) ? { points: fp.points.map(p) } : {}) }; } // eslint-disable-line no-unused-vars
  if (Array.isArray(r.fleches)) o.fleches = r.fleches.map((fl) => { const { surlignageId, formeId, boiteCible, ...reste } = fl; return { ...p(reste), ...(Array.isArray(reste.points) ? { points: reste.points.map(p) } : {}) }; }); // eslint-disable-line no-unused-vars
  return o;
}

/**
 * Les copies d'un groupe d'objets, prêtes à écrire.
 * @param {object[]} recs  les objets copiés (enregistrements tels quels)
 * @param {{ ficheId, page, dx?, dy?, point?, genId, maintenant?, zMax? }} o
 *   point : { x, y } [0,1] — le coin haut-gauche du groupe y est posé (collage au pointeur) ; sinon (dx, dy)
 *   zMax  : z le plus haut des images de la page visée — les images copiées passent au-dessus
 */
export function copies(recs, { ficheId, page, dx = 0, dy = 0, point = null, genId, maintenant = new Date().toISOString(), zMax = 0 }) {
  const liste = (recs || []).filter(copiable);
  if (!liste.length) return [];
  let ddx = dx, ddy = dy;
  if (point) { const c = cadreGroupe(liste); ddx = point.x - c.x; ddy = point.y - c.y; }
  let z = zMax;
  return liste.map((r) => {
    const { updatedAt, retireDe, ...base } = JSON.parse(JSON.stringify(r)); // eslint-disable-line no-unused-vars
    const t = translater(base, ddx, ddy);
    delete t.formeId; delete t.imageId; delete t.surlignageId;
    if (Array.isArray(t.fleches)) t.fleches = t.fleches.map((fl) => ({ ...fl, id: 'fl' + genId('').slice(-10) }));
    return { ...t, id: genId('an'), ficheId, page, createdAt: maintenant, ...(r.kind === 'image' ? { z: ++z } : {}) };
  });
}

/** décalage (dx, dy) en fractions de page pour `px` px de la page de référence (1000 px de large) */
export const decalage = (largeur, hauteur, px = DECALAGE_PX1000) => ({ dx: px / 1000, dy: hauteur > 0 && largeur > 0 ? (px / 1000) * (largeur / hauteur) : px / 1000 });

/* ---- presse-papiers des objets : en mémoire (tous les documents de l'onglet) + jeton dans le presse-papiers
   du système, pour qu'une copie faite AILLEURS ensuite (texte, image) reprenne la main au collage ---- */
let presse = null; // { jeton, objets, texte, le }
export const JETON_HTML = 'medrevise-objets';
export function memoriser(objets, texte = '') {
  presse = { jeton: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), objets: JSON.parse(JSON.stringify(objets)), texte, le: Date.now() };
  return presse;
}
export const presseObjets = () => presse;
export const oublier = () => { presse = null; };
/** HTML posé dans le presse-papiers du système : le texte des objets, et le jeton en commentaire */
export const htmlJeton = (p) => `<!--${JETON_HTML}:${p.jeton}--><div>${String(p.texte || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>`;
/** le jeton lu dans un HTML collé (null si ce n'est pas une copie d'objets) */
export function jetonDe(html) {
  const m = /<!--\s*medrevise-objets:([a-z0-9]+)\s*-->/i.exec(String(html || ''));
  return m ? m[1] : null;
}
/** texte brut des objets (pour le presse-papiers du système : coller dans un autre logiciel donne leur texte) */
export function texteObjets(recs) {
  const out = [];
  const w = (n) => { if (!n) return; if (n.type === 'text' && n.text) out.push(n.text); (n.content || []).forEach(w); if (n.type === 'paragraph') out.push('\n'); };
  for (const r of recs || []) { if (r.content) w(r.content); out.push('\n'); }
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}
