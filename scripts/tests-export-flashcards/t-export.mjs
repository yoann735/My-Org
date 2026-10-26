// Scénario principal (Chrome C, ordinateur) : export d'une fiche contenant CHAQUE type de carte depuis le panneau
// Flashcards (toutes, puis une sélection cochée) ; ouverture du .zip (unzip du système) : JSON valide, toutes les images
// présentes, une seule fois, octet pour octet ; ré-import dans un AUTRE cours : cartes identiques à l'écran (capture
// recto / verso de la vue agrandie comparée au pixel), images affichées, progression ignorée par défaut puis reprise
// avec l'option ; l'export ne modifie aucune carte.
import fs from 'node:fs';
import { banc, COURS, SORTIE } from './commun.mjs';
import { ouvrirZip, sha, empreintesBlobs, capturerCarte, pxDiff } from './aide.mjs';
const b = await banc(false);
const CAP = SORTIE + '/cap'; fs.mkdirSync(CAP, { recursive: true });
const DL = SORTIE + '/telechargements'; fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
await b.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await b.ouvrirApp({ recharger: true });
const origines = await b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='fx-tous')`);
const empAvant = await b.empreinteCartes();

// ---------- 1. panneau : toutes les cartes de la fiche ----------
const n = await b.ouvrirCours(COURS.tous);
b.v(n === 10, 'la fiche « tous les types » est ouverte, 10 cartes dans la liste', String(n));
// captures des cartes d'origine (vue agrandie, recto et verso)
// chaque carte capturée DEUX fois : l'écart entre deux captures de la même carte = le bruit de rendu du Chrome headless
const capO = {}, bruit = { n: 0, max: 0, zero: 0, total: 0 };
for (const q of origines) {
  capO[q.recto] = await capturerCarte(b, q.id, `${CAP}/orig-${q.id}`);
  const bis = await capturerCarte(b, q.id, `${CAP}/orig-bis-${q.id}`);
  for (const cote of ['recto', 'verso']) { const d = await pxDiff(b, capO[q.recto][cote].f, bis[cote].f, bis[cote].zones); bruit.n = Math.max(bruit.n, d.n); bruit.max = Math.max(bruit.max, d.max); bruit.total++; if (!d.n) bruit.zero++; }
}
b.ok(true, `bruit de rendu mesuré (même carte capturée deux fois) : ${bruit.zero}/${bruit.total} captures identiques, au pire ${bruit.n} px (écart max ${bruit.max})`);
await b.toucher(`document.querySelector('[data-act="exporter-fc"]')`, 500);
b.v(await b.ev(`document.querySelectorAll('.fcl-coche').length===10 && [...document.querySelectorAll('.fcl-coche')].every(c=>c.checked)`), 'Exporter : une case par carte, toutes cochées');
b.v(/10 \/ 10/.test(await b.texte('.fcl-selection')), 'barre de sélection « 10 / 10 cochées »', await b.texte('.fcl-selection'));
await b.toucher(`document.querySelector('[data-act="exporter-selection"]')`, 700);
const apercu = await b.ev(`(()=>{const m=document.querySelector('[data-export-flashcards]');return m&&{texte:m.textContent,images:+(m.querySelector('[data-images]')||{dataset:{}}).dataset.images,puces:[...m.querySelectorAll('[data-sorte]')].map(p=>p.dataset.sorte+':'+p.querySelector('.tnum').textContent),nom:m.querySelector('[data-nom-fichier]').textContent}})()`);
b.v(!!apercu && /10 cartes/.test(apercu.texte), 'fenêtre d’export : 10 cartes', apercu && apercu.puces.join(' '));
b.v(apercu && apercu.images === 6, 'aperçu : 6 images distinctes (deux cartes partagent la même)', apercu && String(apercu.images));
b.v(apercu && JSON.stringify(apercu.puces) === JSON.stringify(['texte:1', 'elements:1', 'trous:1', 'image:3', 'occlusion:1', 'muscle:1', 'tableau:1', 'molecule:1']), 'aperçu : chaque type compté', apercu && apercu.puces.join(' '));
b.v(apercu && apercu.nom === `medrevise-flashcards-export-tous-les-types-${new Date().toLocaleDateString('fr-CA')}.zip`, 'nom : medrevise-flashcards-<cours>-AAAA-MM-JJ.zip', apercu && apercu.nom);
await b.capture('export-fenetre');
const fait = await b.lancerExport();
b.v(/medrevise-flashcards-export-tous-les-types/.test(fait), 'export terminé, fichier annoncé', fait);
const z1 = await b.recupererZip();
await b.dormir(1500);
const dl = fs.readdirSync(DL);
const ZIP = SORTIE + '/tous-les-types.zip';
fs.copyFileSync(DL + '/' + dl[0], ZIP); // le téléchargement suivant (même nom) remplacerait ce fichier
b.v(dl.length === 1 && dl[0] === z1.nom && fs.statSync(DL + '/' + dl[0]).size === z1.octets, 'le .zip est bien téléchargé par le navigateur (nom et taille)', dl.join(', ') + ' · ' + z1.octets + ' o');
b.v(JSON.stringify(await b.empreinteCartes()) === JSON.stringify(empAvant), 'l’export ne modifie aucune carte (empreinte de toutes les cartes identique)');

// ---------- 2. ouvrir le ZIP ----------
const Z = ouvrirZip(ZIP);
b.v(Z.integre, 'archive intègre (unzip -t : No errors detected)');
b.v(Z.jsonOk && Array.isArray(Z.doc.items) && Z.doc.items.length === 10, 'flashcards.json : JSON valide, 10 cartes', Z.jsonOk ? Z.doc.format + ' v' + Z.doc.version : 'JSON illisible');
const imagesZip = Z.noms.filter((x) => x.startsWith('images/'));
const refs = [...new Set(JSON.stringify(Z.doc.items).match(/images\/[a-z0-9]+\.[a-z]+/g))];
b.v(imagesZip.length === 6 && new Set(imagesZip).size === 6, 'dossier images/ : 6 fichiers, aucun en double', imagesZip.join(' '));
b.v(refs.length === 6 && refs.every((r) => imagesZip.includes(r)), 'chaque image référencée dans le JSON est présente (aucune manquante)', refs.length + ' référencées');
const idsImages = [...new Set(origines.flatMap((q) => [q.imageId, q.occlusion && q.occlusion.imageId, q.muscle && q.muscle.imageGenerale && q.muscle.imageGenerale.imageId, ...Object.values((q.muscle && q.muscle.images) || {}).map((x) => x.imageId)]).filter(Boolean))];
const empO = await empreintesBlobs(b, idsImages);
b.v(idsImages.every((id) => { const f = imagesZip.find((x) => x.startsWith('images/' + id + '.')); return f && sha(Z.lire(f)) === empO[id]; }), 'images du .zip identiques octet pour octet aux images des cartes (nom stable = id du fichier)');
const it = (recto) => Z.doc.items.find((x) => x.recto === recto) || {};
const oMol = origines.find((q) => q.molecule);
b.v(it('Aspirine').molecule && it('Aspirine').molecule.molfile === oMol.molecule.molfile && it('Aspirine').molecule.smiles === oMol.molecule.smiles, 'Molécule : SMILES + molfile exportés tels quels');
b.v((it('Que cachent les masques ?').occlusion || {}).masques?.length === 3, 'image à masques : image + 3 masques / étiquettes');
const mu = it('Biceps brachial').muscle || {};
b.v(Object.keys(mu.images || {}).join() === 'origine,insertion' && mu.images.origine.masques.length === 1 && it('Biceps brachial').image?.place === 'recto', 'Muscle : 5 lignes, images par ligne (avec masques) et image générale');
b.v(it('Quelles sont les 4 fonctions du rein ?').items?.length === 4 && it('Le {{radius}} est en dehors de l’{{ulna}}.').cloze?.length === 2 && it('Muscles de la fesse — insertions').tableau?.lignes.length === 3, 'éléments à révéler, trous, Tableau exportés');
b.v(Z.doc.items.filter((x) => x.a_apprendre).length === 2, 'tag « À apprendre » exporté (2 cartes)');
b.v(Z.doc.items.every((x) => x.origine && x.origine.cours === COURS.tous && x.origine.matiere === 'Anatomie export' && x.cree_le && x.progress && x.progress.categorie), 'chaque carte : cours et matière d’origine, date de création, bloc progress (catégorie…)');
const p1 = it('Quel os forme le squelette du bras ?').progress || {};
b.v(p1.categorie === 'a_venir' && p1.fsrs && p1.fsrs.stability === 8.4 && p1.historique.length === 2 && it('Quel os est montré ?').progress.categorie === 'retard' && it('Quelles sont les 4 fonctions du rein ?').progress.categorie === 'nouvelle', 'progress : catégorie, dates, état FSRS, historique', JSON.stringify(p1).slice(0, 120));
b.v(/10 carte\(s\) par type/.test(Z.readme) && /Image à masques\s+1/.test(Z.readme) && /Anatomie export › Export — tous les types : 10/.test(Z.readme), 'README.txt : contenu, cartes par type et par cours');
fs.writeFileSync(SORTIE + '/flashcards-exemple.json', JSON.stringify(Z.doc, null, 2));
fs.writeFileSync(SORTIE + '/README-exemple.txt', Z.readme);

// ---------- 3. la sélection cochée ----------
await b.fermerFenetre(); await b.dormir(500);
await b.toucher(`document.querySelector('[data-act="exporter-fc"]')`, 500);
await b.toucher(`document.querySelector('[data-act="tout-decocher"]')`, 300);
for (const q of origines.filter((x) => x.muscle || x.molecule || x.occlusion)) await b.ev(`document.querySelector('[data-coche="${q.id}"]').click()`);
await b.dormir(300);
b.v(/Exporter la sélection \(3\)/.test(await b.texte('[data-act="exporter-selection"]')), 'sélection : 3 cartes cochées → « Exporter la sélection (3) »');
await b.capture('export-selection', await b.rect(`document.querySelector('.pm-vue[data-mode="exercices"]')`).then((r) => ({ x: r.x, y: r.y, width: r.w, height: Math.min(r.h, 860) })));
await b.toucher(`document.querySelector('[data-act="exporter-selection"]')`, 700);
await b.lancerExport();
const z2 = await b.recupererZip('selection.zip');
const Z2 = ouvrirZip(z2.chemin);
b.v(Z2.integre && Z2.doc.items.length === 3 && Z2.noms.filter((x) => x.startsWith('images/')).length === 4, 'export de la sélection : 3 cartes et leurs 4 images seulement', Z2.doc.items.map((x) => x.recto).join(' · '));
await b.fermerFenetre(); await b.dormir(400);

// ---------- 4. ré-import dans un autre cours (progression ignorée par défaut) ----------
const importer = async (cours, progression) => {
  const nb = await b.ouvrirCours(cours);
  await b.toucher(`document.querySelector('[data-act="importer-fc"]')`, 500);
  await b.ev(`[...document.querySelectorAll('.ifc-onglets .seg-btn')].find(x=>/Fichier/.test(x.textContent)).click()`); await b.dormir(300);
  await b.deposer(`document.querySelector('[data-import-flashcards] input[type=file]')`, ZIP);
  await b.attendre(`!!document.querySelector('[data-apercu]') || !!document.querySelector('.ifc-erreur-globale')`, 60000);
  const ap = await b.ev(`(()=>{const a=document.querySelector('[data-apercu]');return a&&{compte:a.querySelector('[data-compte]').textContent,erreurs:a.querySelectorAll('[data-erreur]').length,progression:!!a.querySelector('[data-champ="progression"]'),coche:(a.querySelector('[data-champ="progression"]')||{}).checked}})()`);
  if (progression) await b.ev(`document.querySelector('[data-champ="progression"]').click()`);
  await b.dormir(200);
  if (progression !== null) await b.capture(progression ? 'import-apercu-progression' : 'import-apercu');
  await b.toucher(`document.querySelector('[data-act="importer"]')`, 600);
  await b.attendre(`!!document.querySelector('[data-fait]')`, 60000);
  const fait = await b.texte('[data-fait]');
  await b.fermerFenetre(); await b.dormir(800);
  return { nb, ap, fait };
};
const r1 = await importer(COURS.cible, false);
b.v(r1.nb === 0, 'cours cible vide avant l’import');
b.v(r1.ap && r1.ap.erreurs === 0 && /10 cartes/.test(r1.ap.compte) && /Image à masques 1/.test(r1.ap.compte), 'l’import existant accepte le .zip : aperçu (10 cartes, par type), aucune erreur', r1.ap && r1.ap.compte);
b.v(r1.ap && r1.ap.progression && r1.ap.coche === false, 'option « Reprendre aussi la progression » proposée, décochée par défaut');
b.v(/10 cartes importées/.test(r1.fait), 'import : 10 cartes', r1.fait);
const cibles = await b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='fx-cible')`);
const parR = (l) => Object.fromEntries(l.map((q) => [q.recto, q]));
const O = parR(origines), N = parR(cibles);
b.v(Object.keys(O).every((r) => N[r]), 'chaque carte se retrouve dans le cours cible');
b.v(cibles.every((q) => q.nouvelle === true && q.historique.length === 0 && !q.fsrs && q.dueDate === new Date().toLocaleDateString('fr-CA')), 'progression IGNORÉE par défaut : cartes neuves (Nouvelles, sans historique ni FSRS, départ aujourd’hui)');
b.v(cibles.filter((q) => q.aApprendre).length === 2, 'tag « À apprendre » repris (2 cartes)');
const idsN = [...new Set(cibles.flatMap((q) => [q.imageId, q.occlusion && q.occlusion.imageId, q.muscle && q.muscle.imageGenerale && q.muscle.imageGenerale.imageId, ...Object.values((q.muscle && q.muscle.images) || {}).map((x) => x.imageId)]).filter(Boolean))];
const empN = await empreintesBlobs(b, idsN);
b.v(idsN.length === 6 && new Set(Object.values(empN)).size === 6 && Object.values(empN).every((h) => Object.values(empO).includes(h)), 'images ré-importées : 6 fichiers (la partagée écrite une fois), identiques aux originales');
// comparaison à l'écran
const ecarts = [], mesures = { zero: 0, total: 0, n: 0, max: 0 };
for (const q of cibles) {
  const c = await capturerCarte(b, q.id, `${CAP}/reimp-${q.id}`);
  for (const cote of ['recto', 'verso']) {
    const d = await pxDiff(b, capO[q.recto][cote].f, c[cote].f, c[cote].zones);
    mesures.total++; if (d.n === 0) mesures.zero++; mesures.n = Math.max(mesures.n, d.n); mesures.max = Math.max(mesures.max, d.max);
    if (d.n < 0 || d.maxHors > 3 || d.maxDans > 16 || capO[q.recto][cote].images !== c[cote].images) ecarts.push(`${q.recto} (${cote}) : ${JSON.stringify(d)} images ${capO[q.recto][cote].images} / ${c[cote].images}`);
  }
}
b.v(ecarts.length === 0, 'cartes ré-importées IDENTIQUES à l’écran (vue agrandie, recto et verso : 20 captures comparées au pixel ; seuls écarts tolérés = le bruit de deux captures d’une même carte : rééchantillonnage ≤ 16 dans les photos — octets identiques — et anticrénelage des coins arrondis ; ailleurs ≤ 3)', `${mesures.zero}/${mesures.total} identiques au pixel, au pire ${mesures.n} px (écart max ${mesures.max}) ` + ecarts.join(' | '));
b.v(Object.values(capO).every((x) => !/(^|,)0x0/.test(x.recto.images + ',' + x.verso.images)), 'images affichées (toutes chargées, dimensions non nulles)', Object.values(capO).map((x) => x.recto.images || '-').join(' '));
fs.copyFileSync(capO['Biceps brachial'].recto.f, SORTIE + '/muscle-origine-recto.png');
fs.copyFileSync(`${CAP}/reimp-${N['Biceps brachial'].id}-recto.png`, SORTIE + '/muscle-reimporte-recto.png');
fs.copyFileSync(capO['Que cachent les masques ?'].recto.f, SORTIE + '/occlusion-origine-recto.png');
fs.copyFileSync(`${CAP}/reimp-${N['Que cachent les masques ?'].id}-recto.png`, SORTIE + '/occlusion-reimporte-recto.png');
await b.capture('cours-cible-liste');

// ---------- 5. ré-import avec « Reprendre aussi la progression » ----------
const r2 = await importer(COURS.cible2, true);
b.v(/10 cartes importées dans cette fiche — avec leur progression/.test(r2.fait), 'import avec l’option : « avec leur progression »', r2.fait);
const c2 = parR(await b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='fx-cible2')`));
const CH = ['dueDate', 'j0Date', 'intervalDays', 'historique', 'nouvelle', 'fsrs', 'learnState', 'capped', 'termine', 'missed'];
const diff = Object.keys(O).flatMap((r) => CH.filter((k) => JSON.stringify(O[r][k]) !== JSON.stringify(c2[r] && c2[r][k])).map((k) => r + '.' + k));
b.v(diff.length === 0, 'progression REPRISE : dates, J, FSRS, historique identiques aux cartes d’origine', diff.join(', '));
b.v(JSON.stringify(await b.S(`return (await S.getAll('questions')).filter(q=>q.ficheId==='fx-tous').sort((a,b)=>a.id<b.id?-1:1)`)) === JSON.stringify(origines.sort((a, b) => (a.id < b.id ? -1 : 1))), 'les cartes d’origine sont intactes après les ré-imports');
b.fin();
