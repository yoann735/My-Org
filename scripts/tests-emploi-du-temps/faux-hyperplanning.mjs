// Faux Hyperplanning (banc du 17/10) : sert le .ics de test sur http://localhost:54410/edt.ics.
// /__version?v=1|2|3 (v2 = horaire, salle, annulation changés ; v3 = chevauchement, samedi, soir), /__panne?on=1|0 (HTTP 500), /__etat (nombre de lectures).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url));
const fx = (v) => path.join(ici, '../../tests/emploi-du-temps', v === 2 ? 'semaine-1bkine12-v2.ics' : v === 3 ? 'semaine-1bkine12-v3.ics' : 'semaine-1bkine12.ics');
let version = 1; let panne = false; let lectures = 0;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__version') { version = [2, 3].includes(Number(u.searchParams.get('v'))) ? Number(u.searchParams.get('v')) : 1; res.end('v' + version); return; }
  if (u.pathname === '/__panne') { panne = u.searchParams.get('on') === '1'; res.end('panne ' + panne); return; }
  if (u.pathname === '/__etat') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ version, panne, lectures })); return; }
  if (u.pathname === '/edt.ics') {
    lectures++;
    if (panne) { res.statusCode = 500; res.end('panne'); return; }
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.end(fs.readFileSync(fx(version)));
    return;
  }
  res.statusCode = 404; res.end();
}).listen(54410, () => console.log('faux Hyperplanning sur :54410'));
