// Téléphone (Chrome D, 390 × 844, tactile) : le bouton « Exporter » de la barre du mode Apprentissage tient sur la ligne
// (aucun débordement), un tap ouvre la fenêtre, l'export des cartes visibles aboutit.
import { banc } from './commun.mjs';
import { ouvrirZip } from './aide.mjs';
const b = await banc(true);
await b.ouvrirApp({ recharger: true });
await b.ev(`(()=>{try{localStorage.removeItem('medrevise.apprentissage.filtres')}catch(e){}return 1})()`);
await b.apprentissage();
await b.taper(`document.querySelector('.alib2-recherche input')`, 'scapula');
const ligne = await b.ev(`(()=>{const l=document.querySelector('.alib2-mligne');const r=l.getBoundingClientRect();const bt=l.querySelector('[data-act="exporter-fc"]').getBoundingClientRect();return {large:Math.round(r.width),contenu:l.scrollWidth,bt:[Math.round(bt.left),Math.round(bt.right)],page:document.documentElement.scrollWidth}})()`);
b.v(ligne.contenu <= ligne.large + 1 && ligne.page <= 390 && ligne.bt[1] <= 390, 'barre du mode Apprentissage : le bouton Exporter tient, aucun débordement', JSON.stringify(ligne));
const n = await b.compteur();
await b.capture('mobile-apprentissage-barre', { x: 0, y: 0, width: 390, height: 200 });
await b.toucher(`document.querySelector('.alib2 [data-act="exporter-fc"]')`, 600);
b.v(new RegExp(`${n} cartes`).test(await b.texte('[data-export-flashcards] [data-compte]')), `fenêtre d’export ouverte d’un tap : ${n} cartes visibles`);
await b.capture('mobile-export-fenetre');
await b.lancerExport();
const z = await b.recupererZip('mobile.zip');
const Z = ouvrirZip(z.chemin);
b.v(Z.integre && Z.doc.items.length === n, 'téléphone : export abouti, archive intègre', `${n} cartes · ${z.nom}`);
b.fin();
