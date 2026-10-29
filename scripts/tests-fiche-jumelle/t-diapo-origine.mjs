// (29/10) DIAPO D'ORIGINE (docs/compte-rendu-diapo-origine.md) — même banc que la fiche jumelle : Vite :5199 SANS
// Supabase + Chrome headless 9333, base LOCALE du banc. node t-diapo-origine.mjs <fx> [tablette]
// Vérité terrain (gen-pdf.mjs, verite.json) : fiche p.13 = diapos 12 + 13 (fusion) ; fiche p.15 = diapo 14 ;
// fiche p.6, 14, 21, 29, 30 = pages ajoutées dans la fiche (aucune diapo).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { banc } from './commun.mjs';
const FX = process.argv[2];
const tablette = process.argv[3] === 'tablette';
const b = await banc(tablette ? 1180 : 1440, tablette ? 820 : 900, { tactile: tablette });
const CAP = fileURLToPath(new URL('../../docs/img/diapo-origine/', import.meta.url)); fs.mkdirSync(CAP, { recursive: true });
const cap = async (nom) => { const s = await b.c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(CAP + (tablette ? 'tablette-' : 'ordi-') + nom + '.png', Buffer.from(s.data, 'base64')); };
const C = 'f-fj';
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
const pageAff = () => b.ev(`(()=>{const t=(document.querySelector('.pdfr-v2')||document.body).innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);return t?t[1]+' / '+t[2]:null})()`);
/** fait défiler jusqu'à ce que la page de clé `cle` soit rendue (les pages hors écran ne sont pas dessinées) */
const amener = async (cle) => {
  // la page est peut-être au-dessus : on repart du haut, puis on descend
  if (!(await b.ev(`!!document.querySelector('.pdfr-page[data-cle="${cle}"]')`))) { await b.ev(`(()=>{document.querySelector('.pdfr-scroll').scrollTop=0;return 1})()`); await b.dormir(300); }
  for (let i = 0; i < 80; i++) {
    const ok = await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="${cle}"]');if(!p)return false;p.scrollIntoView({block:'center'});return true})()`);
    if (ok) { await b.dormir(500); return true; }
    await b.ev(`(()=>{const s=document.querySelector('.pdfr-scroll');s.scrollTop+=500;return 1})()`); await b.dormir(120);
  }
  return false;
};
const lien = (cle) => b.ev(`document.querySelector('.pdfr-page[data-cle="${cle}"] .pdfr-origine')?.innerText?.replace(/\\s+/g,' ').trim() || null`);
const toucher = async (js) => { await b.ev(`(()=>{const e=${js};e&&e.scrollIntoView({block:'center'});return 1})()`); await b.dormir(300); const r = await b.rect(js); if (!r) return false; if (tablette) await b.tape([r.cx, r.cy]); else await b.clic([r.cx, r.cy], { att: 300 }); return true; };

console.log('nettoyage :', await b.nettoyer([C]));
await b.ev(`Object.keys(localStorage).filter(k=>k.startsWith('medrevise.jumelle.')).forEach(k=>localStorage.removeItem(k));1`);
if (tablette) {
  // tablette : le sélecteur de fichier ne s'ouvre pas sous des gestes simulés → import par la fonction de l'app
  const b64 = fs.readFileSync(FX + '/fiche.pdf').toString('base64');
  await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const J=await import(u.find(n=>n.includes('/lib/ficheJumelle.js'))||'/src/medrevise/lib/ficheJumelle.js');const S=await import(u.find(n=>n.includes('/lib/storage.js'))||'/src/medrevise/lib/storage.js');
    const bin=atob(${JSON.stringify(b64)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);const f=await S.getOne('fiches','${C}');
    await J.importerJumelle({courseId:'${C}',fichier:new File([a],'fiche.pdf',{type:'application/pdf'}),pdfIdOrig:f.pdfId});localStorage.setItem('medrevise.jumelle.vue.${C}','fiche');return 1;})()`);
  b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert (fiche importée)');
} else {
  b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert');
  const pris = b.fichierSuivant(FX + '/fiche.pdf');
  await b.menuFichier('Importer la fiche jumelle'); await pris; await b.dormir(2500);
  await b.clic(await b.pos(`[...document.querySelectorAll('.fj-resume button')].find(x=>x.innerText.includes('Voir la fiche'))`, false), { att: 1800 });
}
await b.dormir(1200);
b.ok((await vue()) === 'Fiche', 'la fiche est affichée');

// ---------- les liens, page par page (vérité terrain)
await amener(1);
b.ok((await lien(1)) === 'Diapo p. 1', 'fiche p.1 → « Diapo p. 1 »', await lien(1));
await amener(6);
b.ok((await lien(6)) === null, 'fiche p.6 (ajoutée dans la fiche) → aucun lien', String(await lien(6)));
await amener(13);
b.ok((await lien(13)) === 'Diapo p. 12–13', 'fiche p.13 (fusion) → « Diapo p. 12–13 »', await lien(13));
await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="13"]');p.scrollIntoView({block:'start'});return 1})()`); await b.dormir(300);
const pos = await b.rect(`document.querySelector('.pdfr-page[data-cle="13"] .pdfr-origine')`);
const page = await b.rect(`document.querySelector('.pdfr-page[data-cle="13"]')`);
const vueLecture = await b.rect(`document.querySelector('.pdfr-scroll')`);
b.ok(pos && page && pos.x >= page.x && pos.x < page.x + 40 && pos.y >= page.y && pos.y < page.y + 60 && pos.r <= vueLecture.r, 'le lien est DANS la page, en haut à gauche, entièrement visible (même page plus large que l’écran)', JSON.stringify({ lien: [Math.round(pos.x), Math.round(pos.y)], page: [Math.round(page.r), Math.round(page.b)] }));
if (tablette) b.ok(pos.h >= 32, 'tablette : cible ≥ 32 px de haut', String(pos.h));
await b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="13"]');p.scrollIntoView({block:'start'});return 1})()`); await b.dormir(400);
await cap('1-lien-sur-la-fiche');
await amener(15);
b.ok((await lien(15)) === 'Diapo p. 14', 'fiche p.15 → « Diapo p. 14 »', await lien(15));

// ---------- clic : la diapo à CETTE page, puis le retour
await toucher(`document.querySelector('.pdfr-page[data-cle="15"] .pdfr-origine')`); await b.dormir(2000);
b.ok((await vue()) === 'Original' && /^14 \/ 26$/.test(await pageAff()), 'clic : la diapo s’ouvre à la page 14', await pageAff());
const retour = await b.ev(`document.querySelector('[data-retour-fiche]')?.innerText`);
b.ok(retour && /Revenir à la fiche/.test(retour) && retour.includes('p. 15'), 'bouton « Revenir à la fiche (p. 15) »', retour);
b.ok(!(await b.ev(`!!document.querySelector('.pdfr-origine')`)), 'sur la diapo : pas de lien « Diapo p. … »');
await cap('2-diapo-avec-retour');
await toucher(`document.querySelector('[data-retour-fiche]')`); await b.dormir(2000);
b.ok((await vue()) === 'Fiche' && /^15 \/ 30$/.test(await pageAff()), 'retour : la fiche à la page 15', await pageAff());
b.ok(!(await b.ev(`!!document.querySelector('[data-retour-fiche]')`)), 'le bouton de retour disparaît');

// ---------- Tab inchangé : de la fiche p.15 vers la diapo correspondante (14), sans bouton de retour
if (!tablette) {
  await b.ev(`document.activeElement&&document.activeElement.blur();1`);
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await b.dormir(1800);
  b.ok((await vue()) === 'Original' && /^14 \/ 26$/.test(await pageAff()) && !(await b.ev(`!!document.querySelector('[data-retour-fiche]')`)), 'Tab : diapo p.14, comme avant (pas de bouton de retour)', await pageAff());
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await b.dormir(1500);
  // aller par le lien, puis revenir par Tab : le bouton de retour s'efface aussi
  await amener(13); await toucher(`document.querySelector('.pdfr-page[data-cle="13"] .pdfr-origine')`); await b.dormir(1800);
  b.ok(/^12 \/ 26$/.test(await pageAff()), 'fiche p.13 → diapo p.12 (première des pages fusionnées)', await pageAff());
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await b.dormir(1800);
  b.ok((await vue()) === 'Fiche' && !(await b.ev(`!!document.querySelector('[data-retour-fiche]')`)), 'retour par Tab : le bouton de retour s’efface aussi');
  // export / impression : le lien n'est pas dans le document exporté (il n'est rendu qu'à l'écran)
  b.ok(!(await b.ev(`document.querySelector('.pdfr-origine')?.closest('.pdfr-page')?.className.includes('impression') || false`)), '(le lien n’existe qu’à l’écran)');
}
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer(); process.exit(0);
