// Tags « Début / Fin » — SYNCHRO vers un 2ᵉ appareil, sans le vrai cloud : scripts/faux-supabase.mjs (:54399), Vite :5300
// (VITE_SUPABASE_URL=http://localhost:54399), Chrome A (9335) et B (9336), profils neufs. node t-tags-synchro.mjs <fx>
import { banc } from '../tests-fiche-jumelle/commun.mjs';
import fs from 'fs';
const FX = process.argv[2];
let echecs = 0; const v = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const etatCloud = async () => (await fetch('http://localhost:54399/__etat')).json();
process.env.CDP_FILTRE = '5300';
process.env.CDP_PORT = '9335';
const A = await banc();
await A.c.send('Page.navigate', { url: 'http://localhost:5300/' }); await A.dormir(5000);
const pdf = fs.readFileSync(FX + '/cours.pdf').toString('base64');
await A.S(`const b64=(s,t)=>{const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:t})};
await S.put('sources',{id:'src-fj',nom:'Source jumelle',couleur:'#7c5cff'});
await S.put('matieres',{id:'mat-fj',nom:'Physiologie test',sourceId:'src-fj'});
const pdfId=await S.putBlob(b64(${JSON.stringify(pdf)},'application/pdf'));
await S.put('fiches',{id:'f-fj',matiereId:'mat-fj',dossierId:null,titre:'Physiologie rénale (jumelle)',type:'standard',pdfId,pdfName:'cours.pdf',dateImport:'2026-10-15'});return 1`);
v(await A.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'A : cours ouvert');
await A.dormir(1500);
// A : début page 2 par le menu de la page (clic droit), fin page 3 par « … »
const page = async (n) => { for (let i = 0; i < 30; i++) { const ok = await A.ev(`(()=>{const s=document.querySelector('.pdfr-scroll');const e=document.querySelector('.pdfr-page[data-cle="${n}"]');if(e){s.scrollTop+=e.getBoundingClientRect().top-s.getBoundingClientRect().top-20;return true}s.scrollTop+=s.clientHeight*.8;return false})()`); await A.dormir(ok ? 700 : 300); if (ok) return; } };
const valider = async (date) => {
  for (let i = 0; i < 20 && !(await A.ev(`!!document.querySelector('.tgp-fenetre')`)); i++) await A.dormir(150);
  await A.ev(`(()=>{const i=document.querySelector('.tgp-fenetre [data-champ=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'${date}');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
  await A.dormir(300); await A.clic(await A.pos(`document.querySelector('.tgp-fenetre [data-action=valider]')`, false), { att: 700 });
};
await page(2);
let r = await A.ev(`(()=>{const e=document.querySelector('.pdfr-page[data-cle="2"]').getBoundingClientRect();return [e.x+e.width*.3,e.y+Math.min(e.height*.5,300)]})()`);
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await A.c.send('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'right', clickCount: 1 });
await A.dormir(500);
await A.clic(await A.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.includes('Marquer début'))`, false), { att: 500 });
await valider('2026-10-22');
await page(3);
await A.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 400 });
await A.clic(await A.pos(`document.querySelector('.pdfr-page[data-cle="3"] .pdfr-tag-ic')`, false), { att: 500 });
await A.clic(await A.pos(`[...document.querySelectorAll('.ctx-menu-item')].find(x=>x.innerText.includes('Marquer fin'))`, false), { att: 500 });
await valider('2026-10-22');
await A.ev(`window.dispatchEvent(new Event('online'));1`); await A.dormir(6000);
const lignes = (await etatCloud()).rows.filter((x) => x.store === 'page_tag');
v(lignes.length === 2, `faux cloud : ${lignes.length} lignes « page_tag »`, lignes.map((x) => x.record_id).join(', '));
const empreinte = (B) => B.S(`const l=(await S.getAll('page_tag')).filter(t=>t.courseId==='f-fj').sort((a,b)=>a.id<b.id?-1:1).map(t=>[t.id,t.kind,t.page,t.pageCle,t.date,t.document,t.transcriptSessionId||null,!!t.supprime]);const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(l)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16)+' '+l.length`);
const hA = await empreinte(A);
A.c.fermer();
// B : profil neuf, rien de semé — la synchro ramène le cours, son PDF et ses tags
process.env.CDP_PORT = '9336';
const B = await banc();
await B.c.send('Page.navigate', { url: 'http://localhost:5300/' }); await B.dormir(4000);
await B.ev(`[...document.querySelectorAll('.hub-card')].find(b=>/MedRevise/i.test(b.innerText))?.click();1`); await B.dormir(6000);
await B.ev(`window.dispatchEvent(new Event('online'));1`); await B.dormir(6000);
const hB = await empreinte(B);
v(hA === hB, `B : mêmes tags qu’A (SHA-256 ${hB})`, 'A ' + hA);
v(await B.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'B : cours ouvert');
await B.dormir(2500);
const sur = await B.ev(`(()=>{const s=document.querySelector('.pdfr-scroll');s.scrollTop=0;return 1})()`); await B.dormir(800);
const p2 = await B.ev(`(()=>{const e=document.querySelector('.pdfr-page[data-cle="2"]');return e?[...e.querySelectorAll('.tgp-pastille')].map(x=>x.textContent).join('+')+' liseré:'+e.classList.contains('en-seance'):'non montée'})()`);
v(/▶ Début · 22 oct\./.test(p2) && /liseré:true/.test(p2), `B : pastille et liseré sur la page 2 (${p2})`);
await B.capture('tags-synchro-B');
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
