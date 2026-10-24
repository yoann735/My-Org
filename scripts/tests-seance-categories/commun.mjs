// Banc « séance par catégories » (24/10, docs/compte-rendu-seance-categories.md) — Vite :5199 SANS Supabase,
// Chrome headless isolé (port CDP_PORT, défaut 9341) dont le profil contient une COPIE restaurée des vraies
// données (scripts/sauvegarde-fsrs/restore-idb.mjs, origine localhost:5199) : jamais le vrai cloud.
import { appareil } from '../tests-fsrs/banc.mjs';
import fs from 'node:fs';
export async function banc(W = 1440, H = 900, { tactile = W < 760 } = {}) {
  const b = await appareil(Number(process.env.CDP_PORT || 9341));
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 760 });
  if (tactile) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  b.ok = (c, m, d = '') => { console.log((c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : '')); return c; };
  b.S = (js) => b.ev(`(async () => { const S = ${b.mod('storage.js')}; ${js} })()`);
  b.capture = async (nom, clip = null) => {
    const r = await b.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    fs.mkdirSync('../cap', { recursive: true });
    fs.writeFileSync(`../cap/${nom}.png`, Buffer.from(r.data, 'base64'));
  };
  b.rect = (js) => b.ev(`(() => { const e = ${js}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  // vrai clic souris (ou tap) au centre de l'élément
  b.toucher = async (js, att = 350) => {
    const r = await b.rect(js);
    if (!r) throw new Error('introuvable : ' + js);
    if (tactile) {
      await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.cx, y: r.cy }] });
      await b.dormir(50);
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: r.cx, y: r.cy, button: 'left', clickCount: 1 });
    }
    await b.dormir(att);
    return r;
  };
  // MedRevise ouverte (le hub s'affiche à chaque chargement) ; `ecran` = 'reviser' (ordinateur) ou accueil (téléphone)
  b.ouvrirApp = async ({ recharger = true } = {}) => {
    if (recharger) { await b.send('Page.reload', { ignoreCache: true }); await b.dormir(2500); }
    for (let i = 0; i < 60; i++) {
      const ou = await b.ev(`document.querySelector('[data-app="medrevise"], .mrm, .sfa') ? 'app' : document.querySelector('.hub-card') ? 'hub' : ''`);
      if (ou === 'app') break;
      if (ou === 'hub') await b.ev(`(() => { const c = [...document.querySelectorAll('.hub-card')].find((x) => /MedRevise/i.test(x.innerText)); c && c.click(); return 1; })()`);
      await b.dormir(400);
    }
    await b.dormir(1500);
  };
  b.reviser = async () => {
    await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /^Réviser/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`);
    await b.attendre(`!!document.querySelector('[data-sfa="lanceur"], .sfa')`, 15000);
    await b.dormir(600);
  };
  b.lanceur = () => b.ev(`(() => { const l = document.querySelector('[data-sfa="lanceur"]'); if (!l) return null;
    const cat = (c) => { const e = l.querySelector('[data-cat="' + c + '"]'); return { coche: e.querySelector('input').checked, n: +e.querySelector('.sfa-cat-n').dataset.n, max: e.querySelector('select').value }; };
    return { total: l.querySelector('[data-sfa="total"]').textContent, nouvelles: cat('nouvelles'), revisions: cat('revisions'), retard: cat('retard') }; })()`);
  b.cocher = (cat, v) => b.ev(`(() => { const i = document.querySelector('[data-sfa="lanceur"] [data-cat="${cat}"] input'); if (i.checked !== ${!!v}) i.click(); return i.checked; })()`);
  b.maximum = (cat, v) => b.ev(`(() => { const s = document.querySelector('[data-sfa="lanceur"] [data-cat="${cat}"] select'); const P = HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(P, 'value').set.call(s, String(${JSON.stringify(v)})); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  return b;
}
