/* ============================================================
   MedRevise — SURLIGNEUR SUR LE TEXTE D'UN DOCUMENT (10/10,
   docs/compte-rendu-images-surlignage-json.md).

   Les passages surlignés d'un document sont des marques `notion` { id, couleur }. Même
   règle que sur un PDF (lib/resurlignage.js#planSurlignage), à la portion près :
   - même couleur sur un passage entièrement déjà surligné de cette couleur → retiré sur la
     portion repassée (la notion peut être scindée : le second morceau reçoit un nouvel id) ;
   - sinon la portion prend la couleur : une seule couche, et fusion avec la notion de même
     couleur qui la touche ou la jouxte (seul un blanc entre les deux).
   Les positions ProseMirror tiennent lieu d'ancres ({ item: 0, char: pos }).
   Une seule transaction : une seule entrée d'annulation (journal du document).
   @returns { tr, retrait, crees: [{ id, texte, couleur }] } ou null (rien à faire)
   ============================================================ */
import { TextSelection } from '@tiptap/pm/state';
import { planSurlignage } from '../../lib/resurlignage.js';

export function surlignerNotions(state, from, to, couleur, nouvelId) {
  const type = state.schema.marks.notion;
  if (!type || from >= to) return null;
  const doc = state.doc;
  // suites de texte portant la même notion (une notion peut couvrir plusieurs paragraphes)
  const runs = [];
  doc.descendants((n, pos) => {
    if (!n.isText) return;
    const m = n.marks.find((x) => x.type === type && x.attrs && x.attrs.id);
    if (!m) return;
    const der = runs[runs.length - 1];
    if (der && der.id === m.attrs.id && (der.to === pos || doc.textBetween(der.to, pos, '') === '')) der.to = pos + n.nodeSize;
    else runs.push({ id: m.attrs.id, couleur: m.attrs.couleur || 'jaune', attrs: m.attrs, from: pos, to: pos + n.nodeSize });
  });
  const A = (a, b) => ({ v: 1, start: { item: 0, char: a }, end: { item: 0, char: b } });
  const txt = (a) => doc.textBetween(a.start.char, a.end.char, ' ');
  const plan = planSurlignage(A(from, to), runs.map((r, k) => ({ id: k, anchor: A(r.from, r.to), couleur: r.couleur })), couleur, {
    aDuTexte: (a) => /[\p{L}\p{N}]/u.test(txt(a)),
    blanc: (a) => !txt(a).trim(),
  });
  if (!plan.garder.length && !plan.supprimer.length && !plan.creer.length) return null;
  // un morceau ne commence ni ne finit par un blanc
  const rogner = (a) => {
    let x = a.start.char, y = a.end.char;
    while (x < y && /^\s$/.test(doc.textBetween(x, x + 1, ''))) x++;
    while (y > x && /^\s$/.test(doc.textBetween(y - 1, y, ''))) y--;
    return [x, y];
  };
  const tr = state.tr;
  const touches = new Set([...plan.supprimer, ...plan.garder.map((g) => g.id)]);
  touches.forEach((k) => tr.removeMark(runs[k].from, runs[k].to, type));
  tr.removeMark(from, to, type);
  // un même id ne sert qu'à UN morceau : le morceau détaché par une scission en reçoit un neuf
  const pris = new Set(runs.filter((r, k) => !touches.has(k)).map((r) => r.id));
  const crees = [];
  const poser = (a, attrs, neuf) => {
    const [x, y] = rogner(a);
    if (y <= x) return;
    let id = neuf ? null : attrs.id;
    if (!id || pris.has(id)) { id = nouvelId(); crees.push({ id, texte: doc.textBetween(x, y, ' ').trim(), couleur: attrs.couleur || 'jaune' }); }
    pris.add(id);
    tr.addMark(x, y, type.create({ ...attrs, id }));
  };
  plan.garder.forEach((g) => poser(g.anchor, runs[g.id].attrs, false));
  plan.creer.forEach((c) => poser(c.anchor, c.depuis != null ? { ...runs[c.depuis].attrs, couleur: c.couleur } : { couleur: c.couleur }, true));
  tr.setSelection(TextSelection.create(tr.doc, Math.min(to, tr.doc.content.size)));
  return { tr, retrait: plan.retrait, crees };
}
