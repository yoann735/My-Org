// Masques d'une flashcard image produits par une IA — parcours complet dans l'éditeur existant (22/11/2026).
//   node t-masques.mjs ordi|tablette          fiche de DÉMONSTRATION (dessinée par le banc) : captures publiables
//   REEL=1 node t-masques.mjs ordi            fiche tibia/fibula ($TRAVAIL/fiche.png + reponse-ia.json) : captures HORS dépôt
// Le téléphone n'a pas d'éditeur de flashcard image (shell de révision) : voir t-seance-tel.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { appareil, ficheDemo, reponseDemo, TRAVAIL, DOSSIER_IMG, dormir } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const REEL = process.env.REEL === '1';
const b = await appareil(type);
const capt = (nom) => (REEL ? b.capture('reel-' + nom) : b.capture(nom, DOSSIER_IMG));
const chiffres = { appareil: type, reel: REEL };

await b.vider();
await b.ouvrir();
// l'image : fiche de démo dessinée dans la page, ou la vraie fiche (hors dépôt)
let img, reponse, verite = null;
if (REEL) {
  img = { png64: fs.readFileSync(path.join(TRAVAIL, 'fiche.png')).toString('base64'), ...JSON.parse(fs.readFileSync(path.join(TRAVAIL, 'verite.json'), 'utf8')) };
  reponse = JSON.parse(fs.readFileSync(path.join(TRAVAIL, 'reponse-ia.json'), 'utf8'));
} else {
  img = await ficheDemo(b); verite = img.etiquettes; reponse = reponseDemo(img);
}
// cours PDF de test + une boîte d'annotation qui porte l'image (page de PDF → « → Flashcard » → « Masques à deviner »)
const pdf = await PDFDocument.create(); const police = await pdf.embedFont(StandardFonts.Helvetica);
const pg = pdf.addPage([595, 842]); pg.drawText('Cours de test - osteologie', { x: 60, y: 780, size: 22, font: police });
const pdf64 = Buffer.from(await pdf.save()).toString('base64');
await b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js');
  const bin = (s) => { const x = atob(s); const a = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) a[i] = x.charCodeAt(i); return a; };
  const pdfId = await S.putBlob(new Blob([bin(${JSON.stringify(pdf64)})], { type: 'application/pdf' }));
  const imgId = await S.putBlob(new File([bin(${JSON.stringify(img.png64)})], 'fiche.png', { type: 'image/png' }));
  await S.put('sources', { id: 'mi-src', nom: 'Section test', rappelsJ: true });
  await S.put('matieres', { id: 'mi-mat', nom: 'Matière test', sourceId: 'mi-src' });
  await S.put('fiches', { id: 'mi-f', matiereId: 'mi-mat', dossierId: null, titre: 'Cours masques test', type: 'standard', pdfId, pdfName: 'cours.pdf', dateImport: '2026-11-22' });
  await S.put('annotations', { ficheId: 'mi-f', page: 1, kind: 'libre', type: 'boite', fond: 'plein', gabarit: 'carte', taille1000: 15, bord1000: 1.5, pad1000: [10, 8], largeurFixe: true, createdAt: '2026-11-22T08:00:00.000Z',
    id: 'mi-img', x: 0.08, y: 0.2, width: 0.5, height: 0.08, couleur: 'bleu-franc', image: { blobId: imgId, ratio: ${img.H / img.W}, position: 'dessus' },
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tibia - fibula' }] }] } });
  return 1; })()`);
await b.ouvrir();
await b.aller('Biblioth'); await dormir(800);
await b.ev(`(() => { const r = [...document.querySelectorAll('button')].find((x) => (x.title || '') === 'Revenir à la liste' || x.getAttribute('aria-label') === 'Retour'); r && r.click(); return 1; })()`);
await dormir(600);
if (!(await b.ev(`!!document.querySelector('.lt-fiche')`))) await b.clic(`document.querySelector('.lib-master.collapsed .split-handle')`, 900);
await b.clic(`[...document.querySelectorAll('.lt-fiche')].find((e) => e.innerText.trim().startsWith('Cours masques test'))`, 2500);
b.ok(await b.attendre(`!!document.querySelector('.note-box[data-boite="mi-img"]')`, 25000), 'cours PDF ouvert, boîte image affichée');
await dormir(1000);
const empreinte0 = await b.empreinte();

/* ---------- ouvrir l'éditeur de masques existant sur l'image de la boîte ---------- */
await b.clic(`document.querySelector('.note-box[data-boite="mi-img"]')`, 600);
await b.clic(`[...document.querySelectorAll('.mini-barre [data-option="vers-flashcard"]')].find((e) => e.offsetParent)`, 1500);
const F = `document.querySelector('.pis-add.fc-carte')`;
await b.attendre(`!!${F}`, 6000);
await b.clic(`[...${F}.querySelectorAll('button')].find((x) => /Masques à deviner/.test(x.textContent))`, 1500);
b.ok(await b.attendre(`[...document.querySelectorAll('.day-pop img')].some((i) => i.naturalWidth > 0)`, 8000), 'éditeur de masques existant ouvert sur l’image (page de PDF, boîte d’annotation)');
const btns = await b.ev(`(() => { const t = (s) => { const x = document.querySelector(s); return x ? { titre: x.title, texte: x.textContent.trim() } : null; }; return { prompt: t('[data-prompt-masques]'), coller: t('[data-ouvrir-coller-masques]') }; })()`);
b.ok(btns.prompt && btns.coller && btns.prompt.titre && btns.coller.titre, 'boutons « Copier le prompt IA » et « Coller des masques », chacun avec son infobulle', JSON.stringify(btns));

/* ---------- copier le prompt ---------- */
await b.ev(`(() => { window.__copie = null; const c = navigator.clipboard; if (c) c.writeText = (t) => { window.__copie = t; return Promise.resolve(); }; return 1; })()`);
await b.clic(`document.querySelector('[data-prompt-masques]')`, 500);
const copie = await b.ev(`window.__copie`);
const PROMPT = (await b.ev(`(async () => (await import('/src/medrevise/lib/masquesIA.js')).PROMPT_MASQUES_IA)()`));
b.ok(copie === PROMPT && /RÉPONDS UNIQUEMENT/.test(copie), 'le bouton copie le prompt autonome complet', `${(copie || '').length} caractères`);
b.ok(/Prompt copié/.test(await b.ev(`document.querySelector('[data-prompt-masques]').textContent`)), 'retour visuel « Prompt copié »');
fs.writeFileSync(path.join(TRAVAIL, 'prompt-copie.txt'), copie || '');

/* ---------- coller : cas d'erreur ---------- */
const nbZones = () => b.ev(`document.querySelectorAll('.day-pop svg rect[rx]').length - document.querySelectorAll('.day-pop .occ-averifier rect').length`);
const ouvrirColler = async () => { if (!(await b.ev(`!!document.querySelector('[data-coller-masques]')`))) await b.clic(`document.querySelector('[data-ouvrir-coller-masques]')`, 400); };
const coller = async (texte) => { // comme un collage iOS dans un champ : texte inséré, React notifié
  await b.ev(`(() => { const t = document.querySelector('.occ-ia-zone'); t.focus(); t.select(); return 1; })()`);
  await b.send('Input.insertText', { text: texte }); await dormir(200);
};
const importer = async () => { await b.clic(`[...document.querySelectorAll('[data-coller-masques] .btn.primary')].find((x) => /Importer/.test(x.textContent))`, 300); };
await ouvrirColler();
b.ok(await b.ev(`!!document.querySelector('.occ-ia-zone')`), 'panneau « Coller des masques » : zone de collage + choix de fichier');
await coller('{"format":"medrevise-masques","version":1,"masques":[{"label":"A","x":0.1 "y":0.2,"w":0.1,"h":0.1}]}'); await importer(); await dormir(300);
const errInv = await b.ev(`(document.querySelector('.occ-ia-erreur') || {}).textContent || ''`);
b.ok(/invalide près de la ligne 1, colonne/.test(errInv) && /virgule/.test(errInv) && (await nbZones()) === 0, 'JSON invalide → message clair (où + quoi corriger), aucun masque ajouté', errInv.slice(0, 160));
await coller('Désolé, je ne peux pas analyser cette image.'); await importer(); await dormir(300);
b.ok(/Aucun JSON/.test(await b.ev(`(document.querySelector('.occ-ia-erreur') || {}).textContent || ''`)), 'réponse sans JSON → message clair');

/* ---------- coller : la réponse de l'IA avec du texte autour et des balises ```json ---------- */
const texteIA = 'Voici les masques demandés :\n```json\n' + JSON.stringify(reponse) + '\n```\nBonne révision !';
await coller(texteIA);
await capt('01-avant-import');
await importer();
b.ok(await b.attendre(`!!document.querySelector('[data-import-masques]')`, 90000, 300), 'import lu, OCR existant passé, masques en aperçu dans l’éditeur');
await dormir(500);
const resume = await b.ev(`document.querySelector('.occ-ia-resume b').textContent`);
const nb = reponse.masques.length;
const [, nImp, nRec, nVer] = (resume.match(/^(\d+) masques importés · (\d+) recalés? · (\d+) à vérifier$/) || []).map(Number);
b.ok(nImp === nb && nRec + nVer === nb && (REEL ? nVer === 0 : nVer >= 1 && nRec >= nb - 2), 'résumé en une ligne', resume);
chiffres.resume = resume;
const etat = () => b.ev(`(() => { const svg = [...document.querySelectorAll('.day-pop svg')].find((s) => s.querySelector('rect[rx]') && !s.classList.contains('occ-averifier'));
  const r = [...svg.querySelectorAll('rect[rx]')].map((x) => ({ x: +x.getAttribute('x') / 100, y: +x.getAttribute('y') / 100, w: +x.getAttribute('width') / 100, h: +x.getAttribute('height') / 100 }));
  const o = [...document.querySelectorAll('.day-pop .occ-averifier rect')].map((x) => ({ x: +x.getAttribute('x') / 100, y: +x.getAttribute('y') / 100 }));
  return { zones: r, oranges: o, compteur: (document.querySelector('.occ-pied .hint') || {}).textContent, creer: !!(([...document.querySelectorAll('.day-pop .btn.primary')].find((x) => /Créer la flashcard/.test(x.textContent)) || {}).disabled) }; })()`);
let E = await etat();
b.ok(E.zones.length === nb, `${nb} masques affichés sur l’image`, `${E.zones.length}`);
b.ok(E.oranges.length === nVer && (REEL || E.oranges.some((o) => Math.abs(o.x - 0.40) < 0.002 && Math.abs(o.y - 0.30) < 0.002)), 'contour orange « à vérifier » sur chaque masque non recalé (dont l’étiquette inventée, gardée à la place donnée par l’IA)', `${E.oranges.length}`);
b.ok(E.creer && /Valide ou annule/.test(E.compteur || ''), 'rien ne s’enregistre avant « Valider » (bouton Créer désactivé)', E.compteur);
await capt('02-apres-recalage');
if (verite) {
  // chaque étiquette entièrement couverte par SON masque (boîte du texte dessiné ⊂ masque), et aucun titre/repère couvert
  const couvre = (m, e) => m.x <= e.x + 1e-4 && m.y <= e.y + 1e-4 && m.x + m.w >= e.x + e.w - 1e-4 && m.y + m.h >= e.y + e.h - 1e-4;
  const nonCouvertes = verite.filter((e) => !E.zones.some((m) => couvre(m, e))).map((e) => e.label);
  b.ok(!nonCouvertes.length, `chaque étiquette entièrement cachée après recalage (${verite.length}/${verite.length}), multi-lignes et doublons compris`, nonCouvertes.join(', '));
  const inter = (a, c) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
  const titres = img.titres.filter((t) => E.zones.some((m) => inter(m, t) > 0.05 * t.w * t.h)).map((t) => t.label);
  b.ok(!titres.length, 'aucun titre ni repère d’orientation masqué', titres.join(', '));
  // doublons : chaque « Diaphyse » / « Malléole interne » / « Face latérale » a son propre masque, à sa place
  for (const lab of ['Diaphyse', 'Malléole interne', 'Face latérale']) {
    const v = verite.filter((e) => e.label === lab);
    const propres = v.map((e) => E.zones.filter((m) => couvre(m, e) && m.w < e.w * 1.6).length);
    b.ok(v.length === 2 && propres.every((n) => n === 1), `« ${lab} » présente dans les deux vues : un masque à chaque place, sans confusion`, JSON.stringify(propres));
  }
  // marge : masque recalé = contour des mots + ~4 px (pas le rectangle large de l'IA)
  const gerdy = verite.find((e) => e.label === 'Tubercule de Gerdy'); const mg = E.zones.find((m) => couvre(m, gerdy));
  const margePx = mg && Math.max((gerdy.x - mg.x) * img.W, (mg.x + mg.w - gerdy.x - gerdy.w) * img.W);
  b.ok(mg && margePx < 12, 'masque recalé serré sur le texte (marge ≈ 4 px)', `marge max ${margePx && margePx.toFixed(1)} px`);
}

/* ---------- « Annuler » ne laisse aucune trace ---------- */
await b.clic(`[...document.querySelectorAll('[data-import-masques] button')].find((x) => /Annuler/.test(x.textContent))`, 500);
E = await etat().catch(() => ({ zones: [] }));
b.ok(!(await b.ev(`!!document.querySelector('[data-import-masques]')`)) && (await nbZones()) === 0, '« Annuler » retire tous les masques importés');

/* ---------- fichier .json (avec des valeurs hors image) ---------- */
const horsLimites = JSON.parse(JSON.stringify(reponse)); horsLimites.masques[0].x = -0.02; horsLimites.masques[1].w = 2;
const fJson = path.join(TRAVAIL, 'masques-' + type + '.json'); fs.writeFileSync(fJson, JSON.stringify(horsLimites));
await ouvrirColler();
const champ = await b.send('Runtime.evaluate', { expression: `document.querySelector('[data-coller-masques] input[type=file]')` });
await b.send('DOM.enable'); await b.send('DOM.setFileInputFiles', { files: [fJson], objectId: champ.result.result.objectId });
const okFichier = b.ok(await b.attendre(`!!document.querySelector('[data-import-masques]')`, 30000, 300), 'fichier .json choisi → import');
if (!okFichier) console.log('DEBUG', await b.ev(`JSON.stringify({ panneau: !!document.querySelector('[data-coller-masques]'), zone: (document.querySelector('.occ-ia-zone') || {}).value?.slice(0, 80), err: (document.querySelector('.occ-ia-erreur') || {}).textContent })`), b.erreurs.slice(-3));
const avert = await b.ev(`(document.querySelector('.occ-ia-avert') || {}).textContent || ''`);
const nVer2 = Number(((await b.ev(`document.querySelector('.occ-ia-resume b').textContent`)).match(/(\d+) à vérifier/) || [])[1]);
b.ok(/2 masques dépassaient de l'image : ramenés dedans/.test(avert), 'valeurs hors image ramenées dedans, avec un avertissement', avert.slice(0, 160));
E = await etat();
b.ok(E.zones.every((m) => m.x >= 0 && m.y >= 0 && m.x + m.w <= 1.0001 && m.y + m.h <= 1.0001), 'tous les masques dans l’image');

/* ---------- les masques importés se manipulent comme des masques manuels ---------- */
if (!REEL) {
  const pt = (rel) => b.ev(`(() => { const i = [...document.querySelectorAll('.day-pop img')].find((x) => x.naturalWidth > 0); const r = i.getBoundingClientRect(); return [r.x + r.width * ${rel.x}, r.y + r.height * ${rel.y}]; })()`);
  const glisser = async (a, z) => {
    if (b.tactile) {
      await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1], id: 1 }] });
      for (let k = 1; k <= 8; k++) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a[0] + ((z[0] - a[0]) * k) / 8, y: a[1] + ((z[1] - a[1]) * k) / 8, id: 1 }] }); await dormir(25); }
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0], y: a[1] });
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'left', buttons: 1, clickCount: 1 });
      for (let k = 1; k <= 8; k++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0] + ((z[0] - a[0]) * k) / 8, y: a[1] + ((z[1] - a[1]) * k) / 8, button: 'left', buttons: 1 }); await dormir(25); }
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: z[0], y: z[1], button: 'left', buttons: 0, clickCount: 1 });
    }
    await dormir(500);
  };
  // déplacer le masque orange (l'étiquette inventée) : il est « vérifié », le contour orange disparaît
  const o0 = (await etat()).zones[nb - 1];
  // un point du masque que rien ne recouvre (la pastille du libellé se pose près du centre, comme pour un masque dessiné)
  const a = await b.ev(`(() => { const i = [...document.querySelectorAll('.day-pop img')].find((x) => x.naturalWidth > 0); const r = i.getBoundingClientRect();
    for (const fy of [0.85, 0.7, 0.5, 0.3, 0.15]) for (const fx of [0.1, 0.9, 0.3, 0.7, 0.5]) { const x = r.x + r.width * (${o0.x} + ${o0.w} * fx), y = r.y + r.height * (${o0.y} + ${o0.h} * fy);
      const e = document.elementFromPoint(x, y); if (e && e.tagName === 'rect' && !e.closest('.occ-averifier')) return [x, y]; } return null; })()`);
  if (!b.ok(!!a, 'le masque importé est saisissable sur l’image', JSON.stringify(a))) console.log('DEBUG', await b.ev(`(() => { const i = [...document.querySelectorAll('.day-pop img')].find((x) => x.naturalWidth > 0); const r = i.getBoundingClientRect();
    const x = r.x + r.width * ${o0.x + o0.w / 2}, y = r.y + r.height * ${o0.y + o0.h * 0.85}; const l = document.elementsFromPoint(x, y).slice(0, 5).map((e) => e.tagName + '.' + (e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className)); return JSON.stringify({ r: [r.x, r.y, r.width, r.height], x, y, l, vh: innerHeight }); })()`));
  // vers le bas de l'image : le panneau du masque sélectionné s'ouvre alors vers le haut et laisse les poignées du bas libres
  const hImg = await b.ev(`[...document.querySelectorAll('.day-pop img')].find((x) => x.naturalWidth > 0).getBoundingClientRect().height`);
  const dy = Math.round(hImg * 0.3);
  await glisser(a, [a[0] + 30, a[1] + dy]);
  E = await etat();
  const o1 = E.zones[nb - 1];
  b.ok(o1.x > o0.x + 0.005 && o1.y > o0.y + 0.1, 'un masque importé se déplace comme un masque manuel', `${o0.x.toFixed(3)},${o0.y.toFixed(3)} → ${o1.x.toFixed(3)},${o1.y.toFixed(3)}`);
  b.ok(E.oranges.length === nVer2 - 1 && !E.oranges.some((o) => Math.abs(o.x - o1.x) < 0.002 && Math.abs(o.y - o1.y) < 0.002), 'masque « à vérifier » déplacé = vérifié : son contour orange disparaît', `${nVer2} → ${E.oranges.length}`);
  // un clic (sans glisser) le sélectionne, comme un masque dessiné : poignées + panneau
  await b.point(a[0] + 30, a[1] + dy, 500);
  // redimensionner par la poignée du coin bas-droit
  // une poignée d'angle libre (le panneau de la coche sélectionnée peut en recouvrir une, comme pour un masque dessiné)
  const coins = [['se', o1.x + o1.w, o1.y + o1.h, 25, 12], ['sw', o1.x, o1.y + o1.h, -25, 12], ['ne', o1.x + o1.w, o1.y, 25, -12], ['nw', o1.x, o1.y, -25, -12]];
  let fait = null;
  for (const [nom, x, y, dx, dy] of coins) {
    const p = await pt({ x, y });
    const libre = await b.ev(`(() => { const e = document.elementFromPoint(${p[0]}, ${p[1]}); return !!e && e.tagName === 'SPAN' && e.style.cursor === 'grab'; })()`);
    if (libre) { await glisser(p, [p[0] + dx, p[1] + dy]); fait = nom; break; }
  }
  const o2 = (await etat()).zones[nb - 1];
  b.ok(fait && o2.w > o1.w + 0.005 && o2.h > o1.h + 0.003, 'il se redimensionne par ses poignées', `poignée ${fait} : ${o1.w.toFixed(3)}×${o1.h.toFixed(3)} → ${o2.w.toFixed(3)}×${o2.h.toFixed(3)}`);
  // supprimer : le panneau de la coche sélectionnée (« Supprimer »)
  const sup = await b.clic(`[...document.querySelectorAll('.day-pop button')].find((x) => x.offsetParent && /Supprimer cette zone/.test(x.title || ''))`, 400)
    && await b.clic(`[...document.querySelectorAll('.day-pop button')].find((x) => x.offsetParent && /Supprimer cette zone/.test(x.title || '') && /Confirmer/.test(x.textContent))`, 500);
  E = await etat();
  b.ok(sup && E.zones.length === nb - 1, 'il se supprime comme un masque manuel', `${E.zones.length} masques`);
  // un masque dessiné à la main, pour comparer les structures stockées
  await b.clic(`[...document.querySelectorAll('.sc-seg .seg-btn')].find((x) => /Rectangle/.test(x.textContent))`, 400);
  await glisser(await pt({ x: 0.42, y: 0.06 }), await pt({ x: 0.5, y: 0.1 }));
  await b.ev(`(() => { const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName) && a.closest('.day-pop')) { document.execCommand('insertText', false, 'Masque manuel'); } return 1; })()`);
}

/* ---------- « Valider » puis créer la flashcard avec l'option existante ---------- */
await b.clic(`[...document.querySelectorAll('[data-import-masques] button')].find((x) => /Valider/.test(x.textContent))`, 500);
b.ok(!(await b.ev(`!!document.querySelector('[data-import-masques]')`)), '« Valider » garde les masques dans la carte');
b.ok(JSON.stringify(empreinte0) === JSON.stringify(await b.empreinte()), 'rien n’est encore enregistré (stockage identique avant « Créer la flashcard »)');
await b.clic(`[...document.querySelectorAll('.day-pop .btn.primary')].find((x) => /Créer la flashcard/.test(x.textContent) && !x.disabled)`, 2500);
await dormir(1500);
const cartes = await b.ev(`(async () => (await (await __imp('/src/medrevise/lib/storage.js')).getAll('questions')).filter((q) => q.ficheId === 'mi-f'))()`);
const carte = cartes.find((q) => q.occlusion);
const zones = carte ? carte.occlusion.coches.filter((c) => c.kind === 'zone') : [];
b.ok(!!carte && zones.length >= nb - 1, 'flashcard image créée par l’option existante, avec les masques importés', `${zones.length} masques`);
if (carte && !REEL) {
  const manuel = zones.find((c) => c.texte === 'Masque manuel') || zones[zones.length - 1];
  const importe = zones.find((c) => c.texte === 'Tubercule de Gerdy');
  const cles = (o) => JSON.stringify(Object.keys(o || {}).sort());
  b.ok(manuel && importe && cles(manuel) === cles(importe) && cles(manuel.zone) === cles(importe.zone) && importe.zone.shape === 'rect',
    'masque importé stocké EXACTEMENT comme un masque dessiné (mêmes champs coche + zone)', `${cles(importe)} · zone ${cles(importe.zone)}`);
  b.ok(zones.filter((c) => c !== manuel).every((c) => c.texte), 'chaque masque importé a pour réponse le label de l’IA');
  chiffres.carte = { id: carte.id, masques: zones.length, recto: carte.recto, verso: carte.verso.slice(0, 120) };
}
/* ---------- même import sur une IMAGE IMPORTÉE (collée dans « Nouvelle carte » du panneau, pas encore enregistrée) ---------- */
await b.clic(`document.querySelector('.fcl-nouvelle')`, 900);
await b.ev(`(async () => { const f = document.querySelector('.pis-add.fc-carte'); const r = f.querySelector('textarea[aria-label="Recto"]'); r.focus(); document.execCommand('insertText', false, 'Image collée');
  const bin = atob(${JSON.stringify(img.png64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const dt = new DataTransfer(); dt.items.add(new File([a], 'colle.png', { type: 'image/png' }));
  r.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return 1; })()`);
await dormir(900);
await b.clic(`[...document.querySelector('.pis-add.fc-carte').querySelectorAll('button')].find((x) => /Masques à deviner/.test(x.textContent))`, 1500);
await b.attendre(`[...document.querySelectorAll('.day-pop img')].some((i) => i.naturalWidth > 0)`, 8000);
await ouvrirColler(); await coller(JSON.stringify(reponse)); await importer();
const okColle = await b.attendre(`!!document.querySelector('[data-import-masques]')`, 90000, 300);
const resume2 = okColle ? await b.ev(`document.querySelector('.occ-ia-resume b').textContent`) : '';
const rec = (t) => Number(((t || '').match(/(\d+) recalés?/) || [])[1]);
b.ok(okColle && resume2.startsWith(`${nb} masques importés`) && Math.abs(rec(resume2) - rec(resume)) <= 1, 'image importée (collée, pas encore enregistrée) : même import et même recalage (à la lecture OCR près) que sur la page de PDF', `${resume2} (page de PDF : ${resume})`);
chiffres.resumeImageCollee = resume2;
await b.clic(`[...document.querySelectorAll('[data-import-masques] button')].find((x) => /Annuler/.test(x.textContent))`, 400);

fs.writeFileSync(path.join(TRAVAIL, `t-masques-${type}${REEL ? '-reel' : ''}.json`), JSON.stringify({ chiffres, resultats: b.resultats }, null, 1));
const code = b.fin();
b.fermerWs();
process.exit(code ? 1 : 0);
