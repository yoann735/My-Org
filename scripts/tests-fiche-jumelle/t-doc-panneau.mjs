// Fiche jumelle sur DOCUMENT — notions (du document et de la fiche), flashcards et transcript visibles des
// deux côtés ; position de lecture par document ; rien ne reste du mode « Les deux ».
import { banc } from './commun.mjs';
const b = await banc();
b.ok(await b.ouvrir('Myologie (document)', { recharger: true }), 'cours document ouvert');
const id = await b.S(`return (await S.getAll('fiches')).find(f=>f.titre==='Myologie (document)').id`);
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
const versVue = async (v) => { if ((await vue()) === v) return; await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(v)})`, false), { att: 300 }); for (let k = 0; k < 40 && (await vue()) !== v; k++) await b.dormir(100); await b.dormir(1500); };
const surligner = async (sel, mot) => {
  await b.clic(await b.bouton('Surligneur'));
  const r = await b.ev(`(()=>{const w=document.createTreeWalker(document.querySelector('.pdfr-scroll'),NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const i=n.textContent.indexOf(${JSON.stringify(mot)});if(i>=0&&n.parentElement.closest(${JSON.stringify(sel)})){const rg=document.createRange();rg.setStart(n,i);rg.setEnd(n,i+${mot.length});rg.startContainer.parentElement.scrollIntoView({block:'center'});const q=rg.getBoundingClientRect();return [q.left+1,q.top+q.height/2,q.right-1]}}return null})()`);
  await b.glisser([r[0], r[1]], [r[2], r[1]], 12); await b.dormir(800);
  await b.clic(await b.bouton('Sélection'));
};
// une notion dans le DOCUMENT (surligneur dans le texte) et une sur la FICHE
await versVue('Original');
await surligner('.pt-flux-cadre', 'sarcomère');
await versVue('Fiche'); await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(600);
await surligner('.pdfr-textlayer', 'Le sarcomère');
const onglet = async (nom) => { await b.clic(await b.pos(`[...document.querySelectorAll('.pis [role=tab], .pis button')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(nom)}))`, false), { att: 600 }); };
await onglet('Notions');
const nF = await b.ev(`document.querySelector('.pis-notions')?.innerText || ''`);
b.ok(/sarcomère/i.test(nF) && nF.split(/sarcomère/i).length - 1 >= 2, 'côté Fiche : la notion de la fiche ET celle du document', nF.replace(/\n/g, ' | ').slice(0, 200));
const oF = await b.ev(`[...document.querySelectorAll('.pis [role=tab], .pis button')].map(x=>x.innerText.trim()).join(' · ')`);
await versVue('Original'); await onglet('Notions');
const nO = await b.ev(`document.querySelector('.pis-notions')?.innerText || ''`);
b.ok(/Dans la fiche/i.test(nO) && nO.split(/sarcomère/i).length - 1 >= 2, 'côté Document : sa notion + « Dans la fiche »', nO.replace(/\n/g, ' | ').slice(0, 200));
await b.capt('doc-notions-deux-cotes');
const oO = await b.ev(`[...document.querySelectorAll('.pis [role=tab], .pis button')].map(x=>x.innerText.trim()).join(' · ')`);
b.ok(/Flashcards\s*1/.test(oF) && /Flashcards\s*1/.test(oO), 'flashcards du cours (1) des deux côtés');
b.ok(/Transcript/.test(oF) && /Transcript/.test(oO), 'Transcript des deux côtés');
// côté Fiche, un clic sur la notion du DOCUMENT ramène au document
await versVue('Fiche'); await onglet('Notions');
b.ok(/document/i.test(await b.ev(`document.querySelector('.hl-notes .hl-entry-page')?.innerText || ''`)), 'côté Fiche, la notion du document est étiquetée « document »');
await b.clic(await b.pos(`document.querySelector('.hl-notes .hl-entry')`, false), { att: 300 });
for (let k = 0; k < 40 && (await vue()) !== 'Original'; k++) await b.dormir(100);
await b.dormir(1500);
b.ok((await vue()) === 'Original' && await b.ev(`!!document.querySelector('.pt-flux-cadre')`), 'clic : retour au document (éditeur)');
// positions par document
await b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');el.scrollTop=el.scrollHeight*0.55;return 1})()`); await b.dormir(1500);
await versVue('Fiche'); await b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');el.scrollTop=el.scrollHeight*0.8;return 1})()`); await b.dormir(1500);
await versVue('Original'); await b.dormir(800);
const rps = JSON.parse(await b.S(`return JSON.stringify((await S.getAll('reading_position')).filter(r=>String(r.id).startsWith('rp:${id}')).map(r=>r.id+':'+r.kind))`));
b.ok(rps.includes(`rp:${id}:doc`) && rps.includes(`rp:${id}::fiche:1:pdf`), 'une position par document (document : kind doc, fiche : kind pdf)', JSON.stringify(rps));
// plus aucune trace du mode « Les deux » de la fiche jumelle
b.ok(!(await b.ev(`!!document.querySelector('.pdfr-jumelle-deux, .pdfr-jumelle, .vj')`)) && (await b.ev(`document.querySelector('.pdfr-jumelle-bascule').innerText.replace(/\\s+/g,' ').trim()`)) === 'Original Fiche', 'segment à deux positions seulement « Original · Fiche »');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
