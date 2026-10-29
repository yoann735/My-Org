// Banc « listes dans les boîtes » (29/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md). Vite :5199 SANS Supabase
// + Chrome headless 9333, base LOCALE (banc ../tests-simplification-outils). Cas :
//   boîte étroite, boîte large, post-it : puces, numéros, 2 niveaux, mélange avec du texte, éléments sur plusieurs lignes ;
//   collage depuis Word, Google Docs, Notion dans une boîte (vrai évènement « coller ») ;
//   cellules d'un tableau de document ; carte faite depuis une boîte (balisage léger) ; 3 zooms ; export PDF.
// Mesures dans la page : marge des listes, retrait (em), alignement des retours à la ligne sous le texte, interligne, type
// de puce / numéro par niveau. node t-listes.mjs [etiquette] → docs/img/surlignage-listes/listes-<etiquette>-*.png
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { banc, FICHE, TITRE } from '../tests-simplification-outils/commun.mjs';
const ETIQ = process.argv[2] || 'apres';
const AVANT = ETIQ === 'avant'; // ancien code : on capture, on mesure, on ne juge pas
const CAP = fileURLToPath(new URL('../../docs/img/surlignage-listes/', import.meta.url)); fs.mkdirSync(CAP, { recursive: true });
const b = await banc();
let echecs = 0; const v = (c, m, d = '') => { b.ok(!!c || AVANT, (AVANT && !c ? '(avant) ' : '') + m, d); if (!c && !AVANT) echecs++; return c; };
const cap = async (nom, js, marge = 10) => { const r = await b.rect(js).catch(() => null); if (!r) return; const s = await b.c.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r.x - marge), y: Math.max(0, r.y - marge), width: r.w + 2 * marge, height: r.h + 2 * marge, scale: 2 } }); fs.writeFileSync(CAP + `listes-${ETIQ}-${nom}.png`, Buffer.from(s.data, 'base64')); };

const T = (t, m) => ({ type: 'text', text: t, ...(m ? { marks: [{ type: m }] } : {}) });
const P = (...c) => ({ type: 'paragraph', content: c.map((x) => (typeof x === 'string' ? T(x) : x)) });
const LI = (...c) => ({ type: 'listItem', content: c });
const UL = (...li) => ({ type: 'bulletList', content: li });
const OL = (...li) => ({ type: 'orderedList', attrs: { start: 1 }, content: li });
const CONTENU = { type: 'doc', content: [P('Fonctions du rein :'),
  UL(LI(P('Filtrer le sang en continu, environ 180 litres par jour')), LI(P(T('Réabsorber', 'bold')), UL(LI(P('glomérule')), LI(P('capsule de Bowman, double feuillet autour du glomérule'))))),
  P('Étapes :'),
  OL(LI(P('Filtration glomérulaire au niveau du corpuscule rénal')), LI(P('Réabsorption'), OL(LI(P('tubule proximal')), LI(P('anse de Henlé, segment fin puis large')))), LI(P('Sécrétion'))),
  P('Fin du texte.')] };
const boite = (id, x, y, w, h, extra = {}) => ({ id, ficheId: FICHE, page: 1, x, y, width: w, height: h, kind: 'libre', type: 'boite', couleur: 'jaune-franc', fond: 'plein', content: CONTENU, createdAt: '2026-10-29T08:00:00.000Z', ...extra });
await b.preparer({ annotations: [boite('li-etroite', 0.04, 0.06, 0.17, 0.62), boite('li-large', 0.25, 0.06, 0.44, 0.36), boite('li-postit', 0.72, 0.06, 0.25, 0.6, { postit: true, largeurFixe: true })] });
await b.ouvrirCours({ zoom: 1 });

// ---------- mesures d'un conteneur (corps de boîte, cellule, carte)
const MESURE = `(sel) => { const el = document.querySelector(sel); if (!el) return null;
  const lignesDe = (n) => { const rg = document.createRange(); rg.selectNodeContents(n); const rs = [...rg.getClientRects()].filter((r) => r.width > 0.5);
    const L = []; for (const r of rs) { const l = L.find((x) => Math.abs(x.top - r.top) < 3); if (l) { l.left = Math.min(l.left, r.left); } else L.push({ top: r.top, left: r.left }); } return L.sort((a, b) => a.top - b.top); };
  // la boîte est mise à l'échelle du zoom par « scale » : 1 em à l'écran = taille calculée × échelle
  const echelle = el.getBoundingClientRect().width / (el.offsetWidth || 1);
  const out = [];
  for (const l of el.querySelectorAll('ul, ol')) {
    const cs = getComputedStyle(l), lr = l.getBoundingClientRect(); let niv = 0; for (let p = l.parentElement; p && p !== el; p = p.parentElement) if (/^(UL|OL)$/.test(p.tagName)) niv++;
    for (const li of [...l.children].filter((x) => x.tagName === 'LI')) {
      const p = li.querySelector(':scope > p') || li; const fs = parseFloat(getComputedStyle(p).fontSize) * echelle; const L = lignesDe(p);
      out.push({ type: l.tagName.toLowerCase(), niv, puce: cs.listStyleType, marge: cs.marginTop + ' ' + cs.marginBottom, retraitEm: +((L[0].left - lr.left) / fs).toFixed(2),
        decalage: L.length > 1 ? +(Math.max(...L.map((x) => x.left)) - Math.min(...L.map((x) => x.left))).toFixed(2) : 0, lignes: L.length,
        pas: L.length > 1 ? +(L[1].top - L[0].top).toFixed(2) : null, lh: +((parseFloat(getComputedStyle(p).lineHeight) * echelle) || fs * 1.2).toFixed(2), liMarge: getComputedStyle(li).marginTop + ' ' + getComputedStyle(li).marginBottom });
    }
  }
  return out; }`;
const mesurer = (sel) => b.ev(`(${MESURE})(${JSON.stringify(sel)})`);
const juger = (nom, M, { cartes = false } = {}) => {
  if (!M || !M.length) return v(false, `${nom} : listes trouvées`);
  const ul = M.filter((x) => x.type === 'ul'), ol = M.filter((x) => x.type === 'ol');
  v(M.every((x) => x.marge === '0px 0px' && x.liMarge === '0px 0px'), `${nom} : aucune marge avant / après les listes ni entre les éléments`, [...new Set(M.map((x) => x.marge + '|' + x.liMarge))].join(' '));
  v(ul.every((x) => x.retraitEm >= 1.0 && x.retraitEm <= 1.2) && ol.every((x) => x.retraitEm >= 1.2 && x.retraitEm <= 1.45), `${nom} : retrait ~1,1 em (puces ${[...new Set(ul.map((x) => x.retraitEm))].join('/')} em, numéros ${[...new Set(ol.map((x) => x.retraitEm))].join('/')} em)`);
  const longs = M.filter((x) => x.lignes > 1);
  v((longs.length > 0 || cartes === 'large') && longs.every((x) => x.decalage < 0.6), `${nom} : ${longs.length} élément(s) sur plusieurs lignes, retour à la ligne aligné sous le texte (écart max ${Math.max(0, ...longs.map((x) => x.decalage))} px)`);
  v(longs.every((x) => Math.abs(x.pas - x.lh) < 0.75), `${nom} : interligne = celui du texte (${longs.map((x) => x.pas + '/' + x.lh).slice(0, 3).join(', ')} px)`);
  v(ul.filter((x) => x.niv === 0).every((x) => x.puce === 'disc') && ul.filter((x) => x.niv === 1).every((x) => x.puce === 'circle') && ol.filter((x) => x.niv === 0).every((x) => x.puce === 'decimal') && ol.filter((x) => x.niv === 1).every((x) => x.puce === 'lower-alpha'),
    `${nom} : • puis ◦, 1. 2. 3. puis a. b.`, [...new Set(M.map((x) => x.type + x.niv + ':' + x.puce))].join(' '));
};

// ---------- 1. boîtes étroite, large, post-it
for (const [id, nom] of [['li-etroite', 'boîte étroite'], ['li-large', 'boîte large'], ['li-postit', 'post-it']]) {
  juger(nom, await mesurer(`.note-box[data-objet="${id}"] .nb-body`), { cartes: id === 'li-large' ? 'large' : false }); // boîte large : aucune ligne ne déborde
  await cap(id.replace('li-', ''), `document.querySelector('.note-box[data-objet="${id}"]')`);
}
// ---------- 2. trois zooms
for (const z of [0.6, 1.6, 1]) {
  await b.ev(`window.__mrZoom(${z});1`); await b.dormir(1400);
  await b.ev(`document.querySelector('.note-box[data-objet="li-etroite"]').scrollIntoView({block:'start'});1`); await b.dormir(600);
  const M = await mesurer(`.note-box[data-objet="li-etroite"] .nb-body`);
  v(M && M.filter((x) => x.type === 'ul').every((x) => x.retraitEm >= 1.0 && x.retraitEm <= 1.2) && M.filter((x) => x.lignes > 1).every((x) => x.decalage < 0.6), `zoom ${Math.round(z * 100)} % : retrait ${M && [...new Set(M.map((x) => x.retraitEm))].join('/')} em, retours à la ligne alignés`);
  if (z !== 1) await cap(`etroite-zoom-${Math.round(z * 100)}`, `document.querySelector('.note-box[data-objet="li-etroite"]')`);
}
await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(800);

// ---------- 3. collages (Word, Google Docs, Notion) dans une nouvelle boîte
const COLLAGES = {
  word: `<div class=WordSection1><p class=MsoNormal>Les fonctions du rein :</p><p class=MsoListParagraphCxSpFirst style='margin-left:36.0pt;text-indent:-18.0pt;mso-list:l0 level1 lfo1'><!--[if !supportLists]--><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><!--[endif]-->Filtrer le sang en continu, environ 180 litres par jour<o:p></o:p></p><p class=MsoListParagraphCxSpMiddle style='margin-left:72.0pt;text-indent:-18.0pt;mso-list:l0 level2 lfo1'><!--[if !supportLists]--><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><!--[endif]-->glomérule<o:p></o:p></p><p class=MsoListParagraphCxSpLast style='margin-left:36.0pt;text-indent:-18.0pt;mso-list:l0 level1 lfo1'><!--[if !supportLists]--><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><!--[endif]-->Réabsorber<o:p></o:p></p><p class=MsoListParagraphCxSpFirst style='margin-left:36.0pt;text-indent:-18.0pt;mso-list:l1 level1 lfo2'><!--[if !supportLists]--><span><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><!--[endif]-->Filtration<o:p></o:p></p><p class=MsoListParagraphCxSpLast style='margin-left:72.0pt;text-indent:-18.0pt;mso-list:l1 level2 lfo2'><!--[if !supportLists]--><span><span style='mso-list:Ignore'>a.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><!--[endif]-->pression nette de filtration, à retenir<o:p></o:p></p></div>`,
  gdocs: `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;" aria-level="1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;">Filtrer le sang en continu, environ 180 litres par jour</span></p></li><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:circle;" aria-level="2"><p dir="ltr" style="line-height:1.38;"><span>glomérule</span></p></li></ul><li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr" style="line-height:1.38;"><span>Réabsorber</span></p></li></ul><ol style="margin-top:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:decimal;" aria-level="1"><p dir="ltr"><span>Filtration</span></p></li></ol></b>`,
  notion: `<ul><li>Filtrer le sang en continu, environ 180 litres par jour<ul><li>glomérule</li></ul></li><li>Réabsorber</li></ul><ol><li>Filtration</li></ol>`,
};
const page = await b.rect(`document.querySelector('.pdfr-page[data-cle="1"]')`);
const ici = (fx, fy) => [page.x + page.w * fx, page.y + page.h * fy];
let k = 0;
for (const [nom, html] of Object.entries(COLLAGES)) {
  const avant = (await b.enBase()).map((a) => a.id);
  await b.outil6('main'); await b.outil6('ecrire'); await b.dormir(300);
  if (await b.ev(`!!document.querySelector('[data-sous-outil="boite"]')`)) await b.sousOutil('boite');
  await b.clic(ici(0.27, 0.45), { att: 900 }); k++;
  await b.ev(`(() => { const pm = document.querySelector('.note-box.active .ProseMirror'); pm.focus(); const dt = new DataTransfer(); dt.setData('text/html', ${JSON.stringify(html)}); dt.setData('text/plain', 'x');
    pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return 1; })()`);
  await b.dormir(700);
  const pm = await b.ev(`document.querySelector('.note-box.active .ProseMirror').innerHTML`);
  await b.T.Escape(); await b.dormir(900);
  const neuve = (await b.enBase()).find((a) => !avant.includes(a.id) && a.kind === 'libre');
  const json = JSON.stringify(neuve && neuve.content);
  const sousListe = /"bulletList","content":\[\{"type":"listItem","content":\[\{"type":"paragraph"[^\]]*\]\},\{"type":"bulletList"/.test(json) || /"type":"listItem","content":\[\{"type":"paragraph".*?\},\{"type":"bulletList"/.test(json);
  v(neuve && /"bulletList"/.test(json) && /"orderedList"/.test(json) && sousListe && !/·|\\u00a0\\u00a0/.test(json) && !/padding-inline|mso-/.test(pm), `collage ${nom} : vraies listes (puces + numéros), sous-liste dans son élément, sans « · » ni style importé`, json && json.slice(0, 220));
  if (neuve) { juger(`collage ${nom}`, await mesurer(`.note-box[data-objet="${neuve.id}"] .nb-body`), { cartes: "large" }); await cap(`collage-${nom}`, `document.querySelector('.note-box[data-objet="${neuve.id}"]')`); }
  // place nette pour le collage suivant (même endroit) : la boîte retirée de la base, cours rouvert
  if (neuve) { await b.S(`await S.remove('annotations', ${JSON.stringify(neuve.id)}); return 1;`); await b.ouvrirCours({ zoom: 1 }); }
}
await b.outil6('main');

// ---------- 4. carte faite depuis une boîte (balisage léger)
const verso = await b.ev(`(async () => { const u = performance.getEntriesByType('resource').map((e) => e.name); const M = await import(u.find((n) => n.includes('lib/boiteVersCarte.js')) || '/src/medrevise/lib/boiteVersCarte.js'); return M.decouperBoite(${JSON.stringify(CONTENU)}).verso; })()`);
v(/^- Filtrer/m.test(verso) && /^ {2}- glomérule/m.test(verso) && /^ {2}a\. tubule proximal/m.test(verso), 'carte : 2 niveaux gardés dans le verso (« - », « 1. », « a. » en retrait)', JSON.stringify(verso).slice(0, 160));
await b.S(`await S.put('questions', { id: 'q-listes', type: 'flashcard', ficheId: ${JSON.stringify(FICHE)}, theme: 'Listes', recto: 'Fonctions du rein', verso: ${JSON.stringify(verso)}, versoFormat: 'leger', historique: [], nouvelle: true, dueDate: '2026-10-29', j0Date: '2026-10-29', updatedAt: new Date().toISOString() }); return 1;`);
await b.ouvrirCours({ zoom: 1 });
await b.ev(`(()=>{const m=[...document.querySelectorAll('.pm-seg-btn')].find(x=>/Exercices/.test(x.title||x.innerText));m&&m.click();return 1})()`); await b.dormir(700);
await b.ev(`(()=>{const t=[...document.querySelectorAll('.pm-sous-btn')].find(x=>/Flashcards/.test(x.textContent));t&&t.click();return 1})()`); await b.dormir(900);
const carte = await b.ev(`(() => { const c = [...document.querySelectorAll('.tex-li')].find((e) => /Filtrer/.test(e.textContent)); if (!c) return null; const box = c.parentElement;
  const L = (n) => { const rg = document.createRange(); rg.selectNodeContents(n); const t = [...rg.getClientRects()].filter((r) => r.width > 0.5); const ls = []; for (const r of t) { const l = ls.find((x) => Math.abs(x.top - r.top) < 3); if (l) l.left = Math.min(l.left, r.left); else ls.push({ top: r.top, left: r.left }); } return ls; };
  const lis = [...box.querySelectorAll('.tex-li')].map((e) => { const fs = parseFloat(getComputedStyle(e).fontSize); const txt = e.querySelector('.tex-txt'); const ls = L(txt); return { m: e.querySelector('.tex-marque').textContent, niv: +getComputedStyle(e).getPropertyValue('--niv') || 0, retraitEm: +((ls[0].left - e.getBoundingClientRect().left) / fs).toFixed(2), decalage: ls.length > 1 ? +(Math.max(...ls.map((x) => x.left)) - Math.min(...ls.map((x) => x.left))).toFixed(2) : 0, lignes: ls.length, x: Math.round(e.getBoundingClientRect().left) }; });
  return lis; })()`);
v(carte && carte.length >= 9 && carte.filter((x) => x.niv === 0).every((x) => x.retraitEm >= 1.0 && x.retraitEm <= 1.45) && carte.filter((x) => x.lignes > 1).every((x) => x.decalage < 0.6), `carte : ${carte && carte.length} lignes de liste, marque sur la 1ʳᵉ ligne, retours à la ligne sous le texte`, JSON.stringify(carte && carte.slice(0, 4)));
v(carte && carte.map((x) => x.m).join(' ') === '• • ◦ ◦ 1. 2. a. b. 3.' && carte.find((x) => x.m === '◦').x > carte.find((x) => x.m === '•').x, 'carte : • puis ◦ (en retrait), 1. 2. 3. puis a. b.', carte && carte.map((x) => x.m).join(' '));
await cap('carte', `[...document.querySelectorAll('.pis-item')].find((e) => /Filtrer/.test(e.textContent) && /glomérule/.test(e.textContent))`);

// ---------- 5. export PDF (rendu de la page 1 exportée)
const exp = await b.ev(`(async () => { const u = performance.getEntriesByType('resource').map((e) => e.name); const im = (p) => import(u.find((n) => n.includes(p)) || '/src/medrevise/' + p);
  const S = await im('lib/storage.js'); const E = await im('pdf/exportAnnote.js'); const J = await im('pdf/pdfjsSetup.js');
  const f = await S.getOne('fiches', ${JSON.stringify(FICHE)}); const anns = (await S.getAll('annotations')).filter((a) => a.ficheId === ${JSON.stringify(FICHE)} && a.id === 'li-etroite');
  const { octets } = await E.exporterDepuisBlob(f.pdfId, [], anns); const doc = await J.openPdf(new Uint8Array(octets)); const p = await doc.getPage(1);
  const vp = p.getViewport({ scale: 2.5 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await p.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
  const a = anns[0]; const x = Math.round(a.x * vp.width) - 12, y = Math.round(a.y * vp.height) - 12, w = Math.round(a.width * vp.width) + 24, h = Math.round(a.height * vp.height) + 24;
  const d = document.createElement('canvas'); d.width = w; d.height = h; d.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h);
  // pdf.js retire les espaces de tête du texte : le retrait se lit sur la position x de chaque ligne
  const tc = await p.getTextContent(); const lignes = tc.items.filter((i) => i.str.trim()).map((i) => ({ s: i.str.trim(), x: +i.transform[4].toFixed(2), corps: +Math.hypot(i.transform[0], i.transform[1]).toFixed(2) }));
  return { png: d.toDataURL('image/png'), lignes }; })()`);
fs.writeFileSync(CAP + `listes-${ETIQ}-export-pdf.png`, Buffer.from(exp.png.split(',')[1], 'base64'));
const L = exp.lignes; const i0 = L.findIndex((l) => /^•\s*Filtrer/.test(l.s));
const ligne = (re) => L.find((l) => re.test(l.s));
const puce = L[i0], suite = L[i0 + 1], corps = puce ? puce.corps : 1;
// « • » + espace ≈ 0,6 corps : la ligne suivante commence là où commence le TEXTE de la 1ʳᵉ ligne, pas sous la puce
v(puce && suite && /^180/.test(suite.s) && suite.x - puce.x > corps * 0.4 && suite.x - puce.x < corps * 1.2, `export PDF : « • Filtrer… » puis la suite décalée de ${suite && (suite.x - puce.x).toFixed(1)} pt (sous le texte, puce ${corps} pt)`, JSON.stringify(L.slice(i0, i0 + 2)));
const r1 = ligne(/^•\s*Réabsorber/), g = ligne(/^–\s*glom/), f1 = ligne(/^1\.\s*Filtration/), a1 = ligne(/^a\.\s*tubule/);
// sous-liste : sa puce commence sous le TEXTE de l'élément parent (comme à l'écran), ni sous la puce, ni plus loin
const sousTexte = suite ? suite.x - puce.x : 0;
v(r1 && g && f1 && a1 && Math.abs(g.x - r1.x - sousTexte) < 1 && a1.x - f1.x > corps * 0.5 && a1.x - f1.x < corps * 1.5, `export PDF : 2ᵉ niveau sous le texte du parent (« – » +${g && r1 && (g.x - r1.x).toFixed(1)} pt, « a. » +${a1 && f1 && (a1.x - f1.x).toFixed(1)} pt)`, JSON.stringify([r1, g, f1, a1]));

// ---------- 6. cellules d'un tableau de document
const cell = (...c) => ({ type: 'tableCell', content: c });
const flux = { type: 'doc', content: [P('Tableau avec listes :'), { type: 'table', content: [{ type: 'tableRow', content: [cell(P('Rôle')), cell(P('Détail'))] },
  { type: 'tableRow', content: [cell(P('Rein')), cell(UL(LI(P('Filtrer le sang en continu, environ 180 litres par jour')), LI(P('Réabsorber'), UL(LI(P('glomérule'))))), OL(LI(P('Filtration glomérulaire au niveau du corpuscule')), LI(P('Réabsorption'), OL(LI(P('tubule proximal')))))) ] }] }, P('Fin.')] };
const TD = 'Listes dans un tableau (test)';
const idDoc = await b.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const im=(p)=>import(u.find(n=>n.includes(p))||('/src/medrevise/'+p));
  const S=await im('lib/storage.js');const D=await im('documents/lib/documents.js');const N=await im('documents/lib/notesDoc.js');
  for(const f of await S.getAll('fiches')) if(f.titre===${JSON.stringify(TD)}){ await S.remove('notes_doc',f.id); await S.remove('fiches',f.id); }
  await S.put('sources',{id:'src-li',nom:'Source listes',couleur:'#7c5cff'});await S.put('matieres',{id:'mat-li',nom:'Listes test',sourceId:'src-li'});
  const f=await D.createDocumentNotes({matiereId:'mat-li',titre:${JSON.stringify(TD)}});
  await N.majNotesDoc(f.id,{flux:${JSON.stringify(flux)},fluxMaj:Date.now(),fluxAppareil:'banc'});return f.id})()`);
await b.ev(`localStorage.setItem('medrevise.disposition.${idDoc}','pdf');1`);
await b.biblio({ recharger: true }); await b.ouvrir(TD); await b.dormir(2500);
await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
juger('cellule de tableau', await mesurer(`.pt-prose tr:last-child td:last-child`));
await cap('cellule', `document.querySelector('.pt-prose table')`);

// ---------- 7. tablette tactile (1024×1366) : mêmes boîtes, même règle
await b.ouvrirCours({ tablette: true, zoom: 1 });
juger('tablette, boîte étroite', await mesurer(`.note-box[data-objet="li-etroite"] .nb-body`));
await cap('tablette-etroite', `document.querySelector('.note-box[data-objet="li-etroite"]')`);
await b.c.send('Emulation.clearDeviceMetricsOverride'); await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: false });

v(!b.erreurs.filter((e) => !/Failed to load resource|validateDOMNesting/.test(e)).length, 'aucune erreur console', b.erreurs.join(' | ').slice(0, 300));
console.log(AVANT ? '(mesures de l’ancien code : captures « avant » écrites)' : echecs ? `❌ ${echecs} échec(s)` : '✅ tout est vert');
b.c.fermer(); process.exit(0);
