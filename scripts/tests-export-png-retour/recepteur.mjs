// Réception des résultats de safari.html (banc WebKit) : écrit resultats/safari-<n>.json et .png, puis s'arrête.
import http from 'node:http'; import fs from 'node:fs';
const dossier = new URL('./resultats/', import.meta.url);
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') { res.end(); return; }
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    const r = JSON.parse(b); const png = r.png; delete r.png;
    fs.writeFileSync(new URL('safari.json', dossier), JSON.stringify(r, null, 1));
    if (png) fs.writeFileSync(new URL('safari.png', dossier), Buffer.from(png.split(',')[1], 'base64'));
    res.end('ok'); console.log('reçu'); setTimeout(() => process.exit(0), 200);
  });
}).listen(54411);
