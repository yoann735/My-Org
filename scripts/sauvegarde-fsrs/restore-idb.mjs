// RESTAURATION de l'IndexedDB MedRevise à partir d'un export (export-idb.mjs), dans un profil Chrome
// donné, pour l'origine https://my-org-blue.vercel.app — SANS exécuter l'app (page vide, réseau coupé).
// Usage : node restore-idb.mjs <dossier-sauvegarde> <profil-cible> [port] [--force]
//   Refuse si une base existe déjà dans le profil cible (sauf --force, qui VIDE puis réécrit les
//   stores présents dans la sauvegarde). Recrée chaque base avec sa version, ses stores, keyPath,
//   autoIncrement et index, puis réécrit toutes les entrées (Blob/File reconstruits avec leur type).
// Vérification : relancer export-idb.mjs sur le profil cible et comparer (verifier.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ouvrirChromeIsole, SERIALISEUR_PAGE } from './chrome-isole.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force');
const [dossier, profil, port = '9362'] = args;
if (!dossier || !profil) { console.error('usage : node restore-idb.mjs <dossier-sauvegarde> <profil-cible> [port] [--force]'); process.exit(2); }
const index = JSON.parse(readFileSync(join(dossier, 'idb', 'index.json'), 'utf8'));

const { evaluer, fermer } = await ouvrirChromeIsole(profil, Number(port));
try {
  await evaluer(`(() => { ${SERIALISEUR_PAGE}; window.__deser = __deser; return true; })()`);
  const existantes = JSON.parse(await evaluer(`indexedDB.databases().then((d) => JSON.stringify(d.map((x) => x.name)))`));
  if (existantes.length && !force) { console.error('REFUS : le profil cible contient déjà ' + existantes.length + ' base(s) : ' + existantes.join(', ') + ' (utiliser --force pour écraser)'); process.exitCode = 3; await fermer(); process.exit(3); }
  let total = 0;
  for (const base of index.bases) {
    // schéma : lu dans le 1er fichier de chaque store
    const schemas = base.stores.map((s) => { const f = JSON.parse(readFileSync(join(dossier, s.fichiers[0].fichier), 'utf8')); return { store: f.store, keyPath: f.keyPath, autoIncrement: f.autoIncrement, indexes: f.indexes }; });
    await evaluer(`new Promise((res, rej) => {
      const schemas = ${JSON.stringify(schemas)};
      const r = indexedDB.open(${JSON.stringify(base.db)}, ${base.version});
      r.onupgradeneeded = () => { const db = r.result;
        for (const s of schemas) { if (db.objectStoreNames.contains(s.store)) continue;
          const os = db.createObjectStore(s.store, { keyPath: s.keyPath, autoIncrement: s.autoIncrement });
          for (const i of s.indexes) os.createIndex(i.name, i.keyPath, { unique: i.unique, multiEntry: i.multiEntry }); } };
      r.onsuccess = () => { const db = r.result; const v = db.version; db.close(); v === ${base.version} ? res(true) : rej(new Error('version ' + v)); };
      r.onerror = () => rej(r.error);
    })`);
    for (const s of base.stores) {
      if (force) await evaluer(`new Promise((res, rej) => { const r = indexedDB.open(${JSON.stringify(base.db)}); r.onsuccess = () => { const db = r.result; const tx = db.transaction(${JSON.stringify(s.store)}, 'readwrite'); tx.objectStore(${JSON.stringify(s.store)}).clear(); tx.oncomplete = () => { db.close(); res(true); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); })`);
      let n = 0;
      for (const f of s.fichiers) {
        const contenu = readFileSync(join(dossier, f.fichier), 'utf8');
        n += await evaluer(`new Promise((res, rej) => {
          const p = JSON.parse(${JSON.stringify(contenu)});
          const r = indexedDB.open(${JSON.stringify(base.db)});
          r.onsuccess = () => { const db = r.result; const tx = db.transaction(p.store, 'readwrite'); const os = tx.objectStore(p.store);
            for (const [k, v] of p.entries) { const cle = window.__deser(k), val = window.__deser(v); if (os.keyPath == null) os.put(val, cle); else os.put(val); }
            tx.oncomplete = () => { db.close(); res(p.entries.length); }; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); };
          r.onerror = () => rej(r.error);
        })`);
      }
      total += n;
      if (n !== s.exportees) throw new Error(`${base.db}/${s.store} : ${n} restaurées sur ${s.exportees}`);
    }
    console.log(`${base.db} : ${base.stores.map((s) => s.store + '=' + s.exportees).join(', ')}`);
  }
  console.log(`restauration terminée : ${index.bases.length} bases, ${total} entrées`);
} finally { await fermer(); }
