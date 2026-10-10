/* ============================================================
   MedRevise — RAPPORT DU MODE OMBRE (Réglages → FSRS). Pur.
   Compare, sur 30 jours, la charge du planificateur maison (dueDate, ce qui est réellement
   affiché quand l'interrupteur est OFF) à celle que FSRS aurait produite (bloc `fsrs.due` des
   cartes déjà notées depuis l'installation ; dueDate pour les autres, que FSRS n'a pas encore vues).
   ============================================================ */
import { chargeParJour } from './migration.js';

const texte = (v, n = 70) => String(v == null ? '' : v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function rapportOmbre(cartes, journal, jour, dateMaison = (c) => c.dueDate) {
  const fc = (cartes || []).filter((c) => c && c.type === 'flashcard');
  const vues = fc.filter((c) => c.fsrs && (c.fsrs.source === 'reponse' || c.fsrs.source === 'journal'));
  const dateFsrs = (c) => (c.fsrs && (c.fsrs.source === 'reponse' || c.fsrs.source === 'journal') ? c.fsrs.due : dateMaison(c));
  const maison = chargeParJour(fc, dateMaison, jour);
  const fsrs = chargeParJour(fc, dateFsrs, jour);
  const entrees = (journal || []).filter((e) => !(e.details && e.details.relearn));
  const parNote = { 1: 0, 2: 0, 3: 0, 4: 0 };
  entrees.forEach((e) => { if (parNote[e.rating] != null) parNote[e.rating]++; });
  const exemples = vues
    .slice().sort((a, b) => ((b.fsrs.majLe || '') < (a.fsrs.majLe || '') ? -1 : 1))
    .slice(0, 10)
    .map((c) => ({ id: c.id, recto: texte(c.recto), dateMaison: dateMaison(c) || null, dateFsrs: c.fsrs.due || null, stabilite: c.fsrs.stability, difficulte: c.fsrs.difficulty }));
  return {
    jour, reponses: entrees.length, repetitions: (journal || []).length - entrees.length, parNote,
    cartesVuesParFsrs: vues.length,
    tableau: maison.lignes.map((l, i) => ({ jour: l.jour, maison: l.n, fsrs: fsrs.lignes[i].n })),
    retard: { maison: maison.retard, fsrs: fsrs.retard },
    au_dela: { maison: maison.apres, fsrs: fsrs.apres },
    exemples,
  };
}
