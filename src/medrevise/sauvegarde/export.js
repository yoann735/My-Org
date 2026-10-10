/* ============================================================
   MedRevise — EXPORT DÉTERMINISTE des données (filet de sécurité, 11/10/2026,
   docs/compte-rendu-filet-securite.md). Fonctions PURES, partagées par :
   - la copie quotidienne côté serveur (api/_lib/sauvegarde.js → dépôt GitHub privé) ;
   - la copie dans le dossier local (sauvegarde/dossierLocal.js) ;
   - la restauration (scripts/sauvegarde/restore-from-github.mjs) et les tests.

   Même données → mêmes octets :
   - une ligne JSON par enregistrement (git ne stocke que les lignes qui changent) ;
   - lignes triées (store, id) ; clés des objets triées récursivement ;
   - aucune date d'exécution dans les fichiers de données (seul manifest.json porte le JOUR).
   Fichiers : data/records.jsonl, data/review_log.jsonl, data/files-index.json, manifest.json.
   Au-delà de `maxOctets` (40 Mo par défaut, sous la limite de 100 Mo par fichier de GitHub et des
   requêtes de son API), un fichier est découpé : data/records-001.jsonl, -002…
   ============================================================ */

export const VERSION_EXPORT = 1;
export const MAX_OCTETS_DEFAUT = 40 * 1024 * 1024;

/* ---- SHA-256 en JavaScript pur (synchrone, identique navigateur / Node) ---- */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256(entree) {
  const msg = typeof entree === 'string' ? new TextEncoder().encode(entree) : entree;
  const l = msg.length;
  const total = ((l + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total); buf.set(msg); buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor((l * 8) / 0x100000000)); dv.setUint32(total - 4, (l * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/* ---- JSON canonique : clés triées récursivement ---- */
function trier(v) {
  if (Array.isArray(v)) return v.map(trier);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = trier(v[k]); return o; }
  return v;
}
export const jsonCanonique = (v) => JSON.stringify(trier(v));
const octets = (s) => new TextEncoder().encode(s).length;
/** instant normalisé (PostgREST écrit « …23.8+00:00 », le client « …23.800Z ») */
export function normaliserInstant(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/** lignes JSONL de medrevise_records, triées (store, id) */
export function lignesRecords(rows) {
  return (rows || [])
    .map((r) => ({ store: r.store, id: String(r.record_id), updated_at: normaliserInstant(r.updated_at), deleted: !!r.deleted, data: r.deleted ? null : (r.data ?? null) }))
    .sort((a, b) => (a.store < b.store ? -1 : a.store > b.store ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(jsonCanonique);
}
/** lignes JSONL du journal des révisions, triées par id */
export function lignesJournal(rows) {
  return (rows || [])
    .map((r) => ({ ...r, reviewed_at: normaliserInstant(r.reviewed_at), inserted_at: normaliserInstant(r.inserted_at) }))
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))
    .map(jsonCanonique);
}

/** découpe des lignes en fichiers ≤ maxOctets (une ligne n'est jamais coupée) */
export function decouper(base, ext, lignes, maxOctets = MAX_OCTETS_DEFAUT) {
  const parts = []; let cur = []; let taille = 0;
  for (const l of lignes) {
    const t = octets(l) + 1;
    if (cur.length && taille + t > maxOctets) { parts.push(cur); cur = []; taille = 0; }
    cur.push(l); taille += t;
  }
  parts.push(cur);
  const contenu = (p) => (p.length ? p.join('\n') + '\n' : '');
  if (parts.length === 1) return [{ chemin: `${base}.${ext}`, contenu: contenu(parts[0]) }];
  return parts.map((p, i) => ({ chemin: `${base}-${String(i + 1).padStart(3, '0')}.${ext}`, contenu: contenu(p) }));
}

/** comptes lisibles : enregistrements vivants par store, questions par type */
export function comptes(rows, journal = []) {
  const parStore = {}; const parType = {};
  for (const r of rows || []) {
    if (r.deleted) continue;
    parStore[r.store] = (parStore[r.store] || 0) + 1;
    if (r.store === 'questions' && r.data && r.data.type) parType[r.data.type] = (parType[r.data.type] || 0) + 1;
  }
  return { enregistrements: Object.values(parStore).reduce((s, n) => s + n, 0), parStore: trier(parStore), questionsParType: trier(parType), questions: parStore.questions || 0, flashcards: parType.flashcard || 0, revisionsJournal: (journal || []).length };
}

/**
 * Export complet. `fichiersBucket` : [{ nom, taille, empreinte, type, maj }] (liste du bucket, sans contenu).
 * `jour` : 'YYYY-MM-DD' (le seul élément daté). Renvoie { fichiers: [{ chemin, contenu }], manifeste }.
 */
export function construireExport({ records, journal = [], journalAbsent = false, fichiersBucket = [], jour, maxOctets = MAX_OCTETS_DEFAUT }) {
  const fichiers = [
    ...decouper('data/records', 'jsonl', lignesRecords(records), maxOctets),
    ...decouper('data/review_log', 'jsonl', lignesJournal(journal), maxOctets),
  ];
  const index = [...(fichiersBucket || [])]
    .map((f) => ({ nom: f.nom, taille: f.taille ?? null, empreinte: f.empreinte ?? null, type: f.type ?? null, maj: normaliserInstant(f.maj) }))
    .sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
  fichiers.push({ chemin: 'data/files-index.json', contenu: '[\n' + index.map(jsonCanonique).join(',\n') + '\n]\n' });
  const manifeste = {
    version: VERSION_EXPORT, jour,
    comptes: comptes(records, journal),
    journalAbsent: !!journalAbsent,
    fichiersBucket: { nombre: index.length, octets: index.reduce((s, f) => s + (f.taille || 0), 0) },
    fichiers: fichiers.map((f) => ({ chemin: f.chemin, octets: octets(f.contenu), sha256: sha256(f.contenu), lignes: f.contenu ? f.contenu.split('\n').length - 1 : 0 })),
  };
  fichiers.push({ chemin: 'manifest.json', contenu: JSON.stringify(trier(manifeste), null, 1) + '\n' });
  return { fichiers, manifeste };
}

/** relit des lignes JSONL (restauration, tests) */
export const lireJsonl = (texte) => String(texte || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
