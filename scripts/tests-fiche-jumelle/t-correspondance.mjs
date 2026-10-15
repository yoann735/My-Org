// Taux de réussite de la correspondance automatique original ↔ fiche sur le jeu de test
// (cours 26 p., fiche 30 p. : 2 diapositives fusionnées, 5 pages ajoutées) — vérité dans verite.json.
// node t-correspondance.mjs <dossier fx> [fiche.pdf|fiche-v2.pdf]
import { banc } from './commun.mjs';
import fs from 'fs';
const fx = process.argv[2], nomFiche = process.argv[3] || 'fiche.pdf';
const b = await banc();
const b64 = (f) => fs.readFileSync(fx + '/' + f).toString('base64');
const verite = JSON.parse(fs.readFileSync(fx + '/verite.json'))[{ 'fiche.pdf': 'fiche', 'fiche-v2.pdf': 'v2', 'fiche-dure.pdf': 'dure' }[nomFiche]];
const res = JSON.parse(await b.ev(`(async()=>{
  const u=performance.getEntriesByType('resource').map(e=>e.name);
  const J=await import(u.find(n=>n.includes('/medrevise/lib/ficheJumelle.js'))||'/src/medrevise/lib/ficheJumelle.js');
  const P=await import(u.find(n=>n.includes('/medrevise/pdf/pdfjsSetup.js'))||'/src/medrevise/pdf/pdfjsSetup.js');
  const buf=(s)=>{const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a.buffer};
  const dO=await P.openPdf(buf(${JSON.stringify(b64('cours.pdf'))})), dF=await P.openPdf(buf(${JSON.stringify(b64(nomFiche))}));
  const tO=await J.textesPages(dO), tF=await J.textesPages(dF);
  const t0=performance.now(); const c=J.correspondance(tO,tF); const ms=performance.now()-t0;
  return JSON.stringify({c, ms, titresF: tF.map(p=>p.titre)});
})()`));
const { c } = res;
let bons = 0; const lignes = [];
verite.forEach((attendu, j) => {
  const obtenu = c.versA[j];
  // page de fiche : juste si (ajoutée ET non appariée) ou (appariée à l'une de ses pages d'origine)
  const ok = attendu.length === 0 ? obtenu == null : attendu.includes(obtenu);
  if (ok) bons++;
  lignes.push(`${ok ? '✓' : '✗'} fiche p.${String(j + 1).padStart(2)} → ${obtenu == null ? 'ajoutée' : 'orig. p.' + obtenu}  (attendu ${attendu.length ? attendu.join('+') : 'ajoutée'}, score ${c.scores[j] ?? '–'}) « ${res.titresF[j].slice(0, 46)} »`);
});
// pages originales : chacune doit mener à « sa » page de fiche (fusion comprise)
let bonsO = 0;
c.versB.forEach((f, i) => { const att = verite.findIndex((v) => v.includes(i + 1)) + 1; if (f === att) bonsO++; else lignes.push(`✗ orig. p.${i + 1} → fiche ${f} (attendu ${att})`); });
console.log(lignes.join('\n'));
console.log(`\nPages de fiche bien classées : ${bons}/${verite.length} (${(100 * bons / verite.length).toFixed(1)} %)`);
console.log(`Pages originales menant à la bonne page de fiche : ${bonsO}/${c.versB.length} (${(100 * bonsO / c.versB.length).toFixed(1)} %)`);
console.log(`Calcul : ${res.ms.toFixed(1)} ms, méthode ${c.methode}`);
b.c.fermer();
