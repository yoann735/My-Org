// Mode Apprentissage libre (11/10) — jeu de test sur l'ordinateur (A, port 9335, profil de TEST isolé,
// faux Supabase). 1 source, 1 matière, 2 cours :
//  - « Myologie — membre supérieur » : 2 cartes Muscle + 2 flashcards ;
//  - « Biochimie — cycle de Krebs » : 3 flashcards (dont une à trous).
// Des champs de planification VARIÉS (dues aujourd'hui, à venir, déjà notées, bloc FSRS) pour que la
// preuve d'indépendance porte sur de vraies valeurs. Un PDF d'une page par cours (pdf-lib).
import { appareil } from '../tests-collage/outils.mjs';
const A = await appareil(9335);
await A.send('Page.reload'); await A.dormir(2500);
const ouvert = `!!document.querySelector('[data-app="medrevise"]')`;
if (!(await A.ev(ouvert))) await A.clic(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
await A.attendre(ouvert, 30000); await A.dormir(3000);
const r = await A.ev(`(async () => {
  const st = ${A.st};
  const sm2 = await import('/src/medrevise/lib/sm2.js');
  const { PDFDocument, StandardFonts } = await import('/node_modules/.vite/deps/pdf-lib.js');
  const pdf = async (titre) => { const d = await PDFDocument.create(); const p = d.addPage([595, 842]); const f = await d.embedFont(StandardFonts.Helvetica); p.drawText(titre, { x: 60, y: 760, size: 22, font: f }); return st.putBlob(new Blob([await d.save()], { type: 'application/pdf' })); };
  const today = sm2.todayISO();
  const j = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('fr-CA'); };
  await st.put('sources', { id: 'sAL', nom: 'Anatomie & biochimie (test)', rappelsJ: true });
  await st.put('matieres', { id: 'mAL', sourceId: 'sAL', nom: 'Sciences fondamentales (test)', couleur: 'blue' });
  await st.putMany('fiches', [
    { id: 'fMyo', matiereId: 'mAL', titre: 'Myologie — membre supérieur', type: 'standard', pdfId: await pdf('Myologie — membre supérieur'), dateImport: j(-20) },
    { id: 'fKrebs', matiereId: 'mAL', titre: 'Biochimie — cycle de Krebs', type: 'standard', pdfId: await pdf('Biochimie — cycle de Krebs'), dateImport: j(-20) },
  ]);
  // bloc FSRS (mode ombre) au format de scheduler/fsrs.js versBloc : jours civils
  const fsrs = (s, d) => ({ v: 1, state: 2, stability: s, difficulty: d, reps: 3, lapses: 0, derniere: j(-4), due: j(3), intervalle: 7 });
  const muscle = (id, nom, l, plan) => ({ id, type: 'flashcard', ficheId: 'fMyo', theme: 'Muscles du bras', recto: nom, verso: Object.values(l).join('\\n'), muscle: { v: 1, lignes: l }, ...plan });
  const fc = (id, ficheId, theme, recto, verso, plan, extra = {}) => ({ id, type: 'flashcard', ficheId, theme, recto, verso, ...plan, ...extra });
  const rev = (due, iv, h) => ({ learnState: 'review', intervalDays: iv, dueDate: due, capped: false, termine: false, historique: h });
  const H = [{ date: j(-11), qualite: 2 }, { date: j(-4), qualite: 3 }];
  await st.putMany('questions', [
    muscle('qBiceps', 'Biceps brachial', { origine: 'Chef long : tubercule supra-glénoïdal ; chef court : processus coracoïde', trajet: 'Loge antérieure du bras', insertion: 'Tubérosité radiale et aponévrose bicipitale', action: 'Flexion du coude, supination de l’avant-bras', innervation: 'Nerf musculo-cutané (C5–C6)' }, { ...rev(today, 7, H), fsrs: fsrs(9.4, 5.1) }),
    fc('qHumerus', 'fMyo', 'Ostéologie', 'Quel nerf longe le sillon du nerf radial de l’humérus ?', 'Le nerf radial, avec l’artère profonde du bras.', rev(j(5), 9, H)),
    muscle('qTriceps', 'Triceps brachial', { origine: 'Chef long : tubercule infra-glénoïdal ; vastes latéral et médial : face postérieure de l’humérus', trajet: 'Loge postérieure du bras', insertion: 'Olécrane', action: 'Extension du coude', innervation: 'Nerf radial (C6–C8)' }, { ...rev(j(2), 4, H), fsrs: fsrs(4.2, 6.3) }),
    fc('qCoiffe', 'fMyo', 'Épaule', 'Quels muscles forment la coiffe des rotateurs ?', 'Supra-épineux, infra-épineux, petit rond, subscapulaire.', { ...sm2.startAdaptive(today), historique: [] }),
    fc('qCitrate', 'fKrebs', 'Cycle de Krebs', 'Quelle enzyme condense l’acétyl-CoA et l’oxaloacétate ?', 'La citrate synthase.', rev(today, 3, H)),
    fc('qNADH', 'fKrebs', 'Cycle de Krebs', 'Combien de NADH un tour de cycle produit-il ?', 'Trois NADH, un FADH2 et un GTP.', rev(j(8), 12, H), { fsrs: fsrs(14.8, 4.4) }),
    fc('qAKG', 'fKrebs', 'Cycle de Krebs', 'L’alpha-cétoglutarate déshydrogénase produit du {{succinyl-CoA}}.', 'L’alpha-cétoglutarate déshydrogénase produit du succinyl-CoA.', rev(j(1), 2, H), { cloze: ['succinyl-CoA'] }),
  ]);
  await st.put('learning_set', { id: 'learning_set', cardIds: [] }); // liste vide au départ
  return { today, n: (await st.getAll('questions')).length };
})()`);
console.log('seed', JSON.stringify(r), '· erreurs', A.erreurs);
await A.send('Page.reload'); await A.dormir(5000);
A.fermer();
