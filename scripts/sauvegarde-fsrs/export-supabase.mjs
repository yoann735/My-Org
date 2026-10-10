// EXPORT COMPLET EN LECTURE SEULE du cloud MedRevise (projet Supabase « My Org »).
// - table medrevise_records : TOUTES les lignes (tous les stores, tombstones `deleted` compris),
//   GET paginé par 1000, ordre stable (store, record_id) ;
// - bucket Storage medrevise-blobs : liste (POST /object/list = lecture) + téléchargement de chaque
//   fichier (GET).
// Aucune écriture : seuls des GET et l'appel de LISTE du Storage sont émis. La clé utilisée est la
// clé anon PUBLIQUE, lue dans le bundle déployé (jamais affichée ni écrite sur disque).
// Usage : node export-supabase.mjs <dossier-sortie>
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const sortie = process.argv[2];
if (!sortie) { console.error('usage : node export-supabase.mjs <dossier-sortie>'); process.exit(2); }
const SITE = 'https://my-org-blue.vercel.app';
const URL_SB = 'https://deaonugwvbapkdixdowk.supabase.co';
const BUCKET = 'medrevise-blobs';
const sha = (b) => createHash('sha256').update(b).digest('hex');

// clé anon publique : extraite du bundle déployé
const html = await (await fetch(SITE + '/')).text();
const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let key = null;
for (const s of scripts) {
  const js = await (await fetch(SITE + s)).text();
  for (const m of js.matchAll(/eyJhbGci[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g)) {
    try { if (JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url')).role === 'anon') { key = m[0]; break; } } catch {}
  }
  if (key) break;
}
if (!key) { console.error('clé anon introuvable dans le bundle'); process.exit(1); }
const H = { apikey: key, Authorization: 'Bearer ' + key };

// 1) medrevise_records
const lignes = [];
for (let p = 0; ; p++) {
  const r = await fetch(`${URL_SB}/rest/v1/medrevise_records?select=*&order=store.asc,record_id.asc&offset=${p * 1000}&limit=1000`, { headers: H });
  if (!r.ok) { console.error('ERREUR medrevise_records', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  const lot = await r.json(); lignes.push(...lot);
  if (lot.length < 1000) break;
}
// contrôle de complétude : compte exact renvoyé par PostgREST
const rc = await fetch(`${URL_SB}/rest/v1/medrevise_records?select=record_id&limit=1`, { headers: { ...H, Prefer: 'count=exact' } });
const compteExact = Number((rc.headers.get('content-range') || '').split('/')[1]);
mkdirSync(join(sortie, 'supabase'), { recursive: true });
const contenu = JSON.stringify({ table: 'medrevise_records', ordre: 'store,record_id', lignes });
writeFileSync(join(sortie, 'supabase', 'medrevise_records.json'), contenu);
const parStore = {};
lignes.forEach((l) => { const s = (parStore[l.store] ||= { lignes: 0, vivantes: 0, supprimees: 0 }); s.lignes++; l.deleted ? s.supprimees++ : s.vivantes++; });
console.log(`medrevise_records : ${lignes.length} lignes (compte exact serveur : ${compteExact})`);

// 2) bucket medrevise-blobs (liste récursive des dossiers éventuels, puis téléchargement)
const objets = [];
async function lister(prefixe) {
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_SB}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefixe, limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } }) });
    if (!r.ok) { console.error('ERREUR liste bucket', r.status, (await r.text()).slice(0, 300)); return; }
    const lot = await r.json();
    for (const o of lot) {
      const chemin = prefixe ? `${prefixe}/${o.name}` : o.name;
      if (o.id == null) await lister(chemin); else objets.push({ chemin, meta: o });
    }
    if (lot.length < 1000) break;
  }
}
await lister('');
const dBlobs = join(sortie, 'supabase', BUCKET); mkdirSync(dBlobs, { recursive: true });
const fichiersBucket = [];
for (const o of objets) {
  const r = await fetch(`${URL_SB}/storage/v1/object/authenticated/${BUCKET}/${o.chemin.split('/').map(encodeURIComponent).join('/')}`, { headers: H });
  if (!r.ok) { fichiersBucket.push({ chemin: o.chemin, erreur: r.status }); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  const local = o.chemin.replace(/[^A-Za-z0-9._\-]/g, '_');
  writeFileSync(join(dBlobs, local), buf);
  fichiersBucket.push({ chemin: o.chemin, fichier: `supabase/${BUCKET}/${local}`, octets: buf.length, sha256: sha(buf), mimetype: o.meta.metadata && o.meta.metadata.mimetype, updated_at: o.meta.updated_at });
}
writeFileSync(join(sortie, 'supabase', 'index.json'), JSON.stringify({
  projet: 'deaonugwvbapkdixdowk', table: { nom: 'medrevise_records', lignes: lignes.length, compteExact, parStore, sha256: sha(contenu) },
  bucket: { nom: BUCKET, objets: objets.length, erreurs: fichiersBucket.filter((f) => f.erreur).length, fichiers: fichiersBucket },
}, null, 1));
console.log(`bucket ${BUCKET} : ${objets.length} objets, ${fichiersBucket.filter((f) => !f.erreur).length} téléchargés, ${fichiersBucket.filter((f) => f.erreur).length} erreurs`);
console.log(JSON.stringify(parStore));
