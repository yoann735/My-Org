// Banc « analyse suspendue » (26/11/2026, docs/compte-rendu-suivi-diapos-continu-et-defilement.md).
// Panne injectée PAR LE BANC (le code de l'app n'est pas modifié) : le moteur OCR de l'app ne répond plus (worker Tesseract
// occupé ou bloqué). Le prof coupe son partage (galerie : image ambiguë → l'analyse demande l'OCR), puis reprend et fait
// défiler 4 diapos. Avant la correction : l'analyse attend l'OCR pour toujours → plus aucun changement détecté, et
// l'indication reste « Diapo N · auto ». Après : OCR borné à 8 s, la boucle continue.
// Usage : node t-ocr-bloque.mjs   (BASE / DEEPGRAM / PORT_CHROME / PROFIL comme les autres bancs)
import fs from 'node:fs';
import path from 'node:path';
import { lancerChrome, dormir, ok, TRAVAIL, BASE, ouvrirBanc } from './commun.mjs';

const SORTIE = process.env.SORTIE || path.join(TRAVAIL, 'ocr-bloque.json');
const chrome = await lancerChrome();
const r = { base: BASE };
try {
  const { teams, app, ouvrir, demarrerOnglet } = await ouvrirBanc();
  await ouvrir('Histologie générale (banc)');
  await demarrerOnglet();
  if (!ok(await app.attendre(`window.__transcription && window.__transcription.lireEtat().phase==='live'`, 20000), 'transcription en direct')) throw new Error('démarrage impossible');
  await teams.ev('window.demarrerSon()');
  ok(await app.attendre(`window.__transcription.lireSuivi().statut==='suivi'`, 60000), 'suivi prêt');
  await teams.ev('window.montrer(1); 1');
  ok(await app.attendre(`window.__transcription.lireSuivi().page===1`, 15000), 'diapo 1 reconnue');
  // PANNE : le moteur OCR partagé de l'app ne répond plus
  await app.ev(`import('/src/medrevise/ocr/moteur.js').then((m) => { const e = m.moteurOcr(); window.__ocrDemandes = 0; e.recognizePage = () => { window.__ocrDemandes++; return new Promise(() => {}); }; return 1; })`);
  await teams.ev('window.couperPartage(); 1');
  await dormir(20000);
  r.ocrDemandes = await app.ev('window.__ocrDemandes');
  const vus = [];
  for (const p of [5, 6, 7, 9]) {
    await teams.ev(`window.montrer(${p}); 1`);
    const t0 = Date.now();
    const vu = await app.attendre(`window.__transcription.lireSuivi().page===${p}`, 25000);
    vus.push({ page: p, vu, delaiS: vu ? (Date.now() - t0) / 1000 : null, indication: await app.ev(`(document.querySelector('.trx-suivi-ind')||{}).innerText||''`) });
    await dormir(5000);
  }
  r.vus = vus;
  r.journal = await app.ev('JSON.parse(JSON.stringify((window.__transcription.journalSuivi)||[]))');
  ok(r.ocrDemandes >= 1, `OCR demandé pendant la galerie (${r.ocrDemandes} demande(s)) et jamais répondu`);
  ok(vus.every((v) => v.vu), `après la panne : ${vus.filter((v) => v.vu).length}/4 diapos reconnues`, vus.map((v) => `p.${v.page} ${v.vu ? 'vue en ' + v.delaiS.toFixed(1) + ' s' : 'RATÉE'} « ${v.indication} »`).join(' · '));
  fs.writeFileSync(SORTIE, JSON.stringify(r, null, 1));
  await app.ev(`(document.querySelector('.trx-stop')||{click(){}}).click(),1`);
  teams.ev('window.arreterSon(); 1').catch(() => {});
} finally { chrome.arreter(); }
const ko = ok.resultats.filter((x) => !x.ok).length;
console.log(ko ? `${ko} échec(s)` : 'TOUT VERT');
process.exit(ko ? 1 : 0);
