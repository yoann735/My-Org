/* ============================================================
   MedRevise — EXPORT COMPLET DES FLASHCARDS (26/10, docs/compte-rendu-export-flashcards.md).
   Un .zip ré-importable tel quel par l'import du panneau (lib/importFlashcards.js) :
     flashcards.json   { format, version, exporte_le, items: [ … ] } — le schéma de l'import, chaque carte avec
                       TOUT son contenu (texte, éléments, trous, image, image à masques, Muscle et ses images
                       par ligne, Tableau, Molécule SMILES + molfile), son tag « À apprendre », son cours / sa
                       matière d'origine, ses dates, et un bloc séparé `progress` (catégorie, dates, état FSRS,
                       historique…) — ignoré au ré-import sauf « Reprendre aussi la progression ».
     images/<id>.<ext> chaque image utilisée, une seule fois (nom stable : l'id du fichier), référencée par
                       son nom (`fichier`) dans le JSON.
     README.txt        le contenu de l'archive, le nombre de cartes par type et par cours.
   LECTURE SEULE : aucune carte n'est modifiée, rien n'est écrit dans la base ni envoyé au cloud.
   Module pur (aucun DOM) : les blobs sont lus par la fonction `lireBlob` fournie.
   ============================================================ */
import { categoriser } from './categoriesFC.js';
import { nextDate } from './planning.js';
import { estMuscle, LIGNES_MUSCLE, imagesDe, imageGeneraleDe } from './muscle.js';
import { estTableau } from './carteTableau.js';
import { estMolecule } from '../molecule/carte.js';
import { creerZipProgressif } from './zipSimple.js';

export const FORMAT_EXPORT = 'medrevise-flashcards';
export const VERSION_EXPORT = '1.2';

/* champs du CONTENU (repris dans l'entrée), de l'IDENTITÉ (id, rattachement, horodatage) ;
   tout le reste d'une carte est sa PROGRESSION (dates, J, FSRS, historique, carnet…) → bloc `progress` */
const CONTENU = new Set(['type', 'theme', 'concept', 'recto', 'verso', 'indice', 'a_retenir', 'difficulte', 'tags', 'cloze', 'items',
  'versoFormat', 'versoAuto', 'imageId', 'imagePlace', 'occlusion', 'muscle', 'molecule', 'tableau', 'aApprendre']);
const IDENTITE = new Set(['id', 'ficheId', 'srcId', '_schema', 'updatedAt', 'createdAt', 'source', 'ephemeral']);

export const LIBELLES_EXPORT = { texte: 'Texte', elements: 'Éléments à révéler', trous: 'Trous', image: 'Image', occlusion: 'Image à masques', muscle: 'Muscle', tableau: 'Tableau', molecule: 'Molécule' };

/** sorte d'une carte pour les compteurs de l'export */
export function sorteExport(q) {
  if (q.occlusion && q.occlusion.imageId) return 'occlusion';
  if (estMuscle(q)) return 'muscle';
  if (estTableau(q)) return 'tableau';
  if (estMolecule(q)) return 'molecule';
  if ((q.cloze && q.cloze.length) || /\{\{[^{}]+\}\}/.test(q.recto || '')) return 'trous';
  if (Array.isArray(q.items) && q.items.length) return 'elements';
  if (q.imageId) return 'image';
  return 'texte';
}

/** cartes exportables : les flashcards enregistrées (pas les cartes éphémères d'une séance) */
export const estExportable = (q) => !!q && q.type === 'flashcard' && !q.ephemeral;

/** date de création : `createdAt` si la carte l'a, sinon l'horodatage de son id (genId : préfixe + Date.now() en base 36) */
export function dateCreation(q) {
  if (q && typeof q.createdAt === 'string' && q.createdAt) return q.createdAt;
  const m = /^[a-z]([0-9a-z]{8})/.exec((q && q.id) || '');
  if (m) {
    const t = parseInt(m[1], 36);
    if (t > Date.UTC(2015, 0, 1) && t < Date.UTC(2100, 0, 1)) return new Date(t).toISOString();
  }
  return null;
}

/** tous les ids d'images (blobs) d'une carte, dans l'ordre d'apparition */
export function imagesDeCarte(q) {
  const ids = [];
  if (q.occlusion && q.occlusion.imageId) ids.push(q.occlusion.imageId);
  if (q.imageId) ids.push(q.imageId);
  if (estMuscle(q)) {
    const g = imageGeneraleDe(q);
    if (g) ids.push(g.imageId);
    const ims = imagesDe(q);
    LIGNES_MUSCLE.forEach((l) => { if (ims[l.id]) ids.push(ims[l.id].imageId); });
  }
  return ids;
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
/** nom stable d'une image dans l'archive : son id + l'extension de son type (png par défaut) */
export const nomImage = (id, type) => `images/${id}.${EXT[String(type || '').toLowerCase()] || 'png'}`;

/** cours / matière / section d'une carte (noms lisibles) */
export function origineDe(q, ix) {
  const f = ix.fiches.get(q.ficheId);
  const m = f && ix.matieres.get(f.matiereId);
  const s = m && ix.sections.get(m.sourceId);
  return {
    ...(s ? { section: s.nom || '' } : {}),
    matiere: m ? m.nom || '' : '',
    cours: f ? f.titre || '' : '',
  };
}

export function indexNoms(db) {
  return {
    fiches: new Map(((db && db.fiches) || []).map((f) => [f.id, f])),
    matieres: new Map(((db && db.matieres) || []).map((m) => [m.id, m])),
    sections: new Map(((db && db.sources) || []).map((s) => [s.id, s])),
  };
}

/* catégorie de séance au jour de l'export (informative : elle se recalcule d'elle-même) */
function categories(cartes, today) {
  const c = categoriser(cartes, today, nextDate);
  const out = new Map();
  c.nouvelles.forEach((q) => out.set(q.id, 'nouvelle'));
  c.revisions.forEach((q) => out.set(q.id, 'revision'));
  c.retard.forEach((q) => out.set(q.id, 'retard'));
  return out;
}

/**
 * Une carte → son entrée du JSON (schéma de l'import). `fichiers` : Map(id d'image → nom dans l'archive) ;
 * une image absente de la Map (introuvable sur cet appareil) est signalée par une clé commentaire « _image_manquante ».
 */
export function carteVersItem(q, { fichiers = new Map(), origine = null, categorie = null } = {}) {
  const it = { type: 'flashcard' };
  const manque = [];
  const fichier = (id) => { const n = fichiers.get(id); if (!n) manque.push(id); return n || null; };
  if (q.theme) it.theme = q.theme;
  const construite = estMuscle(q) || estTableau(q) || estMolecule(q); // verso construit à l'import
  if (q.recto) it.recto = q.recto;
  if (!construite && q.verso != null && (q.verso !== '' || !(Array.isArray(q.items) && q.items.length))) it.verso = q.verso;
  if (q.versoFormat) it.verso_format = q.versoFormat;
  if (q.versoAuto) it.verso_auto = true;
  if (Array.isArray(q.cloze) && q.cloze.length) it.cloze = q.cloze;
  if (q.indice) it.indice = q.indice;
  if (q.a_retenir) it.a_retenir = q.a_retenir;
  if (q.difficulte) it.difficulte = q.difficulte;
  if (Array.isArray(q.tags) && q.tags.length) it.tags = q.tags;
  if (Array.isArray(q.items) && q.items.length) it.items = q.items.map((x) => ({ text: x.text, masked: x.masked !== false }));
  if (q.occlusion && q.occlusion.imageId) {
    const n = fichier(q.occlusion.imageId);
    if (n) it.occlusion = { fichier: n, largeur: q.occlusion.imageW ?? null, hauteur: q.occlusion.imageH ?? null, masques: q.occlusion.coches || [] };
  } else if (q.imageId) {
    const n = fichier(q.imageId);
    if (n) it.image = { fichier: n, place: q.imagePlace === 'verso' || q.imagePlace === 'deux' ? q.imagePlace : 'recto' };
  }
  if (estMuscle(q)) {
    const l = q.muscle.lignes || {};
    it.muscle = Object.fromEntries(LIGNES_MUSCLE.map((x) => [x.id, typeof l[x.id] === 'string' ? l[x.id] : '']));
    const ims = imagesDe(q);
    const parLigne = {};
    LIGNES_MUSCLE.forEach((x) => {
      if (!ims[x.id]) return;
      const n = fichier(ims[x.id].imageId);
      if (n) parLigne[x.id] = { fichier: n, ...(ims[x.id].masques ? { masques: ims[x.id].masques } : {}) };
    });
    if (Object.keys(parLigne).length) it.muscle.images = parLigne;
    const g = imageGeneraleDe(q);
    if (g) { const n = fichier(g.imageId); if (n) it.image = { fichier: n, place: g.auRecto ? 'recto' : 'verso' }; }
  }
  if (estMolecule(q)) {
    const m = q.molecule;
    it.molecule = { nom: m.nom || '', smiles: m.smiles || '', sens: m.sens || 'nom-molecule', ...(m.molfile ? { molfile: m.molfile } : {}), ...(m.formule ? { formule: m.formule } : {}),
      ...(m.comparaison ? { comparaison: m.comparaison } : {}), ...(m.biblio != null ? { biblio: m.biblio } : {}) };
  }
  if (estTableau(q)) it.tableau = { colonnes: q.tableau.colonnes, lignes: q.tableau.lignes };
  if (q.aApprendre === true) it.a_apprendre = true;
  it.origine = { ...(origine || {}), id: q.id, ...(q.source && typeof q.source === 'object' ? { source: q.source } : {}) };
  const cree = dateCreation(q);
  if (cree) it.cree_le = cree;
  if (q.updatedAt) it.modifie_le = q.updatedAt;
  // progression : tout ce qui n'est ni contenu ni identité, tel quel
  const progress = { categorie: categorie || (q.termine ? 'terminee' : 'a_venir') };
  for (const [k, v] of Object.entries(q)) if (!CONTENU.has(k) && !IDENTITE.has(k) && v !== undefined) progress[k] = v;
  it.progress = progress;
  if (manque.length) it._image_manquante = manque.join(', ');
  return it;
}

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** « medrevise-flashcards-<cours ou matière>-AAAA-MM-JJ.zip » */
export function nomArchive(libelle, date) {
  const slug = sansAccents(libelle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'flashcards';
  return `medrevise-flashcards-${slug}-${date}.zip`;
}

/** libellé de l'archive d'après les cartes : leur cours s'il est unique, sinon leur matière, sinon `defaut` */
export function libelleDesCartes(cartes, db, defaut = 'selection') {
  const ix = indexNoms(db);
  const cours = new Set(cartes.map((q) => q.ficheId));
  if (cours.size === 1) { const f = ix.fiches.get([...cours][0]); if (f && f.titre) return f.titre; }
  const mats = new Set(cartes.map((q) => (ix.fiches.get(q.ficheId) || {}).matiereId));
  if (mats.size === 1) { const m = ix.matieres.get([...mats][0]); if (m && m.nom) return m.nom; }
  return defaut;
}

/** résumé (sans lire les images) : nombre de cartes, par sorte, par cours ; nombre d'images distinctes */
export function resumeExport(cartes, db) {
  const ix = indexNoms(db);
  const parSorte = {}, parCours = new Map();
  const images = new Set();
  for (const q of cartes) {
    const s = sorteExport(q);
    parSorte[s] = (parSorte[s] || 0) + 1;
    const o = origineDe(q, ix);
    const cle = (o.matiere ? o.matiere + ' › ' : '') + (o.cours || 'Cours introuvable');
    parCours.set(cle, (parCours.get(cle) || 0) + 1);
    imagesDeCarte(q).forEach((id) => images.add(id));
  }
  return { cartes: cartes.length, parSorte, parCours: [...parCours.entries()], images: images.size };
}

export function texteReadme({ resume, exporteLe, manquantes = [], libelle }) {
  const l = [];
  l.push('MedRevise — export de flashcards');
  l.push('================================');
  l.push(`Contenu : ${libelle}`);
  l.push(`Exporté le : ${new Date(exporteLe).toLocaleString('fr-FR')}`);
  l.push('');
  l.push('Contenu de l’archive');
  l.push('  flashcards.json  les cartes (schéma de l’import des flashcards de MedRevise, ré-importable tel quel)');
  l.push(`  images/          ${resume.images - manquantes.length} image(s) utilisée(s) par les cartes, référencée(s) par leur nom dans le JSON (« fichier »)`);
  l.push('  README.txt       ce fichier');
  l.push('');
  l.push('Ré-import : panneau d’un cours › Exercices › Flashcards › Importer › Fichier .json / .zip — déposer ce .zip.');
  l.push('Chaque carte porte un bloc « progress » (catégorie, dates, état FSRS, historique) : il est ignoré au ré-import,');
  l.push('sauf si « Reprendre aussi la progression » est coché.');
  l.push('');
  l.push(`${resume.cartes} carte(s) par type`);
  for (const [k, lib] of Object.entries(LIBELLES_EXPORT)) if (resume.parSorte[k]) l.push(`  ${lib.padEnd(20)} ${resume.parSorte[k]}`);
  l.push('');
  l.push('Par cours');
  for (const [c, n] of resume.parCours) l.push(`  ${c} : ${n}`);
  if (manquantes.length) {
    l.push('');
    l.push(`ATTENTION : ${manquantes.length} image(s) introuvable(s) sur cet appareil au moment de l’export (non incluse(s)) : ${manquantes.join(', ')}`);
  }
  return l.join('\n') + '\n';
}

const pause = () => new Promise((r) => setTimeout(r, 0));

/**
 * Construit l'archive. `lireBlob(id)` → Blob | null. `onProgres({ etape, fait, total })` (etape : images | cartes | archive).
 * Rend { blob, nom, resume, manquantes, octets }. Rien n'est écrit.
 */
export async function construireExport({ cartes, db, lireBlob, libelle, today, maintenant = new Date(), onProgres = () => {} }) {
  const liste = (cartes || []).filter(estExportable);
  const ix = indexNoms(db);
  const resume = resumeExport(liste, db);
  // 1. les images, chacune UNE fois
  const ids = [];
  const vus = new Set();
  for (const q of liste) for (const id of imagesDeCarte(q)) if (!vus.has(id)) { vus.add(id); ids.push(id); }
  const fichiers = new Map(), entrees = [], manquantes = [];
  let t0 = Date.now();
  for (let i = 0; i < ids.length; i++) {
    let b = null;
    try { b = await lireBlob(ids[i]); } catch (e) { b = null; }
    if (b) {
      const nom = nomImage(ids[i], b.type);
      fichiers.set(ids[i], nom);
      entrees.push({ nom, donnees: new Uint8Array(await b.arrayBuffer()) });
    } else manquantes.push(ids[i]);
    onProgres({ etape: 'images', fait: i + 1, total: ids.length });
    if (Date.now() - t0 > 30) { await pause(); t0 = Date.now(); }
  }
  // 2. les cartes
  const cats = categories(liste, today);
  const items = [];
  for (let i = 0; i < liste.length; i++) {
    const q = liste[i];
    items.push(carteVersItem(q, { fichiers, origine: origineDe(q, ix), categorie: cats.get(q.id) || null }));
    if (i % 50 === 49) { onProgres({ etape: 'cartes', fait: i + 1, total: liste.length }); await pause(); }
  }
  onProgres({ etape: 'cartes', fait: liste.length, total: liste.length });
  const exporteLe = maintenant.toISOString();
  const doc = { format: FORMAT_EXPORT, version: VERSION_EXPORT, exporte_le: exporteLe, contenu: libelle, nb_cartes: items.length, items };
  const json = JSON.stringify(doc, null, 2);
  // 3. l'archive (JSON et README d'abord, puis les images)
  const tous = [
    { nom: 'flashcards.json', donnees: json },
    { nom: 'README.txt', donnees: texteReadme({ resume, exporteLe, manquantes, libelle }) },
    ...entrees,
  ];
  const blob = await creerZipProgressif(tous, (fait, total) => onProgres({ etape: 'archive', fait, total }));
  return { blob, nom: nomArchive(libelle, today), resume, manquantes, octets: blob.size, doc };
}
