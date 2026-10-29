// (29/10) PLUSIEURS FICHES — tablette (1180 × 820, tactile). Le sélecteur de fichier ne s'ouvre pas sous
// des gestes simulés : les deux fiches sont importées par la fonction de l'app (lib/ficheJumelle.js#importerJumelle,
// mêmes fichiers que t-plusieurs-fiches.mjs), puis tout le reste se fait AU DOIGT : menu de choix au-dessus de la
// page, cibles ≥ 36 px, choix d'une fiche, retour à la diapo. node t-plusieurs-fiches-tablette.mjs <fx>
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { banc } from './commun.mjs';
const FX = process.argv[2];
const b = await banc(1180, 820, { tactile: true });
const CAP = fileURLToPath(new URL('../../docs/img/plusieurs-fiches/', import.meta.url)); fs.mkdirSync(CAP, { recursive: true });
const cap = async (nom) => { const s = await b.c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(CAP + 'tablette-' + nom + '.png', Buffer.from(s.data, 'base64')); };
const C = 'f-fj';
console.log('nettoyage :', await b.nettoyer([C]));
await b.ev(`Object.keys(localStorage).filter(k=>k.startsWith('medrevise.jumelle.')).forEach(k=>localStorage.removeItem(k));1`);
const b64 = (f) => fs.readFileSync(FX + '/' + f).toString('base64');
const r = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);
  const J=await import(u.find(n=>n.includes('/lib/ficheJumelle.js'))||'/src/medrevise/lib/ficheJumelle.js');const S=await import(u.find(n=>n.includes('/lib/storage.js'))||'/src/medrevise/lib/storage.js');
  const fichier=(s,n)=>{const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new File([a],n,{type:'application/pdf'})};
  const f=await S.getOne('fiches','${C}');
  const r1=await J.importerJumelle({courseId:'${C}',fichier:fichier(${JSON.stringify(b64('fiche.pdf'))},'fiche.pdf'),pdfIdOrig:f.pdfId});
  const r2=await J.importerJumelle({courseId:'${C}',fichier:fichier(${JSON.stringify(b64('fiche-dure.pdf'))},'fiche-dure.pdf'),pdfIdOrig:f.pdfId,enPlus:true});
  await J.modifierFiche(r2,{titre:'Fiche courte · séance 2',seance:{tagId:'pt-s2d',date:'2026-10-08',de:14,a:26}});
  return [r1.id,r1.nsAnnot,r2.id,r2.nsAnnot];})()`);
b.ok(r[0] === 'cp:' + C && r[1] === C + '::fiche:1' && r[2].startsWith('cp:' + C + ':') && r[3].startsWith(C + '::fiche-'), 'deux fiches importées (fonction de l’app)', JSON.stringify(r));
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert sur tablette');
await b.dormir(1500);
const btn = await b.rect(`document.querySelector('[data-choix-fiche]')`);
b.ok(btn && btn.h >= 36, 'menu de choix visible, cible ≥ 36 px', btn && JSON.stringify({ h: btn.h, w: btn.w }));
await b.tape([btn.cx, btn.cy]); await b.dormir(400);
const dessus = await b.ev(`(()=>{const it=document.querySelector('.pdfr-fiche-menu [data-fiche]');if(!it)return null;const q=it.getBoundingClientRect();const t=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);return {haut:Math.round(q.height),dessus:!!(t&&t.closest('.pdfr-fiche-menu'))}})()`);
b.ok(dessus && dessus.dessus && dessus.haut >= 44, 'le menu est AU-DESSUS de la page, lignes ≥ 44 px', JSON.stringify(dessus));
await cap('menu-choix');
const autre = await b.rect(`[...document.querySelectorAll('.pdfr-fiche-menu [data-fiche]')].find(x=>x.innerText.includes('Fiche courte'))`);
await b.tape([autre.cx, autre.cy]); await b.dormir(1800);
b.ok((await b.ev(`document.querySelector('[data-choix-fiche] .pdfr-fiche-nom')?.innerText`)) === 'Fiche courte · séance 2' && (await b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`)) === 'Fiche', 'au doigt : la fiche choisie s’affiche');
await cap('fiche-choisie');
const orig = await b.rect(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText==='Original')`);
await b.tape([orig.cx, orig.cy]); await b.dormir(1500);
b.ok(/\b1\s*\/\s*26\b/.test(await b.ev(`document.querySelector('.pdfr-v2')?.innerText || ''`)) && (await b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`)) === 'Original', 'segment Original : la diapo (26 p.) — inchangé');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
// remise en état (une seule fiche, comme avant le test)
await b.nettoyer([C]);
b.c.fermer(); process.exit(0);
