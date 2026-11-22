// Synchro d'une carte à masques IMPORTÉS (22/11/2026) : après `BASE=http://localhost:5315 node t-masques.mjs ordi`
// (Vite :5315 branché sur une COPIE du faux Supabase, :54419), la carte part au faux cloud comme une carte aux masques
// dessinés : enregistrement `questions` avec son occlusion intacte + l'image dans le stockage des fichiers. Aucun vrai cloud.
const CLOUD = process.env.CLOUD || 'http://localhost:54419';
let etat, carte;
for (let k = 0; k < 30; k++) {
  etat = await (await fetch(CLOUD + '/__etat')).json();
  carte = etat.rows.map((r) => r.data || r.payload || r.record || r).find((d) => d && d.occlusion && d.ficheId === 'mi-f');
  if (carte) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const ok = (c, m, d = '') => { console.log(`[synchro] ${c ? '✅' : '❌'} ${m}${d ? ' — ' + d : ''}`); return c; };
const zones = carte ? carte.occlusion.coches.filter((c) => c.kind === 'zone') : [];
let n = 0;
n += !ok(!!carte && zones.length >= 12, 'la carte à masques importés est arrivée au (faux) cloud avec ses masques', `${zones.length} masques`);
n += !ok(!!carte && zones.every((z) => z.zone && z.zone.shape === 'rect' && z.zone.rect && z.texte !== undefined), 'masques intacts (même structure que dans l’éditeur)');
n += !ok(!!carte && etat.blobs.some((b) => b.id === carte.occlusion.imageId), 'l’image de la carte est partie dans le stockage des fichiers', carte && carte.occlusion.imageId);
process.exit(n ? 1 : 0);
