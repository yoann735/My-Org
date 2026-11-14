// Non-régression du lecteur, de la fiche jumelle, du tableau et de la synchro — node t-non-regression.mjs ordi|tablette
import { appareil, dormir } from './commun.mjs';
const type = process.argv[2] || 'ordi';
const b = await appareil(type);
await b.ouvrirApp();
await b.nettoyer(); await b.nettoyer('f-jum::fiche:1');
await b.attendreSynchro(30000);
b.ok(await b.ouvrirCours('Glandes (test)'), 'lecteur : cours ouvert'); await dormir(1500);
const compte = (k) => b.S(`return (await S.getAll('annotations')).filter((a) => a.ficheId === 'f-enr' && ${k}).length`);

const trace = async (fx0, fy0, fx1, fy1) => {
  const p0 = await b.pointPage(1, fx0, fy0); const [x0, y0] = p0; const [x1, y1] = [x0 + (fx1 - fx0) * p0.w, y0 + (fy1 - fy0) * p0.h];
  if (b.tactile) { // stylet
    const ev = (t, x, y, bt) => b.send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: bt, clickCount: 1, pointerType: 'pen' });
    await ev('mousePressed', x0, y0, 1); for (let i = 1; i <= 10; i++) { await dormir(16); await ev('mouseMoved', x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10, 1); } await ev('mouseReleased', x1, y1, 0); await dormir(500);
  } else await b.glisser(x0, y0, x1, y1);
};
// crayon
await b.outil('Crayon');
const t0 = await compte(`a.kind === 'trait'`);
await trace(0.1, 0.62, 0.4, 0.66);
b.ok(await b.attendre(`(async () => (await (await __imp('/src/medrevise/lib/storage.js')).getAll('annotations')).filter((a) => a.ficheId === 'f-enr' && a.kind === 'trait').length === ${t0 + 1})()`, 4000), 'crayon : trait tracé et enregistré');
// annuler / rétablir
await b.echap();
const mod = 4; // ⌘ (meta) : Input.dispatchKeyEvent modifiers 4
await b.touche('z', 'KeyZ', 90, mod); await dormir(600);
b.ok((await compte(`a.kind === 'trait'`)) === t0, 'annuler (⌘Z) : le trait est retiré');
await b.touche('z', 'KeyZ', 90, mod | 8); await dormir(600);
b.ok((await compte(`a.kind === 'trait'`)) === t0 + 1, 'rétablir (⌘⇧Z) : le trait revient');
// forme
await b.outil('Forme');
const f0 = await compte(`a.kind === 'forme'`);
await trace(0.1, 0.7, 0.3, 0.78);
await dormir(500);
b.ok((await compte(`a.kind === 'forme'`)) === f0 + 1, 'forme : tracée et enregistrée');
await b.echap();
// texte libre
await b.outil('Texte');
await b.stylet(...(await b.pointPage(1, 0.1, 0.85)), 600);
await b.focusBoite(); await b.ecrire('Texte libre de non-régression'); await dormir(500); await b.echap(); await dormir(400);
b.ok((await compte(`a.kind === 'texte' && /non-régression/.test(JSON.stringify(a.content))`)) === 1, 'texte libre : posé, écrit, enregistré');
b.ok(['appareil', 'envoye'].includes(await b.etatEnr()), 'indicateur : enregistré', await b.etatEnr());
// surligneur : glisser sur une ligne du texte du PDF
const h0 = await b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === 'f-enr').length`);
const tS0 = await compte(`a.mode === 'surligneur'`);
await b.clic(`document.querySelector('[data-outil="surligneur"]')`, 400);
await trace(0.07, 0.257, 0.45, 0.257);
await dormir(800);
const h1 = await b.S(`return (await S.getAll('highlights')).filter((h) => h.ficheId === 'f-enr').length`);
const tS = await compte(`a.mode === 'surligneur'`);
b.ok(h1 === h0 + 1 || tS === tS0 + 1, 'surligneur : surlignage posé et enregistré', `surlignages ${h0} → ${h1}, traits surligneur ${tS0} → ${tS}`);
await b.echap();
// gomme : efface le trait du crayon
const idsTraits = () => b.S(`return (await S.getAll('annotations')).filter((a) => a.ficheId === 'f-enr' && a.kind === 'trait' && a.mode !== 'surligneur' && !/^an-trait-/.test(a.id)).map((a) => a.id)`);
const avantG = await idsTraits();
await b.outil('Gomme');
await trace(0.25, 0.60, 0.25, 0.68);
await dormir(600);
const apresG = await idsTraits();
b.ok(avantG.length === 1 && !apresG.includes(avantG[0]), 'gomme : le trait du crayon est effacé (ou coupé en morceaux)', `${avantG.length} → ${apresG.length} (nouveaux morceaux : ${apresG.length})`);
await b.echap();
// menu Fichier › Historique…
await b.clic(`document.querySelector('.mf-bouton')`, 500);
const entree = await b.ev(`!!document.querySelector('[data-entree="historique"]')`);
b.ok(entree, 'menu Fichier : entrée « Historique… »');
await b.clic(`document.querySelector('.mf-section.affiche [data-entree="historique"], [data-entree="historique"]')`, 1200);
b.ok(await b.attendre(`!!document.querySelector('[data-historique="f-enr"]')`, 5000), 'Historique ouvert depuis le menu Fichier');
await b.echap(); await dormir(400);
await b.fermerCours();

// fiche jumelle
b.ok(await b.ouvrirCours('Fiche jumelle (test)'), 'fiche jumelle : cours ouvert'); await dormir(1500);
await b.clic(`[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find((x) => /Fiche/.test(x.innerText))`, 2000);
await b.attendre(`!!document.querySelector('.pdfr-page[data-cle="1"]')`, 10000); await dormir(1200);
const idJ = await b.nouvelleBoite(0.1, 0.3, 1);
await b.ecrire('Boîte sur la fiche jumelle'); await dormir(500); await b.echap(); await dormir(400);
const recJ = await b.S(`return await S.getOne('annotations', ${JSON.stringify(idJ)})`);
b.ok(!!recJ && recJ.ficheId === 'f-jum::fiche:1' && /jumelle/.test(JSON.stringify(recJ.content)), 'fiche jumelle : boîte écrite dans le calque de la fiche', recJ && recJ.ficheId);
await b.capture(`fiche-jumelle-${type}`);
await b.fermerCours();

// tableau
b.ok(await b.ouvrirCours('Glandes (test)'), 'tableau : cours rouvert'); await dormir(1200);
await b.clic(`[...document.querySelectorAll('button')].find((x) => /Tableau|tableau en plein/.test(x.title || x.innerText || '') && (x.closest('.seg, .tab-dispo, [role=tablist]')))`, 2000);
const okTb = await b.attendre(`!!document.querySelector('.tb2-barre')`, 10000);
b.ok(okTb, 'tableau : affiché');
const avantTb = await b.S(`const r = await S.getOne('board', 'board:f-enr'); return r ? (r.objects || []).length : 0;`);
await b.clic(`document.querySelector('[data-act="carte"]')`, 1200);
await dormir(800);
const apresTb = await b.S(`const r = await S.getOne('board', 'board:f-enr'); return r ? (r.objects || []).length : 0;`);
b.ok(apresTb === avantTb + 1, 'tableau : une carte créée et enregistrée', `${avantTb} → ${apresTb}`);
b.ok(await b.ev(`!!document.querySelector('.tb2-barre [data-enregistrement]')`), 'tableau : indicateur d’enregistrement dans sa barre');
await b.capture(`tableau-${type}`);
await b.ev(`(() => { const x = [...document.querySelectorAll('button')].find((e) => /PDF seul|^\\s*PDF\\s*$/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`); await dormir(800);
// synchro : tout est parti
await b.attendre(`document.querySelector('[data-enregistrement]')?.dataset.enregistrement === 'envoye'`, 20000);
b.ok((await b.etatEnr()) === 'envoye', 'synchro : tout est envoyé (« Enregistré et envoyé »)');
// ménage
await b.S(`const r = await S.getOne('board', 'board:f-enr'); if (r) await S.put('board', { ...r, objects: (r.objects || []).slice(0, ${avantTb}) }); return 1;`);
await b.nettoyer(); await b.nettoyer('f-jum::fiche:1');
process.exitCode = b.fin();
b.fermerWs();
