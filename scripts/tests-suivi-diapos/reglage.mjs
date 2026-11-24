// Banc « suivi automatique des diapos » (24/11/2026) — RÉGLAGE HORS LIGNE des seuils.
// Rejoue le moteur (moteur.js, le vrai code de l'app servi par Vite :5304) sur les images recadrées gardées par le dernier
// passage de t-suivi.mjs ($TRAVAIL/captures) contre les pages du PDF, dans un Chrome headless MUET.
// Usage : node reglage.mjs [vérité: 1,2,3,…]  → tableau score / 2e / marge par capture
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TRAVAIL, CHROME, BASE, cdp, dormir } from './commun.mjs';

const ch = spawn(CHROME, ['--headless=new', '--mute-audio', '--remote-debugging-port=9403', '--user-data-dir=' + path.join(TRAVAIL, 'chrome-reglage'), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
try {
  await dormir(2500);
  const b = await cdp(9403, { url: BASE + '/' });
  await dormir(2500);
  const pdf = fs.readFileSync(process.env.PDF_HISTO || path.join(TRAVAIL, 'histo-banc.pdf')).toString('base64');
  const dir = path.join(TRAVAIL, 'captures');
  const caps = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort().map((f) => fs.readFileSync(path.join(dir, f)).toString('base64'));
  const res = await b.ev(`(async () => {
    const M = await import('/src/medrevise/transcription/diapos/moteur.js');
    const { openPdf } = await import('/src/medrevise/pdf/pdfjsSetup.js');
    const bin = (s) => { const x = atob(s); const a = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) a[i] = x.charCodeAt(i); return a; };
    const doc = await openPdf(bin(${JSON.stringify(pdf)}));
    const LARG = ${Number(process.env.LARG || 480)};
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n); const v = p.getViewport({ scale: LARG / p.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height); const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: g, viewport: v, intent: 'print' }).promise;
      pages.push(M.signatureDe(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height));
    }
    const fond = ${process.env.FOND ? 'M.fondCommun(pages)' : 'null'};
    const out = [];
    for (const b64 of ${JSON.stringify(caps)}) {
      const im = await createImageBitmap(new Blob([bin(b64)], { type: 'image/jpeg' }));
      const c = new OffscreenCanvas(320, Math.round(320 * im.height / im.width)); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
      const s = M.signatureDe(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      const mq = new Uint8Array(M.CX * M.CY); for (let y = 0; y < M.CY; y++) for (let x = 0; x < M.CX; x++) if (x >= M.CX * 0.76 && y >= M.CY * 0.76) mq[y * M.CX + x] = 1;
      const sc = pages.map((p) => M.ressemblanceImage(s, p, ${process.env.MASQUE ? 'mq' : 'null'}, fond));
      const cl = sc.map((v, i) => [i + 1, Math.round(v * 1000) / 1000]).sort((a, b) => b[1] - a[1]).slice(0, 4);
      out.push(cl);
    }
    return out;
  })()`);
  res.forEach((cl, i) => console.log(String(i).padStart(3), cl.map(([p, v]) => `p${p}:${v}`).join('  ')));
  b.fermer();
} finally { ch.kill('SIGKILL'); }
process.exit(0);
