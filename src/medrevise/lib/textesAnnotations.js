/* ============================================================
   MedRevise — TEXTES DES BOÎTES : ALLER-RETOUR JSON ET DOUBLE VERSION (10/10,
   docs/compte-rendu-images-surlignage-json.md).

   Les boîtes (kind 'libre') et textes libres (kind 'texte') posés sur les pages ont un
   `id` attribué à la création (genId, storage.js) et jamais recalculé : c'est la clé de
   l'aller-retour. Le fichier exporté ne contient QUE { course, page?, boxes: [{ id, text }] }.

   À l'import, seul le TEXTE d'une boîte change ; sa géométrie, sa couleur, ses flèches,
   sa page et son ordre restent intacts. Deux versions par boîte (champs AJOUTÉS au même
   enregistrement — rien d'existant n'est retiré) :
     textOriginal / contentOriginal : figés au premier import (jamais écrasés par un import) ;
     textAlt / contentAlt          : le texte importé (remplacé à chaque import) ;
     displayVersion                : 'original' | 'alt' — la version affichée.
   `content` reste LE contenu affiché (celui que lisent le rendu, les exports, la synchro
   et les anciens clients) : basculer de version recopie la version choisie dans `content`.
   Fonctions pures, sans écriture : le lecteur (PdfReader) applique le résultat par son
   historique (une seule entrée d'annulation par import ou par bascule).
   ============================================================ */

export const KINDS_TEXTE = new Set(['libre', 'texte']);
export const estBoiteTexte = (a) => !!(a && KINDS_TEXTE.has(a.kind));
export const aDeuxVersions = (a) => !!(a && typeof a.textAlt === 'string' && a.contentAlt);
export const versionAffichee = (a) => (aDeuxVersions(a) && a.displayVersion === 'alt' ? 'alt' : 'original');

/** texte brut d'un contenu TipTap : un paragraphe (ou élément de liste) par ligne */
export function texteDeContenu(content) {
  const lignes = [];
  let courante = '';
  const bloc = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'codeBlock']);
  const marcher = (n) => {
    if (!n) return;
    if (n.type === 'text') { courante += n.text || ''; return; }
    if (n.type === 'hardBreak') { courante += '\n'; return; }
    const enfants = n.content || [];
    if (bloc.has(n.type) && !enfants.some((c) => bloc.has(c.type) || c.type === 'bulletList' || c.type === 'orderedList')) {
      enfants.forEach(marcher);
      lignes.push(courante); courante = '';
      return;
    }
    enfants.forEach(marcher);
  };
  marcher(content);
  if (courante) lignes.push(courante);
  return lignes.join('\n').replace(/\s+$/, '');
}

/** premier nœud texte (ses marques = le style « de base » de la boîte) et premier bloc */
function modeleDe(content) {
  let texte = null, para = null;
  const marcher = (n) => {
    if (!n || texte) return;
    if (!para && (n.type === 'paragraph' || n.type === 'heading')) para = n;
    if (n.type === 'text') { texte = n; return; }
    (n.content || []).forEach(marcher);
  };
  marcher(content);
  return { marks: (texte && texte.marks) || null, para };
}

/** contenu TipTap depuis un texte brut, avec le style de base du contenu `modele`
    (taille, police, couleur du premier mot ; alignement du premier paragraphe) */
export function contenuDepuisTexte(texte, modele) {
  const { marks, para } = modeleDe(modele);
  const type = para && para.type === 'heading' ? 'heading' : 'paragraph';
  const attrs = para && para.attrs ? para.attrs : null;
  const lignes = String(texte == null ? '' : texte).replace(/\r\n?/g, '\n').split('\n');
  return {
    type: 'doc',
    content: lignes.map((l) => ({
      type, ...(attrs ? { attrs: { ...attrs } } : {}),
      ...(l ? { content: [{ type: 'text', text: l, ...(marks && marks.length ? { marks: marks.map((m) => ({ ...m })) } : {}) }] } : {}),
    })),
  };
}

/** boîtes de texte, dans l'ordre de lecture : page affichée, puis haut, puis gauche */
export function boitesOrdonnees(edits, ordrePages) {
  const rang = new Map((ordrePages || []).map((cle, i) => [String(cle), i]));
  return (edits || []).filter(estBoiteTexte)
    .filter((a) => rang.has(String(a.page)))
    .sort((a, b) => (rang.get(String(a.page)) - rang.get(String(b.page))) || ((a.y || 0) - (b.y || 0)) || ((a.x || 0) - (b.x || 0)));
}

/** objet exporté : { course, page?, boxes: [{ id, text }] } — rien d'autre */
export function construireExport({ cours, page = null, boites }) {
  return {
    course: cours || '',
    ...(page != null ? { page } : {}),
    boxes: (boites || []).map((b) => ({ id: b.id, text: texteDeContenu(b.content) })),
  };
}

/** lit le JSON collé ou le fichier : { boxes: [{ id, text }] } (ou directement la liste).
    @returns { boxes } ou { erreur } */
export function lireImport(brut) {
  let j;
  const s = String(brut || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!s) return { erreur: 'Rien à importer : colle le JSON ou choisis un fichier.' };
  try { j = JSON.parse(s); } catch (e) { return { erreur: 'Ce n’est pas du JSON valide (' + (e.message || 'erreur de syntaxe') + ').' }; }
  const liste = Array.isArray(j) ? j : j && Array.isArray(j.boxes) ? j.boxes : null;
  if (!liste) return { erreur: 'JSON inattendu : il faut un objet { "boxes": [ { "id", "text" } ] }.' };
  const boxes = [];
  let invalides = 0;
  for (const e of liste) {
    if (e && typeof e.id === 'string' && typeof e.text === 'string') boxes.push({ id: e.id, text: e.text });
    else invalides++;
  }
  return { boxes, invalides };
}

/** texte comparé à l'import : la version IA si elle existe, sinon le texte affiché */
const texteDeReference = (a) => (aDeuxVersions(a) ? a.textAlt : texteDeContenu(a.content));
const memeTexte = (x, y) => String(x).replace(/\r\n?/g, '\n').replace(/\s+$/, '') === String(y).replace(/\r\n?/g, '\n').replace(/\s+$/, '');

/** Plan d'import (sans rien écrire) : pour chaque entrée, la boîte retrouvée par id reçoit
    le texte en version IA (affichée). @returns { maj: [{ avant, apres }], inconnus: [id], inchanges, doublons } */
export function planImport(boxes, edits) {
  const parId = new Map((edits || []).filter(estBoiteTexte).map((a) => [a.id, a]));
  const vus = new Set();
  const maj = [], inconnus = [];
  let inchanges = 0, doublons = 0;
  for (const { id, text } of boxes || []) {
    if (vus.has(id)) { doublons++; continue; }
    vus.add(id);
    const a = parId.get(id);
    if (!a) { inconnus.push(id); continue; }
    if (memeTexte(text, texteDeReference(a))) { inchanges++; continue; }
    maj.push({ avant: a, apres: avecTexteAlt(a, text) });
  }
  return { maj, inconnus, inchanges, doublons };
}

/** la boîte avec ce texte comme version IA, affichée. L'original est figé au PREMIER import
    (le texte affiché à ce moment-là, ou la version originale si la boîte en a déjà une). */
export function avecTexteAlt(a, texte) {
  const premier = !aDeuxVersions(a);
  const contentOriginal = premier ? (a.content || { type: 'doc', content: [{ type: 'paragraph' }] }) : a.contentOriginal;
  const textOriginal = premier ? texteDeContenu(contentOriginal) : a.textOriginal;
  const contentAlt = contenuDepuisTexte(texte, contentOriginal);
  return { ...a, textOriginal, contentOriginal, textAlt: String(texte), contentAlt, displayVersion: 'alt', content: contentAlt };
}

/** la boîte affichée dans une version ('original' | 'alt') ; null si rien ne change */
export function basculerVersion(a, version) {
  if (!aDeuxVersions(a) || versionAffichee(a) === version) return null;
  return { ...a, displayVersion: version, content: version === 'alt' ? a.contentAlt : a.contentOriginal };
}

/** édition à la main de la version AFFICHÉE : `content` change, la version affichée suit */
export function avecContenuEdite(a, json) {
  if (!aDeuxVersions(a)) return { ...a, content: json };
  return versionAffichee(a) === 'alt'
    ? { ...a, content: json, contentAlt: json, textAlt: texteDeContenu(json) }
    : { ...a, content: json, contentOriginal: json, textOriginal: texteDeContenu(json) };
}

/** résumé lisible d'un import */
export function resumeImport({ maj, inconnus, inchanges, doublons }, invalides = 0) {
  const n = maj.length;
  const parts = [`${n} boîte${n > 1 ? 's' : ''} mise${n > 1 ? 's' : ''} à jour`];
  if (inchanges) parts.push(`${inchanges} inchangée${inchanges > 1 ? 's' : ''}`);
  if (inconnus.length) parts.push(`${inconnus.length} id inconnu${inconnus.length > 1 ? 's' : ''} ignoré${inconnus.length > 1 ? 's' : ''}`);
  if (doublons) parts.push(`${doublons} doublon${doublons > 1 ? 's' : ''} ignoré${doublons > 1 ? 's' : ''}`);
  if (invalides) parts.push(`${invalides} entrée${invalides > 1 ? 's' : ''} illisible${invalides > 1 ? 's' : ''}`);
  return parts.join(', ');
}
