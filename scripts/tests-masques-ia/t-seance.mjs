// Carte à masques IMPORTÉS en séance — node t-seance.mjs ordi|tablette|tel   (22/11/2026)
// La carte est construite par les MÊMES fonctions que l'éditeur : lecture (lireMasquesIA), OCR existant (ocrImage, blob),
// recalage, zones de l'éditeur (nouvelleZone), nettoyage (cleanCoche) et ajout au cours (appendItemsToFiche, champs de
// OcclusionEditorModal#enregistrer). Fiche de DÉMONSTRATION (publiable). Vérifie recto (masques opaques « ?n », aucune
// réponse) et verso (contours + réponses = labels), comme une carte aux masques dessinés à la main dans la même séance.
import { appareil, ficheDemo, reponseDemo, DOSSIER_IMG, dormir } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const b = await appareil(type);
await b.vider();
await b.ouvrir();
const img = await ficheDemo(b);
const rep = reponseDemo(img, { inventee: false });
const r = await b.ev(`(async () => {
  const S = await import('/src/medrevise/lib/storage.js'); const M = await import('/src/medrevise/lib/masquesIA.js');
  const { ocrImage } = await import('/src/medrevise/ocr/ocrImage.js'); const { nouvelleZone } = await import('/src/medrevise/pages/ImportAnatomieVisuel.jsx');
  const { cleanCoche, appendItemsToFiche } = await import('/src/medrevise/lib/import.js'); const sm2 = await import('/src/medrevise/lib/sm2.js');
  const bin = atob(${JSON.stringify(img.png64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const imageId = await S.putBlob(new File([a], 'fiche.png', { type: 'image/png' }));
  await S.put('sources', { id: 'ms-src', nom: 'Section test', rappelsJ: true });
  await S.put('matieres', { id: 'ms-mat', nom: 'Matière test', sourceId: 'ms-src' });
  await S.put('fiches', { id: 'ms-f', matiereId: 'ms-mat', dossierId: null, titre: 'Cours masques séance', type: 'standard', ordre: 0 });
  const lu = M.lireMasquesIA(${JSON.stringify(JSON.stringify(rep))}, { W: ${img.W}, H: ${img.H} });
  const liste = M.recalerMasques(lu.masques, await ocrImage({ blobId: imageId }), { W: ${img.W}, H: ${img.H} });
  const coches = liste.map((m, i) => nouvelleZone({ shape: 'rect', rect: { x: m.x, y: m.y, w: m.w, h: m.h } }, { numero: i + 1, texte: m.label }));
  // + un masque « dessiné à la main » sur une 2e carte, pour comparer le rendu en séance
  const manuel = nouvelleZone({ shape: 'rect', rect: { x: 0.02, y: 0.2, w: 0.2, h: 0.03 }, fill: '#a47bff', fillOpacity: 0.25, stroke: '#a47bff', strokeOpacity: 0.95, strokeWidth: 2 }, { numero: 1, texte: 'Tubercule de Gerdy' });
  const carte = (cs, recto) => { const propres = cs.map((c, i) => cleanCoche(c, i)); const rep = propres.filter((c) => c.kind === 'zone' && c.texte).map((c) => c.texte);
    return { type: 'flashcard', theme: '', concept: '', difficulte: 'intermediaire', recto, verso: rep.join(' · '), versoAuto: true, indice: null, a_retenir: '', occlusion: { imageId, imageW: ${img.W}, imageH: ${img.H}, coches: propres } }; };
  await appendItemsToFiche({ ficheId: 'ms-f', items: [carte(coches, 'Masques importés : que cachent-ils ?'), carte([manuel], 'Masque dessiné : que cache-t-il ?')] });
  // planifiées aujourd'hui (au lieu de nouvelles) pour arriver directement dans la séance
  const q = (await S.getAll('questions')).filter((x) => x.ficheId === 'ms-f');
  await S.putMany('questions', q.map((x) => ({ ...x, nouvelle: false, dueDate: sm2.todayISO(), j0Date: sm2.todayISO(), intervalDays: 3, historique: [{ date: sm2.todayISO(), qualite: 3 }] })));
  return { n: coches.length, recales: liste.filter((m) => m.recale).length, ids: q.map((x) => x.id), recto: q.map((x) => x.recto) };
})()`);
b.ok(r.n === rep.masques.length, `carte construite par la chaîne de l’éditeur : ${r.n} masques importés (${r.recales} recalés) + une carte au masque dessiné`);
await b.ouvrir();
if (type !== 'tel') await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => /^Réviser/.test(e.title || e.innerText || '')); x && x.click(); return 1; })()`);
await dormir(1200);
await b.clic(`document.querySelector('[data-sfa="demarrer"]')`, 1800);
await b.ev(`(() => { const a = document.querySelector('.bf-astuce'); a && a.remove(); return 1; })()`);
const vus = {};
for (let tour = 0; tour < 4; tour++) {
  const id = await b.ev(`(document.querySelector('.sfc-carte[data-carte]') || {}).dataset?.carte || null`);
  if (!id || vus[id]) break;
  const recto = await b.ev(`(() => { const c = document.querySelector('.sfc-carte'); return { q: c.querySelectorAll('.occ-q').length, rep: c.querySelectorAll('.occ-reponse').length, texte: c.innerText.slice(0, 80), masques: c.querySelectorAll('.occ-view svg rect').length }; })()`);
  const importee = /importés/.test(recto.texte);
  if (importee) await b.capture('03-carte-en-seance-recto', DOSSIER_IMG);
  await b.clic(`[...document.querySelectorAll('.sfc-btn')].find((x) => /Voir la réponse/.test(x.textContent))`, 800);
  const verso = await b.ev(`(() => { const c = document.querySelector('.sfc-carte'); return { q: c.querySelectorAll('.occ-q').length, rep: [...c.querySelectorAll('.occ-reponse')].map((x) => x.textContent) }; })()`);
  if (importee) await b.capture('04-carte-en-seance-verso', DOSSIER_IMG);
  vus[id] = { importee, recto, verso };
  // carte suivante (« Passer » : rien n'est noté)
  await b.clic(`document.querySelector('[data-nav="suivante"], [data-nav="passer"]')`, 900);
}
const imp = Object.values(vus).find((v) => v.importee), man = Object.values(vus).find((v) => !v.importee);
const n = rep.masques.length;
b.ok(!!imp && imp.recto.q === n && imp.recto.rep === 0 && imp.recto.masques === n, `recto : ${n} masques opaques « ?1…?${n} », aucune réponse visible`, JSON.stringify(imp && imp.recto));
b.ok(!!imp && imp.verso.q === 0 && imp.verso.rep.length === n && rep.masques.every((m) => imp.verso.rep.includes(m.label)), 'verso : chaque masque montre sa réponse (le label)', JSON.stringify(imp && imp.verso.rep.slice(0, 4)));
b.ok(!!man && man.recto.q === 1 && man.recto.rep === 0 && man.verso.rep.length === 1, 'carte au masque dessiné : même rendu (recto opaque, verso réponse)', JSON.stringify(man));
const code = b.fin();
b.fermerWs();
process.exit(code ? 1 : 0);
