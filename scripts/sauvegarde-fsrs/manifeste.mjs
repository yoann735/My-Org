// MANIFESTE d'une sauvegarde : SHA-256 + taille de CHAQUE fichier du dossier (hors MANIFESTE.json),
// plus les compteurs lus dans idb/index.json et supabase/index.json.
// Usage : node manifeste.mjs <dossier-sauvegarde> [note libre]
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const [dossier, ...note] = process.argv.slice(2);
if (!dossier) { console.error('usage : node manifeste.mjs <dossier-sauvegarde> [note]'); process.exit(2); }
const fichiers = [];
const parcourir = (d) => readdirSync(d).sort().forEach((n) => {
  const p = join(d, n); const st = statSync(p);
  if (st.isDirectory()) return parcourir(p);
  const rel = relative(dossier, p);
  if (rel === 'MANIFESTE.json') return;
  fichiers.push({ fichier: rel, octets: st.size, sha256: createHash('sha256').update(readFileSync(p)).digest('hex') });
});
parcourir(dossier);
const lire = (f) => (existsSync(join(dossier, f)) ? JSON.parse(readFileSync(join(dossier, f), 'utf8')) : null);
const idb = lire('idb/index.json'), sb = lire('supabase/index.json');
const manifeste = {
  creeLe: new Date().toISOString(),
  note: note.join(' ') || null,
  indexeddb: idb && { bases: idb.bases.length, entrees: idb.bases.reduce((s, b) => s + b.stores.reduce((t, x) => t + x.exportees, 0), 0),
    erreurs: idb.bases.reduce((s, b) => s + b.stores.reduce((t, x) => t + x.erreurs.length, 0), 0),
    parBase: Object.fromEntries(idb.bases.map((b) => [b.db, b.stores.reduce((t, x) => t + x.exportees, 0)])) },
  supabase: sb && { lignes: sb.table.lignes, compteExactServeur: sb.table.compteExact, parStore: sb.table.parStore, bucketObjets: sb.bucket.objets, bucketErreurs: sb.bucket.erreurs },
  fichiers,
  octetsTotal: fichiers.reduce((s, f) => s + f.octets, 0),
};
writeFileSync(join(dossier, 'MANIFESTE.json'), JSON.stringify(manifeste, null, 1));
console.log(`MANIFESTE.json : ${fichiers.length} fichiers, ${(manifeste.octetsTotal / 1048576).toFixed(1)} Mo`);
