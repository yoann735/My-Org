// ⌘F du lecteur : PHRASES (natif + OCR), à cheval sur deux lignes, césure, apostrophes, espaces, casse / accents ;
// compteur « n sur N », précédent / suivant, liste des résultats (page + extrait) ; document éditable et fiche jumelle.
// Banc 9333 (base locale) : seed-recherche.mjs + tests-fiche-jumelle seed / seed-doc / t-jumelle-import.
// node t-recherche.mjs [ordinateur|tablette]
import { banc } from '../tests-fiche-jumelle/commun.mjs';
const app = process.argv[2] || 'ordinateur';
const b = await banc(1440, 900, { tactile: app === 'tablette' });
let echecs = 0; const v = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); if (!c) echecs++; };
const tablette = async () => { if (app === 'tablette') { await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }); await b.dormir(1800); } };
const cmdF = async () => {
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, modifiers: 4 });
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, modifiers: 4 });
  await b.dormir(400);
};
const touche = async (key, mod = 0) => { const code = key === 'Enter' ? 13 : 0; await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code, modifiers: mod, ...(key === 'Enter' ? { text: '\r' } : {}) }); await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code, modifiers: mod }); await b.dormir(700); };
const chercher = async (q) => {
  await cmdF();
  const focus = await b.ev(`document.activeElement && document.activeElement.tagName === 'INPUT' && /Rechercher/.test(document.activeElement.placeholder)`);
  if (!focus) await b.ev(`(()=>{const i=[...document.querySelectorAll('input[placeholder^="Rechercher"]')].find(e=>e.offsetParent);i&&i.focus();return 1})()`);
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] });
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
  await b.c.send('Input.insertText', { text: q });
  for (let i = 0; i < 40; i++) { await b.dormir(250); const t = await b.ev(`(document.querySelector('[data-compteur-recherche]')||{}).textContent||''`); if (t && t !== '…') break; }
  await b.dormir(900);
  return focus;
};
const etat = () => b.ev(`(()=>{const c=(document.querySelector('[data-compteur-recherche]')||{}).textContent||'';
  const res=[...document.querySelectorAll('.rch-item')].map(e=>({page:e.querySelector('.rch-page').textContent,trouve:(e.querySelector('mark')||{}).textContent,extrait:e.querySelector('.rch-extrait').textContent}));
  const actifs=[...document.querySelectorAll('.pdfr-match-rect.active')].map(e=>{const r=e.getBoundingClientRect();return Math.round(r.top)});
  let hl=0,hlt=0;try{hl=CSS.highlights.get('recherche-doc')?CSS.highlights.get('recherche-doc').size:0;hlt=CSS.highlights.get('recherche-doc-toutes')?CSS.highlights.get('recherche-doc-toutes').size:0}catch(e){}
  return {c,res,actifs,lignesActives:new Set(actifs).size,hl,hlt}})()`);

// ---- cours PDF : natif + OCR ----
v(await b.ouvrir('Recherche phrases', { recharger: true }), 'cours « Recherche phrases » ouvert');
await tablette();
// OCR de la diapo image : attendre que la page 3 soit reconnue
let ocr = false;
for (let i = 0; i < 60 && !ocr; i++) { ocr = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));const f=await S.getOne('fiches','f-rech');const o=(await S.getAll('ocr_pages').catch(()=>[]))||[];return JSON.stringify(o).includes('corticopapillaire')||document.body.innerText.includes('corticopapillaire')||[...document.querySelectorAll('.pdfr-textlayer')].some(t=>t.textContent.includes('corticopapillaire'))})()`).catch(() => false); if (!ocr) await b.dormir(1000); }
console.log('OCR de la diapo prêt :', ocr);
const cas = [
  ['tubule contourné proximal', 2, 'césure « proxi- / mal » en fin de ligne'],
  ['deux tiers de la charge filtrée, ce qui explique', 1, 'phrase à cheval sur deux lignes'],
  ["l'aldostérone augmente la réabsorption du sodium", 2, 'apostrophe droite tapée, typographique dans le PDF'],
  ['DEBIT DE FILTRATION GLOMERULAIRE', 1, 'majuscules sans accents, espaces multiples dans le PDF'],
  ['gradient corticopapillaire atteint 1200', 1, 'diapositive IMAGE (OCR), sur deux lignes'],
];
for (const [q, n, quoi] of cas) {
  const f = await chercher(q);
  const e = await etat();
  v(e.c === `1 sur ${n}` && e.res.length === n, `« ${q} » (${quoi}) : ${e.c}, ${e.res.length} résultat(s) listé(s)`, e.res.map((r) => r.page + ' ' + r.extrait).join(' ‖ '));
  if (q.startsWith('tubule')) {
    v(f, '⌘F met le curseur dans le champ de recherche');
    v(e.lignesActives === 2, `occurrence active surlignée sur ses DEUX lignes (${e.actifs.length} rectangles)`);
    await b.capture(`recherche-${app}-cesure`);
    await touche('Enter');
    v((await etat()).c === `2 sur ${n}`, `Entrée → suivant : ${(await etat()).c}`);
    await touche('Enter', 8);
    v((await etat()).c === `1 sur ${n}`, `Maj+Entrée → précédent : ${(await etat()).c}`);
    await b.ev(`[...document.querySelectorAll('.rch-item')][1].click()`); await b.dormir(800);
    v((await etat()).c === `2 sur ${n}`, `clic sur un résultat de la liste → ${(await etat()).c}`);
  }
  if (q.startsWith('deux')) { v(e.lignesActives === 2, `surlignage sur deux lignes (${e.actifs.length} rectangles)`); await b.capture(`recherche-${app}-deux-lignes`); }
  if (q.startsWith('gradient')) { v(/p\. 3/.test(e.res[0] ? e.res[0].page : ''), 'résultat en page 3 (diapo image)'); await b.capture(`recherche-${app}-ocr`); }
}
// ---- document éditable ----
v(await b.ouvrir('Myologie (document)', { recharger: true }), 'document « Myologie » ouvert');
await tablette();
await chercher("sarcomère est l'unité contractile");
let e = await etat();
v(e.c === '1 sur 2' && e.res.length === 2 && e.hl === 1 && e.hlt === 1, `document : ${e.c}, courante + autre surlignées (${e.hl} + ${e.hlt})`, e.res.map((r) => r.page + ' ' + r.extrait).join(' ‖ '));
await b.capture(`recherche-${app}-document`);
await touche('Enter');
v((await etat()).c === '2 sur 2', `document : suivant → ${(await etat()).c}`);
// ---- fiche jumelle (vue Fiche) ----
v(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours à fiche jumelle ouvert');
await tablette();
const vue = await b.ev(`(()=>{const s=[...document.querySelectorAll('button')].find(x=>/^Fiche/.test(x.innerText.trim())&&x.closest('[class*=bascule], [role=group], [class*=segment]'));if(s&&s.getAttribute('aria-pressed')!=='true'&&s.getAttribute('aria-selected')!=='true')s.click();return !!s})()`);
await b.dormir(2500);
await chercher('rein droit est plus bas');
e = await etat();
v(/^1 sur [1-9]/.test(e.c) && e.res.length >= 1, `fiche jumelle : « rein droit est plus bas » → ${e.c}`, e.res.map((r) => r.page + ' ' + r.extrait).join(' ‖ '));
await b.capture(`recherche-${app}-jumelle`);
v(!(b.erreurs && b.erreurs.length), 'console sans erreur', (b.erreurs || []).slice(0, 3).join(' | '));
console.log(echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
process.exit(0);
