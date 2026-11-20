// Banc « taille de police · duplication des objets · remplacer un document par un PDF » (20/11/2026,
// docs/compte-rendu-police-duplication-remplacement-pdf.md). DONNÉES DE TEST UNIQUEMENT, jamais le vrai cloud.
//   Vite :5320 (VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=faux) + faux Supabase :54399
//   (../tests-seance-passer-precedente/relancer-faux-supabase.sh, remise à zéro avant chaque passage) ;
//   Chrome headless aux profils NEUFS : 9345 ordinateur 1440×900 (souris), 9346 téléphone 390×844 (tactile),
//   9347 tablette iPad 820×1180 (tactile). Outils CDP du banc du mode file d'attente.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { appareil as appareilFA, dormir } from '../tests-file-attente/commun.mjs';

export { dormir };
export const BASE = process.env.BASE || 'http://localhost:5320';
export const AVANT = BASE.endsWith(':5321'); // code d'avant le chantier (captures « avant »)
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/police-duplication-remplacement/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });

/** un PDF de test : `n` pages, au format diapo (16:9) ou A4 */
export async function pdfTest(n, { diapo = true, titre = 'Diapo' } = {}) {
  const pdf = await PDFDocument.create(); const police = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = diapo ? pdf.addPage([960, 540]) : pdf.addPage([595, 842]);
    const h = p.getHeight();
    p.drawRectangle({ x: 0, y: h - 70, width: p.getWidth(), height: 70, color: rgb(0.1, 0.35, 0.4) });
    p.drawText(`${titre} ${i} / ${n}`, { x: 40, y: h - 48, size: 26, font: police, color: rgb(1, 1, 1) });
    p.drawText(`Le nephron est l'unite fonctionnelle du rein (page ${i}).`, { x: 40, y: h - 130, size: 18, font: police });
  }
  return Buffer.from(await pdf.save()).toString('base64');
}

/** remet à zéro le faux Supabase (en mémoire : un passage précédent re-synchroniserait ses données) */
export const reinitCloud = () => execSync('sh "' + fileURLToPath(new URL('../tests-seance-passer-precedente/relancer-faux-supabase.sh', import.meta.url)) + '"', { stdio: 'ignore' });

export async function appareil(type) {
  const b = await appareilFA(type, BASE);
  // un onglet ouvert par Chrome lui-même (chrome://settings/help après une mise à jour) passe au premier plan : les
  // gestes tactiles envoyés à l'app attendent alors indéfiniment — l'app est ramenée devant avant chaque geste
  const pointFA = b.point;
  b.point = async (x, y, att) => { await b.send('Page.bringToFront'); return pointFA(x, y, att); };
  /** profil vierge : faux cloud remis à zéro, données de l'origine effacées */
  b.neuf = async () => { reinitCloud(); await b.vider(); await b.ouvrir(); };
  b.capture = async (nom) => { const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + nom + (AVANT ? '-avant' : '') + '-' + type + '.png', Buffer.from(s.result.data, 'base64')); };
  /** touche (avec modificateurs CDP : 1 Alt, 2 Ctrl, 4 Meta, 8 Shift) */
  b.touche = async (key, { code = key, vk = 0, mod = 0, texte } = {}) => {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod, ...(texte ? { text: texte } : {}) });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod });
    await dormir(350);
  };
  b.taper = async (t) => { await b.send('Input.insertText', { text: t }); await dormir(300); };
  b.stocker = (store) => b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); return JSON.parse(JSON.stringify(await S.getAll(${JSON.stringify(store)}))); })()`);
  b.un = (store, id) => b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); return JSON.parse(JSON.stringify((await S.getOne(${JSON.stringify(store)}, ${JSON.stringify(id)})) || null)); })()`);
  /** ouvre un cours depuis la Bibliothèque */
  b.ouvrirCours = async (titre) => {
    await b.aller('Biblioth'); await dormir(800);
    await b.ev(`(() => { const r = [...document.querySelectorAll('button')].find((x) => (x.title || '') === 'Revenir à la liste' || x.getAttribute('aria-label') === 'Retour'); r && r.click(); return 1; })()`);
    await dormir(600);
    if (!(await b.ev(`!!document.querySelector('.lt-fiche')`))) await b.clic(`document.querySelector('.lib-master.collapsed .split-handle')`, 900);
    return b.clic(`[...document.querySelectorAll('.lt-fiche')].find((e) => e.innerText.trim().startsWith(${JSON.stringify(titre)}))`, 2500);
  };
  /** clic SANS faire défiler (éléments fixes : mini barre, menus — scrollIntoView y fausse le geste) */
  b.clicFixe = async (js, att = 300) => { await dormir(120); const r = await b.ev('(() => { const e = ' + js + '; if (!e) return null; const r = e.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()'); if (!r) return false; await b.point(r.cx, r.cy, att); return true; };
  /** px de référence (page de 1000 px) d'un texte rendu : font-size calculée × agrandissement (transform) × 1000 / largeur de sa page */
  b.px1000 = (js) => b.ev('(() => { const t = ' + js + '; if (!t) return null; const pg = t.closest(".pdfr-page") || document.querySelector(".pdfr-page"); let k = 1; for (let e = t; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.transform && cs.transform !== "none") k *= new DOMMatrix(cs.transform).a; if (cs.scale && cs.scale !== "none") k *= parseFloat(cs.scale); } return +(parseFloat(getComputedStyle(t).fontSize) * k * 1000 / pg.getBoundingClientRect().width).toFixed(2); })()');
  /** le sélecteur de taille ouvert (bouton `.ct-bouton` déjà cliqué) : saisir `v` px dans le champ, Entrée */
  /** ouvre le sélecteur de taille par son bouton (`js` : l'élément bouton) ; rend true si le panneau est ouvert */
  b.ouvrirTaille = async (js) => {
    for (let k = 0; k < 3; k++) {
      if (await b.ev(`!!document.querySelector('.ct-pop input[data-champ="px"]')`)) return true;
      await b.clicFixe(js, 450);
    }
    return b.ev(`!!document.querySelector('.ct-pop input[data-champ="px"]')`);
  };
  b.saisirTaille = async (v) => {
    await b.clicFixe(`document.querySelector('.ct-pop input[data-champ="px"]')`, 250);
    await b.ev(`(() => { const i = document.querySelector('.ct-pop input[data-champ="px"]'); i.focus(); i.select(); return 1; })()`);
    await b.taper(String(v).replace('.', ','));
    await b.touche('Enter', { code: 'Enter', vk: 13 }); await dormir(500);
  };
  /** arbre DOM d'un élément, avec style, font-size calculée et --lp (diagnostic) */
  b.arbre = (sel, prof = 6) => b.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'absent'; const out = [];
    const w = (n, d) => { if (d > ${prof}) return; const cs = getComputedStyle(n); out.push(' '.repeat(d * 2) + n.tagName + '.' + String(n.className).slice(0, 60) + ' style=[' + (n.getAttribute('style') || '').slice(0, 140) + '] fs=' + cs.fontSize + ' lp=' + cs.getPropertyValue('--lp')); [...n.children].forEach((c) => w(c, d + 1)); };
    w(e, 0); return out.join(String.fromCharCode(10)); })()`);
  return b;
}

/** sème : une section, une matière, puis les fiches données (avec PDF éventuels, en base64) */
export async function semer(b, fiches, annotations = [], extra = '') {
  return b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js');
    const blob = (b64) => { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: 'application/pdf' }); };
    await S.put('sources', { id: 'pr-src', nom: 'Section test', rappelsJ: true });
    await S.put('matieres', { id: 'pr-mat', nom: 'Matière test', sourceId: 'pr-src' });
    for (const f of ${JSON.stringify(fiches)}) { const r = { ...f }; if (r.pdf64) { r.pdfId = await S.putBlob(blob(r.pdf64)); delete r.pdf64; } await S.put('fiches', r); }
    const ann = ${JSON.stringify(annotations)}; if (ann.length) await S.putMany('annotations', ann);
    ${extra}
    return 1; })()`);
}
