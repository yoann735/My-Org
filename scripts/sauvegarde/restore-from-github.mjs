// RESTAURATION d'une copie du filet de sécurité (dépôt GitHub privé, ou export du dossier local) vers une
// IndexedDB MedRevise, dans un Chrome headless ISOLÉ (réseau coupé, l'app ne tourne jamais) — voir
// restore-from-github.md. Supabase n'est JAMAIS écrit par ce script.
//
//   node scripts/sauvegarde/restore-from-github.mjs --depot <user>/medrevise-backups --ref <commit|main> --profil <dossier-profil-vide>
//   node scripts/sauvegarde/restore-from-github.mjs --dossier <chemin d'un export local « données/YYYY-MM-DD »> --profil <…>
//   options : --origine http://localhost:5199 (défaut : https://my-org-blue.vercel.app) · --force (profil non vide) · --verifier-seulement
//   jeton (dépôt privé) : variable d'environnement GITHUB_TOKEN (jamais affiché).
// Étapes : téléchargement des fichiers à la révision demandée → contrôle SHA-256 contre manifest.json →
// reconstruction des stores (medrevise-<store>/v1, clé = id ; journal → medrevise-review_log) → relecture et
// comparaison des comptes ET des empreintes par store. Code de sortie 0 seulement si tout est identique.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256, lireJsonl, jsonCanonique } from '../../src/medrevise/sauvegarde/export.js';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const drapeau = (n) => args.includes('--' + n);
const depot = opt('depot'); const ref = opt('ref', 'main'); const dossier = opt('dossier'); const profil = opt('profil');
if (opt('origine')) process.env.ORIGINE = opt('origine');
if ((!depot && !dossier) || (!profil && !drapeau('verifier-seulement'))) {
  console.error('usage : --depot <user>/<repo> --ref <commit> | --dossier <export local>  et  --profil <profil Chrome vide>'); process.exit(2);
}

/* 1. fichiers de la copie */
async function lireFichier(chemin) {
  if (dossier) { const p = join(dossier, chemin); if (!existsSync(p)) throw new Error('fichier absent : ' + p); return readFileSync(p, 'utf8'); }
  const r = await fetch(`https://api.github.com/repos/${depot}/contents/${chemin}?ref=${encodeURIComponent(ref)}`, {
    headers: { Accept: 'application/vnd.github.raw', 'User-Agent': 'medrevise-restore', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) },
  });
  if (!r.ok) throw new Error(`GitHub ${chemin} @ ${ref} : HTTP ${r.status}`);
  return r.text();
}
const manifeste = JSON.parse(await lireFichier('manifest.json'));
console.log(`copie du ${manifeste.jour} — ${manifeste.comptes.enregistrements} enregistrements, ${manifeste.comptes.flashcards} flashcards, ${manifeste.comptes.questions} questions`);
const contenus = {};
for (const f of manifeste.fichiers) {
  const c = await lireFichier(f.chemin);
  if (sha256(c) !== f.sha256) { console.error(`ARRÊT : empreinte différente pour ${f.chemin}`); process.exit(1); }
  contenus[f.chemin] = c;
}
console.log(`empreintes SHA-256 : ${manifeste.fichiers.length}/${manifeste.fichiers.length} conformes au manifeste`);

/* 2. stores à reconstruire */
const lignes = Object.keys(contenus).filter((c) => /^data\/records(-\d{3})?\.jsonl$/.test(c)).sort().flatMap((c) => lireJsonl(contenus[c]));
const journal = Object.keys(contenus).filter((c) => /^data\/review_log(-\d{3})?\.jsonl$/.test(c)).sort().flatMap((c) => lireJsonl(contenus[c]));
const stores = {};
for (const l of lignes) { if (l.deleted || l.data == null) continue; (stores[l.store] ||= []).push([l.id, l.data]); }
if (journal.length) {
  const { depuisLigne } = await import('../../src/medrevise/journal/fusion.js');
  stores.review_log = journal.map((l) => [l.id, depuisLigne(l)]);
}
const empreinteStore = (entrees) => sha256(entrees.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, v]) => k + '\t' + jsonCanonique(v)).join('\n'));
const attendu = Object.fromEntries(Object.entries(stores).map(([s, e]) => [s, { n: e.length, empreinte: empreinteStore(e) }]));
const vivantsAttendus = Object.values(attendu).reduce((s, x) => s + x.n, 0) - (attendu.review_log ? attendu.review_log.n : 0);
if (vivantsAttendus !== manifeste.comptes.enregistrements) { console.error(`ARRÊT : ${vivantsAttendus} enregistrements lus ≠ ${manifeste.comptes.enregistrements} au manifeste`); process.exit(1); }
if (drapeau('verifier-seulement')) { console.log('vérification seule : copie complète et intègre'); process.exit(0); }

/* 3. reconstruction dans un Chrome isolé */
const { ouvrirChromeIsole } = await import('../sauvegarde-fsrs/chrome-isole.mjs');
const { evaluer, fermer } = await ouvrirChromeIsole(profil, Number(opt('port', 9371)));
let ko = 0;
try {
  const existantes = JSON.parse(await evaluer(`indexedDB.databases().then((d) => JSON.stringify(d.map((x) => x.name).filter((n) => n.startsWith('medrevise-'))))`));
  if (existantes.length && !drapeau('force')) { console.error(`REFUS : le profil contient déjà ${existantes.length} base(s) MedRevise (--force pour écraser)`); process.exitCode = 3; }
  else {
    for (const [store, entrees] of Object.entries(stores)) {
      for (let i = 0; i < entrees.length; i += 500) {
        const lot = JSON.stringify(entrees.slice(i, i + 500));
        await evaluer(`new Promise((ok, ko) => { const r = indexedDB.open(${JSON.stringify('medrevise-' + store)}, 1);
          r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('v1')) r.result.createObjectStore('v1'); };
          r.onerror = () => ko(r.error);
          r.onsuccess = () => { const db = r.result; const tx = db.transaction('v1', 'readwrite'); const os = tx.objectStore('v1');
            ${i === 0 && drapeau('force') ? 'os.clear();' : ''}
            for (const [k, v] of JSON.parse(${JSON.stringify(lot)})) os.put(v, k);
            tx.oncomplete = () => { db.close(); ok(true); }; tx.onerror = () => ko(tx.error); }; })`);
      }
    }
    /* 4. relecture et comparaison */
    const lu = JSON.parse(await evaluer(`(async () => { const out = {}; for (const s of ${JSON.stringify(Object.keys(stores))}) {
      out[s] = await new Promise((ok) => { const r = indexedDB.open('medrevise-' + s); r.onsuccess = () => { const db = r.result; const tx = db.transaction('v1'); const os = tx.objectStore('v1');
        const k = os.getAllKeys(); const v = os.getAll(); tx.oncomplete = () => { db.close(); ok(k.result.map((x, i) => [x, v.result[i]])); }; }; }); }
      return JSON.stringify(out); })()`));
    for (const [s, a] of Object.entries(attendu)) {
      const e = lu[s] || [];
      const same = e.length === a.n && empreinteStore(e) === a.empreinte;
      if (!same) ko++;
      console.log(`${same ? '✅' : '❌'} medrevise-${s} : ${e.length}/${a.n} enregistrements · empreinte ${same ? 'identique' : 'DIFFÉRENTE'}`);
    }
    console.log(ko ? `ÉCHEC : ${ko} store(s) différent(s)` : `RESTAURATION CONFORME : ${Object.keys(attendu).length} stores, comptes et empreintes identiques`);
    console.log('Fichiers (PDF, images) : non contenus dans la copie GitHub (index seulement) — ils restent dans le bucket Supabase et dans le dossier local de sauvegarde.');
  }
} finally { await fermer(); }
process.exit(ko || process.exitCode ? 1 : 0);
