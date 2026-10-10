// Chantier 3 : export / import JSON des textes d'annotations, deux versions, bascules.
// Pré-requis : « PDF texte J » ouvert (5 boîtes sur la page 1, seed.mjs).
import { banc } from './commun-doc.mjs';
import { outilsJson } from './json-commun.mjs';
const B = await banc();
const { c, ev, ok, clic, dormir } = B;
const J = outilsJson(B);
await c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' }).catch(() => {});
await ev(`(()=>{window.__telecharges=[];const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__telecharges.push({nom:this.download,href:this.href});return}return o.call(this)};return 1})()`);
await J.cadrer();
const avantRecs = await J.boites('j-txt');
const clip = await J.rectPage();
const AV = await J.capturer('json-avant', clip);
const rectB3 = () => ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const bs=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')];const e=bs.find(x=>/itrate synthase/.test(x.innerText));const r=e.getBoundingClientRect();return {x0:Math.floor(r.x-p.x)-14,y0:Math.floor(r.y-${clip.y})-14,x1:Math.ceil(r.right-p.x)+14,y1:Math.ceil(r.bottom-${clip.y})+14}})()`);
const rb3Avant = await rectB3();
// 1. EXPORT — page courante, presse-papiers
await J.fichier('Exporter les textes');
await clic(await B.bouton('Copier le JSON'), { att: 600 });
const copie = JSON.parse(await ev(`navigator.clipboard.readText()`));
ok(Object.keys(copie).join() === 'course,page,boxes' && copie.page === 1 && copie.boxes.length === 5 && copie.boxes.every((b) => Object.keys(b).join() === 'id,text'), '1. « Copier le JSON » (page) : { course, page, boxes:[{id,text}] } et rien d’autre', JSON.stringify(copie).slice(0, 260) + '…');
// 1b. EXPORT — fichier, cours entier
await clic(await B.pos(`[...document.querySelectorAll('.ta-portee .mep-pre')].find(b=>b.innerText.startsWith('Cours'))`, false), { att: 300 });
await clic(await B.bouton('Exporter le JSON'), { att: 800 });
const tel = await ev(`(async()=>{const t=window.__telecharges[window.__telecharges.length-1];if(!t)return null;return {nom:t.nom,txt:await (await fetch(t.href)).text()}})()`);
const fic = tel && JSON.parse(tel.txt);
ok(!!fic && !('page' in fic) && fic.boxes.length === 5 && fic.course === 'PDF texte J', '1b. « Exporter le JSON » (cours entier) : fichier ' + (tel && tel.nom), tel && tel.txt.slice(0, 160).replace(/\n/g, ' '));
await J.capturer('json-panneau-export', { x: 900, y: 60, width: 540, height: 420 });
await B.touche('Escape', { vk: 27 });
// 2. IMPORT — un seul texte modifié + un id inconnu
const modifie = JSON.parse(JSON.stringify(copie));
const cible = modifie.boxes.find((b) => b.id === 'an-b3');
cible.text = 'Citrate synthase : 1re étape du cycle.';
modifie.boxes.push({ id: 'an-inconnu-42', text: 'ne doit rien toucher' });
await J.fichier('Importer des textes');
await ev(`(()=>{const t=document.querySelector('.ta-colle');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,${JSON.stringify(JSON.stringify(modifie, null, 2))});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await dormir(200);
await clic(await B.bouton('Importer le collage'), { att: 900 });
const msg = await ev(`(document.querySelector('.ta-message')||{}).innerText`);
ok(/^1 boîte mise à jour, 4 inchangées, 1 id inconnu ignoré/.test(msg || ''), '2. résumé après import', JSON.stringify(msg));
await J.capturer('json-panneau-import', { x: 900, y: 60, width: 540, height: 520 });
await B.touche('Escape', { vk: 27 }); await dormir(400);
// 3. seules les données TEXTE de an-b3 ont changé ; les 4 autres boîtes : identiques
const apresRecs = await J.boites('j-txt');
const sans = (a) => { const { updatedAt, content, textOriginal, contentOriginal, textAlt, contentAlt, displayVersion, ...geo } = a; return geo; };
const autresIdentiques = apresRecs.filter((a) => a.id !== 'an-b3').every((a) => JSON.stringify(a) === JSON.stringify(avantRecs.find((x) => x.id === a.id)));
const b3a = avantRecs.find((a) => a.id === 'an-b3'), b3 = apresRecs.find((a) => a.id === 'an-b3');
ok(autresIdentiques, '3a. les 4 autres boîtes : enregistrements strictement identiques');
ok(JSON.stringify(sans(b3)) === JSON.stringify(sans(b3a)), '3b. an-b3 : position, taille, couleur, flèche, épingle, page intactes');
ok(b3.textOriginal === 'citrate synthase premiere etape du cycle tres importante a retenir pour le partiel' && b3.textAlt === cible.text && b3.displayVersion === 'alt' && JSON.stringify(b3.contentOriginal) === JSON.stringify(b3a.content), '3c. an-b3 : textOriginal figé, textAlt importé, affichage « alt »', JSON.stringify({ textOriginal: b3.textOriginal, textAlt: b3.textAlt, displayVersion: b3.displayVersion }));
ok(JSON.stringify(b3.content.content[0].content[0].marks) === JSON.stringify(b3a.content.content[0].content[0].marks), '3d. style du texte (taille de police) conservé');
const AP = await J.capturer('json-apres', clip);
const d = await J.diff(AV, AP);
const rb3 = await ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const bs=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')];const e=bs.find(x=>x.innerText.includes('Citrate synthase'));const r=e.getBoundingClientRect();return {x0:Math.floor(r.x-p.x)-14,y0:Math.floor(r.y-${clip.y})-14,x1:Math.ceil(r.right-p.x)+14,y1:Math.ceil(r.bottom-${clip.y})+14}})()`);
// la flèche de an-b3 part du bord de la boîte : elle suit la nouvelle taille du texte → zone élargie à la flèche
const fl = await ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const l=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .nb-fleche line')].map(e=>e.getBoundingClientRect());if(!l.length)return null;const x0=Math.min(...l.map(r=>r.x)),y0=Math.min(...l.map(r=>r.y)),x1=Math.max(...l.map(r=>r.right)),y1=Math.max(...l.map(r=>r.bottom));return {x0:Math.floor(x0-p.x)-6,y0:Math.floor(y0-${clip.y})-6,x1:Math.ceil(x1-p.x)+6,y1:Math.ceil(y1-${clip.y})+6}})()`);
const U = (a, b) => (b ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : a);
const zone = U(U(rb3, rb3Avant), fl);
ok(d.n > 0 && d.x0 >= zone.x0 && d.y0 >= zone.y0 && d.x1 <= zone.x1 && d.y1 <= zone.y1, '3e. capture avant/après : pixels différents UNIQUEMENT dans la boîte an-b3 (et sa flèche)', `diff ${JSON.stringify(d)} ⊂ zone ${JSON.stringify(zone)}`);
// 4. BASCULE PAR BOÎTE : « Voir l’original » dans la mini barre
const pb = await ev(`(()=>{const e=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')].find(x=>x.querySelector('.nb-version'));const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,e.querySelector('.nb-version').innerText]})()`);
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pb[0], y: pb[1] }); await dormir(700);
await clic(await B.pos(`document.querySelector('.nb-bascule')`, false), { att: 700 });
let r = (await J.boites('j-txt')).find((a) => a.id === 'an-b3');
const badge2 = await ev(`(document.querySelector('.pdfr-page[data-cle="1"] .nb-version')||{}).innerText`);
ok(pb[2] === 'IA' && r.displayVersion === 'original' && JSON.stringify(r.content) === JSON.stringify(b3a.content) && badge2 === 'orig.', '4a. bascule de la boîte → texte d’origine (badge « IA » → « orig. »)');
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 880 }); await dormir(600);
const AO = await J.capturer('json-retour-original', clip);
const d2 = await J.diff(AV, AO);
ok(d2.n > 0 && d2.x0 >= zone.x0 && d2.x1 <= zone.x1 && d2.y0 >= zone.y0 && d2.y1 <= zone.y1, '4b. version originale réaffichée : seul le badge « orig. » diffère de la capture d’avant', JSON.stringify(d2));
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pb[0], y: pb[1] }); await dormir(700);
await clic(await B.pos(`document.querySelector('.nb-bascule')`, false), { att: 700 });
r = (await J.boites('j-txt')).find((a) => a.id === 'an-b3');
ok(r.displayVersion === 'alt' && r.textAlt === cible.text, '4c. et retour en version IA');
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 880 }); await dormir(400);
// 5. BASCULES GLOBALES (page / cours), dans les deux sens
await J.fichier('Version des textes');
await clic(await B.bouton('Tout afficher en version originale'), { att: 700 });
r = (await J.boites('j-txt')).find((a) => a.id === 'an-b3');
const m1 = await ev(`(document.querySelector('.ta-message')||{}).innerText`);
await clic(await B.pos(`[...document.querySelectorAll('.ta-portee .mep-pre')].find(b=>b.innerText.startsWith('Cours'))`, false), { att: 300 });
await clic(await B.bouton('Tout afficher en version IA'), { att: 700 });
const r2 = (await J.boites('j-txt')).find((a) => a.id === 'an-b3');
const m2 = await ev(`(document.querySelector('.ta-message')||{}).innerText`);
ok(r.displayVersion === 'original' && r2.displayVersion === 'alt', '5. « Tout afficher en version originale » (page) puis « … IA » (cours)', `${m1} / ${m2}`);
await J.capturer('json-panneau-affichage', { x: 900, y: 60, width: 540, height: 420 });
await B.touche('Escape', { vk: 27 }); await dormir(300);
// 6. RÉIMPORT d'une nouvelle version : textAlt remplacé, textOriginal intact
cible.text = 'Citrate synthase = étape 1 (acétyl-CoA + oxaloacétate).';
await J.fichier('Importer des textes');
await ev(`(()=>{const t=document.querySelector('.ta-colle');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,${JSON.stringify(JSON.stringify(modifie))});t.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await dormir(200);
await clic(await B.bouton('Importer le collage'), { att: 900 });
const m3 = await ev(`(document.querySelector('.ta-message')||{}).innerText`);
await B.touche('Escape', { vk: 27 }); await dormir(300);
r = (await J.boites('j-txt')).find((a) => a.id === 'an-b3');
ok(r.textAlt === cible.text && r.textOriginal === b3.textOriginal && JSON.stringify(r.contentOriginal) === JSON.stringify(b3a.content), '6. réimport : textAlt remplacé, textOriginal intact', m3);
// 7. ÉDITION À LA MAIN de la version affichée (IA)
const pe = await ev(`(async()=>{const e=[...document.querySelectorAll('.pdfr-page[data-cle="1"] .note-box')].find(x=>x.innerText.includes('Citrate synthase ='));e.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,400));const t=e.querySelector('.nb-body');const r=t.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
await clic(pe, { att: 700 });
await B.touche('End', { vk: 35, code: 'End' });
await B.ecrire(' OK');
await dormir(300);
await B.touche('Escape', { vk: 27 }); await dormir(900);
r = (await J.boites('j-txt')).find((a) => a.id === 'an-b3');
ok(r.textAlt.endsWith(' OK') && r.textOriginal === b3.textOriginal && r.displayVersion === 'alt', '7. édition à la main en version IA → s’applique à la version IA seulement', JSON.stringify(r.textAlt));
// 8. ANNULER l'import (⌘Z) : la boîte revient d'un cran
await ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur(),1`);
const avantZ = r.textAlt;
await B.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await dormir(700);
r = (await J.boites('j-txt')).find((a) => a.id === 'an-b3');
ok(r.textAlt !== avantZ, '8. ⌘Z annule la dernière écriture de la boîte', JSON.stringify(r.textAlt));
await B.touche('z', { meta: true, shift: true, code: 'KeyZ', vk: 90 }); await dormir(700);
ok(!B.erreurs.length, 'aucune exception JS', B.erreurs.join(' | '));
c.fermer();
