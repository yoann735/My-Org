// Mode Apprentissage libre (11/10) — outils communs du banc (profil de TEST, faux Supabase).
export const ouvert = `!!document.querySelector('[data-app="medrevise"]')`;
export async function ouvrirMedRevise(A) {
  if (!(await A.ev(ouvert))) await A.clic(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
  await A.attendre(ouvert, 30000); await A.dormir(2500);
}
export const onglet = (A, titre) => A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '') === ${JSON.stringify(titre)}); el && el.click(); return !!el; })()`);
// Bibliothèque › arbre › cours `titre` (vrai clic) › panneau Exercices › Flashcards
export async function ouvrirFiche(A, titre) {
  await onglet(A, 'Bibliothèque'); await A.dormir(1500);
  await A.ev(`(() => { const r = [...document.querySelectorAll('button')].find((b) => (b.title || '') === 'Revenir à la liste'); r && r.click(); return 1; })()`); await A.dormir(500);
  await A.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Arbre'); b && b.click(); return 1; })()`); await A.dormir(500);
  await A.clic(await A.pos(`[...document.querySelectorAll('.lt-fiche')].find((e) => e.innerText.trim().startsWith(${JSON.stringify(titre)}))`));
  await A.dormir(3000);
  const bouton = (txt) => A.pos(`[...document.querySelectorAll('.pis button')].filter((b) => b.offsetParent !== null).find((b) => b.innerText.trim().startsWith(${JSON.stringify(txt)}))`);
  const ex = await bouton('Exercices'); if (ex) { await A.clic(ex); await A.dormir(500); }
  await A.clic(await bouton('Flashcards')); await A.dormir(700);
}
// état d'une carte dans le panneau : pastille, libellé du bouton
export const etatCarte = (A, id) => A.ev(`(() => { const c = document.querySelector('.pis-item[data-item="${id}"]'); if (!c) return null; return { pastille: !!c.querySelector('.alib-pastille'), bouton: (c.querySelector('.alib-btn-carte') || {}).innerText?.trim() || null }; })()`);
export const liste = (A) => A.ev(`(async () => { const r = await (${A.st}).getOne('learning_set', 'learning_set'); return r ? r.cardIds : []; })()`);

/* ---- PREUVE D'INDÉPENDANCE : instantané de tout ce que la méthode des J et FSRS possèdent ----
   - l'export de diagnostic (lib/diagnosticExport.js construireDiagnostic — le contenu du bouton
     « Exporter le diagnostic ») : cartes (dueDate, états, bloc FSRS, historique), séance du jour
     sauvegardée, plan du jour ;
   - les enregistrements `questions` BRUTS (tous les champs) ;
   - le journal des révisions local (toutes les entrées) et sa file d'envoi ;
   - le calendrier (nombre de cartes par jour sur 60 jours, planning.js nextDate) ;
   - les stats (streak…) ; au faux cloud : les lignes `questions` et la table du journal. */
export const instantane = (A) => A.ev(`(async () => {
  const url = (p) => performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes(p)) || p;
  const st = await import(url('/src/medrevise/lib/storage.js'));
  const D = await import(url('/src/medrevise/lib/diagnosticExport.js'));
  const J = await import(url('/src/medrevise/journal/journal.js'));
  const P = await import(url('/src/medrevise/lib/planning.js'));
  const diag = await D.construireDiagnostic();
  const questions = (await st.getAll('questions')).sort((a, b) => a.id.localeCompare(b.id));
  const calendrier = {};
  for (const q of questions) { const d = P.nextDate(q); if (d) calendrier[d] = (calendrier[d] || 0) + 1; }
  const journal = (await J.toutLeJournal()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const cloud = await (await fetch('http://localhost:54399/__etat')).json();
  const revues = await (await fetch('http://localhost:54399/__journal')).json();
  return {
    diagnostic: { cartes: diag.cartes, planDuJour: diag.planDuJour, journal: diag.journal, seanceEnregistree: diag.seanceEnregistree, mesuresSeance: diag.mesuresSeance, reglagesFC: diag.reglagesFC },
    questions, calendrier: Object.fromEntries(Object.entries(calendrier).sort()), journal,
    journalEnAttente: (await J.idsEnAttente()).sort(), stats: await st.getStats(),
    cloud: { questions: cloud.rows.filter((r) => r.store === 'questions').map((r) => ({ id: r.record_id, updated_at: r.updated_at, data: r.data })).sort((a, b) => a.id.localeCompare(b.id)), journal: revues },
  };
})()`);
