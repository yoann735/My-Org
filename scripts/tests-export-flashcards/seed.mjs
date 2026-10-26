// Jeu de test de l'export (Chrome C, ou D avec « tel ») : section « Section export » › matière « Anatomie export » ›
//  - « Export — tous les types » : une carte de CHAQUE type, avec de vraies images (dessinées au canvas) : texte (tag
//    « À apprendre », progression FSRS), trous, éléments à révéler, image (recto et verso), image à masques (occlusion :
//    2 masques + 1 étiquette), Muscle (image générale + 2 images par ligne dont une à masques), Tableau, Molécule
//    (aspirine : SMILES + molfile calculés par OpenChemLib) ; deux cartes partagent la même image ;
//  - « Cours cible (ré-import) » et « Cours cible 2 (avec progression) » : vides ;
//  - matière « Physio export » › « Export 300 cartes illustrées » : 300 cartes, chacune avec sa propre image (~100 Ko).
// Rejouable : réécrit les mêmes ids, vide les cours de test.
import { banc, COURS, MATIERE } from './commun.mjs';
const tel = process.argv[2] === 'tel';
const b = await banc(tel);
const url = await b.ev('location.href');
if (!url.includes('5302')) { await b.send('Page.navigate', { url: 'http://localhost:5302/' }); await b.dormir(3000); }
await b.ouvrirApp({ recharger: true });
const r = await b.S(`
  const { PDFDocument, StandardFonts } = await import('/node_modules/.vite/deps/pdf-lib.js');
  const { cleanCoche } = await import('/src/medrevise/lib/import.js');
  const { carteMolecule } = await import('/src/medrevise/molecule/carte.js');
  const chimie = await import('/src/medrevise/molecule/chimie.js');
  const { carteMuscle } = await import('/src/medrevise/lib/muscle.js');
  const { carteTableau } = await import('/src/medrevise/lib/carteTableau.js');
  const sm2 = await import('/src/medrevise/lib/sm2.js');
  const today = sm2.todayISO();
  const j = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('fr-CA'); };
  const pdf = async (t) => { const d = await PDFDocument.create(); const p = d.addPage([595, 842]); const f = await d.embedFont(StandardFonts.Helvetica); p.drawText(t, { x: 60, y: 760, size: 20, font: f }); return S.putBlob(new Blob([await d.save()], { type: 'application/pdf' })); };
  // une image reconnaissable : fond de couleur, formes, texte ; « bruit » pour un poids réaliste
  const image = async (texte, teinte, { w = 480, h = 320, bruit = 0 } = {}) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + teinte + ',55%,82%)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'hsl(' + teinte + ',60%,40%)'; g.beginPath(); g.ellipse(w * 0.32, h * 0.5, w * 0.18, h * 0.3, 0.3, 0, 7); g.fill();
    g.fillRect(w * 0.58, h * 0.22, w * 0.3, h * 0.18); g.fillRect(w * 0.58, h * 0.6, w * 0.22, h * 0.16);
    g.fillStyle = '#1d1d1f'; g.font = 'bold ' + Math.round(h / 9) + 'px sans-serif'; g.fillText(texte, 14, h - 16);
    if (bruit) { const d = g.getImageData(0, 0, w, Math.round(h * bruit)); for (let i = 0; i < d.data.length; i += 4) { const v = (Math.random() * 60) | 0; d.data[i] += v; d.data[i + 1] -= v; } g.putImageData(d, 0, 0); }
    const bl = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    return S.putBlob(bl);
  };
  // nettoyage d'une passe précédente
  const FICHES = ['fx-tous', 'fx-cible', 'fx-cible2', 'fx-gros'];
  for (const q of await S.getAll('questions')) if (FICHES.includes(q.ficheId)) await S.remove('questions', q.id);
  await S.putMany('sources', [{ id: 'sx', nom: 'Section export', rappelsJ: true }]);
  await S.putMany('matieres', [{ id: 'mx', sourceId: 'sx', nom: ${JSON.stringify(MATIERE)}, ordre: 0 }, { id: 'mx2', sourceId: 'sx', nom: 'Physio export', ordre: 1 }]);
  const C = ${JSON.stringify(COURS)};
  const fiche = async (id, mat, titre, ordre) => ({ id, matiereId: mat, titre, type: 'standard', ordre, pdfId: await pdf(titre), dateImport: j(-30) });
  await S.putMany('fiches', [await fiche('fx-tous', 'mx', C.tous, 0), await fiche('fx-cible', 'mx', C.cible, 1), await fiche('fx-cible2', 'mx', C.cible2, 2), await fiche('fx-gros', 'mx2', C.gros, 0)]);
  const id = (k, s) => 'q' + (Date.UTC(2026, 8, 15, 9) + k * 60000).toString(36) + s; // comme genId : la date de création se lit dans l'id
  const H = [{ date: j(-9), qualite: 4 }, { date: j(-3), qualite: 3 }];
  const fsrs = { state: 2, stability: 8.4, difficulty: 5.2, due: j(4), reps: 2, lapses: 0, last_review: j(-3) };
  const revue = { historique: H, nouvelle: false, learnState: 'review', intervalDays: 7, dueDate: j(4), j0Date: j(-20), capped: false, termine: false, missed: 0, fsrs };
  const neuve = (o = {}) => ({ historique: [], nouvelle: true, intervalDays: 1, dueDate: today, j0Date: today, capped: false, termine: false, missed: 0, ...o });
  const [iScap, iOcc, iMus, iOri, iIns, iVerso] = [await image('Scapula', 30), await image('Membre sup.', 200), await image('Biceps', 350), await image('Origine', 120), await image('Insertion', 270), await image('Verso', 60)];
  const zone = (x, y, w, h, texte, n) => cleanCoche({ kind: 'zone', ancre: { x: x + w / 2, y: y + h / 2 }, boite: { x: x + w / 2, y: y + h / 2 }, texte, couleur: '#8B6FE8', zone: { shape: 'rect', rect: { x, y, w, h } } }, n);
  const etiquette = cleanCoche({ kind: 'point', ancre: { x: 0.8, y: 0.85 }, boite: { x: 0.8, y: 0.85 }, texte: 'Vue antérieure' }, 2);
  const OCL = await chimie.chargerOCL();
  const asp = chimie.exporter(OCL, chimie.lire(OCL, { smiles: 'CC(=O)Oc1ccccc1C(=O)O' }));
  const base = (k, s, o) => ({ id: id(k, s), type: 'flashcard', ficheId: 'fx-tous', difficulte: 2, tags: [], concept: o.theme || '', ...o });
  const muscle = carteMuscle({ nom: 'Biceps brachial', theme: 'Myologie', indice: 'Deux chefs', aRetenir: 'Supinateur puissant', lignes: { origine: 'Chef long : tubercule supra-glénoïdal\\nChef court : processus coracoïde', trajet: 'Loge antérieure du bras', insertion: 'Tubérosité radiale', action: 'Flexion du coude, supination', innervation: 'Nerf musculo-cutané (C5–C6)' },
    images: { origine: { imageId: iOri, masques: [zone(0.1, 0.2, 0.3, 0.2, 'coracoïde', 0)] }, insertion: { imageId: iIns } }, imageGenerale: { imageId: iMus, auRecto: true } });
  const tableau = carteTableau({ titre: 'Muscles de la fesse — insertions', theme: 'Myologie', colonnes: ['Muscle', 'Origine', 'Insertion'], lignes: [['Grand glutéal', 'Ilium, sacrum, coccyx', 'Tubérosité glutéale'], ['Moyen glutéal', 'Face glutéale de l’ilium', 'Grand trochanter'], ['Piriforme', 'Face pelvienne du sacrum', 'Grand trochanter']] });
  const mol = carteMolecule({ nom: 'Aspirine', smiles: asp.smiles, molfile: asp.molfile, formule: asp.formule, sens: 'nom-molecule', theme: 'Pharmacologie' });
  const cartes = [
    base(1, 'te01', { theme: 'Ostéologie', recto: 'Quel os forme le squelette du bras ?', verso: 'L’humérus.', indice: 'Un seul os', a_retenir: 'Bras = humérus', aApprendre: true, ...revue }),
    base(2, 'tr01', { theme: 'Ostéologie', recto: 'Le {{radius}} est en dehors de l’{{ulna}}.', verso: 'Le radius est latéral, l’ulna médiale.', cloze: ['radius', 'ulna'], indice: null, a_retenir: '', ...neuve() }),
    base(3, 'el01', { theme: 'Physiologie rénale', recto: 'Quelles sont les 4 fonctions du rein ?', verso: 'Quatre grandes fonctions :', indice: null, a_retenir: '', items: [{ text: 'Épuration des déchets azotés', masked: true }, { text: 'Équilibre hydro-électrolytique', masked: true }, { text: 'Équilibre acido-basique', masked: false }, { text: 'Fonctions endocrines (EPO, rénine)', masked: true }], aApprendre: true, ...neuve() }),
    base(4, 'im01', { theme: 'Ostéologie', recto: 'Quel os est montré ?', verso: 'La scapula (omoplate).', indice: null, a_retenir: 'Os plat triangulaire', imageId: iScap, imagePlace: 'recto', ...revue, dueDate: j(-2) }),
    base(5, 'im02', { theme: 'Ostéologie', recto: 'Même image au verso : quel os ?', verso: 'Toujours la scapula.', indice: null, a_retenir: '', imageId: iScap, imagePlace: 'deux', ...neuve() }),
    base(6, 'im03', { theme: 'Ostéologie', recto: 'Image au verso seulement', verso: 'Voici l’image.', indice: null, a_retenir: '', imageId: iVerso, imagePlace: 'verso', ...neuve() }),
    base(7, 'oc01', { theme: 'Ostéologie', recto: 'Que cachent les masques ?', verso: 'Humérus · Radius', versoAuto: true, indice: null, a_retenir: '', occlusion: { imageId: iOcc, imageW: 480, imageH: 320, coches: [zone(0.14, 0.3, 0.3, 0.4, 'Humérus', 0), zone(0.58, 0.22, 0.3, 0.18, 'Radius', 1), etiquette] }, ...neuve() }),
    { ...base(8, 'mu01', {}), ...muscle, id: id(8, 'mu01'), ficheId: 'fx-tous', ...revue },
    { ...base(9, 'ta01', {}), ...tableau, id: id(9, 'ta01'), ficheId: 'fx-tous', ...neuve() },
    { ...base(10, 'mo01', {}), ...mol, id: id(10, 'mo01'), ficheId: 'fx-tous', ...neuve() },
  ];
  await S.putMany('questions', cartes);
  // 300 cartes illustrées (une image chacune)
  const gros = [];
  for (let k = 0; k < 300; k++) {
    const im = await image('Carte ' + (k + 1), (k * 37) % 360, { w: 400, h: 260, bruit: 0.45 });
    gros.push({ id: id(100 + k, 'g' + String(k).padStart(3, '0')), type: 'flashcard', ficheId: 'fx-gros', theme: 'Lot ' + (1 + (k % 6)), concept: '', difficulte: 2, tags: [], recto: 'Carte illustrée n° ' + (k + 1), verso: 'Réponse ' + (k + 1), indice: null, a_retenir: '', imageId: im, imagePlace: k % 3 === 0 ? 'deux' : 'recto', ...(k % 2 ? revue : neuve()) });
  }
  await S.putMany('questions', gros);
  const blobs = await Promise.all([...cartes, ...gros].map(async () => 0));
  return { today, n: cartes.length + gros.length, molfile: asp.molfile.length, b: blobs.length };
`);
console.log((tel ? 'D' : 'C') + ' seed', JSON.stringify(r), b.erreurs);
process.exit(0);
