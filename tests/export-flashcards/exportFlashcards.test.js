// (26/10) Export complet des flashcards (.zip ré-importable) — docs/compte-rendu-export-flashcards.md.
// Aller-retour en mémoire (fake-indexeddb) : une fiche avec chaque type de carte et ses images → export → .zip →
// analyse de l'import existant → import dans un AUTRE cours : contenu identique, images présentes une seule fois,
// progression ignorée par défaut puis reprise avec l'option ; l'export ne modifie aucune carte.
import { describe, it, expect, beforeAll } from 'vitest';
import * as S from '../../src/medrevise/lib/storage.js';
import { construireExport, carteVersItem, dateCreation, nomArchive, sorteExport, imagesDeCarte } from '../../src/medrevise/lib/exportFlashcards.js';
import { analyserImport, importerCartes, exempleJSON } from '../../src/medrevise/lib/importFlashcards.js';
import { lireZip } from '../../src/medrevise/lib/zipLecture.js';
import { creerZip, creerZipProgressif } from '../../src/medrevise/lib/zipSimple.js';
import { cleanCoche } from '../../src/medrevise/lib/import.js';

const T = '2026-10-26';
const png = (n) => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, n, n + 1, n + 2])], { type: 'image/png' });
const H = [{ date: '2026-10-20', qualite: 4 }];
const planif = { historique: H, nouvelle: false, intervalDays: 6, dueDate: '2026-10-29', j0Date: '2026-10-01', capped: false, termine: false, missed: 0, learnState: 'review', fsrs: { state: 2, stability: 7.3, difficulty: 5.1, due: '2026-10-29', reps: 3, lapses: 0 } };
let ids;

beforeAll(async () => {
  const [i1, i2, i3, i4, i5] = await Promise.all([1, 2, 3, 4, 5].map((n) => S.putBlob(png(n))));
  ids = { i1, i2, i3, i4, i5 };
  await S.putMany('sources', [{ id: 's1', nom: 'Section A' }]);
  await S.putMany('matieres', [{ id: 'm1', sourceId: 's1', nom: 'Anatomie' }]);
  await S.putMany('fiches', [{ id: 'f1', matiereId: 'm1', titre: 'Membre supérieur', type: 'standard' }, { id: 'f2', matiereId: 'm1', titre: 'Cours cible', type: 'standard' }]);
  // un masque tel que l'éditeur l'enregistre (cleanCoche)
  const coche = cleanCoche({ id: 'c1', kind: 'zone', ancre: { x: 0.2, y: 0.3 }, boite: { x: 0.2, y: 0.3 }, texte: 'Humérus', couleur: '#8B6FE8', zone: { shape: 'rect', rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } } }, 0);
  await S.putMany('questions', [
    { id: 'qtexte000001', type: 'flashcard', ficheId: 'f1', theme: 'Os', concept: 'Os', recto: 'Quel os forme le bras ?', verso: 'L’humérus.', indice: 'Un seul os', a_retenir: 'Bras = humérus', difficulte: 1, tags: ['os'], aApprendre: true, ...planif },
    { id: 'qtrous', type: 'flashcard', ficheId: 'f1', theme: 'Os', recto: 'Le {{radius}} est latéral.', verso: 'Le radius est latéral.', cloze: ['radius'], indice: null, a_retenir: '', historique: [], nouvelle: true, dueDate: T, j0Date: T, intervalDays: 1 },
    { id: 'qelem', type: 'flashcard', ficheId: 'f1', theme: 'Os', recto: 'Les 3 os de l’avant-bras ?', verso: '', items: [{ text: 'Radius', masked: true }, { text: 'Ulna', masked: false }], indice: null, a_retenir: '', historique: [], nouvelle: true },
    { id: 'qimage', type: 'flashcard', ficheId: 'f1', recto: 'Quel os ?', verso: 'La scapula.', imageId: i1, imagePlace: 'deux', indice: null, a_retenir: '', historique: [] },
    { id: 'qimage2', type: 'flashcard', ficheId: 'f1', recto: 'Même image, autre carte', verso: 'Scapula', imageId: i1, imagePlace: 'verso', indice: null, a_retenir: '', historique: [] },
    { id: 'qocc', type: 'flashcard', ficheId: 'f1', recto: 'Que cachent les masques ?', verso: 'Humérus', versoAuto: true, occlusion: { imageId: i2, imageW: 800, imageH: 600, coches: [coche] }, indice: null, a_retenir: '', historique: [] },
    { id: 'qmuscle', type: 'flashcard', ficheId: 'f1', theme: 'Muscles', recto: 'Biceps brachial', verso: 'Origine : …', indice: null, a_retenir: '', cloze: [], imageId: null, imagePlace: null, historique: H,
      muscle: { v: 1, lignes: { origine: 'Tubercule supra-glénoïdal', trajet: '', insertion: 'Tubérosité radiale', action: 'Flexion', innervation: 'Musculo-cutané' }, images: { origine: { imageId: i3, masques: [{ id: 'mm', kind: 'zone' }] }, insertion: { imageId: i4 } }, imageGenerale: { imageId: i5, auRecto: true } } },
    { id: 'qtab', type: 'flashcard', ficheId: 'f1', recto: 'Os du bras', verso: 'x', indice: null, a_retenir: '', tableau: { v: 1, colonnes: ['Os', 'Région'], lignes: [['Humérus', 'Bras'], ['Radius', 'Avant-bras']] }, historique: [] },
    { id: 'qmol', type: 'flashcard', ficheId: 'f1', recto: 'Éthanol', verso: 'C2H6O', indice: null, a_retenir: '', historique: [],
      molecule: { v: 1, nom: 'Éthanol', smiles: 'CCO', molfile: 'MOLFILE-ORIGINAL', formule: 'C2H6O', sens: 'nom-molecule', comparaison: 'constitution', biblio: null } },
    { id: 'qautre', type: 'qcm', ficheId: 'f1', question: 'pas une flashcard' },
  ]);
});

const cartesF = async (f) => (await S.getAll('questions')).filter((q) => q.ficheId === f && q.type === 'flashcard');
const parRecto = (l) => Object.fromEntries(l.map((q) => [q.recto, q]));

describe('export', () => {
  it('date de création tirée de l’id, nom d’archive', () => {
    const t = Date.UTC(2026, 9, 1, 10);
    expect(dateCreation({ id: 'q' + t.toString(36) + 'ab12' })).toBe(new Date(t).toISOString());
    expect(dateCreation({ id: 'x', createdAt: '2026-01-01T00:00:00.000Z' })).toBe('2026-01-01T00:00:00.000Z');
    expect(nomArchive('Membre supérieur — Os', T)).toBe('medrevise-flashcards-membre-superieur-os-2026-10-26.zip');
  });
  it('contenu, tag, origine et progression séparée', () => {
    const it0 = carteVersItem({ id: 'q1', type: 'flashcard', ficheId: 'f1', recto: 'R', verso: 'V', theme: 'T', aApprendre: true, ...planif, carnetAt: '2026-10-21' }, { origine: { matiere: 'M', cours: 'C' }, categorie: 'revision' });
    expect(it0).toMatchObject({ type: 'flashcard', recto: 'R', verso: 'V', theme: 'T', a_apprendre: true, origine: { matiere: 'M', cours: 'C', id: 'q1' } });
    expect(it0.progress).toMatchObject({ categorie: 'revision', dueDate: '2026-10-29', fsrs: planif.fsrs, historique: H, carnetAt: '2026-10-21' });
    expect('dueDate' in it0).toBe(false);
  });
  it('archive : JSON valide au schéma de l’import, chaque image une fois, rien de modifié', async () => {
    const avant = JSON.stringify((await S.getAll('questions')).sort((a, b) => (a.id < b.id ? -1 : 1)));
    const db = { questions: await S.getAll('questions'), fiches: await S.getAll('fiches'), matieres: await S.getAll('matieres'), sources: await S.getAll('sources') };
    const etapes = new Set();
    const r = await construireExport({ cartes: db.questions.filter((q) => q.ficheId === 'f1'), db, lireBlob: S.getBlob, libelle: 'Membre supérieur', today: T, onProgres: (p) => etapes.add(p.etape) });
    expect([...etapes].sort()).toEqual(['archive', 'cartes', 'images']);
    expect(r.nom).toBe('medrevise-flashcards-membre-superieur-2026-10-26.zip');
    expect(r.manquantes).toEqual([]);
    const z = await lireZip(r.blob);
    const noms = [...z.keys()].sort();
    expect(noms.filter((n) => n.startsWith('images/')).length).toBe(5); // i1 partagée par 2 cartes : une seule fois
    expect(noms).toContain('flashcards.json');
    expect(noms).toContain('README.txt');
    const doc = JSON.parse(await z.get('flashcards.json').text());
    expect(doc.items.length).toBe(9); // le QCM n'est pas exporté
    const refs = JSON.stringify(doc.items).match(/images\/[^"]+/g);
    for (const n of refs) expect(z.has(n)).toBe(true);
    expect(await z.get(r.doc.items.find((x) => x.recto === 'Quel os ?').image.fichier).arrayBuffer()).toEqual(await (await S.getBlob(ids.i1)).arrayBuffer());
    const readme = await z.get('README.txt').text();
    expect(readme).toMatch(/9 carte\(s\) par type/);
    expect(readme).toMatch(/Anatomie › Membre supérieur : 9/);
    expect(JSON.stringify((await S.getAll('questions')).sort((a, b) => (a.id < b.id ? -1 : 1)))).toBe(avant);
  });
});

describe('ré-import', () => {
  let fichier;
  beforeAll(async () => {
    const db = { questions: await S.getAll('questions'), fiches: await S.getAll('fiches'), matieres: await S.getAll('matieres'), sources: await S.getAll('sources') };
    const r = await construireExport({ cartes: db.questions.filter((q) => q.ficheId === 'f1'), db, lireBlob: S.getBlob, libelle: 'Membre supérieur', today: T });
    fichier = new File([r.blob], r.nom, { type: 'application/zip' });
  });
  it('l’import existant accepte le .zip : aperçu, compte par type, progression détectée', async () => {
    const a = await analyserImport({ fichier, existantes: await cartesF('f2') });
    expect(a.ok).toBe(true);
    expect(a.erreurs).toEqual([]);
    expect(a.cartes.length).toBe(9);
    expect(a.compte).toMatchObject({ texte: 2, trous: 1, image: 2, occlusion: 1, muscle: 1, molecule: 1, tableau: 1 });
    expect(a.avecProgression).toBe(9);
    expect(a.doublons).toBe(0);
  }, 60000);
  it('dans un autre cours : contenu identique, images identiques et écrites une fois, progression IGNORÉE par défaut', async () => {
    const blobsAvant = (await S.getAllEntries('blobs')).length;
    const a = await analyserImport({ fichier, existantes: await cartesF('f2') });
    const r = await importerCartes({ ficheId: 'f2', analyse: a, startDate: T });
    expect(r.count).toBe(9);
    expect((await S.getAllEntries('blobs')).length - blobsAvant).toBe(5);
    const o = parRecto(await cartesF('f1')), n = parRecto(await cartesF('f2'));
    const memeImage = async (x, y) => expect(await (await S.getBlob(y)).arrayBuffer()).toEqual(await (await S.getBlob(x)).arrayBuffer());
    for (const k of ['theme', 'verso', 'indice', 'a_retenir', 'difficulte', 'tags', 'cloze', 'items', 'aApprendre', 'versoAuto', 'tableau', 'imagePlace']) {
      for (const recto of Object.keys(o)) if (o[recto][k] != null && !(k === 'verso' && (o[recto].muscle || o[recto].tableau || o[recto].molecule))) expect([recto, k, n[recto][k]]).toEqual([recto, k, o[recto][k]]);
    }
    await memeImage(o['Quel os ?'].imageId, n['Quel os ?'].imageId);
    expect(n['Quel os ?'].imageId).toBe(n['Même image, autre carte'].imageId); // partagée : un seul fichier
    const occO = o['Que cachent les masques ?'].occlusion, occN = n['Que cachent les masques ?'].occlusion;
    expect([occN.imageW, occN.imageH, occN.coches]).toEqual([occO.imageW, occO.imageH, occO.coches]);
    await memeImage(occO.imageId, occN.imageId);
    const mO = o['Biceps brachial'].muscle, mN = n['Biceps brachial'].muscle;
    expect(mN.lignes).toEqual(mO.lignes);
    expect(mN.images.origine.masques).toEqual(mO.images.origine.masques);
    await memeImage(mO.images.origine.imageId, mN.images.origine.imageId);
    await memeImage(mO.images.insertion.imageId, mN.images.insertion.imageId);
    expect(mN.imageGenerale.auRecto).toBe(true);
    await memeImage(mO.imageGenerale.imageId, mN.imageGenerale.imageId);
    const molN = n['Éthanol'].molecule;
    expect([molN.smiles, molN.molfile, molN.formule, molN.sens]).toEqual(['CCO', 'MOLFILE-ORIGINAL', 'C2H6O', 'nom-molecule']);
    // progression ignorée : cartes neuves, parties de la date choisie
    const t = n['Quel os forme le bras ?'];
    expect([t.nouvelle, t.historique, t.dueDate, t.j0Date, t.fsrs]).toEqual([true, [], T, T, undefined]);
    expect(t.createdAt).toBe(dateCreation(o['Quel os forme le bras ?']));
  }, 60000);
  it('« Reprendre aussi la progression » : dates, J, FSRS, historique repris', async () => {
    await S.putMany('fiches', [{ id: 'f3', matiereId: 'm1', titre: 'Cours cible 2', type: 'standard' }]);
    const a = await analyserImport({ fichier, existantes: [] });
    await importerCartes({ ficheId: 'f3', analyse: a, startDate: T, progression: true });
    const o = parRecto(await cartesF('f1')), n = parRecto(await cartesF('f3'));
    for (const recto of Object.keys(o)) for (const k of ['dueDate', 'j0Date', 'intervalDays', 'historique', 'nouvelle', 'fsrs', 'learnState', 'capped', 'termine', 'missed']) expect([recto, k, n[recto][k]]).toEqual([recto, k, o[recto][k]]);
  }, 60000);
});

describe('non-régression', () => {
  it('l’exemple du format attendu s’analyse toujours sans erreur', async () => {
    const a = await analyserImport({ texte: exempleJSON() });
    expect(a.ok && a.erreurs.length).toBe(0);
  }, 60000);
  it('archive : creerZip et creerZipProgressif produisent le même contenu', async () => {
    const f = [{ nom: 'a.txt', donnees: 'bonjour' }, { nom: 'b/c.bin', donnees: new Uint8Array([1, 2, 3]) }];
    const [x, y] = [await lireZip(creerZip(f)), await lireZip(await creerZipProgressif(f))];
    expect(await x.get('a.txt').text()).toBe(await y.get('a.txt').text());
    expect(new Uint8Array(await y.get('b/c.bin').arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
  it('sorte et images d’une carte', () => {
    expect(sorteExport({ items: [{ text: 'a' }] })).toBe('elements');
    expect(imagesDeCarte({ muscle: { lignes: {}, images: { action: { imageId: 'b2' } }, imageGenerale: { imageId: 'b1' } } })).toEqual(['b1', 'b2']);
  });
});
