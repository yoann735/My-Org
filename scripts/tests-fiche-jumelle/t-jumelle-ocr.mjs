// Fiche jumelle sur un cours SCANNÉ : la correspondance utilise le texte de l'OCR existant du cours
// (seed-scan.mjs, OCR terminé). Taux mesuré contre verite.json.
import { banc } from './commun.mjs';
import fs from 'fs';
const FX = process.argv[2];
const verite = JSON.parse(fs.readFileSync(FX + '/verite.json')).fiche;
const b = await banc();
console.log('nettoyage :', await b.nettoyer(['f-fjs']));
b.ok(await b.ouvrir('Physiologie rénale (scan)', { recharger: true }), 'cours scanné ouvert');
b.ok(await b.ev(`[...document.querySelectorAll('.mf-item, .pdfr-textlayer span')].length`) > 0, 'couche de texte OCR présente sur la page');
const pris = b.fichierSuivant(FX + '/fiche.pdf');
await b.menuFichier('Importer la fiche jumelle'); await pris; await b.dormir(4000);
const rec = JSON.parse(await b.S(`return JSON.stringify(await S.getOne('companion_pdf','cp:f-fjs'))`));
let bons = 0;
verite.forEach((att, j) => { const o = rec.pageMap.versOrig[j]; if (att.length ? att.includes(o) : o == null) bons++; });
b.ok(rec.pageMap.methode === 'texte', 'méthode : similarité de texte (OCR du cours)', rec.pageMap.methode);
b.ok(bons >= 28, `pages de fiche bien classées via l’OCR : ${bons}/30 (${(100 * bons / 30).toFixed(1)} %)`, rec.pageMap.versOrig.map((x) => x ?? '·').join(' '));
console.log('   RESULTAT_OCR', bons, '/ 30');
await b.T.Escape();
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
