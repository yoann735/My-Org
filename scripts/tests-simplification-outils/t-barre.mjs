// §1 BARRE À 6 OUTILS : ordre, ⌘1–6, sous-barres, sous-outils mémorisés, Insérer, « ? » retiré.   node t-barre.mjs [tablette]
import { banc } from './commun.mjs';
const tablette = process.argv[2] === 'tablette';
const b = await banc();
await b.preparer();
await b.ouvrirCours({ tablette });
const SEL = tablette ? '.tab-outils [data-outil]' : '.ptb-outils [data-outil]';
const ids = await b.ev(`[...document.querySelectorAll('${SEL}')].map(e=>e.getAttribute('data-outil'))`);
const titres = await b.ev(`[...document.querySelectorAll('${SEL}')].map(e=>e.title.split(' — ')[0])`);
b.ok(JSON.stringify(ids) === JSON.stringify(['main', 'surligneur', 'dessin', 'ecrire', 'forme', 'inserer']), 'barre : Sélection · Surligneur · Dessin · Texte · Formes · Insérer', JSON.stringify(titres));
b.ok(titres.every((t, i) => t.endsWith('⌘' + (i + 1))), 'infobulles ⌘1–6 dans l’ordre');
const ancien = await b.ev(`!!document.querySelector('[title^="?"], [aria-label="?"], .ptb-outil[title^="Gomme"], .ptb-outil[title^="Crayon"], .ptb-outil[title^="Boîte"]')`);
b.ok(!ancien, 'plus de « ? », Crayon, Gomme ni Boîte comme outils séparés de la barre');
const apres = await b.ev(`(()=>{const o=document.querySelector('[data-outil="inserer"]');let n=o.nextElementSibling;const l=[];while(n){l.push(n.className+':'+(n.getAttribute('aria-label')||n.title||'').split(' (')[0]);n=n.nextElementSibling}return l})()`);
console.log('après Insérer :', JSON.stringify(apres));
const actif = () => b.ev(`(document.querySelector('${SEL}[aria-pressed="true"]')||{}).getAttribute?.('data-outil')`);
const sousBarre = () => b.ev(`(()=>{const r=document.querySelector('.pdfr-contexte .pdfr-rangee-contenu');return r?[...r.querySelectorAll('[data-sous-outil], [data-inserer], .ptb-dessins, .sc-pastille, .ct-bouton, .ptb-bascule, [data-forme], [data-mode-gomme]')].map(e=>e.getAttribute('data-sous-outil')||e.getAttribute('data-inserer')||e.getAttribute('data-forme')||e.getAttribute('data-mode-gomme')||(e.classList.contains('ct-bouton')?'taille:'+e.getAttribute('data-genre'):e.classList.contains('ptb-dessins')?'dessins':e.classList.contains('sc-pastille')?'couleur':e.innerText.trim()||e.className.split(' ')[0])):null})()`);
// ⌘1–6 (touche physique)
const cmd = async (n) => { await b.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur();1`); await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: String(n), code: 'Digit' + n, windowsVirtualKeyCode: 48 + n, modifiers: 4 }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: String(n), code: 'Digit' + n, windowsVirtualKeyCode: 48 + n, modifiers: 4 }); await b.dormir(350); };
const vus = [];
for (let n = 1; n <= 6; n++) { await cmd(n); vus.push(await actif()); }
b.ok(JSON.stringify(vus) === JSON.stringify(['main', 'surligneur', 'dessin', 'ecrire', 'forme', 'inserer']), '⌘1 … ⌘6 sélectionnent les 6 outils dans l’ordre', JSON.stringify(vus));
// sous-barres
await cmd(2); const sSurl = await sousBarre();
b.ok(sSurl && sSurl.includes('taille:surligneur') && sSurl.some((x) => /Ligne droite/.test(x)) && sSurl.includes('couleur'), 'Surligneur : couleurs · épaisseur du trait libre · « Ligne droite »', JSON.stringify(sSurl));
await b.capRect('so-sous-surligneur', `document.querySelector('.pdfr-contexte')`, 4);
await cmd(3); const sDessin = await sousBarre();
b.ok(sDessin && sDessin[0] === 'crayon' && sDessin[1] === 'gomme' && sDessin.includes('taille:crayon') && sDessin.includes('couleur'), 'Dessin : Crayon · Gomme, épaisseur, couleurs', JSON.stringify(sDessin));
await b.capRect('so-sous-dessin', `document.querySelector('.pdfr-contexte')`, 4);
await b.sousOutil('gomme'); const sGomme = await sousBarre();
b.ok(sGomme && sGomme.includes('zone') && sGomme.includes('trait') && (await b.ev(`[...document.querySelectorAll('[data-mode-gomme]')].map(e=>e.innerText).join('/')`)) === 'Standard/Trait entier', 'Dessin › Gomme : Standard / Trait entier', JSON.stringify(sGomme));
await cmd(1); await cmd(3);
b.ok((await b.ev(`(document.querySelector('[data-sous-outil][aria-pressed="true"]')||{}).dataset?.sousOutil`)) === 'gomme', 'Dessin retrouve le dernier sous-outil (Gomme)');
await b.sousOutil('crayon');
await cmd(4); const sTexte = await sousBarre();
b.ok(sTexte && JSON.stringify(sTexte.slice(0, 4)) === JSON.stringify(['boite', 'texte', 'postit', 'boiteTableau']), 'Texte : Boîte · Texte libre · Post-it · Boîte-tableau', JSON.stringify(sTexte));
await b.capRect('so-sous-texte', `document.querySelector('.pdfr-contexte')`, 4);
await cmd(5); const sFormes = await sousBarre();
b.ok(sFormes && JSON.stringify(sFormes.slice(0, 6)) === JSON.stringify(['rectangle', 'ellipse', 'triangle', 'ligne', 'fleche', 'plus']), 'Formes : Rectangle · Ellipse · Triangle · Ligne · Flèche · « … »', JSON.stringify(sFormes));
await b.clic(await b.pos(`document.querySelector('[data-forme="plus"]')`, false), { att: 300 });
const toutes = await b.ev(`[...document.querySelectorAll('.ptb-formes [data-forme]')].map(e=>e.dataset.forme).filter(x=>x!=='plus')`);
b.ok(toutes.length === 12, '« … » des formes : les 7 autres formes (12 en tout)', JSON.stringify(toutes));
await b.capRect('so-sous-formes', `document.querySelector('.pdfr-contexte')`, 4);
await cmd(6); const sIns = await sousBarre();
b.ok(sIns && sIns.includes('image') && sIns.includes('page'), 'Insérer : Image · Page (· Dessins du téléphone si le cours en reçoit)', JSON.stringify(sIns));
b.ok((await b.ev(`document.querySelector('.pdfr-textlayer').className`)).includes('outil-main'), 'Insérer laisse la page en Sélection');
await b.capRect('so-sous-inserer', `document.querySelector('.pdfr-contexte')`, 4);
await b.outil6('inserer'); b.ok((await actif()) === 'main', 're-cliquer Insérer referme sa sous-barre (⌘6 sélectionne seulement)');
// barre complète (capture)
await cmd(1);
{ const r1 = await b.rect(`document.querySelector('.pdfr-barre')`); await b.capture('so-barre-6-outils' + (tablette ? '-tablette' : ''), { x: Math.round(r1.x - 4), y: Math.round(r1.y - 4), width: Math.round(Math.min(r1.w + 8, 1440)), height: Math.round(r1.h + 8) }); }
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
