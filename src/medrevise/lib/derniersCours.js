/* ============================================================
   MedRevise — dernier cours ouvert de chaque matière (17/10, emploi du temps :
   boutons « Ouvrir » et « Transcrire » d'un cours de l'école).

   Noté par le lecteur (pdf/PdfReader.jsx) à chaque ouverture d'un cours, dans le
   localStorage de CET appareil : une préférence de confort, rien de synchronisé,
   aucune fiche modifiée. À défaut (matière jamais ouverte ici), le cours le plus
   récent de la matière — un cours avec document d'abord.
   ============================================================ */
import { dateAjout } from './datesFiches.js';

const CLE = 'medrevise.derniersCours.v1';
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch { return {}; } };

export function noterCoursOuvert(fiche) {
  if (!fiche || !fiche.id || !fiche.matiereId) return;
  try {
    const m = lire();
    m[fiche.matiereId] = { ficheId: fiche.id, at: new Date().toISOString() };
    localStorage.setItem(CLE, JSON.stringify(m));
  } catch { /* stockage indisponible : simple confort perdu */ }
}

const aUnDocument = (f) => !!(f.pdfId || f.htmlId || f.docNotes);

/** fiche à ouvrir pour une matière, ou null */
export function dernierCoursDe(db, matiereId) {
  if (!db || !matiereId) return null;
  const fiches = (db.fiches || []).filter((f) => f.matiereId === matiereId && !f.archive);
  if (!fiches.length) return null;
  const note = lire()[matiereId];
  const vue = note && fiches.find((f) => f.id === note.ficheId);
  if (vue) return vue;
  const tri = [...fiches].sort((a, b) => (aUnDocument(b) - aUnDocument(a)) || (dateAjout(b) - dateAjout(a)));
  return tri[0];
}
