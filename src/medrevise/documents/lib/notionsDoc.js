/* ============================================================
   MedRevise — NOTIONS D'UN DOCUMENT DE NOTES (07/10).

   Un passage du document marqué « notion » (mark `notion`, documents/lib/richtext.js)
   devient un enregistrement du store `highlights`, comme un surlignage du PDF, mais avec
   `source: 'doc'` et `docNotionId` (l'id de la mark) — sans page ni rectangles. Il compte
   donc partout où comptent les notions (révision, notions prioritaires), et le lecteur
   PDF le traite à part (jamais de défilement vers une page).
   Le DOCUMENT fait foi : un passage supprimé retire sa notion ; une mark revenue (annuler)
   la recrée. Voir synchroniserNotionsDoc.
   ============================================================ */
import { getAll, put, remove, newHighlight } from '../../lib/storage.js';
import { collectNotions } from './richtext.js';
import { lireNotesDoc, attendreNotesDoc, contenuGlobal } from './notesDoc.js';

export const estNotionDoc = (h) => !!(h && h.source === 'doc');

export async function notionsDuDoc(ficheId) {
  return (await getAll('highlights')).filter((h) => h.ficheId === ficheId && estNotionDoc(h));
}

export async function creerNotionDoc(ficheId, { id, texte, couleur = 'jaune' }) {
  const rec = { ...newHighlight({ ficheId, page: null, texte, couleur, rects: [] }), source: 'doc', docNotionId: id };
  await put('highlights', rec);
  return rec;
}

/** Aligne les notions enregistrées sur les marks présentes dans le cours — onglet « Notes »
 *  ET texte des pages (08/10) : on relit l'enregistrement une fois les écritures en file
 *  terminées, jamais un seul morceau (une notion déplacée d'une page à l'autre n'est pas
 *  perdue). Renvoie true si quelque chose a changé. */
export async function synchroniserNotionsDoc(ficheId) {
  await attendreNotesDoc();
  const presentes = collectNotions(contenuGlobal(await lireNotesDoc(ficheId)));
  const parId = new Map(presentes.map((n) => [n.id, n]));
  const recs = await notionsDuDoc(ficheId);
  let change = false;
  const vus = new Set();
  for (const r of recs) {
    const n = parId.get(r.docNotionId);
    if (!n) { await remove('highlights', r.id); change = true; continue; }
    vus.add(r.docNotionId);
    if (n.texte !== r.texte) { await put('highlights', { ...r, texte: n.texte }); change = true; }
  }
  for (const n of presentes) if (!vus.has(n.id)) { await creerNotionDoc(ficheId, n); change = true; }
  return change;
}
