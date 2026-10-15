// Fiche jumelle — un calque d'annotations PAR document ; notions, flashcards, transcript rattachés
// au cours (visibles des deux côtés) ; position de lecture mémorisée par document.
import { banc } from './commun.mjs';
const b = await banc();
// calques propres : on retire les annotations de test du cours ET de sa fiche (la fiche reste importée)
await b.S(`for(const st of ['annotations','highlights'])for(const a of await S.getAll(st))if(a.ficheId==='f-fj'||String(a.ficheId).startsWith('f-fj::fiche'))await S.remove(st,a.id);return 1`);
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert');
const vue = () => b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`);
const versVue = async (v) => { if ((await vue()) !== v) await b.clic(await b.pos(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText===${JSON.stringify(v)})`, false), { att: 1500 }); };
const enHaut = async () => { await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0`); await b.dormir(600); };
const boites = () => b.ev(`[...document.querySelectorAll('.note-box')].map(n=>n.innerText.trim()).join(' | ')`);
const poserBoite = async (txt) => {
  const pg = await b.rect(`[...document.querySelectorAll('.pdfr-textlayer span')][0].closest('.pdfr-page')`);
  await b.clic(await b.bouton('Boîte'));
  await b.clic([pg.x + pg.w * 0.55, pg.y + 300], { att: 800 }); await b.ecrire(txt);
  await b.T.Escape(); await b.T.Escape(); await b.dormir(500);
};
const surligner = async (mot) => {
  await b.clic(await b.bouton('Surligneur'));
  const sp = await b.rect(`[...document.querySelectorAll('.pdfr-textlayer span')].find(s=>s.textContent.includes(${JSON.stringify(mot)}))`);
  await b.glisser([sp.x + 2, sp.cy], [sp.x + sp.w * 0.7, sp.cy], 12); await b.dormir(600);
  await b.clic(await b.bouton('Sélection'));
};
// ORIGINAL : une boîte + un surlignage
await versVue('Original'); await enHaut();
await poserBoite('Boîte de l’original');
await surligner('Pyramides');
b.ok((await boites()).includes('Boîte de l’original'), 'boîte posée sur l’original');
// FICHE : la boîte de l'original n'y est PAS ; on y pose les siennes
await versVue('Fiche'); await enHaut();
b.ok(!(await boites()).includes('Boîte de l’original'), 'sur la fiche, la boîte de l’original n’apparaît pas', await boites());
await poserBoite('Boîte de la fiche');
await surligner('Capsule');
b.ok((await boites()) === 'Boîte de la fiche', 'boîte posée sur la fiche (seule de ce calque)', await boites());
const base = JSON.parse(await b.S(`const r=[];for(const st of ['annotations','highlights'])for(const a of await S.getAll(st))if(a.ficheId==='f-fj'||String(a.ficheId).startsWith('f-fj::fiche'))r.push({st,ns:a.ficheId,t:a.texte||(JSON.stringify(a.content||'').match(/"text":"([^"]*)"/)||[])[1]});return JSON.stringify(r)`));
b.ok(base.some((x) => x.ns === 'f-fj' && /original/.test(x.t)) && base.some((x) => x.ns === 'f-fj::fiche:1' && /fiche/.test(x.t)), 'en base : calque « f-fj » (original) et « f-fj::fiche:1 » (fiche)', JSON.stringify(base));
await b.capt('jumelle-calque-fiche');
// ORIGINAL de nouveau : seule sa boîte
await versVue('Original'); await enHaut();
b.ok((await boites()) === 'Boîte de l’original', 'retour à l’original : seule sa boîte', await boites());
// NOTIONS : celles des DEUX documents dans le panneau, quel que soit le document affiché
await b.clic(await b.pos(`[...document.querySelectorAll('.pis button, .pis [role=tab]')].find(x=>x.innerText.trim().startsWith('Notions'))`, false), { att: 600 });
const notions = await b.ev(`document.querySelector('.pis-notions')?.innerText || ''`);
b.ok(notions.includes('Pyramides') && notions.includes('Capsule') && /Dans la fiche/i.test(notions), 'panneau Notions sur l’original : sa notion + celle de la fiche', notions.replace(/\n/g, ' | ').slice(0, 220));
await b.capt('jumelle-notions-deux-docs');
// clic sur la notion de la fiche → bascule vers la fiche
await b.clic(await b.pos(`[...document.querySelectorAll('.pis-notions .hl-entry')].find(x=>x.innerText.includes('Capsule'))`, false), { att: 1800 });
b.ok((await vue()) === 'Fiche', 'clic sur la notion de la fiche : bascule vers la fiche');
const notionsF = await b.ev(`document.querySelector('.pis-notions')?.innerText || ''`);
b.ok(notionsF.includes('Pyramides') && /Dans l.original/i.test(notionsF), 'sur la fiche, la notion de l’original reste listée');
// FLASHCARDS / TRANSCRIPT : rattachés au cours, mêmes des deux côtés
const onglets = () => b.ev(`[...document.querySelectorAll('.pis [role=tab], .pis button')].map(x=>x.innerText.trim()).filter(Boolean).join(' · ')`);
const oF = await onglets(); await versVue('Original'); const oO = await onglets();
b.ok(/Flashcards\s*1/.test(oF) && /Flashcards\s*1/.test(oO), 'flashcards du cours : 1 des deux côtés', oF.slice(0, 120));
b.ok(/Transcript/.test(oF) && /Transcript/.test(oO), 'onglet Transcript (du cours) des deux côtés');
// POSITION DE LECTURE PAR DOCUMENT
await versVue('Fiche');
await b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');el.scrollTop=el.scrollHeight*19.3/30;return 1})()`); await b.dormir(1500);
const pF = await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`);
await versVue('Original');
await b.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');el.scrollTop=el.scrollHeight*4.3/26;return 1})()`); await b.dormir(1500);
const pO = await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`);
const rps = JSON.parse(await b.S(`return JSON.stringify((await S.getAll('reading_position')).filter(r=>String(r.id).startsWith('rp:f-fj')).map(r=>({id:r.id,cle:r.cle,ns:r.ficheId})))`));
b.ok(rps.some((r) => r.id === 'rp:f-fj') && rps.some((r) => r.id === 'rp:f-fj::fiche:1'), 'deux positions mémorisées : original et fiche', JSON.stringify(rps));
await versVue('Fiche'); // la dernière vue est la fiche
await b.dormir(800);
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'rechargement du cours');
const apres = await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`);
b.ok((await vue()) === 'Fiche', 'le cours rouvre sur la fiche (dernière vue de l’appareil)');
console.log('   pages : fiche', pF, '/ original', pO, '/ à la réouverture', apres);
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
