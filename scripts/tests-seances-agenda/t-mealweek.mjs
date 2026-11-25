// 4) MealWeek intacte (séances liées à l’agenda) : build d’AVANT le chantier (git archive 07ba376, « mealweek-avant-seances » :5335) et build d’APRÈS (dist, « mealweek-apres-seances » :5336), sans cloud ; même capture octet pour octet, ordinateur et téléphone.
//    node t-mealweek.mjs
import fs from 'node:fs';
import { appareil, dormir, DOSSIER_IMG } from './commun.mjs';
const AVANT = process.env.MW_AVANT || 'http://localhost:5335', APRES = process.env.MW_APRES || 'http://localhost:5336';
let echecs = 0;
for (const type of ['ordi', 'tel']) {
  const b = await appareil(type);
  const prendre = async (base) => {
    await b.send('Page.navigate', { url: base + '/' }); await b.attendre(`document.readyState === 'complete'`, 20000);
    await b.ev(`(localStorage.clear(), localStorage.setItem('app.current', JSON.stringify('mealweek')), 1)`);
    await b.send('Page.navigate', { url: base + '/' }); await b.attendre(`document.readyState === 'complete'`, 20000); await dormir(800);
    for (let k = 0; k < 20 && await b.ev(`/Choisis ton espace/.test(document.body.innerText)`); k++) {
      await b.ev(`(() => { const x = [...document.querySelectorAll('.hub-card, [role=button], button, a')].find((e) => /MealWeek/.test(e.innerText || '') && /Planifie/.test(e.innerText || '')); x && x.click(); return 1; })()`); await dormir(500);
    }
    await dormir(3500);
    await b.ev(`(document.querySelectorAll('*').forEach((e) => { e.style.animation = 'none'; e.style.transition = 'none'; e.style.caretColor = 'transparent'; }), 1)`); await dormir(600);
    const texte = await b.ev(`document.body.innerText.slice(0, 80).replace(/\\s+/g, ' ')`);
    const s = await b.send('Page.captureScreenshot', { format: 'png' });
    return { png: Buffer.from(s.result.data, 'base64'), texte };
  };
  b.erreurs.length = 0;
  const av = await prendre(AVANT); const errAvant = b.erreurs.splice(0);
  const ap = await prendre(APRES); const errApres = b.erreurs.splice(0).filter((e) => !/Failed to load resource|net::ERR/.test(e || ''));
  fs.writeFileSync(DOSSIER_IMG + `mealweek-${type}-avant.png`, av.png); fs.writeFileSync(DOSSIER_IMG + `mealweek-${type}-apres.png`, ap.png);
  b.ok(Buffer.compare(av.png, ap.png) === 0, `MealWeek (${b.nom}) : capture identique octet pour octet, avant / après`, ap.texte);
  b.ok(errApres.length === 0, `MealWeek (${b.nom}) : aucune erreur console`, errApres.join(' | ').slice(0, 200) + (errAvant.length ? ' (avant : ' + errAvant.length + ')' : ''));
  echecs += b.echecs; b.fermerWs();
}
process.exitCode = echecs;
