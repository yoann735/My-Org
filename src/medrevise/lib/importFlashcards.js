/* ============================================================
   MedRevise — IMPORT DE FLASHCARDS (JSON) DEPUIS LE PANNEAU (17/10,
   docs/compte-rendu-import-tableau-nettete.md). Schéma d'import v1.1 (celui des prompts de
   génération), ÉTENDU à tous les types de cartes :
     { "items": [ { "type": "flashcard", "theme", "recto", "verso", "cloze", "indice", "a_retenir",
                    "image":    { "data": "data:image/png;base64,…" | "fichier": "nom.png" (dans le .zip), "place": "recto"|"verso"|"deux" },
                    "muscle":   { "origine", "trajet", "insertion", "action", "innervation", "topographie" } (28/10 : tous facultatifs),
                    "molecule": { "nom", "smiles", "sens": "nom-molecule"|"molecule-nom" },
                    "tableau":  { "colonnes": [2 à 6], "lignes": [[…], …] (1 à 12),
                                  "masque"?: { "cellules": [[true|false, …], …], "noms": [true|false, …] } (31/10 : true = masqué ;
                                  absent = toutes les cases masquées, noms de colonnes visibles) },
                    "items":    [ { "text", "masked": true|false }, … ] (26/10 : éléments à révéler d'une carte texte) } ] }
   (26/10, export complet — lib/exportFlashcards.js, docs/compte-rendu-export-flashcards.md) ACCEPTE EN PLUS, pour
   ré-importer un export tel quel : "occlusion": { "fichier"|"data", "largeur", "hauteur", "masques": [ … ] } (image à
   masques), "muscle.images": { <ligne>: { "fichier"|"data", "masques"? } }, "molecule": { …, "molfile", "formule",
   "comparaison", "biblio" }, "verso_format", "verso_auto", "a_apprendre", "origine" et "modifie_le" (informatifs),
   "cree_le" (gardé sur la carte), "progress" (repris SEULEMENT avec l'option « Reprendre aussi la progression »).
   Une carte Muscle / Molécule / Tableau a son recto (nom, titre) ; son verso est construit.
   VALIDATION STRICTE : champ manquant, type inconnu, champ inconnu, valeur hors limites → un message
   par carte, avec son numéro et sa LIGNE dans le JSON ; rien n'est importé tant qu'il reste une
   erreur. Les clés qui commencent par « _ » sont des commentaires (ignorées). Les items d'un autre
   type v1.1 (qcm, feynman, exercice) sont signalés et laissés de côté (le panneau importe des
   flashcards).
   Écriture : appendItemsToFiche (lib/import.js) — exactement le chemin d'une carte créée à la main
   (mêmes J, date de départ choisie) ; les images passent par putBlob (même stockage, même synchro).
   ============================================================ */
import { parseLooseJson, cleanPastedJson, extractFirstJsonValue } from './parsePastedJson.js';
import { appendItemsToFiche, cleanCoche } from './import.js';
import { putBlob } from './storage.js';
import { carteMuscle, LIGNES_MUSCLE } from './muscle.js';
import { carteMolecule, SENS } from '../molecule/carte.js';
import { carteTableau, normaliserTableau } from './carteTableau.js';
import { lireZip, typeImage } from './zipLecture.js';

const CHAMPS = new Set(['type', 'id', 'theme', 'concept', 'recto', 'verso', 'cloze', 'indice', 'a_retenir', 'difficulte', 'tags', 'source_cours', 'image', 'muscle', 'molecule', 'tableau', 'items',
  // (26/10) export complet ré-importable
  'occlusion', 'verso_format', 'verso_auto', 'a_apprendre', 'origine', 'cree_le', 'modifie_le', 'progress']);

/* (26/10) éléments à révéler du verso d'une carte texte : [{ text, masked }] — `masked` facultatif (vrai par défaut) */
function lireElements(v) {
  if (v == null) return { items: null };
  if (!Array.isArray(v)) return { erreur: 'champ « items » : liste d’éléments [{ "text", "masked" }] attendue' };
  const items = [];
  for (let k = 0; k < v.length; k++) {
    const x = v[k];
    if (!x || typeof x !== 'object' || Array.isArray(x)) return { erreur: `items[${k}] : objet { "text", "masked" } attendu` };
    const inconnu = sansCommentaires(x).find((c) => !['text', 'masked'].includes(c));
    if (inconnu) return { erreur: `items[${k}].${inconnu} : champ inconnu (attendus : text, masked)` };
    if (!estTexte(x.text)) return { erreur: `items[${k}].text : texte manquant` };
    if (x.masked != null && typeof x.masked !== 'boolean') return { erreur: `items[${k}].masked : true ou false` };
    items.push({ text: str(x.text), masked: x.masked !== false });
  }
  return { items };
}
const AUTRES_TYPES = new Set(['qcm', 'feynman', 'exercice']);
const CHAMPS_MUSCLE = LIGNES_MUSCLE.map((l) => l.id);
const estTexte = (v) => typeof v === 'string' && v.trim() !== '';
const str = (v) => (v == null ? '' : String(v)).trim();
const sansCommentaires = (o) => Object.keys(o).filter((k) => !k.startsWith('_'));
export const normRecto = (s) => String(s || '').replace(/\{\{c?\d*:{0,2}([^}]*)\}\}/g, '$1').replace(/<[^>]+>/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/* ---- position (ligne) de chaque élément du tableau d'items dans le texte JSON ---- */
function lignesDesItems(texte) {
  const s = cleanPastedJson(texte);
  const brut = extractFirstJsonValue(s);
  if (!brut) return [];
  const decal = s.indexOf(brut);
  const lignePrefixe = (texte.slice(0, texte.indexOf(s)).match(/\n/g) || []).length;
  // le tableau des items : `"items": [` au premier niveau, ou le tableau racine
  let debutTab = -1;
  if (brut.trimStart().startsWith('[')) debutTab = brut.indexOf('[');
  else {
    let prof = 0, chaine = false, echap = false;
    for (let i = 0; i < brut.length; i++) {
      const c = brut[i];
      if (chaine) { if (echap) echap = false; else if (c === '\\') echap = true; else if (c === '"') chaine = false; continue; }
      if (c === '"') { if (prof === 1 && /^"(items|flashcards)"\s*:\s*\[/.test(brut.slice(i, i + 40))) { debutTab = brut.indexOf('[', i); break; } chaine = true; continue; }
      if (c === '{' || c === '[') prof++; else if (c === '}' || c === ']') prof--;
    }
  }
  if (debutTab < 0) return [];
  // chaque élément commence au premier caractère non blanc après « [ » ou après une virgule de ce niveau
  const pos = [];
  let prof = 0, chaine = false, echap = false, attendu = true;
  for (let i = debutTab + 1; i < brut.length; i++) {
    const c = brut[i];
    if (chaine) { if (echap) echap = false; else if (c === '\\') echap = true; else if (c === '"') chaine = false; continue; }
    if (prof === 0) {
      if (c === ']') break;
      if (c === ',') { attendu = true; continue; }
      if (attendu && !/\s/.test(c)) { pos.push(i); attendu = false; }
    }
    if (c === '"') { chaine = true; continue; }
    if (c === '{' || c === '[') prof++; else if (c === '}' || c === ']') prof--;
  }
  const ligneDe = (k) => lignePrefixe + (s.slice(0, decal + k).match(/\n/g) || []).length + 1;
  return pos.map((k) => ligneDe(k));
}

/* ---- un fichier image (« data » ou « fichier » du .zip) : { blob, nom } ou { erreur } ; `nom` (fichier du .zip) sert à
   n'écrire qu'UNE fois une image partagée par plusieurs cartes ---- */
function lireFichierImage(o, fichiers, champ) {
  if (o.data != null) {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(o.data));
    if (!m) return { erreur: `${champ}.data : URL de donnée d’image invalide (data:image/…;base64,…)` };
    try {
      const bin = atob(m[2].replace(/\s/g, ''));
      const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      return { blob: new Blob([a], { type: m[1].toLowerCase() }), nom: null };
    } catch (e) { return { erreur: `${champ}.data : base64 illisible` }; }
  }
  if (o.fichier != null) {
    const nom = str(o.fichier);
    if (!fichiers) return { erreur: `${champ}.fichier « ${nom} » : importe un .zip qui contient ce fichier (ou utilise ${champ}.data)` };
    const trouve = fichiers.has(nom) ? [nom, fichiers.get(nom)] : [...fichiers.entries()].find(([k]) => k.split('/').pop() === nom.split('/').pop());
    if (!trouve) return { erreur: `${champ}.fichier « ${nom} » absent du .zip` };
    const t = typeImage(nom);
    if (!t) return { erreur: `${champ}.fichier « ${nom} » : format d’image non reconnu` };
    const b = trouve[1];
    return { blob: b.type ? b : new Blob([b], { type: t }), nom: trouve[0] };
  }
  return { erreur: `${champ} : « data » ou « fichier » attendu` };
}

/* ---- une image : { blob } prête à écrire, ou une erreur ---- */
function lireImage(img, fichiers) {
  if (img == null) return { image: null };
  const o = typeof img === 'string' ? { data: img } : img;
  if (typeof o !== 'object' || Array.isArray(o)) return { erreur: 'image : objet { data | fichier, place } attendu' };
  const inconnus = sansCommentaires(o).filter((k) => !['data', 'fichier', 'place'].includes(k));
  if (inconnus.length) return { erreur: `image.${inconnus[0]} : champ inconnu (attendus : data, fichier, place)` };
  const place = o.place == null ? 'recto' : String(o.place);
  if (!['recto', 'verso', 'deux'].includes(place)) return { erreur: `image.place « ${place} » : recto, verso ou deux` };
  const f = lireFichierImage(o, fichiers, 'image');
  if (f.erreur) return { erreur: f.erreur };
  return { image: { blob: f.blob, nom: f.nom, place } };
}

/* ---- (26/10) image à masques (occlusion) : { occlusion: { blob, nom, imageW, imageH, coches } } ou { erreur } ---- */
function lireOcclusion(v, fichiers) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { erreur: 'occlusion : objet { fichier | data, largeur, hauteur, masques } attendu' };
  const inconnu = sansCommentaires(v).find((k) => !['data', 'fichier', 'largeur', 'hauteur', 'masques'].includes(k));
  if (inconnu) return { erreur: `occlusion.${inconnu} : champ inconnu (attendus : fichier, data, largeur, hauteur, masques)` };
  if (!Array.isArray(v.masques)) return { erreur: 'occlusion.masques : liste des masques et étiquettes attendue' };
  const k = v.masques.findIndex((c) => !c || typeof c !== 'object' || Array.isArray(c));
  if (k >= 0) return { erreur: `occlusion.masques[${k}] : objet attendu` };
  for (const d of ['largeur', 'hauteur']) if (v[d] != null && !(Number.isFinite(v[d]) && v[d] > 0)) return { erreur: `occlusion.${d} : nombre de pixels attendu` };
  const f = lireFichierImage(v, fichiers, 'occlusion');
  if (f.erreur) return { erreur: f.erreur };
  return { occlusion: { blob: f.blob, nom: f.nom, imageW: v.largeur ?? null, imageH: v.hauteur ?? null, coches: v.masques.map((c, i) => ({ ...c, ...cleanCoche(c, i) })) } }; // normalisés, rien de perdu
}

/* ---- (26/10) images par ligne d'une carte Muscle : { images: { ligne: { blob, nom, masques? } } } ou { erreur } ---- */
function lireImagesMuscle(v, fichiers) {
  if (v == null) return { images: {} };
  if (typeof v !== 'object' || Array.isArray(v)) return { erreur: 'muscle.images : objet { <ligne>: { fichier | data, masques } } attendu' };
  const images = {};
  for (const ligne of sansCommentaires(v)) {
    if (!CHAMPS_MUSCLE.includes(ligne)) return { erreur: `muscle.images.${ligne} : ligne inconnue (attendues : ${CHAMPS_MUSCLE.join(', ')})` };
    const o = v[ligne];
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { erreur: `muscle.images.${ligne} : objet { fichier | data, masques } attendu` };
    const inconnu = sansCommentaires(o).find((k) => !['data', 'fichier', 'masques'].includes(k));
    if (inconnu) return { erreur: `muscle.images.${ligne}.${inconnu} : champ inconnu (attendus : fichier, data, masques)` };
    if (o.masques != null && !Array.isArray(o.masques)) return { erreur: `muscle.images.${ligne}.masques : liste attendue` };
    const f = lireFichierImage(o, fichiers, `muscle.images.${ligne}`);
    if (f.erreur) return { erreur: f.erreur };
    images[ligne] = { blob: f.blob, nom: f.nom, ...(o.masques && o.masques.length ? { masques: o.masques } : {}) };
  }
  return { images };
}

/* ---- une carte : { carte, sorte, image, occlusion, imagesMuscle, progress } ou { erreur } ---- */
async function lireCarte(it, fichiers, chimie) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return { erreur: 'n’est pas un objet' };
  if (it.type == null) return { erreur: 'champ « type » manquant' };
  if (typeof it.type !== 'string') return { erreur: 'champ « type » : texte attendu' };
  if (AUTRES_TYPES.has(it.type)) return { autre: it.type };
  if (it.type !== 'flashcard') return { erreur: `type inconnu « ${it.type} » (attendu : flashcard)` };
  const inconnu = sansCommentaires(it).find((k) => !CHAMPS.has(k));
  if (inconnu) return { erreur: `champ inconnu « ${inconnu} »` };
  const sortes = ['muscle', 'molecule', 'tableau'].filter((k) => it[k] != null);
  if (sortes.length > 1) return { erreur: `une carte est soit muscle, soit molecule, soit tableau (ici : ${sortes.join(' + ')})` };
  if (sortes.length && it.items != null) return { erreur: `« items » (éléments à révéler) : seulement sur une carte texte (pas ${sortes[0]})` };
  if (it.occlusion != null && (sortes.length || it.items != null || it.image != null)) return { erreur: 'une image à masques (« occlusion ») ne se combine ni avec « image », ni avec « items », muscle, molecule ou tableau' };
  // (26/10) champs de l'export complet
  if (it.a_apprendre != null && typeof it.a_apprendre !== 'boolean') return { erreur: 'champ « a_apprendre » : true ou false' };
  if (it.verso_auto != null && typeof it.verso_auto !== 'boolean') return { erreur: 'champ « verso_auto » : true ou false' };
  if (it.verso_format != null && typeof it.verso_format !== 'string') return { erreur: 'champ « verso_format » : texte attendu' };
  for (const k of ['origine', 'progress']) if (it[k] != null && (typeof it[k] !== 'object' || Array.isArray(it[k]))) return { erreur: `champ « ${k} » : objet attendu` };
  if (it.cree_le != null && (typeof it.cree_le !== 'string' || Number.isNaN(Date.parse(it.cree_le)))) return { erreur: 'champ « cree_le » : date ISO attendue' };
  const base = { theme: str(it.theme || it.concept), indice: str(it.indice), aRetenir: str(it.a_retenir), difficulte: estTexte(it.difficulte) || [1, 2, 3].includes(it.difficulte) ? it.difficulte : 'intermediaire' }; // (26/10) l'export écrit la valeur stockée (1|2|3)
  const im = lireImage(it.image, fichiers);
  if (im.erreur) return { erreur: im.erreur };
  let carte, sorte, occlusion = null, imagesMuscle = {};
  if (it.muscle != null) {
    const m = it.muscle;
    if (typeof m !== 'object' || Array.isArray(m)) return { erreur: 'muscle : objet { origine, trajet, insertion, action, innervation, topographie } attendu' };
    const k = sansCommentaires(m).find((x) => !CHAMPS_MUSCLE.includes(x) && x !== 'images');
    if (k) return { erreur: `muscle.${k} : champ inconnu (attendus : ${CHAMPS_MUSCLE.join(', ')}, images)` };
    const ims = lireImagesMuscle(m.images, fichiers);
    if (ims.erreur) return { erreur: ims.erreur };
    imagesMuscle = ims.images;
    // (28/10) aucune ligne n'est obligatoire (comme dans le formulaire) : seul le nom du muscle l'est
    if (!estTexte(it.recto)) return { erreur: 'champ « recto » (nom du muscle) manquant' };
    carte = carteMuscle({ nom: it.recto, lignes: Object.fromEntries(CHAMPS_MUSCLE.map((x) => [x, str(m[x])])), ...base });
    sorte = 'muscle';
  } else if (it.molecule != null) {
    const m = it.molecule;
    if (typeof m !== 'object' || Array.isArray(m)) return { erreur: 'molecule : objet { nom, smiles } attendu' };
    const k = sansCommentaires(m).find((x) => !['nom', 'smiles', 'sens', 'molfile', 'formule', 'comparaison', 'biblio'].includes(x));
    if (k) return { erreur: `molecule.${k} : champ inconnu (attendus : nom, smiles, sens, molfile, formule)` };
    if (m.molfile != null && !estTexte(m.molfile)) return { erreur: 'molecule.molfile : texte (molfile V2000) attendu' };
    if (!estTexte(m.smiles)) return { erreur: 'champ « molecule.smiles » manquant' };
    const nom = str(m.nom) || str(it.recto);
    if (!nom) return { erreur: 'champ « molecule.nom » (ou « recto ») manquant' };
    const sens = m.sens == null ? 'nom-molecule' : String(m.sens);
    if (!SENS.some((s) => s.id === sens)) return { erreur: `molecule.sens « ${sens} » : nom-molecule ou molecule-nom` };
    let mol;
    try {
      const OCL = await chimie.charger();
      const lu = chimie.lire(OCL, { smiles: str(m.smiles) });
      if (!lu.getAllAtoms()) throw new Error('vide');
      mol = chimie.exporter(OCL, lu);
    } catch (e) { return { erreur: `molecule.smiles « ${str(m.smiles)} » : SMILES illisible` }; }
    // (26/10) export complet : le dessin d'origine (molfile, coordonnées comprises) est gardé tel quel
    if (estTexte(m.molfile)) mol = { smiles: str(m.smiles), molfile: m.molfile, formule: estTexte(m.formule) ? str(m.formule) : mol.formule };
    carte = carteMolecule({ nom, smiles: mol.smiles, molfile: mol.molfile, formule: mol.formule, sens, ...base,
      ...(estTexte(m.comparaison) ? { comparaison: str(m.comparaison) } : {}), ...(m.biblio != null ? { biblio: m.biblio } : {}) });
    sorte = 'molecule';
  } else if (it.tableau != null) {
    const r = normaliserTableau(it.tableau);
    if (!r.ok) return { erreur: r.raison };
    if (!estTexte(it.recto)) return { erreur: 'champ « recto » (titre du tableau) manquant' };
    carte = carteTableau({ titre: it.recto, colonnes: r.tableau.colonnes, lignes: r.tableau.lignes, masque: r.tableau.masque || null, ...base });
    sorte = 'tableau';
  } else {
    const el = lireElements(it.items);
    if (el.erreur) return { erreur: el.erreur };
    const avecElements = !!(el.items && el.items.length);
    if (!estTexte(it.recto) && !estTexte(it.verso) && !avecElements) return { erreur: 'champs « recto » et « verso » manquants' };
    if (!estTexte(it.recto)) return { erreur: 'champ « recto » manquant' };
    if (!estTexte(it.verso) && !avecElements) return { erreur: 'champ « verso » manquant (ou des « items » à révéler)' };
    if (it.cloze != null && !Array.isArray(it.cloze)) return { erreur: 'champ « cloze » : liste de mots attendue (ou null)' };
    const cloze = (it.cloze || []).map(str).filter(Boolean);
    carte = { type: 'flashcard', theme: base.theme, concept: base.theme, difficulte: base.difficulte, recto: str(it.recto), verso: str(it.verso),
      indice: base.indice || null, a_retenir: base.aRetenir, ...(cloze.length ? { cloze } : {}), ...(avecElements ? { items: el.items } : {}) };
    sorte = cloze.length || /\{\{[^}]+\}\}/.test(it.recto) ? 'trous' : im.image ? 'image' : 'texte';
    if (it.occlusion != null) {
      const o = lireOcclusion(it.occlusion, fichiers);
      if (o.erreur) return { erreur: o.erreur };
      occlusion = o.occlusion;
      sorte = 'occlusion';
    }
  }
  if (estTexte(it.verso_format)) carte.versoFormat = str(it.verso_format);
  if (it.verso_auto === true) carte.versoAuto = true;
  if (it.a_apprendre === true) carte.aApprendre = true;
  if (it.cree_le != null) carte.createdAt = it.cree_le;
  if (Array.isArray(it.tags)) carte.tags = it.tags.map(str).filter(Boolean);
  if (estTexte(it.id)) carte.id = str(it.id);
  const progress = it.progress ? Object.fromEntries(Object.entries(it.progress).filter(([k]) => k !== 'categorie')) : null;
  return { carte, sorte, image: im.image, occlusion, imagesMuscle, progress: progress && Object.keys(progress).length ? progress : null };
}

export const LIBELLES_SORTES = { texte: 'Texte', trous: 'Trous', image: 'Image', occlusion: 'Image à masques', muscle: 'Muscle', molecule: 'Molécule', tableau: 'Tableau' };

/**
 * Analyse un import (texte JSON, ou fichier .json / .zip). Rien n'est écrit.
 * @param {{ texte?: string, fichier?: File, existantes?: Array }} p — existantes : les cartes de la fiche (doublons)
 * @returns {Promise<{ ok: false, erreur } | { ok: true, cartes, erreurs, autres, compte, doublons }>}
 */
export async function analyserImport({ texte = null, fichier = null, existantes = [] }) {
  let fichiers = null;
  if (fichier) {
    if (/\.zip$/i.test(fichier.name || '') || /zip/.test(fichier.type || '')) {
      try { fichiers = await lireZip(fichier); } catch (e) { return { ok: false, erreur: e.message }; }
      const json = [...fichiers.keys()].find((k) => /\.json$/i.test(k) && !k.startsWith('__MACOSX'));
      if (!json) return { ok: false, erreur: 'Le .zip ne contient aucun fichier .json.' };
      texte = await fichiers.get(json).text();
    } else texte = await fichier.text();
  }
  const p = parseLooseJson(texte || '');
  if (!p.ok) return { ok: false, erreur: p.error };
  const d = p.data;
  const items = Array.isArray(d) ? d : d && Array.isArray(d.items) ? d.items : d && Array.isArray(d.flashcards) ? d.flashcards : d && typeof d === 'object' && d.type ? [d] : null;
  if (!items) return { ok: false, erreur: 'Aucune liste de cartes : un objet { "items": [ … ] } (ou une liste [ … ]) est attendu.' };
  if (!items.length) return { ok: false, erreur: 'La liste « items » est vide.' };
  const lignes = lignesDesItems(texte);
  let chimieMod = null;
  const chimie = {
    charger: async () => { chimieMod = chimieMod || await import('../molecule/chimie.js'); return chimieMod.chargerOCL(); },
    lire: (...a) => chimieMod.lire(...a), exporter: (...a) => chimieMod.exporter(...a),
  };
  const deja = new Set((existantes || []).filter((q) => q.type === 'flashcard').map((q) => normRecto(q.recto)));
  const cartes = [], erreurs = [], autres = [];
  const compte = { texte: 0, trous: 0, image: 0, occlusion: 0, muscle: 0, molecule: 0, tableau: 0 };
  for (let i = 0; i < items.length; i++) {
    const r = await lireCarte(items[i], fichiers, chimie);
    const ou = { index: i + 1, ligne: lignes[i] || null };
    if (r.erreur) { erreurs.push({ ...ou, message: r.erreur }); continue; }
    if (r.autre) { autres.push({ ...ou, type: r.autre }); continue; }
    const cle = normRecto(r.carte.recto);
    const doublon = deja.has(cle);
    deja.add(cle);
    cartes.push({ ...ou, carte: r.carte, sorte: r.sorte, image: r.image, occlusion: r.occlusion, imagesMuscle: r.imagesMuscle, progress: r.progress, doublon });
    compte[r.sorte]++;
  }
  return { ok: true, cartes, erreurs, autres, compte, doublons: cartes.filter((c) => c.doublon).length, avecProgression: cartes.filter((c) => c.progress).length };
}

/**
 * Importe les cartes analysées dans la fiche (aucune s'il reste une erreur).
 * `doublons` : 'ignorer' | 'importer'. `progression` (26/10) : reprendre le bloc `progress` des cartes qui en ont un
 * (dates, J, FSRS, historique) au lieu de les faire partir de `startDate` comme des cartes neuves. Rend { count, ignores }.
 */
export async function importerCartes({ ficheId, analyse, startDate, doublons = 'ignorer', progression = false }) {
  if (!analyse || !analyse.ok || analyse.erreurs.length) throw new Error('Corrige les erreurs avant d’importer.');
  const garder = analyse.cartes.filter((c) => doublons === 'importer' || !c.doublon);
  const items = [];
  const progres = new Map(); // item → bloc progress
  // une image partagée par plusieurs cartes (même fichier du .zip) n'est écrite qu'une fois
  const ecrites = new Map();
  const ecrire = async (im) => {
    if (im.nom && ecrites.has(im.nom)) return ecrites.get(im.nom);
    const id = await putBlob(im.blob);
    if (im.nom) ecrites.set(im.nom, id);
    return id;
  };
  for (const c of garder) {
    let carte = { ...c.carte };
    if (c.sorte === 'muscle') {
      const images = {};
      for (const [ligne, im] of Object.entries(c.imagesMuscle || {})) images[ligne] = { imageId: await ecrire(im), ...(im.masques ? { masques: im.masques } : {}) };
      const imageGenerale = c.image ? { imageId: await ecrire(c.image), auRecto: c.image.place !== 'verso' } : null;
      if (c.image || Object.keys(images).length) {
        // verso reconstruit avec les images (comme une carte faite à la main)
        const m = carteMuscle({ nom: carte.recto, lignes: carte.muscle.lignes, theme: carte.theme || '', indice: carte.indice || '', aRetenir: carte.a_retenir || '', difficulte: carte.difficulte, images, imageGenerale });
        carte = { ...carte, verso: m.verso, muscle: m.muscle };
      }
    } else if (c.occlusion) {
      carte.occlusion = { imageId: await ecrire(c.occlusion), imageW: c.occlusion.imageW, imageH: c.occlusion.imageH, coches: c.occlusion.coches };
    } else if (c.image) {
      carte.imageId = await ecrire(c.image); carte.imagePlace = c.image.place;
    }
    if (progression && c.progress) progres.set(carte, c.progress);
    items.push(carte);
  }
  const decorer = progres.size ? (rec, raw) => avecProgression(rec, progres.get(raw)) : null;
  const r = await appendItemsToFiche({ ficheId, items, startDate, decorer });
  return { count: r.count || 0, ignores: analyse.cartes.length - garder.length + (r.duplicates || 0) };
}

/* la planification d'une carte neuve (newItem : départ, Nouvelle, historique vide) cède la place à celle de l'export */
const PLANIF_NEUVE = ['dueDate', 'j0Date', 'intervalDays', 'capped', 'termine', 'nouvelle', 'historique', 'missed', 'plan', 'cursor'];
function avecProgression(rec, progress) {
  if (!progress) return rec;
  const out = { ...rec };
  for (const k of PLANIF_NEUVE) delete out[k];
  return { ...out, ...progress };
}

/* ---- le format attendu : un exemple COMPLET et commenté (clés « _… »), réimportable tel quel ---- */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
export const EXEMPLE_IMPORT = {
  _commentaire: 'Import de flashcards MedRevise — schéma v1.1 étendu. Les clés qui commencent par « _ » sont des commentaires (ignorés). Un item = une carte ; « type » vaut toujours « flashcard ».',
  items: [
    { _sorte: 'texte', type: 'flashcard', theme: 'Nerfs crâniens', recto: 'Quel nerf innerve le muscle oblique supérieur ?', verso: 'Le nerf trochléaire (IV).', indice: 'Le plus fin des nerfs crâniens', a_retenir: 'SO4 : oblique supérieur → IV' },
    { _sorte: 'trous (cloze)', _aide: 'le recto contient {{…}} ; « cloze » liste les mots masqués', type: 'flashcard', theme: 'Nerfs crâniens', recto: 'Le nerf {{abducens}} innerve le muscle droit latéral.', verso: 'Le nerf abducens (VI) innerve le muscle droit latéral.', cloze: ['abducens'] },
    { _sorte: 'image', _aide: 'image.data = URL de donnée, ou image.fichier = nom d’un fichier joint dans un .zip ; place : recto, verso ou deux', type: 'flashcard', theme: 'Ostéologie', recto: 'Quel os est montré ?', verso: 'La scapula.', image: { data: PIXEL, place: 'recto' } },
    { _sorte: 'texte à éléments', _aide: 'items = éléments du verso, révélés un par un en révision ; masked: true = caché jusqu’au toucher (défaut), false = toujours visible ; verso facultatif (introduction)', type: 'flashcard', theme: 'Physiologie rénale', recto: 'Quelles sont les 4 fonctions du rein ?', verso: 'Quatre grandes fonctions :', items: [{ text: 'Épuration des déchets azotés (urée, créatinine)', masked: true }, { text: 'Équilibre hydro-électrolytique', masked: true }, { text: 'Équilibre acido-basique', masked: false }, { text: 'Fonctions endocrines (EPO, rénine, calcitriol)', masked: true }] },
    { _sorte: 'muscle', _aide: 'recto = nom du muscle ; les 6 champs du tableau Muscle, chacun facultatif (une ligne vide s’affiche « — ») ; verso construit', type: 'flashcard', theme: 'Muscles du bras', recto: 'Biceps brachial', muscle: { origine: 'Chef long : tubercule supra-glénoïdal ; chef court : processus coracoïde', trajet: 'Loge antérieure du bras', insertion: 'Tubérosité radiale', action: 'Flexion du coude, supination', innervation: 'Nerf musculo-cutané (C5–C6)', topographie: 'Loge antérieure du bras, superficiel au brachial' } },
    { _sorte: 'molécule', _aide: 'molecule.smiles (obligatoire), nom, sens : nom-molecule (recto = nom) ou molecule-nom', type: 'flashcard', theme: 'Biochimie', molecule: { nom: 'Éthanol', smiles: 'CCO', sens: 'nom-molecule' } },
    { _sorte: 'tableau', _aide: 'recto = titre ; 2 à 6 colonnes, 1 à 12 lignes ; en révision les cellules se révèlent une par une', type: 'flashcard', theme: 'Myologie', recto: 'Muscles de la fesse — insertions', tableau: { colonnes: ['Muscle', 'Origine', 'Insertion'], lignes: [['Grand glutéal', 'Ilium, sacrum, coccyx', 'Tubérosité glutéale'], ['Moyen glutéal', 'Face glutéale de l’ilium', 'Grand trochanter'], ['Piriforme', 'Face pelvienne du sacrum', 'Bord supérieur du grand trochanter']] } },
    { _sorte: 'tableau (masque choisi)', _aide: 'masque facultatif : cellules = une ligne de booléens par ligne du tableau (true = masquée en révision, false = toujours visible) ; noms = un booléen par colonne (true = nom de colonne masqué) ; sans masque : toutes les cases masquées, noms visibles', type: 'flashcard', theme: 'Myologie', recto: 'Muscles de la fesse — innervation', tableau: { colonnes: ['Muscle', 'Innervation'], lignes: [['Grand glutéal', 'Nerf glutéal inférieur'], ['Moyen glutéal', 'Nerf glutéal supérieur']], masque: { cellules: [[false, true], [false, true]], noms: [false, false] } } },
  ],
};
export const exempleJSON = () => JSON.stringify(EXEMPLE_IMPORT, null, 2);

/** complément du prompt de génération : les types de cartes que l'import accepte en plus */
export const COMPLEMENT_PROMPT = `

---

## TYPES DE FLASHCARDS SUPPLÉMENTAIRES (import du panneau MedRevise)

En plus des flashcards texte et à trous, tu peux produire, dans le même tableau "items" (toujours "type": "flashcard") :
- **Muscle** : "recto" = nom du muscle, "muscle": { "origine", "trajet", "insertion", "action", "innervation", "topographie" } (chaque champ facultatif ; verso construit automatiquement) ;
- **Molécule** : "molecule": { "nom", "smiles", "sens": "nom-molecule" | "molecule-nom" } (SMILES valide obligatoire) ;
- **Tableau** : "recto" = titre, "tableau": { "colonnes": [2 à 6 noms], "lignes": [[…], …] (1 à 12 lignes, autant de cellules que de colonnes), "masque" facultatif : { "cellules": [[true|false, …], …] (une ligne de booléens par ligne ; true = case masquée en révision, false = toujours visible), "noms": [true|false, …] (true = nom de colonne masqué) } — sans "masque", toutes les cases sont masquées et les noms de colonnes visibles } ;
- **Texte à éléments** : "items": [{ "text": "…", "masked": true }, …] — la réponse découpée en éléments révélés un par un ("masked": false = toujours visible) ; "verso" devient facultatif (introduction) ;
- **Image** (facultative sur une carte texte) : "image": { "data": "data:image/png;base64,…", "place": "recto" | "verso" | "deux" }.
Aucun autre champ. Exemple complet :

\`\`\`json
${JSON.stringify(EXEMPLE_IMPORT, null, 2)}
\`\`\``;
