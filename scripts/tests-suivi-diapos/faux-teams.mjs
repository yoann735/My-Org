// OUTIL DE TEST (24/11/2026, docs/compte-rendu-suivi-auto-diapos.md) — jamais chargé par l'app.
// Faux Teams local (:54411) : sert la page faux-teams.html, pdf.js (node_modules) et le PDF du cours lu EN LOCAL
// (PDF_HISTO, sinon $TRAVAIL/histo-banc.pdf de gen-histo.mjs) — le PDF n'est jamais copié dans le dépôt.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '../..');
const TRAVAIL = process.env.TRAVAIL || path.join(os.tmpdir(), 'banc-suivi-diapos');
const PORT = Number(process.env.PORT || 54411);
const PDF = () => process.env.PDF_HISTO || path.join(TRAVAIL, 'histo-banc.pdf');
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.pdf': 'application/pdf' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let f = null;
  if (u.pathname === '/' || u.pathname === '/teams.html') f = path.join(ICI, 'faux-teams.html');
  else if (u.pathname === '/cours.pdf') f = PDF();
  else if (u.pathname === '/autre.pdf') f = path.join(TRAVAIL, 'autre.pdf');
  else if (u.pathname === '/pdf.mjs') f = path.join(RACINE, 'node_modules/pdfjs-dist/build/pdf.min.mjs');
  else if (u.pathname === '/pdf.worker.mjs') f = path.join(RACINE, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
  if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end('absent'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('faux Teams sur http://localhost:' + PORT + ' — PDF : ' + PDF()));
