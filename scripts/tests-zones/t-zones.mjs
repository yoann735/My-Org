// Zones image v2 (11/10) — BUREAU 1 440 px, vrais événements (souris, ⌘V, Échap) : carte Muscle (survol discret,
// collage sans saut, indicateur OCR seul, actions en icônes + tooltips, Masquer des mots, Remplacer, Retirer,
// visionneuse, image générale + « Montrer au recto »), enregistrement puis MODIFICATION (même formulaire),
// carte standard et carte Molécule (même composant). Profil de TEST + faux Supabase local.
// Usage : node t-zones.mjs <dossier-captures>
import { writeFileSync, mkdirSync } from 'node:fs';
import { appareil, ok, bilan } from '../tests-collage/outils.mjs';
import { ouvrirFormulaire } from '../tests-collage/ouvrir.mjs';

const captures = process.argv[2] || '/tmp/zones';
mkdirSync(captures, { recursive: true });
const A = await appareil(9335, { captures });
ok(await ouvrirFormulaire(A), 'formulaire Muscle ouvert (panneau Flashcards › Ajouter › Tableau muscle)');
const F = `[...document.querySelectorAll('.mu-form')].find((f) => f.getClientRects().length)`;
const Z = (cle) => `(${F}).querySelector('[data-zone-image="${cle}"]')`;
const coupe = async (nom, sel, marge = 16) => {
  const r = await A.ev(`(() => { const e = ${sel}; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
  await A.dormir(250);
  const s = await A.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - marge), y: Math.max(0, r[1] - marge), width: r[2] + 2 * marge, height: r[3] + 2 * marge, scale: 2 } });
  writeFileSync(`${captures}/${nom}.png`, Buffer.from(s.data, 'base64'));
};
// les clics sur « Remplacer » / « Image » ouvriraient le sélecteur de fichiers : on les enregistre sans l'ouvrir
await A.ev(`(() => { window.__parcourir = 0; HTMLInputElement.prototype.click = function () { if (this.type === 'file') window.__parcourir++; }; return 1; })()`);
const fichier = async (sel, l, h, fond, texte) => {
  // vrai fichier PNG posé dans l'<input type=file> de la zone (DOM.setFileInputFiles → événement change)
  const b64 = await A.ev(`(async () => { const c = new OffscreenCanvas(${l}, ${h}); const x = c.getContext('2d'); x.fillStyle = ${JSON.stringify(fond)}; x.fillRect(0, 0, ${l}, ${h}); x.fillStyle = '#fff'; x.fillRect(10, 10, ${l} - 20, ${h} - 20); x.fillStyle = '#111'; x.font = 'bold 28px Arial'; x.fillText(${JSON.stringify(texte)}, 24, 50);
    const b = await c.convertToBlob({ type: 'image/png' }); const t = new Uint8Array(await b.arrayBuffer()); let s = ''; for (const o of t) s += String.fromCharCode(o); return btoa(s); })()`);
  const chemin = `${captures}/__${texte.replace(/\W+/g, '_')}.png`;
  writeFileSync(chemin, Buffer.from(b64, 'base64'));
  const { root } = await A.send('DOM.getDocument', { depth: -1, pierce: true });
  await A.ev(`(${sel}).setAttribute('data-test-input', '1'), true`);
  const { nodeId } = await A.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-test-input="1"]' });
  await A.send('DOM.setFileInputFiles', { nodeId, files: [chemin] });
  await A.ev(`(${sel}).removeAttribute('data-test-input'), true`);
};

// 1. SURVOL d'une zone vide : trait plein discret, aucun contour, aucune bulle
await A.survoler([5, 5]);
const repos = await A.ev(`getComputedStyle(${Z('insertion')}.querySelector('.zim-ajout')).borderTopStyle`);
await A.survoler(await A.pos(`${Z('insertion')}.querySelector('.zim-ajout')`));
await A.survoler(await A.pos(`${Z('insertion')}`));
await A.dormir(200);
const survol = await A.ev(`(() => { const v = ${Z('insertion')}.querySelector('[data-zone-visuel]'); const b = v.querySelector('.zim-ajout'); const cs = getComputedStyle(b);
  return { classe: v.classList.contains('zi-survol'), outline: getComputedStyle(v).outlineStyle, bulle: getComputedStyle(v, '::after').content, astuceVisible: getComputedStyle(v, '::after').content !== 'none',
    trait: cs.borderTopStyle, transition: cs.transitionDuration, hauteur: b.getBoundingClientRect().height, libelle: b.textContent.trim() }; })()`);
ok(repos === 'dashed' && survol.classe && survol.trait === 'solid' && survol.outline === 'none' && !survol.astuceVisible, 'survol d’une zone vide : bouton « Image » pointillé → trait plein, ni contour ni bulle', JSON.stringify({ repos, ...survol }));
ok(/0\.12s/.test(survol.transition) && Math.round(survol.hauteur) === 32 && survol.libelle === 'Image', 'bouton « Image » : 32 px, libellé « Image », transition 120 ms', JSON.stringify(survol));
await coupe('apres-zone-vide-survol', `${Z('insertion')}`, 10);

// 2. COLLER au survol → vignette, hauteur réservée, texte de la ligne jamais déplacé
await A.ev(`(() => { const t = document.getElementById('mu-insertion'); t.focus(); document.execCommand('insertText', false, 'Grand trochanter, face latérale'); t.blur(); return 1; })()`);
await A.survoler(await A.pos(`${Z('insertion')}`));
await A.pressePapierImage(420, 160, '#1f618d', 'Grand trochanter|face latérale');
const texteAvant = await A.ev(`document.getElementById('mu-insertion').getBoundingClientRect().top`);
await A.ev(`(() => { window.__hauteurs = []; const z = ${Z('insertion')}; const mo = new MutationObserver(() => { const v = z.querySelector('.zim-vignette'); if (v) window.__hauteurs.push(Math.round(v.getBoundingClientRect().height)); }); mo.observe(z, { subtree: true, childList: true, attributes: true }); window.__mo = mo; return 1; })()`);
await A.cmdV(); await A.dormir(1500);
await A.ev(`window.__mo.disconnect(), true`);
const apres = await A.ev(`(() => { const z = ${Z('insertion')}; const v = z.querySelector('.zim-vignette'); const i = v && v.querySelector('img'); const t = document.getElementById('mu-insertion');
  return { img: i && i.complete ? i.naturalWidth + 'x' + i.naturalHeight : null, h: v && Math.round(v.getBoundingClientRect().height), hauteurs: window.__hauteurs, texteTop: t.getBoundingClientRect().top,
    // écart visible texte → image : la marge basse du champ (9 px) + l'écart entre les boîtes
    ecart: v && Math.round(v.getBoundingClientRect().top - t.getBoundingClientRect().bottom + parseFloat(getComputedStyle(t).paddingBottom)), sousLeTexte: v && v.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 0.5, coins: v && getComputedStyle(v.querySelector('.zim-cadre')).borderTopLeftRadius,
    bordure: v && getComputedStyle(v).borderTopWidth, liens: z.querySelectorAll('.linklike, a').length, texteOcr: /Texte lu|Aucun texte|mots/.test(z.textContent) }; })()`);
ok(apres.img === '420x160' && apres.sousLeTexte && apres.ecart >= 8 && apres.ecart <= 12 && Math.abs(apres.texteTop - texteAvant) < 1, 'coller → vignette dans Insertion, sur sa propre ligne, ~8 px sous le texte (texte non déplacé)', JSON.stringify(apres));
ok(apres.hauteurs.length > 0 && apres.hauteurs[0] === 96 && apres.hauteurs.every((h) => h <= 96) && apres.h <= 96, 'hauteur réservée (96 px) dès l’arrivée de l’image, jamais dépassée : pas de saut', JSON.stringify(apres.hauteurs.slice(0, 6)) + ' → ' + apres.h);
ok(apres.coins !== '0px' && apres.bordure === '0px' && apres.liens === 0 && !apres.texteOcr, 'vignette à coins arrondis sans bordure ; plus aucun lien texte ni « Texte lu · N mots »', JSON.stringify(apres));
const ocrVu = [];
for (let i = 0; i < 60; i++) { const e = await A.ev(`(() => { const o = ${Z('insertion')}.querySelector('.zim-ocr'); return o ? (o.classList.contains('lecture') ? 'lecture' : 'texte') : 'rien'; })()`); if (ocrVu[ocrVu.length - 1] !== e) ocrVu.push(e); if (e === 'texte') break; await A.dormir(250); }
ok(ocrVu[ocrVu.length - 1] === 'texte', 'état OCR porté par le seul indicateur de la vignette (spinner → icône texte)', ocrVu.join(' → '));

// 3. ACTIONS en icônes : tooltips, tailles, Masquer des mots visible (texte lu)
await A.survoler([5, 5]);
const actions = await A.ev(`[...${Z('insertion')}.querySelectorAll('.zim-act')].map((b) => ({ t: b.title, l: b.getAttribute('aria-label'), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), texte: b.textContent.trim(), rouge: b.classList.contains('retirer') ? getComputedStyle(b).color : null }))`);
ok(actions.length === 3 && /Remplacer/.test(actions[0].t) && /Masquer des mots/.test(actions[1].t) && /Retirer/.test(actions[2].t) && actions.every((a) => a.w === 28 && a.h === 28 && !a.texte), 'trois actions en icônes 28 px, sans texte, avec tooltip : Remplacer · Masquer des mots · Retirer', JSON.stringify(actions.map((a) => a.t + ' ' + a.w + 'px')));
const posV = await A.ev(`(() => { const v = ${Z('insertion')}.querySelector('.zim-vignette').getBoundingClientRect(); const a = ${Z('insertion')}.querySelector('.zim-actions').getBoundingClientRect(); return { aDroite: a.left >= v.right, dessous: a.top >= v.bottom }; })()`);
ok(posV.aDroite || posV.dessous, `actions ${posV.aDroite ? 'à droite de la vignette' : 'sous la vignette (cellule étroite)'}`, JSON.stringify(posV));
await coupe('apres-zone-avec-image', `${Z('insertion')}`, 10);
// Masquer des mots → la fenêtre existante s'ouvre ; Échap la ferme
await A.clic(await A.pos(`${Z('insertion')}.querySelector('.zim-act[aria-label="Masquer des mots"]')`));
await A.attendre(`!!document.querySelector('.mm[role=dialog]')`, 8000);
ok(true, '« Masquer des mots » ouvre la fenêtre des masques');
await A.attendre(`!/Lecture/.test(document.querySelector('.mm .mm-tete .hint').textContent)`, 20000).catch(() => {});
const mots = await A.ev(`document.querySelectorAll('.mm-image [class*=mot], .mm-image button').length`);
if (mots) {
  await A.clic(await A.pos(`document.querySelector('.mm-image [class*=mot], .mm-image button')`));
  const valider = await A.pos(`[...document.querySelectorAll('.mm button')].find((b) => /Masquer|Ajouter|Valider/.test(b.textContent) && !b.disabled && b.closest('.mm-pied, .mm-actions, .mm'))`);
  if (valider) { await A.clic(valider); await A.dormir(500); }
}
if (await A.ev(`!!document.querySelector('.mm[role=dialog]')`)) { await A.touche('Escape', { code: 'Escape', vk: 27 }); await A.dormir(400); }
const masques = await A.ev(`(() => { const b = ${Z('insertion')}.querySelector('.zim-act[aria-label="Masquer des mots"]'); return { titre: b.title, nb: (b.querySelector('.zim-nb') || {}).textContent || '0', ferme: !document.querySelector('.mm[role=dialog]') }; })()`);
ok(masques.ferme, 'fenêtre des masques refermée' + (masques.nb !== '0' ? ` — ${masques.nb} masque posé (pastille sur l’icône)` : ''), JSON.stringify(masques));
// Remplacer → sélecteur de fichiers, puis nouvelle image dans la même zone
const n0 = await A.ev(`window.__parcourir`);
await A.clic(await A.pos(`${Z('insertion')}.querySelector('.zim-act[aria-label="Remplacer l’image"]')`));
const n1 = await A.ev(`window.__parcourir`);
await fichier(`${Z('insertion')}.querySelector('input[type=file]')`, 300, 200, '#b9770e', 'Remplacée');
await A.dormir(1200);
const remplacee = await A.ev(`(() => { const i = ${Z('insertion')}.querySelector('.zim-vignette img'); return i && i.complete ? i.naturalWidth + 'x' + i.naturalHeight : null; })()`);
ok(n1 === n0 + 1 && remplacee === '300x200', 'Remplacer : ouvre le sélecteur de fichiers, la nouvelle image remplace l’ancienne', `${n0}→${n1}, ${remplacee}`);
// Retirer → retour au bouton « Image »
await A.clic(await A.pos(`${Z('insertion')}.querySelector('.zim-act.retirer')`));
const retiree = await A.ev(`({ vide: !!${Z('insertion')}.querySelector('.zim-ajout'), img: !!${Z('insertion')}.querySelector('.zim-vignette') })`);
ok(retiree.vide && !retiree.img, 'Retirer : la zone revient au bouton « Image »', JSON.stringify(retiree));
// remettre une image (survol + ⌘V) pour la suite
await A.survoler(await A.pos(`${Z('insertion')}`));
await A.pressePapierImage(420, 160, '#1f618d', 'Grand trochanter|face latérale');
await A.cmdV(); await A.dormir(1500);

// 4. VISIONNEUSE : clic sur la vignette, Échap ; puis clic sur le fond
await A.survoler([5, 5]);
await A.clic(await A.pos(`${Z('insertion')}.querySelector('.zim-vignette')`));
const lb1 = await A.ev(`!!document.querySelector('.mui-visionneuse img')`);
await A.capture('apres-visionneuse');
await A.touche('Escape', { code: 'Escape', vk: 27 }); await A.dormir(300);
const lb2 = await A.ev(`!document.querySelector('.mui-visionneuse')`);
await A.clic(await A.pos(`${Z('insertion')}.querySelector('.zim-vignette')`));
const p = await A.ev(`(() => { const z = document.querySelector('.mui-v-zone').getBoundingClientRect(); return [z.x + 12, z.bottom - 12]; })()`);
await A.clic(p);
const lb3 = await A.ev(`!document.querySelector('.mui-visionneuse')`);
ok(lb1 && lb2 && lb3, 'clic sur la vignette → aperçu plein écran ; fermé par Échap, et par un clic sur le fond', JSON.stringify({ lb1, lb2, lb3 }));

// 5. IMAGE GÉNÉRALE : en tête, même composant, 140 px max, « Montrer au recto » sur une ligne à côté
await A.survoler(await A.pos(`${Z('generale')}`));
await A.pressePapierImage(360, 240, '#7d3c98', 'Vue postérieure');
await A.cmdV(); await A.dormir(2500);
await A.survoler([5, 5]);
const gen = await A.ev(`(() => { const z = ${Z('generale')}; const v = z.querySelector('.zim-vignette'); const c = z.querySelector('.mu-recto-opt'); const tableau = (${F}).querySelector('.mu-saisie');
  const vr = v.getBoundingClientRect(), cr = c.getBoundingClientRect();
  return { h: Math.round(vr.height), composant: !!z.querySelector('.zim.generale'), libelle: c.textContent.trim(), tooltip: c.title, uneLigne: cr.height < 30, aCote: cr.left >= vr.right || (cr.top >= vr.top && cr.top < vr.bottom + 40),
    avantTableau: z.compareDocumentPosition(tableau) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false, actions: z.querySelectorAll('.zim-act').length }; })()`);
ok(gen.composant && gen.h <= 140 && gen.h > 96 && gen.actions >= 2, 'image générale : même composant, vignette plus grande (≤ 140 px)', JSON.stringify(gen));
ok(gen.libelle === 'Montrer au recto' && /verso/.test(gen.tooltip) && gen.uneLigne && gen.avantTableau, '« Montrer au recto » : libellé court sur une ligne, l’info « sinon au verso » en tooltip ; bloc en tête, avant le tableau', JSON.stringify(gen));
await coupe('apres-image-generale', `${Z('generale')}`, 10);

// 6. ENREGISTRER puis ROUVRIR en modification : même formulaire
const NOM = 'm. Test zones v2';
await A.ev(`(() => { const n = (${F}).querySelector('.mu-nom-champ'); n.focus(); document.execCommand('selectAll'); document.execCommand('insertText', false, ${JSON.stringify(NOM)}); return 1; })()`);
await A.survoler(await A.pos(`${Z('origine')}`));
await A.pressePapierImage(260, 260, '#148f77', 'Crête iliaque');
await A.cmdV(); await A.dormir(1500);
await A.clic(await A.pos(`(${F}).querySelector('.mu-recto-opt input')`));
const signature = (sel) => A.ev(`(() => { const f = ${sel}; return [...f.querySelectorAll('[data-zone-image]')].map((z) => z.getAttribute('data-zone-image') + ':' + (z.querySelector('.zim-vignette') ? 'image' : z.querySelector('.zim-ajout') ? 'vide' : '?') + ':' + [...z.querySelectorAll('.zim-act')].map((b) => b.getAttribute('aria-label')).join('|')).join(' ; '); })()`);
const sigCreation = await signature(F);
await A.clic(await A.pos(`[...(${F}).querySelectorAll('.imp-actions .btn.primary')].find((b) => b.getClientRects().length)`));
await A.dormir(2500);
const carte = await A.ev(`(async () => { const q = (await ${A.st}.getAll('questions')).find((x) => x.recto === ${JSON.stringify(NOM)}); return q ? { id: q.id, images: Object.keys(q.muscle.images || {}).sort(), generale: q.muscle.imageGenerale } : null; })()`);
ok(carte && carte.images.join(',') === 'insertion,origine' && carte.generale && carte.generale.auRecto === true, 'carte enregistrée : images Insertion + Origine, image générale au recto', JSON.stringify(carte));
await A.ev(`(() => { const b = [...document.querySelectorAll('.pis-add button')].find((x) => /Terminer/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(800);
const item = `[...document.querySelectorAll('.pis-item')].find((x) => x.textContent.includes(${JSON.stringify(NOM)}))`;
await A.ev(`(${item}).scrollIntoView({ block: 'center' }), true`); await A.dormir(300);
// liste du panneau (lecture) : vignettes du tableau compact, cliquables
const liste = await A.ev(`(() => { const it = ${item}; return [...it.querySelectorAll('.mu-ligne-image .zim-vignette')].map((v) => Math.round(v.getBoundingClientRect().height)); })()`);
ok(liste.length === 2 && liste.every((h) => h > 0 && h <= 96), 'liste du panneau : vignettes à la même taille (≤ 96 px) sur les lignes', JSON.stringify(liste));
await A.survoler(await A.pos(item));
await A.clic(await A.pos(`(${item}).querySelector('button[title="Éditer"]')`));
await A.dormir(1800);
const E = `[...document.querySelectorAll('.mu-form')].find((f) => f.getClientRects().length && f.querySelector('.mu-nom-champ').value === ${JSON.stringify(NOM)})`;
await A.attendre(`!!(${E}) && (${E}).querySelectorAll('.zim-vignette img').length === 3 && [...(${E}).querySelectorAll('.zim-vignette img')].every((i) => i.complete)`, 15000).catch(() => {});
await A.dormir(4000); // OCR des images enregistrées (cache local) → « Masquer des mots »
const sigEdition = await signature(E);
ok(sigEdition === sigCreation, 'modification : même formulaire, mêmes zones et mêmes actions qu’en création', sigEdition === sigCreation ? sigEdition.slice(0, 160) + '…' : `création ${sigCreation} ≠ modification ${sigEdition}`);
await coupe('apres-modification', `(${E})`, 8);
await A.ev(`(() => { const b = [...(${E}).querySelectorAll('.imp-actions button')].find((x) => /Annuler/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(600);

// 7. CARTE STANDARD : même composant (sans « Masquer des mots »), « Afficher au » à côté
await A.clic(await A.pos(`[...document.querySelectorAll('.pis-head button, .pm-exos button, button')].find((b) => b.offsetParent && b.innerText.trim().startsWith('Ajouter'))`)); await A.dormir(800);
const S = `[...document.querySelectorAll('.fci-champ')].find((f) => f.getClientRects().length)`;
const vide = await A.ev(`(() => { const s = ${S}; const b = s.querySelector('.zim-ajout'); return { libelle: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) }; })()`);
await A.survoler(await A.pos(S));
await A.pressePapierImage(320, 160, '#117a65', 'Carte standard');
await A.cmdV(); await A.dormir(4000);
await A.survoler([5, 5]);
const std = await A.ev(`(() => { const s = ${S}; const v = s.querySelector('.zim-vignette'); return { vignette: !!v, h: v && Math.round(v.getBoundingClientRect().height), actions: [...s.querySelectorAll('.zim-act')].map((b) => b.getAttribute('aria-label')), place: (s.querySelector('.zim-place .seg-btn.active') || {}).textContent, liens: s.querySelectorAll('.linklike').length, ocr: !!s.querySelector('.zim-ocr') }; })()`);
ok(vide.libelle === 'Image' && vide.h === 32 && std.vignette && std.h <= 96 && std.actions.join('|') === 'Remplacer l’image|Retirer l’image' && std.place === 'Recto' && std.liens === 0 && std.ocr, 'carte standard : même bouton « Image », même vignette + indicateur OCR, Remplacer / Retirer en icônes, « Afficher au » à côté', JSON.stringify({ vide, std }));
await coupe('apres-standard', S, 10);
await A.clic(await A.pos(`(${S}).querySelector('.zim-act.retirer')`));
ok(await A.ev(`!!(${S}).querySelector('.zim-ajout')`), 'carte standard : Retirer → bouton « Image »');

// 8. CARTE MOLÉCULE : même composant ; enregistrée avec son image
await A.clic(await A.pos(`[...document.querySelectorAll('.fc-sorte')].find((b) => b.offsetParent && /Molécule/.test(b.textContent))`));
await A.attendre(`!!document.querySelector('.mol-form #mol-nom') && !!document.querySelector('.mol-form .fci-champ')`, 30000);
await A.dormir(1500);
await A.clic(await A.pos(`document.querySelector('.mol-form #mol-nom')`));
await A.ecrire('Alanine'); await A.dormir(600);
await A.clic(await A.pos(`document.querySelector('.mol-sugg')`)); await A.dormir(2500);
const M = `document.querySelector('.mol-form .fci-champ')`;
await A.survoler(await A.pos(M));
await A.dormir(200);
const molSurvol = await A.ev(`(() => { const b = (${M}).querySelector('.zim-ajout'); return { trait: getComputedStyle(b).borderTopStyle, h: Math.round(b.getBoundingClientRect().height) }; })()`);
await A.pressePapierImage(300, 200, '#a93226', 'Alanine');
await A.cmdV(); await A.dormir(4000);
await A.survoler([5, 5]);
const mol = await A.ev(`(() => { const s = ${M}; const v = s.querySelector('.zim-vignette'); return { vignette: !!v, h: v && Math.round(v.getBoundingClientRect().height), actions: [...s.querySelectorAll('.zim-act')].map((b) => b.getAttribute('aria-label')), place: (s.querySelector('.zim-place .seg-btn.active') || {}).textContent }; })()`);
ok(molSurvol.trait === 'solid' && molSurvol.h === 32 && mol.vignette && mol.h <= 96 && mol.actions.join('|') === 'Remplacer l’image|Retirer l’image' && mol.place === 'Recto', 'carte Molécule : même composant (survol discret, collage, vignette, icônes, « Afficher au »)', JSON.stringify({ molSurvol, mol }));
await coupe('apres-molecule', M, 10);
await A.clic(await A.pos(`[...document.querySelectorAll('.mol-form .zim-place .seg-btn')].find((b) => b.textContent === 'Les deux')`));
await A.clic(await A.pos(`[...document.querySelectorAll('.mol-form .imp-actions .btn.primary')].find((b) => b.getClientRects().length)`));
await A.dormir(2500);
const molCarte = await A.ev(`(async () => { const q = (await ${A.st}.getAll('questions')).filter((x) => x.molecule && x.molecule.nom === 'Alanine' && x.imageId).pop(); return q ? { imagePlace: q.imagePlace, imageId: !!q.imageId, smiles: !!q.molecule.smiles } : null; })()`);
ok(molCarte && molCarte.imagePlace === 'deux' && molCarte.smiles, 'carte Molécule enregistrée avec son image (affichée aux deux faces)', JSON.stringify(molCarte));
await A.ev(`(() => { const b = [...document.querySelectorAll('.pis-add button')].find((x) => /Terminer/.test(x.textContent)); b && b.click(); return 1; })()`); await A.dormir(800);
const molListe = await A.ev(`(() => { const it = [...document.querySelectorAll('.pis-item')].filter((x) => /Alanine/.test(x.textContent)).pop(); return it ? !!it.querySelector('.fc-image img, .fc-image') : null; })()`);
ok(molListe === true, 'liste du panneau : la carte Molécule montre son image');

ok(A.erreurs.length === 0, 'aucune erreur JavaScript', A.erreurs.join(' | ').slice(0, 300));
A.fermer();
process.exit(bilan() ? 1 : 0);
