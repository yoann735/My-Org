// EXPORT COMPLET (lecture seule) de l'IndexedDB MedRevise d'un PROFIL COPIÉ — toutes les bases de
// l'origine, tous les stores, toutes les entrées, blobs compris (images, PDF), sans perte.
// Usage : node export-idb.mjs <profil-copié> <dossier-sortie> [port]
//   <profil-copié> : un --user-data-dir contenant Default/IndexedDB/https_my-org-blue.vercel.app_0.indexeddb.*
//                    (COPIE du profil réel, jamais le profil réel lui-même).
// Sortie : <dossier>/idb/<base>/<store>.json (ou .partNNN.json au-delà de 25 Mo) + <dossier>/idb/index.json.
// Les fichiers ne contiennent aucun horodatage d'export : deux exports d'un même contenu sont
// identiques octet pour octet (c'est ce qui sert à vérifier une restauration).
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ouvrirChromeIsole, SERIALISEUR_PAGE } from './chrome-isole.mjs';

const [profil, sortie, port = '9361'] = process.argv.slice(2);
if (!profil || !sortie) { console.error('usage : node export-idb.mjs <profil-copié> <dossier-sortie> [port]'); process.exit(2); }
const PART_MAX = 25 * 1024 * 1024;
const sha = (s) => createHash('sha256').update(s).digest('hex');

const { evaluer, fermer, bloquees } = await ouvrirChromeIsole(profil, Number(port));
try {
  await evaluer(`(() => { ${SERIALISEUR_PAGE}; window.__ser = __ser; window.__cles = {}; return true; })()`);
  // schéma de chaque base (version, stores, keyPath, index) + clés de chaque store
  const schema = JSON.parse(await evaluer(`(async () => {
    const dbs = (await indexedDB.databases()).sort((a, b) => (a.name < b.name ? -1 : 1));
    const out = [];
    for (const d of dbs) {
      const db = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        r.onupgradeneeded = () => { r.transaction.abort(); rej(new Error('base absente ' + d.name)); }; });
      const stores = [];
      for (const s of [...db.objectStoreNames].sort()) {
        const tx = db.transaction(s, 'readonly'); const os = tx.objectStore(s);
        const cles = await new Promise((res, rej) => { const q = os.getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        window.__cles[d.name + '/' + s] = cles;
        stores.push({ store: s, keyPath: os.keyPath, autoIncrement: os.autoIncrement,
          indexes: [...os.indexNames].map((n) => { const i = os.index(n); return { name: n, keyPath: i.keyPath, unique: i.unique, multiEntry: i.multiEntry }; }),
          count: cles.length });
      }
      out.push({ db: d.name, version: db.version, stores });
      db.close();
    }
    return JSON.stringify(out);
  })()`));

  const index = { origine: 'https://my-org-blue.vercel.app', bases: [] };
  for (const base of schema) {
    const bIdx = { db: base.db, version: base.version, stores: [] };
    for (const st of base.stores) {
      const dossier = join(sortie, 'idb', base.db); mkdirSync(dossier, { recursive: true });
      const lotTaille = /blob/i.test(base.db) ? 1 : 200;
      const entrees = []; const erreurs = [];
      for (let i = 0; i < st.count; i += lotTaille) {
        const lot = JSON.parse(await evaluer(`(async () => {
          const cles = window.__cles[${JSON.stringify(base.db + '/' + st.store)}].slice(${i}, ${i + lotTaille});
          const db = await new Promise((res, rej) => { const r = indexedDB.open(${JSON.stringify(base.db)}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
          const out = [];
          for (const k of cles) {
            try {
              const v = await new Promise((res, rej) => { const q = db.transaction(${JSON.stringify(st.store)}, 'readonly').objectStore(${JSON.stringify(st.store)}).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
              out.push([await window.__ser(k), await window.__ser(v)]);
            } catch (e) { out.push([await window.__ser(k), null, String(e)]); }
          }
          db.close();
          return JSON.stringify(out);
        })()`));
        for (const e of lot) { if (e.length > 2) erreurs.push({ cle: e[0], erreur: e[2] }); entrees.push([e[0], e[1]]); }
      }
      // découpage en parts (taille) — l'ordre des entrées est celui des clés (ordre IndexedDB)
      const entete = { db: base.db, version: base.version, store: st.store, keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes: st.indexes };
      const parts = []; let courant = []; let taille = 0;
      for (const e of entrees) {
        const t = JSON.stringify(e).length;
        if (courant.length && taille + t > PART_MAX) { parts.push(courant); courant = []; taille = 0; }
        courant.push(e); taille += t;
      }
      parts.push(courant);
      const fichiers = [];
      parts.forEach((p, n) => {
        const nom = parts.length === 1 ? `${st.store}.json` : `${st.store}.part${String(n + 1).padStart(3, '0')}.json`;
        const contenu = JSON.stringify({ ...entete, part: n + 1, parts: parts.length, entries: p });
        writeFileSync(join(dossier, nom), contenu);
        fichiers.push({ fichier: `idb/${base.db}/${nom}`, octets: Buffer.byteLength(contenu), sha256: sha(contenu), entrees: p.length });
      });
      bIdx.stores.push({ store: st.store, count: st.count, exportees: entrees.length, erreurs, fichiers });
      console.log(`${base.db}/${st.store} : ${entrees.length}/${st.count} entrées${erreurs.length ? ' — ERREURS ' + erreurs.length : ''}`);
    }
    index.bases.push(bIdx);
  }
  index.requetesBloquees = bloquees.length;
  writeFileSync(join(sortie, 'idb', 'index.json'), JSON.stringify(index, null, 1));
  const total = index.bases.reduce((s, b) => s + b.stores.reduce((t, x) => t + x.exportees, 0), 0);
  const err = index.bases.reduce((s, b) => s + b.stores.reduce((t, x) => t + x.erreurs.length, 0), 0);
  console.log(`bases ${index.bases.length} · entrées ${total} · erreurs ${err} · requêtes réseau bloquées ${bloquees.length}`);
} finally { await fermer(); }
