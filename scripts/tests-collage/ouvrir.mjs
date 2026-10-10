// Ouvre MedRevise, puis le cours PDF `titre` depuis la Bibliothèque (vrai clic), panneau Exercices ›
// Flashcards › Ajouter › `formulaire` ('Tableau muscle' | 'Flashcard'). Renvoie true si le formulaire est là.
export async function ouvrirFormulaire(A, { titre = '3 1 Muscles de la fesse', formulaire = 'Tableau muscle' } = {}) {
  await A.send('Page.reload'); await A.dormir(2500);
  const ouvert = `!!(document.querySelector('[data-app="medrevise"]') || document.querySelector('.sfa'))`;
  if (!(await A.ev(ouvert))) {
    // MealWeek ouverte (dernier écran) → retour au hub
    await A.ev(`(() => { const b = [...document.querySelectorAll('button, a')].find((x) => /Retour à l'accueil|mes apps/.test((x.getAttribute('title') || '') + x.textContent)); b && b.click(); return 1; })()`);
    await A.dormir(1200);
    await A.clic(await A.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
  }
  await A.attendre(ouvert, 20000);
  await A.dormir(6000); // synchro de démarrage + migrations
  await A.ev(`(() => { const el = [...document.querySelectorAll('.sb-item')].find((b) => (b.getAttribute('title') || '').startsWith('Bibliothèque')); el && el.click(); return true; })()`);
  await A.dormir(1500);
  await A.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Arbre'); b && b.click(); return true; })()`);
  await A.dormir(500);
  await A.clic(await A.pos(`[...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(titre)}).pop()`));
  await A.dormir(4000);
  const bouton = (txt) => A.pos(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).find((b) => b.innerText.trim().startsWith(${JSON.stringify(txt)}))`);
  await A.clic(await bouton('Exercices')); await A.dormir(500);
  await A.clic(await bouton('Flashcards')); await A.dormir(500);
  await A.clic(await bouton('Ajouter')); await A.dormir(700);
  const choix = await bouton(formulaire);
  if (choix) { await A.clic(choix); await A.dormir(700); }
  return A.ev(formulaire === 'Tableau muscle' ? `!!document.querySelector('.mu-form')` : `!!document.querySelector('.fci-champ')`);
}
