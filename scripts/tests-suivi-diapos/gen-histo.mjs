// Banc « suivi automatique des diapos » (24/11/2026, docs/compte-rendu-suivi-auto-diapos.md).
// PDF D'HISTOLOGIE DE SECOURS, généré HORS du dépôt ($TRAVAIL/histo-banc.pdf) quand aucun vrai PDF n'est donné
// (PDF_HISTO=~/Downloads/xxx.pdf). Il imite ce qui rend l'histologie difficile : beaucoup de diapos AU MÊME TITRE avec
// des photos différentes, des diapos SANS titre (photo seule), des diapos à fond NOIR, presque pas de texte.
// Photos : colorations « H&E » dessinées au hasard (graine fixe : reproductible) dans un Chrome headless MUET.
// Usage : node gen-histo.mjs  → écrit $TRAVAIL/histo-banc.pdf et $TRAVAIL/histo-banc.json (titres, sortes)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TRAVAIL, CHROME, cdp, dormir } from './commun.mjs';

export const DIAPOS = [
  { titre: 'Histologie générale : les tissus', sous: 'Bloc 1 · kinésithérapie', url: 'moodle.helha.be/histologie', sorte: 'titre' },
  { titre: 'Plan du cours', puces: ['Épithéliums de revêtement', 'Tissus conjonctifs', 'Cartilage et os', 'Tissu musculaire', 'Tissu nerveux, sang, peau'], sorte: 'texte' },
  ...[1, 2, 3, 4, 5].map((k) => ({ titre: 'Épithélium pavimenteux stratifié', tissu: 'epithelium', graine: 100 + k, sorte: 'meme-titre' })),
  { titre: 'Épithélium cylindrique simple', tissu: 'cylindrique', graine: 210, sorte: 'photo' },
  { tissu: 'conjonctif', graine: 220, sorte: 'sans-titre' },
  { tissu: 'epithelium', graine: 230, sorte: 'sans-titre' },
  { titre: 'Tissu conjonctif lâche', tissu: 'conjonctif', graine: 240, sorte: 'photo' },
  { titre: 'Tissu conjonctif dense', tissu: 'dense', graine: 250, sorte: 'photo' },
  { titre: 'Cartilage hyalin', tissu: 'cartilage', graine: 260, sorte: 'meme-titre' },
  { titre: 'Cartilage hyalin', tissu: 'cartilage', graine: 261, sorte: 'meme-titre' },
  { titre: 'Cartilage élastique', tissu: 'cartilage', graine: 270, sorte: 'photo' },
  { titre: 'Fibrocartilage', tissu: 'dense', graine: 280, sorte: 'photo' },
  ...[1, 2, 3].map((k) => ({ titre: 'Os compact : ostéon', tissu: 'os', graine: 300 + k, sorte: 'noir', noir: true })),
  { tissu: 'os', graine: 310, sorte: 'sans-titre', noir: true },
  { titre: 'Muscle strié squelettique', tissu: 'muscle', graine: 320, sorte: 'meme-titre' },
  { titre: 'Muscle strié squelettique', tissu: 'muscle', graine: 321, sorte: 'meme-titre' },
  { titre: 'Muscle cardiaque', tissu: 'muscle', graine: 330, sorte: 'photo' },
  { titre: 'Muscle lisse', tissu: 'lisse', graine: 340, sorte: 'photo' },
  { titre: 'Tissu nerveux', tissu: 'nerveux', graine: 350, sorte: 'photo' },
  { titre: 'Sang : frottis', tissu: 'sang', graine: 360, sorte: 'photo' },
  ...[1, 2, 3, 4].map((k) => ({ titre: 'Peau : épiderme et derme', tissu: k % 2 ? 'epithelium' : 'dense', graine: 400 + k, sorte: 'meme-titre' })),
  { tissu: 'sang', graine: 420, sorte: 'sans-titre' },
  { titre: 'Récapitulatif', puces: ['Épithéliums : cellules jointives', 'Conjonctifs : matrice abondante', 'Muscles : contraction', 'Nerveux : conduction'], sorte: 'texte' },
];
/** diapo « hors PDF » que le prof montre (question, schéma au tableau) */
export const AUTRE = { titre: 'Questions ? Pause de 5 minutes', tissu: 'nerveux', graine: 999, sorte: 'hors-pdf' };

/* dessin d'une « photo » H&E dans la page (canvas) — renvoie un PNG en base64 */
const DESSIN = `(d, W, H) => {
  // graine MÉLANGÉE (des graines voisines donnaient presque le même tirage : photos quasi identiques) + tirages de chauffe
  let s = (Math.imul(d.graine || 1, 2654435761) >>> 1) % 2147483646 + 1; const r = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 20; i++) r();
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const teinte = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const rose = teinte([238, 190, 210], [250, 215, 225], r()), violet = teinte([90, 40, 130], [140, 70, 170], r());
  g.fillStyle = d.noir ? '#141414' : 'rgb(' + rose + ')'; g.fillRect(0, 0, W, H);
  const rond = (x, y, rx, ry, col, a = 0) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill(); };
  const v = () => 'rgb(' + violet.map((x) => x + Math.round((r() - .5) * 30)) + ')';
  const t = d.tissu;
  if (t === 'epithelium' || t === 'cylindrique') {
    const n = 6 + Math.floor(r() * 6), y0 = H * (0.15 + r() * 0.3);
    for (let k = 0; k < n; k++) for (let x = 0; x < W; x += 26 + r() * 10) { const y = y0 + k * 22 + Math.sin(x / 90 + k) * 12; rond(x, y, t === 'cylindrique' ? 6 : 11 - k, t === 'cylindrique' ? 13 : 6, v(), r()); }
    g.fillStyle = 'rgba(200,120,160,.5)'; g.fillRect(0, y0 + n * 22, W, H);
    for (let i = 0; i < 160; i++) rond(r() * W, y0 + n * 22 + r() * H, 4, 3, v());
  } else if (t === 'conjonctif' || t === 'dense') {
    g.strokeStyle = 'rgba(205,90,130,.75)'; g.lineWidth = t === 'dense' ? 9 : 3;
    const ang = r() * 3;
    for (let i = 0; i < (t === 'dense' ? 70 : 45); i++) { g.beginPath(); const x = r() * W, y = r() * H; g.moveTo(x, y); g.bezierCurveTo(x + 120 * Math.cos(ang), y + 80 * r(), x + 260 * Math.cos(ang), y - 40, x + 380 * Math.cos(ang + r()), y + 140 * Math.sin(ang)); g.stroke(); }
    for (let i = 0; i < 90; i++) rond(r() * W, r() * H, 7, 4, v(), ang);
  } else if (t === 'cartilage') {
    for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H; rond(x, y, 24, 18, 'rgba(255,240,250,.9)'); rond(x, y, 9, 8, v()); }
    g.fillStyle = 'rgba(120,100,190,.25)'; g.fillRect(0, 0, W, H);
  } else if (t === 'os') {
    for (let k = 0; k < 6; k++) { const cx = r() * W, cy = r() * H; for (let q = 9; q > 0; q--) rond(cx, cy, q * 22, q * 19, q % 2 ? 'rgb(225,200,170)' : 'rgb(190,160,130)'); rond(cx, cy, 14, 12, '#2a1a10'); for (let i = 0; i < 18; i++) rond(cx + Math.cos(i) * 110 * r(), cy + Math.sin(i) * 100 * r(), 5, 3, '#3a2a20'); }
  } else if (t === 'muscle' || t === 'lisse') {
    const ang = (r() - .5) * .6; g.save(); g.translate(W / 2, H / 2); g.rotate(ang);
    for (let y = -H; y < H; y += 46) { g.fillStyle = 'rgb(' + teinte([215, 110, 140], [235, 140, 165], r()) + ')'; g.fillRect(-W, y, 2 * W, 40);
      if (t === 'muscle') for (let x = -W; x < W; x += 9) { g.fillStyle = 'rgba(120,40,80,.35)'; g.fillRect(x, y, 3, 40); }
      for (let i = 0; i < 6; i++) rond(-W + r() * 2 * W, y + 20, t === 'lisse' ? 22 : 10, 5, v()); }
    g.restore();
  } else if (t === 'nerveux') {
    for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * H; rond(x, y, 30, 26, 'rgb(170,90,160)'); rond(x, y, 10, 10, '#401a50'); g.strokeStyle = 'rgba(150,80,150,.8)'; g.lineWidth = 3; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - .5) * 300, y + (r() - .5) * 300, x + (r() - .5) * 500, y + (r() - .5) * 400); g.stroke(); } }
  } else if (t === 'sang') {
    for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * H; rond(x, y, 17, 17, 'rgb(225,120,130)'); rond(x, y, 7, 7, 'rgb(240,170,175)'); }
    for (let i = 0; i < 5; i++) rond(r() * W, r() * H, 26, 24, v());
  }
  return c.toDataURL('image/png').split(',')[1];
}`;

async function principal() {
  fs.mkdirSync(TRAVAIL, { recursive: true });
  const prof = path.join(TRAVAIL, 'chrome-gen');
  const ch = spawn(CHROME, ['--headless=new', '--mute-audio', '--remote-debugging-port=9401', '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  try {
    await dormir(2500);
    const b = await cdp(9401);
    const pdf = await PDFDocument.create();
    const fonte = await pdf.embedFont(StandardFonts.Helvetica), gras = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 960, H = 540;
    const ecrire = async (d, page) => {
      const fond = d.noir ? rgb(0.05, 0.05, 0.05) : rgb(1, 1, 1), encre = d.noir ? rgb(0.95, 0.95, 0.95) : rgb(0.12, 0.14, 0.2);
      page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: fond });
      if (d.tissu) {
        const plein = !d.titre;
        const pw = plein ? W : 760, ph = plein ? H : 400;
        const png = await b.ev(`(${DESSIN})(${JSON.stringify(d)}, ${pw * 2}, ${ph * 2})`);
        const im = await pdf.embedPng(Buffer.from(png, 'base64'));
        page.drawImage(im, { x: plein ? 0 : (W - pw) / 2, y: plein ? 0 : 28, width: pw, height: ph });
      }
      if (d.titre) page.drawText(d.titre, { x: 48, y: H - 72, size: d.sorte === 'titre' ? 40 : 30, font: gras, color: encre });
      if (d.sous) page.drawText(d.sous, { x: 48, y: H - 130, size: 22, font: fonte, color: encre });
      if (d.url) page.drawText(d.url, { x: 48, y: 60, size: 18, font: fonte, color: rgb(0.1, 0.45, 0.5) });
      if (d.sorte === 'titre') { page.drawRectangle({ x: 48, y: 200, width: 864, height: 6, color: rgb(0.1, 0.55, 0.55) }); page.drawCircle({ x: 820, y: 330, size: 70, color: rgb(0.85, 0.55, 0.7) }); }
      (d.puces || []).forEach((p, i) => page.drawText('•  ' + p, { x: 70, y: H - 150 - i * 52, size: 24, font: fonte, color: encre }));
    };
    for (const d of DIAPOS) await ecrire(d, pdf.addPage([W, H]));
    fs.writeFileSync(path.join(TRAVAIL, 'histo-banc.pdf'), await pdf.save());
    // la diapo hors PDF, en PDF à part (le faux Teams la rend comme les autres)
    const autre = await PDFDocument.create(); const f2 = await autre.embedFont(StandardFonts.HelveticaBold);
    const pa = autre.addPage([W, H]); pa.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.93, 0.95, 1) });
    pa.drawText(AUTRE.titre, { x: 48, y: H - 72, size: 30, font: f2, color: rgb(0.1, 0.1, 0.3) });
    const pngA = await b.ev(`(${DESSIN})(${JSON.stringify(AUTRE)}, 900, 500)`); pa.drawImage(await autre.embedPng(Buffer.from(pngA, 'base64')), { x: 300, y: 40, width: 600, height: 333 });
    fs.writeFileSync(path.join(TRAVAIL, 'autre.pdf'), await autre.save());
    fs.writeFileSync(path.join(TRAVAIL, 'histo-banc.json'), JSON.stringify(DIAPOS.map((d, i) => ({ page: i + 1, titre: d.titre || null, sorte: d.sorte })), null, 1));
    console.log('PDF :', path.join(TRAVAIL, 'histo-banc.pdf'), DIAPOS.length, 'pages');
    b.fermer();
  } finally { ch.kill('SIGKILL'); }
}
if (process.argv[1] && process.argv[1].endsWith('gen-histo.mjs')) principal().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
