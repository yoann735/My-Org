// RESTAURATION DU CLOUD MedRevise à partir d'une sauvegarde (export-supabase.mjs).
// ⚠️ JAMAIS EXÉCUTÉ EN MODE RÉEL pendant l'étape 1 (consigne) — procédure complète : restore.md.
//
// Par défaut : SIMULATION HORS LIGNE — lit la sauvegarde, vérifie les empreintes, affiche le plan.
// Aucune requête réseau sans --executer.
//
// Mode réel : node restore-supabase.mjs <dossier-sauvegarde> --executer [--supprimer-nouvelles] [--sans-bucket]
//   Exige SUPABASE_SERVICE_ROLE_KEY dans l'environnement (clé SECRÈTE, jamais commitée : à copier depuis
//   Supabase → Project Settings → API, dans le terminal seulement). Le service role contourne la RPC
//   medrevise_push, dont le filtre « plus récent gagne » empêcherait de revenir à un état ANCIEN.
//   1. instantané de l'état cloud ACTUEL dans <dossier>/../avant-restauration-<horodatage>.json ;
//   2. upsert INCONDITIONNEL de toutes les lignes sauvegardées (par lots de 500) ;
//   3. lignes apparues depuis la sauvegarde : listées ; supprimées seulement avec --supprimer-nouvelles ;
//   4. fichiers du bucket medrevise-blobs réenvoyés (x-upsert) sauf --sans-bucket ;
//   5. recomptage et comparaison aux chiffres de la sauvegarde.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const dossier = args.find((a) => !a.startsWith('--'));
const executer = args.includes('--executer');
const supprimerNouvelles = args.includes('--supprimer-nouvelles');
const sansBucket = args.includes('--sans-bucket');
if (!dossier) { console.error('usage : node restore-supabase.mjs <dossier-sauvegarde> [--executer] [--supprimer-nouvelles] [--sans-bucket]'); process.exit(2); }
const URL_SB = 'https://deaonugwvbapkdixdowk.supabase.co';
const BUCKET = 'medrevise-blobs';
const sha = (b) => createHash('sha256').update(b).digest('hex');

const idx = JSON.parse(readFileSync(join(dossier, 'supabase', 'index.json'), 'utf8'));
const brut = readFileSync(join(dossier, 'supabase', 'medrevise_records.json'), 'utf8');
if (sha(brut) !== idx.table.sha256) { console.error('ARRÊT : empreinte de medrevise_records.json différente de index.json'); process.exit(1); }
const { lignes } = JSON.parse(brut);
const fichiers = idx.bucket.fichiers.filter((f) => !f.erreur);
for (const f of fichiers) if (sha(readFileSync(join(dossier, f.fichier))) !== f.sha256) { console.error('ARRÊT : fichier altéré ' + f.fichier); process.exit(1); }
console.log(`sauvegarde vérifiée : ${lignes.length} lignes medrevise_records, ${fichiers.length} fichiers du bucket`);
console.log('plan : 1) instantané de l\'état actuel  2) upsert inconditionnel de ' + lignes.length + ' lignes (' + Math.ceil(lignes.length / 500) + ' lots)'
  + `  3) lignes nouvelles : ${supprimerNouvelles ? 'SUPPRIMÉES' : 'conservées (listées)'}  4) bucket : ${sansBucket ? 'ignoré' : fichiers.length + ' fichiers réenvoyés'}  5) recomptage`);
if (!executer) { console.log('SIMULATION : aucune requête envoyée. Ajouter --executer pour restaurer réellement (voir restore.md).'); process.exit(0); }

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error('ARRÊT : SUPABASE_SERVICE_ROLE_KEY absente de l\'environnement'); process.exit(1); }
const H = { apikey: key, Authorization: 'Bearer ' + key };
const toutLire = async () => { const t = []; for (let p = 0; ; p++) { const r = await fetch(`${URL_SB}/rest/v1/medrevise_records?select=*&order=store.asc,record_id.asc&offset=${p * 1000}&limit=1000`, { headers: H }); if (!r.ok) throw new Error('lecture ' + r.status + ' ' + await r.text()); const l = await r.json(); t.push(...l); if (l.length < 1000) return t; } };

// 1) instantané
const actuel = await toutLire();
const inst = join(dirname(dossier), `avant-restauration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(inst, JSON.stringify({ lignes: actuel }));
console.log(`1) instantané de l'état actuel : ${actuel.length} lignes → ${inst}`);
// 2) upsert inconditionnel
for (let i = 0; i < lignes.length; i += 500) {
  const r = await fetch(`${URL_SB}/rest/v1/medrevise_records?on_conflict=store,record_id`, { method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(lignes.slice(i, i + 500)) });
  if (!r.ok) throw new Error(`lot ${i / 500 + 1} : ${r.status} ${await r.text()}`);
}
console.log(`2) ${lignes.length} lignes réécrites`);
// 3) lignes nouvelles
const cles = new Set(lignes.map((l) => l.store + '\u0000' + l.record_id));
const nouvelles = actuel.filter((l) => !cles.has(l.store + '\u0000' + l.record_id));
console.log(`3) lignes apparues depuis la sauvegarde : ${nouvelles.length}`);
if (supprimerNouvelles) for (const l of nouvelles) {
  const r = await fetch(`${URL_SB}/rest/v1/medrevise_records?store=eq.${encodeURIComponent(l.store)}&record_id=eq.${encodeURIComponent(l.record_id)}`, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error('suppression ' + r.status);
}
// 4) bucket
if (!sansBucket) for (const f of fichiers) {
  const r = await fetch(`${URL_SB}/storage/v1/object/${BUCKET}/${f.chemin.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST',
    headers: { ...H, 'x-upsert': 'true', 'Content-Type': f.mimetype || 'application/octet-stream' }, body: readFileSync(join(dossier, f.fichier)) });
  if (!r.ok) throw new Error(`bucket ${f.chemin} : ${r.status} ${await r.text()}`);
}
// 5) recomptage
const apres = await toutLire();
const ok = lignes.every((l) => apres.some((a) => a.store === l.store && a.record_id === l.record_id && a.updated_at === l.updated_at && JSON.stringify(a.deleted) === JSON.stringify(l.deleted)));
console.log(`5) cloud après restauration : ${apres.length} lignes · toutes les lignes sauvegardées présentes avec leur updated_at : ${ok ? 'OUI' : 'NON'}`);
