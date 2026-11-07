// Banc « compteur de vues + agrandissement des images » (07/11, docs/compte-rendu-compteur-vues-et-zoom-image.md).
// Même installation que scripts/tests-sauvegarde-statut (profils Chrome NEUFS, jamais le vrai cloud) :
//   faux Supabase :54399 (JOURNAL=1), faux GitHub :54398, Vite :5303 (config « medrevise-banc-sauvegarde »),
//   Chrome headless 9335 (ordinateur 1440×900, souris), 9336 (téléphone 390×844, tactile), 9337 (tablette 1024×1366, tactile).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dispositif as dispositif0 } from '../tests-sauvegarde-statut/commun.mjs';

export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/vues-zoom/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });

export async function dispositif(type) {
  // un seul onglet frais par appareil (l'app passe à /medrevise : sans ce ménage, chaque lancement en ouvrirait un de plus)
  const port = { ordi: 9335, tel: 9336, tablette: 9337 }[type];
  const pages = (await (await fetch(`http://localhost:${port}/json`)).json()).filter((x) => x.type === 'page');
  await fetch(`http://localhost:${port}/json/new?http://localhost:5303/?banc=5300`, { method: 'PUT' });
  for (const p of pages) await fetch(`http://localhost:${port}/json/close/${p.id}`, { method: 'PUT' });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await dispositif0(type);
  b.tactile = type !== 'ordi';
  b.ok = (c, m, d = '') => { console.log(`[${b.nom}] ` + (c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); return c; };
  b.v = (c, m, d = '') => { if (!b.ok(c, m, d)) b.echecs++; return c; };
  b.echecs = 0;
  b.capture = async (nom) => { const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + nom + '.png', Buffer.from(s.data, 'base64')); };
  b.fin = () => { const errs = b.erreurs.filter((e) => !/validateDOMNesting|Failed to load resource|cannot be a descendant|cannot contain a nested/.test(e)); b.v(errs.length === 0, 'aucune erreur console', errs.join(' | ').slice(0, 400)); console.log(b.echecs ? `❌ ${b.echecs} échec(s)` : '✅ tout est vert'); return b.echecs; };
  // toucher / clic à un POINT précis (x, y) — tactile ou souris selon l'appareil
  b.point = async (x, y, att = 350) => {
    if (b.tactile) {
      await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await b.dormir(40);
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await b.dormir(att);
  };
  // double-tap / double-clic à un point
  b.double = async (x, y, att = 400) => {
    if (b.tactile) {
      for (let i = 0; i < 2; i++) { await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await b.dormir(30); await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(90); }
    } else for (let i = 1; i <= 2; i++) for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: i });
    await b.dormir(att);
  };
  // pincement à deux doigts : écart initial d0 → d1 (px), centré en (x, y)
  b.pincer = async (x, y, d0, d1, pas = 8) => {
    const pts = (d) => [{ x: x - d / 2, y, id: 1 }, { x: x + d / 2, y, id: 2 }];
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) });
    for (let i = 1; i <= pas; i++) { await b.dormir(16); await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + ((d1 - d0) * i) / pas) }); }
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await b.dormir(300);
  };
  // glissé d'un doigt (ou de la souris) de (x0, y0) à (x1, y1)
  b.glisser = async (x0, y0, x1, y1, pas = 10) => {
    if (b.tactile) {
      await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
      for (let i = 1; i <= pas; i++) { await b.dormir(16); await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / pas, y: y0 + ((y1 - y0) * i) / pas, id: 1 }] }); }
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
      for (let i = 1; i <= pas; i++) { await b.dormir(16); await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / pas, y: y0 + ((y1 - y0) * i) / pas, button: 'left', buttons: 1 }); }
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
    }
    await b.dormir(400);
  };
  b.touche = async (key, code = key) => {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: { Escape: 27, ' ': 32, Enter: 13, '1': 49, '2': 50, '3': 51, '4': 52, '+': 187, '-': 189 }[key] || 0, text: key.length === 1 ? key : undefined });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
    await b.dormir(250);
  };
  b.apprendre = async () => {
    if (b.type === 'tel') {
      await b.ev(`(() => { const r = document.querySelector('.alib-mobile .alib-mtete .mrm-icon-btn'); r && r.click(); return 1; })()`); await b.dormir(300);
      await b.ev(`(() => { const x = document.querySelector('.alib-entree'); x && x.click(); return 1; })()`);
    } else {
      // repasse par Réviser : le panneau est REMONTÉ (il relit filtres et tri mémorisés)
      await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /^Réviser/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`);
      await b.attendre(`!document.querySelector('.alib2')`, 8000); await b.dormir(300);
      await b.ev(`(() => { const x = document.querySelector('.sb-item[data-onglet="apprlibre"]'); x && x.click(); return 1; })()`);
    }
    await b.attendre(`!!document.querySelector('.alib2')`, 15000);
    await b.dormir(600);
    await b.ev(`(() => { for (const t of document.querySelectorAll('.alib2-stete[aria-expanded="false"], .alib2-mtete[aria-expanded="false"], .alib2-ctete[aria-expanded="false"]')) t.click(); return 1; })()`);
    await b.dormir(300);
  };
  b.compteur = () => b.ev(`+((document.querySelector('[data-compteur]') || {}).dataset || {}).compteur`);
  b.passagesBase = () => b.S(`const r = await S.getOne('learning_set', 'learning_set'); return (r && r.passages) || {};`);
  b.reinitApprendre = () => b.ev(`['filtres','vue','selection','tri'].forEach((k) => localStorage.removeItem('medrevise.apprentissage.' + k)); 1`);
  /** compteurs de vues affichés : { cardId: n } (cartes affichées seulement) */
  b.vuesAffichees = () => b.ev(`Object.fromEntries([...document.querySelectorAll('.alib2-carte')].map((c) => { const v = c.querySelector('[data-vues]'); return [c.dataset.carte, v ? +v.dataset.vues : null]; }))`);
  b.idsAffiches = () => b.ev(`[...document.querySelectorAll('.alib2-carte')].map((c) => c.dataset.carte)`);
  b.empreintePlanif = () => b.S(`const q = (await S.getAll('questions')).filter((x) => x.type === 'flashcard').sort((a, c) => a.id < c.id ? -1 : 1);
    return q.map((x) => [x.id, x.dueDate, x.j0Date, x.intervalDays, JSON.stringify(x.fsrs || null), (x.historique || []).length, !!x.nouvelle].join('|')).join('\\n');`);
  b.journal = () => b.ev(`(async () => { const J = await import('/src/medrevise/journal/journal.js'); return (await J.toutLeJournal()).map((e) => [e.id, e.card_id, e.rating]); })()`);
  return b;
}
