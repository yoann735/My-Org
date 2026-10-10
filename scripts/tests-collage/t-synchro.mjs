// Synchro vers un 2e appareil (profil VIDE, même faux Supabase) : la carte « m. Test collage » arrive avec
// ses images aux mêmes lignes (empreintes SHA-256 des fichiers identiques sur les deux appareils).
// Usage : node t-synchro.mjs
import { appareil, ok, bilan } from './outils.mjs';
const A = await appareil(9335);
await A.ev(`(window.dispatchEvent(new Event('online')), true)`); await A.dormir(6000); // A pousse (fichiers compris)
const empreintes = (X) => X.ev(`(async () => { const st = ${X.st}; const q = (await st.getAll('questions')).find((x) => x.recto === 'm. Test collage'); if (!q) return null;
  const h = async (id) => { const b = await st.getBlob(id); if (!b) return null; const d = await crypto.subtle.digest('SHA-256', await b.arrayBuffer()); return [...new Uint8Array(d)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join(''); };
  const o = {}; for (const [k, v] of Object.entries(q.muscle.images || {})) o[k] = await h(v.imageId);
  if (q.muscle.imageGenerale) o.generale = await h(q.muscle.imageGenerale.imageId); return o; })()`);
const ea = await empreintes(A);
const B = await appareil(9336);
await B.send('Page.reload'); await B.dormir(3000);
const ouvert = `!!(document.querySelector('[data-app="medrevise"]') || document.querySelector('.sfa'))`;
if (!(await B.ev(ouvert))) await B.clic(await B.pos(`[...document.querySelectorAll('.hub-card')].find((c) => c.textContent.includes('MedRevise'))`));
await B.attendre(ouvert, 20000); await B.dormir(12000);
const eb = await empreintes(B);
ok(ea && eb && JSON.stringify(ea) === JSON.stringify(eb) && Object.keys(eb).sort().join() === 'generale,insertion,origine,trajet', '2e appareil : carte reçue, images aux mêmes lignes, fichiers identiques (SHA-256)', JSON.stringify({ A: ea, B: eb }));
ok(A.erreurs.length + B.erreurs.length === 0, 'aucune erreur JavaScript');
A.fermer(); B.fermer();
process.exit(bilan() ? 1 : 0);
