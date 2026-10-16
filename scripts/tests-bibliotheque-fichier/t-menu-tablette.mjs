// Menu « Fichier » en tablette (paysage + portrait, au doigt) et téléphone. Base LOCALE du banc.
// Un seul scénario par connexion (l'émulation CDP saute à la déconnexion).
import { banc } from './commun.mjs';
const ORDRE = 'renommer|fichiers|miseEnPage|ocr|pdfAnnote|exporter|exportIA|textes|supprimer';
const b = await banc(1440, 900, { tactile: true });
await b.c.send('Runtime.evaluate', { expression: `localStorage.setItem('medrevise.biblio.tri','manuel')` });
await b.biblio({ recharger: true });
const res = {};
for (const [titre, nom, vueFiche] of [['Membre supérieur — repères', 'pdf'], ['Conformité doc', 'document'], ['Physiologie rénale (jumelle)', 'jumelle', true]]) {
  await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.dormir(400);
  await b.biblio(); await b.ouvrir(titre);
  for (const [W, H, o] of [[1180, 820, 'paysage'], [820, 1180, 'portrait']]) {
    await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }); await b.dormir(1200);
    if (vueFiche) { await b.ev(`(()=>{const x=[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Fiche');x&&x.click();return 1})()`); await b.dormir(1500); }
    const tab = await b.ev(`!!document.querySelector('.lecteur-tab .tab-entete')`);
    const f = await b.rect(`document.querySelector('.tab-entete .mf-bouton')`);
    await b.tape([f.cx, f.cy]);
    const m = await b.ev(`(()=>{const m=document.querySelector('.mf-menu');const r=m.getBoundingClientRect();return {ids:[...m.querySelectorAll('[data-entree]')].map(e=>e.dataset.entree).join('|'),
      h:Math.min(...[...m.querySelectorAll('button[data-entree]')].map(e=>e.getBoundingClientRect().height)),dans:r.right<=innerWidth&&r.left>=0,
      ordreEntete:[...document.querySelector('.tab-entete').children].map(e=>e.classList.contains('tab-titre')?'titre':e.classList.contains('mf')?'Fichier':e.classList.contains('tab-dispo')||e.classList.contains('seg')?'modes':e.getAttribute('aria-label')||e.className).join(' · ')}})()`);
    res[`${nom}-${o}`] = { f: [Math.round(f.x), Math.round(f.y), Math.round(f.w), Math.round(f.h)], ...m };
    b.ok(tab && m.ids === ORDRE, `${nom} ${o} : en-tête tablette, menu identique (9 entrées, même ordre)`, m.ids);
    b.ok(m.h >= 42 && m.dans, `${nom} ${o} : entrées ≥ 42 px au doigt, menu dans l’écran`, m.h + ' px');
    if (nom === 'document') {
      const g = await b.rect(`document.querySelector('button[data-entree=ocr]')`);
      await b.tape([g.cx, g.cy]);
      b.ok(await b.ev(`document.querySelector('.mf-raison')?.innerText==='Non disponible pour un document'`), `${nom} ${o} : entrée grisée touchée → « Non disponible pour un document »`);
    }
    await b.capture(`mf-tab-${nom}-${o}`, { x: 0, y: 0, width: W, height: Math.min(H, 640) });
    await b.T.Escape(); await b.dormir(200);
    if (vueFiche) { await b.ev(`(()=>{const x=[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Original');x&&x.click();return 1})()`); await b.dormir(1200); }
  }
}
const pos = Object.entries(res).filter(([k]) => k.endsWith('paysage')).map(([k, v]) => v.f.join(','));
b.ok(new Set(pos).size === 1, 'paysage : bouton Fichier au même endroit et même taille sur les 3 pages', pos.join(' / '));
const posP = Object.entries(res).filter(([k]) => k.endsWith('portrait')).map(([k, v]) => v.f.join(','));
b.ok(new Set(posP).size === 1, 'portrait : idem', posP.join(' / '));
console.log('en-tête tablette :', res['pdf-paysage'].ordreEntete);
// téléphone : shell mobile, pas de lecteur — rien ne casse
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await b.dormir(1500);
await b.capture('mf-telephone');
b.ok(!b.erreurs.length, 'aucune erreur (tablette, téléphone)', b.erreurs.join(' / '));
await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
process.exit(0);
