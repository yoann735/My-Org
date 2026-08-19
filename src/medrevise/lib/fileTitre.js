/* ============================================================
   MedRevise — titre pré-rempli d'une fiche déduit d'un FICHIER DÉPOSÉ (glisser-
   déposer depuis le Finder sur l'arbre de Réviser, voir components/TreeFileDrop.jsx).

   LECTURE SEULE, JAMAIS D'EXÉCUTION : le HTML passe par DOMParser, qui n'exécute
   aucun script et ne charge aucune ressource externe (contrairement à une iframe
   ou à srcdoc). Exactement le même mécanisme que docElFromHtml
   (lib/courseExport.js), qui lit déjà les cours HTML stockés sans les ouvrir.
   ============================================================ */

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/**
 * Titre porté par le document lui-même : <title>, puis le grand titre du gabarit
 * MedRevise (#doc h1), puis n'importe quel <h1>. '' si le document n'en porte
 * aucun (ou s'il est illisible) — l'appelant se rabat alors sur le nom de fichier.
 */
export function titreFromHtml(html) {
  if (!html) return '';
  let doc;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch { return ''; }
  for (const sel of ['title', '#doc h1', 'h1']) {
    const t = clean(doc.querySelector(sel) && doc.querySelector(sel).textContent);
    if (t) return t;
  }
  return '';
}

/**
 * Repli : nom de fichier nettoyé — extension retirée, tirets/underscores/points
 * → espaces, espaces repliés, majuscule initiale.
 * "osteologie-membre-sup.html" → "Osteologie membre sup".
 * Les ACCENTS absents du nom de fichier ne sont PAS devinés (aucun dictionnaire :
 * une correction automatique se tromperait tôt ou tard sur un terme médical). Un
 * <title> correct les apporte, et le champ de la modale reste modifiable.
 */
export function titreFromFilename(name) {
  const base = clean(String(name || '').replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' '));
  if (!base) return 'Fiche importée';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Titre pré-rempli d'un fichier déposé. HTML → contenu du document ; PDF (ou HTML
 * sans titre / illisible) → nom de fichier nettoyé.
 * @param {File} file
 * @param {'html'|'pdf'} kind — issu de detectDocKind (ui.jsx), seule bascule de type
 */
export async function titreFromFile(file, kind) {
  if (kind === 'html') {
    try {
      const t = titreFromHtml(await file.text());
      if (t) return t;
    } catch { /* illisible → repli nom de fichier */ }
  }
  return titreFromFilename(file && file.name);
}
