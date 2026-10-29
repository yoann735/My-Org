// Banc « statut de synchro + cases à cocher » (29/10, docs/compte-rendu-statut-synchro.md) — captures des cases à cocher
// dans chaque écran concerné. Usage : node cap-cases.mjs avant|apres
// Même installation que ../tests-synchro-affichage (faux Supabase :54399, Vite :5300, Chrome A 9335 / B 9336, profils neufs,
// jeu ../tests-selection-passages/seed.mjs). Captures dans ../../docs/img/statut-synchro/cases-<quand>-<écran>.png
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appareil } from '../tests-synchro-affichage/commun.mjs';
const QUAND = process.argv[2] || 'apres';
const DOSSIER = fileURLToPath(new URL('../../docs/img/statut-synchro/', import.meta.url));
fs.mkdirSync(DOSSIER, { recursive: true });
const tel = process.argv[3] === 'tel';
const b = await appareil(tel);
const appareilNom = tel ? 'tel' : 'ordi';
const cap = async (nom, js, marge = 12, hMax = 640) => {
  try {
    await b.ev(`(() => { const e = ${js}; e && e.scrollIntoView({ block: 'center' }); return 1; })()`); await b.dormir(250);
    const r = await b.rect(js);
    if (!r) { console.log('⚠️ introuvable', nom); return; }
    const W = tel ? 390 : 1440;
    const clip = { x: Math.max(0, r.x - marge), y: Math.max(0, r.y - marge), width: Math.min(W, r.w + 2 * marge), height: Math.min(hMax, r.h + 2 * marge) };
    const s = await b.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: tel ? 2 : 1.5 } });
    fs.writeFileSync(`${DOSSIER}cases-${QUAND}-${appareilNom}-${nom}.png`, Buffer.from(s.data, 'base64'));
    console.log('📸', nom);
  } catch (e) { console.log('⚠️', nom, String(e.message || e).slice(0, 120)); }
};
// mode sombre de l'app (thème partagé) : on capture tel quel, c'est la DA courante du profil
await b.send('Page.navigate', { url: 'http://localhost:5300/' }); await b.dormir(3000);
await b.ouvrirApp({ recharger: false });
await b.attendrePhase(['ajour', 'incomplet', 'echec', 'horsligne'], 30000);

// 1. Séance du jour : catégories Retard / Révisions / Nouvelles
if (!tel) await b.reviser();
await b.attendre(`!!document.querySelector('[data-sfa="lanceur"]')`, 15000);
await cap('seance', `document.querySelector('[data-sfa="lanceur"]')`);

// 2. Apprentissage : cases de groupe (partiel), cases de carte, filtre des matières
await b.apprentissage(); await b.deplier(); await b.dormir(400);
await b.ev(`(() => { const c = document.querySelector('.alib2-carte[data-carte="c1-retard1"] .alib2-case input'); c && c.click(); return 1; })()`); await b.dormir(300);
await b.ev(`(() => { const c = document.querySelector('.alib2-carte[data-carte="c1-retard2"] .alib2-case input'); c && c.click(); return 1; })()`); await b.dormir(400);
await cap('apprentissage-liste', `document.querySelector('.alib2-cours[data-cours="f1"]') || document.querySelector('.alib2')`, 8, tel ? 760 : 560);
if (tel) { await b.toucher(`document.querySelector('[data-puce="filtres"]')`, 700); await cap('apprentissage-filtres', `document.querySelector('.alib2-feuille')`, 0, 800); await b.toucher(`document.querySelector('.alib2-fpied .btn')`, 500); }
else { await b.toucher(`document.querySelector('[data-puce="matieres"]')`, 500); await cap('apprentissage-filtres', `document.querySelector('.alib2-pop')`); await b.ev(`(window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})), 1)`); }
// remise à zéro de la sélection (le banc reste rejouable)
await b.ev(`(() => { for (const id of ['c1-retard1','c1-retard2']) { const c = document.querySelector('.alib2-carte[data-carte="' + id + '"] .alib2-case input'); c && c.checked && c.click(); } return 1; })()`);

if (!tel) {
  // 3. Réglages : bascule « Carte Muscle : révéler ligne par ligne »
  await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /Réglages/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`); await b.dormir(1200);
  await cap('reglages', `document.querySelector('.rfc-bascule')`, 10);
  // 4. Liste des flashcards d'un cours, mode « Exporter » (une case par carte)
  // le panneau Flashcards vit dans le lecteur : le cours de test reçoit un PDF d'une page (données du banc seulement)
  await b.S(`const f = await S.getOne('fiches', 'f1'); if (f.pdfId) return 1;
    const { PDFDocument, StandardFonts } = await import('/node_modules/.vite/deps/pdf-lib.js').catch(() => import('pdf-lib'));
    const d = await PDFDocument.create(); const p = d.addPage([595, 842]); const fo = await d.embedFont(StandardFonts.Helvetica); p.drawText('Cours 1 — Rein'.replace('—', '-'), { x: 60, y: 760, size: 20, font: fo });
    const id = await S.putBlob(new Blob([await d.save()], { type: 'application/pdf' })); await S.put('fiches', { ...f, pdfId: id }); return 1;`);
  await b.ouvrirCours('Cours 1 — Rein', { recharger: true }); await b.ongletFlashcards();
  await b.ev(`(() => { const x = document.querySelector('[data-act="exporter-fc"]'); x && x.click(); return 1; })()`); await b.dormir(700);
  await b.ev(`(() => { const x = document.querySelector('[data-act="tout-decocher"]'); x && x.click(); const c = document.querySelector('[data-coche]'); c && c.click(); return 1; })()`); await b.dormir(300);
  await cap('export-flashcards', `document.querySelector('.pm-vue[data-mode="exercices"]')`, 0, 520);
}
b.fin();
