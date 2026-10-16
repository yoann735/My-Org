/* ============================================================
   MedRevise — CARNET D'ERREURS : PUCES « Type d'erreur » (16/10, docs/compte-rendu-fichiers-cours.md).
   Une puce = un libellé + un GABARIT qui pré-remplit « Ce que j'ai confondu » (les « ___ » sont
   à compléter). Liste par défaut ci-dessous ; la liste éditée vit dans le store `prompts`
   (enregistrement `carnetPuces`, lib/storage.js) et se modifie dans Réglages › Carnet d'erreurs.
   Les entrées existantes ne changent pas : les champs `carnetType` et `carnetAstuce` sont
   AJOUTÉS aux nouvelles entrées seulement (la note reste dans `carnetRaison`).
   ============================================================ */
export const TROU = '___';
export const PUCES_DEFAUT = [
  { id: 'lateral', label: 'Inversion latéral/médial', gabarit: 'J’ai inversé latéral et médial : j’ai dit ___ au lieu de ___' },
  { id: 'origine', label: 'Confusion origine/insertion', gabarit: 'J’ai donné l’insertion (___) au lieu de l’origine (___)' },
  { id: 'oubli', label: 'Oubli d’un élément de liste', gabarit: 'J’ai oublié ___ dans la liste de ___' },
  { id: 'orthographe', label: 'Terme mal orthographié', gabarit: 'J’ai écrit ___ au lieu de ___' },
  { id: 'innervation', label: 'Mauvaise innervation', gabarit: 'J’ai dit innervé par ___ au lieu de ___' },
  { id: 'valeur', label: 'Mauvais chiffre/valeur', gabarit: 'J’ai dit ___ au lieu de ___' },
  { id: 'raisonnement', label: 'Raisonnement', gabarit: 'Mon raisonnement : ___ ; il fallait : ___' },
  { id: 'autre', label: 'Autre', gabarit: 'J’ai dit ___ au lieu de ___' },
];
/** la liste en vigueur (réglages, sinon défaut) */
export const pucesDe = (rec) => (rec && Array.isArray(rec.puces) && rec.puces.length ? rec.puces : PUCES_DEFAUT);
export const nouvelIdPuce = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const brut = (x) => String(x || '').replace(/<[^>]+>/g, ' ').replace(/\{\{c\d+::([^}:]*)(::[^}]*)?\}\}/g, '$1').replace(/\s+/g, ' ').trim();
const court = (x, n) => (x.length > n ? x.slice(0, n - 1) + '…' : x);
/** suggestion d'astuce depuis une flashcard ratée : reprend recto + verso */
export function suggestionAstuce(carte) {
  if (!carte) return '';
  const r = court(brut(carte.recto || carte.concept || carte.question || ''), 120);
  const v = court(brut(carte.verso || carte.reponse || carte.explication || ''), 160);
  if (!r && !v) return '';
  return r && v ? `Retenir : « ${r} » → ${v}` : `Retenir : ${r || v}`;
}
/** sélectionne le prochain « ___ » d'un champ à partir du curseur (boucle au début) */
export function selectionnerTrou(champ, depuis = 0) {
  if (!champ) return false;
  let i = champ.value.indexOf(TROU, depuis);
  if (i < 0 && depuis > 0) i = champ.value.indexOf(TROU);
  if (i < 0) return false;
  champ.focus(); champ.setSelectionRange(i, i + TROU.length);
  return true;
}
