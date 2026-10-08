/* ============================================================
   MedRevise — CARTE « MOLÉCULE » : modèle (08/10, docs/compte-rendu-flashcards-molecules.md).
   Léger (aucune dépendance) : importé partout où l'on doit RECONNAÎTRE une carte Molécule ;
   la chimie (OpenChemLib) et l'éditeur ne se chargent qu'à l'ouverture.

   Une carte Molécule est une flashcard ORDINAIRE (type 'flashcard', mêmes J, même mode
   Apprendre, même synchro) qui porte en plus :
     molecule: { v: 1, nom, smiles, molfile, formule, sens, comparaison, biblio }
       smiles      — SMILES isomérique (stéréo) : la référence chimique ;
       molfile     — le dessin tel que tracé (V2000) : réaffiché à l'identique ;
       sens        — 'nom-molecule' (recto = nom, verso = la reconstruire) | 'molecule-nom' ;
       comparaison — 'constitution' (connectivité seulement, défaut) | 'stereo' (D/L, R/S, cis/trans) ;
       biblio      — id de l'entrée de la bibliothèque d'origine (ou null : dessinée de zéro).
   Recto / verso TEXTE remplis aussi : un appareil pas encore à jour, l'export, le carnet
   d'erreurs ou la recherche montrent une carte lisible. Ajout pur : rien d'existant ne change.
   ============================================================ */
export const estMolecule = (item) => !!(item && item.molecule && typeof item.molecule === 'object' && (item.molecule.smiles || item.molecule.molfile));

export const SENS = [
  { id: 'nom-molecule', label: 'Nom → molécule' },
  { id: 'molecule-nom', label: 'Molécule → nom' },
];
export const NIVEAUX = [
  { id: 'constitution', label: 'Constitution', aide: 'connectivité seulement (D/L, α/β, cis/trans ignorés)' },
  { id: 'stereo', label: 'Stéréo stricte', aide: 'D/L, R/S, α/β et cis/trans comptent' },
];

export function textesCarte({ nom, formule, smiles, sens }) {
  return sens === 'molecule-nom'
    ? { recto: `Quelle est cette molécule ?${formule ? ` (${formule})` : ''}`, verso: nom }
    : { recto: nom, verso: `${nom}${formule ? ` — ${formule}` : ''}${smiles ? ` · SMILES ${smiles}` : ''}` };
}

export function carteMolecule({ nom, smiles, molfile, formule, sens = 'nom-molecule', comparaison = 'constitution', biblio = null, theme = '', indice = '', aRetenir = '', difficulte = 'intermediaire' }) {
  const n = nom.trim();
  const t = textesCarte({ nom: n, formule, smiles, sens });
  return {
    type: 'flashcard', theme: theme.trim(), concept: theme.trim(), difficulte,
    recto: t.recto, verso: t.verso,
    indice: indice.trim() || null, a_retenir: aRetenir.trim(), cloze: [],
    imageId: null, imagePlace: null,
    molecule: { v: 1, nom: n, smiles, molfile, formule, sens, comparaison, biblio },
  };
}

/** texte structuré (copie / export) */
export const texteMolecule = (item) => {
  const m = item.molecule || {};
  return `${m.nom || item.recto}\nFormule brute : ${m.formule || '—'}\nSMILES : ${m.smiles || '—'}`;
};
