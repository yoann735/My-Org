/* ============================================================
   MedRevise — export unifié "Tout exporter" (vue cours, branche HTML) :
   assemble cours + surlignages + cartes manuelles en un seul JSON, destiné à
   un prompt externe qui complétera les cartes (contrat v1, figé — voir
   convention dans CLAUDE.md du dossier Rattrapage/gabarit).

   Le gabarit HTML (autonome, script inline — voir gabarit-fiche.html) empêche
   de re-surligner un texte déjà dans un <mark class="hl"> (textNodesInRange) :
   un rose ("cloze") ne peut donc JAMAIS être imbriqué dans un jaune au sens
   DOM — highlighter le mot en rose puis la phrase en jaune autour produit
   3 <mark> FRÈRES (jaune-rose-jaune), jamais un jaune qui englobe un rose.
   dans_notion se détecte donc par ADJACENCE (le rose touche un/des mark
   jaune juste avant/après, espaces ignorés), pas par containment DOM.
   ============================================================ */
import { ficheToText } from './ficheToText.js';

const SENS_PAR_COULEUR = { jaune: 'notion_importante', rose: 'cloze' };

function isWhitespaceText(node) {
  return !!node && node.nodeType === Node.TEXT_NODE && /^\s*$/.test(node.nodeValue);
}
function isJauneMark(node) {
  return !!node && node.nodeType === Node.ELEMENT_NODE
    && node.matches('mark.hl') && (node.dataset.hl || 'jaune') === 'jaune';
}
// remonte les frères touchants (espaces ignorés) tant qu'ils sont eux-mêmes
// des mark.hl jaune — s'arrête dès qu'un nœud non-jaune/non-vide est rencontré.
function collectTouchingJaune(markEl, siblingProp) {
  const texts = [];
  let n = markEl[siblingProp];
  while (n) {
    if (isWhitespaceText(n)) { n = n[siblingProp]; continue; }
    if (isJauneMark(n)) { texts.push(n.textContent); n = n[siblingProp]; continue; }
    break;
  }
  if (siblingProp === 'previousSibling') texts.reverse();
  return texts;
}

/** @param {HTMLElement} docEl — l'élément #doc de la fiche (gabarit HTML) */
export function extractHighlights(docEl) {
  return [...docEl.querySelectorAll('mark.hl')].map((m) => {
    const couleur = m.dataset.hl || 'jaune';
    const texte = m.textContent.replace(/\s+/g, ' ').trim();
    if (couleur !== 'rose') {
      return { couleur, sens: SENS_PAR_COULEUR[couleur] || 'surligne', texte };
    }
    const before = collectTouchingJaune(m, 'previousSibling');
    const after = collectTouchingJaune(m, 'nextSibling');
    const dans_notion = (before.length || after.length)
      ? [...before, texte, ...after].join(' ').replace(/\s+/g, ' ').trim()
      : null;
    return { couleur: 'rose', sens: 'cloze', texte, dans_notion };
  });
}

// projection v1.1 "propre" pour le prompt externe — retire l'état de planning/sync
// (plan/cursor/historique/missed/updatedAt/srcId/ficheId/id) et les doublons legacy
// de l'adaptateur (concept/question/choix/bonneReponse/_schema) : un enregistrement
// db.questions brut n'est PAS le contrat de sortie, juste sa source.
const CARTE_FIELDS = {
  flashcard: ['theme', 'type', 'recto', 'verso', 'cloze', 'indice', 'a_retenir', 'difficulte', 'tags'],
  qcm: ['theme', 'type', 'enonce', 'options', 'reponses_correctes', 'explication', 'explication_distracteurs', 'difficulte', 'tags'],
};

function projectCarte(item) {
  const fields = CARTE_FIELDS[item.type];
  if (!fields) return null;
  const out = {};
  fields.forEach((f) => { if (item[f] !== undefined) out[f] = item[f]; });
  return out;
}

/**
 * Assemble le contrat medrevise_cours_export v1.
 * @param {object} p
 * @param {object} p.fiche — enregistrement db.fiches (titre)
 * @param {string} p.matiereNom — nom de la matière (db.matieres)
 * @param {HTMLElement} p.docEl — #doc de l'iframe (gabarit HTML)
 * @param {object[]} p.cartes — enregistrements bruts db.questions (qcm/flashcard) de cette fiche
 */
export function buildCourseExport({ fiche, matiereNom, docEl, cartes }) {
  return {
    type: 'medrevise_cours_export',
    version: 1,
    matiere: matiereNom || '',
    cours: {
      titre: fiche.titre || '',
      texte_structure: ficheToText(docEl),
    },
    surlignages: extractHighlights(docEl),
    cartes_manuelles: (cartes || []).map(projectCarte).filter(Boolean),
  };
}
