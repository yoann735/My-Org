// VÉRIFICATION d'une sauvegarde ou d'une restauration.
//   node verifier.mjs manifeste <dossier-sauvegarde>
//       recalcule le SHA-256 de chaque fichier listé dans MANIFESTE.json et le compare.
//   node verifier.mjs comparer <dossier-sauvegarde> <dossier-réexport>
//       compare l'export IndexedDB d'origine à un ré-export (fait par export-idb.mjs sur le profil
//       restauré) : mêmes bases, mêmes stores, mêmes fichiers, mêmes empreintes SHA-256.
//       Affiche aussi un contrôle métier des cartes (contenus riches : images, Muscle, molécules).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [mode, a, b] = process.argv.slice(2);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

if (mode === 'manifeste') {
  const m = JSON.parse(readFileSync(join(a, 'MANIFESTE.json'), 'utf8'));
  let ok = 0; const ko = [];
  for (const f of m.fichiers) {
    const p = join(a, f.fichier);
    if (!existsSync(p)) { ko.push(f.fichier + ' (absent)'); continue; }
    sha(readFileSync(p)) === f.sha256 ? ok++ : ko.push(f.fichier);
  }
  console.log(`manifeste : ${ok}/${m.fichiers.length} fichiers conformes${ko.length ? ' — NON CONFORMES : ' + ko.join(', ') : ''}`);
  process.exit(ko.length ? 1 : 0);
}

if (mode === 'comparer') {
  const ia = JSON.parse(readFileSync(join(a, 'idb', 'index.json'), 'utf8'));
  const ib = JSON.parse(readFileSync(join(b, 'idb', 'index.json'), 'utf8'));
  const liste = (ix) => ix.bases.flatMap((x) => x.stores.flatMap((s) => s.fichiers.map((f) => [f.fichier, f.sha256, f.entrees])));
  const la = liste(ia), lb = new Map(liste(ib).map(([f, h, n]) => [f, [h, n]]));
  let ok = 0; const ko = [];
  for (const [f, h, n] of la) {
    const x = lb.get(f);
    if (!x) ko.push(f + ' : absent du ré-export');
    else if (x[0] !== h) ko.push(`${f} : empreinte différente`);
    else if (sha(readFileSync(join(b, f))) !== h) ko.push(`${f} : fichier ré-exporté altéré`);
    else ok++;
  }
  if (lb.size !== la.length) ko.push(`nombre de fichiers : ${la.length} attendus, ${lb.size} ré-exportés`);
  const basesA = ia.bases.map((x) => x.db).join(','), basesB = ib.bases.map((x) => x.db).join(',');
  if (basesA !== basesB) ko.push('liste des bases différente');
  console.log(`bases : ${ia.bases.length} → ${ib.bases.length} · fichiers identiques (SHA-256) : ${ok}/${la.length}`);

  // contrôle métier sur le ré-export
  const lire = (dir, db, st) => { const s = (JSON.parse(readFileSync(join(dir, 'idb', 'index.json'), 'utf8')).bases.find((x) => x.db === db) || { stores: [] }).stores.find((x) => x.store === st);
    return s ? s.fichiers.flatMap((f) => JSON.parse(readFileSync(join(dir, f.fichier), 'utf8')).entries.map((e) => e[1])) : []; };
  const lireCles = (dir, db, st) => { const s = (JSON.parse(readFileSync(join(dir, 'idb', 'index.json'), 'utf8')).bases.find((x) => x.db === db) || { stores: [] }).stores.find((x) => x.store === st);
    return s ? s.fichiers.flatMap((f) => JSON.parse(readFileSync(join(dir, f.fichier), 'utf8')).entries.map((e) => e[0])) : []; };
  for (const [nom, dir] of [['origine', a], ['restaurée', b]]) {
    const q = lire(dir, 'medrevise-questions', 'v1');
    const blobs = lire(dir, 'medrevise-blobs', 'v1');
    const fc = q.filter((x) => x.type === 'flashcard');
    const txt = (x) => JSON.stringify(x);
    // mêmes prédicats que l'app : lib/muscle.js estMuscle, molecule/carte.js estMolecule
    const muscle = fc.filter((x) => x.muscle && typeof x.muscle === 'object' && x.muscle.lignes);
    const mol = fc.filter((x) => x.molecule && typeof x.molecule === 'object' && (x.molecule.smiles || x.molecule.molfile));
    const img = fc.filter((x) => x.imageId);
    const clesBlobs = new Set(lireCles(dir, 'medrevise-blobs', 'v1'));
    const refs = new Set(); fc.forEach((x) => txt(x).replace(/"(?:imageId|blobId|imageGeneraleId|image)":"([^"]+)"/g, (_, id) => refs.add(id)));
    const manquants = [...refs].filter((id) => !clesBlobs.has(id)).length;
    const tableaux = fc.filter((x) => /<table|\|\s*---/.test(txt(x))).length;
    const octetsBlobs = blobs.reduce((s, v) => s + (v && v.b64 ? Math.floor(v.b64.length * 3 / 4) : 0), 0);
    console.log(`${nom} : ${q.length} questions dont ${fc.length} flashcards · Muscle ${muscle.length} · molécules ${mol.length} · avec image ${img.length} · avec tableau ${tableaux} · blobs ${blobs.length} (${(octetsBlobs / 1048576).toFixed(1)} Mo) · réf. d'images des flashcards ${refs.size} dont absentes du store blobs ${manquants}`);
  }
  console.log(ko.length ? 'ÉCHEC :\n  ' + ko.join('\n  ') : 'RESTAURATION CONFORME : contenu identique octet pour octet');
  process.exit(ko.length ? 1 : 0);
}
console.error('usage : node verifier.mjs manifeste <dossier> | comparer <dossier> <réexport>'); process.exit(2);
