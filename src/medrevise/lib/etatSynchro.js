/* ============================================================
   MedRevise — ÉTAT DE SYNCHRO UNIQUE (07/11/2026, docs/compte-rendu-sauvegarde-et-statut-synchro.md).

   LE DÉFAUT CORRIGÉ. Quatre calculs indépendants disaient chacun « où en est la synchro » :
   - l'en-tête (porte, lib/synchroAffichage.js) : empreintes des enregistrements + file d'envoi, SANS les fichiers ;
   - Réglages « Synchronisation » (syncStatusLabel) : le dernier `syncNow`, jamais mis à jour par la passe rapide →
     « Pas encore synchronisé cette session » juste après un rafraîchissement réussi ;
   - Réglages, indicateur (SyncIndicator) : enregistrements + file + FICHIERS, calculé à part, à un autre moment ;
   - le journal des révisions (SynchroJournal).
   D'où « À jour » en haut et « Pas à jour — 19 éléments » dans Réglages, au même instant.

   DÉSORMAIS. UNE liste des éléments en attente (`collecterEnAttente`) et UN calcul (`calculerEtatSynchro`), lus par
   l'en-tête (ordinateur, tablette, téléphone) ET par Réglages (ligne « N en attente » dépliable). Règle :
   « À jour » SEULEMENT si la dernière passe a été confirmée par le serveur (porte « ajour ») ET si la liste,
   recalculée APRÈS cette passe, est vide. Sinon « N en attente », ou l'erreur réelle (hors ligne / échec).

   STRICTEMENT EN LECTURE : rien n'est retiré d'aucune file, rien n'est marqué envoyé, aucune écriture IndexedDB ni
   cloud. Les seuls appels réseau sont la liste du bucket des fichiers (etatBlobs), après une passe.
   ============================================================ */
import { outboxEntries, blobOutboxEntries, dernierEchecEnvoi } from '../data/sync.js';
import { etatBlobs, getOne } from './storage.js';
import { fileEnvoiLecture } from '../journal/journal.js';
import { libelleBandeau, heureCourte } from './synchroAffichage.js';

const NOMS_STORES = {
  sources: 'Source', matieres: 'Matière', dossiers: 'Dossier', fiches: 'Fiche', questions: 'Carte', structures: 'Structure',
  highlights: 'Surlignage', annotations: 'Annotation', stats: 'Statistiques', exos: 'Exercices', docs: 'Document',
  anatstruct: 'Anatomie', sessionsLog: 'Séance', prompts: 'Consigne', apprentissage: 'Apprentissage', notes: 'Note',
  tableau: 'Tableau', liaison: 'Liaison', dessins: 'Dessin', reading_position: 'Position de lecture', notes_doc: 'Note de document',
  learning_set: 'Série d’apprentissage', companion_pdf: 'PDF associé', board: 'Tableau blanc', page_tag: 'Étiquette de page',
  transcript_session: 'Transcription', ocr_layer: 'Texte reconnu (OCR)',
};
export const nomStore = (s) => NOMS_STORES[s] || s || 'Élément';

const nettoyer = (v, n = 70) => String(v == null ? '' : v).replace(/<[^>]+>/g, ' ').replace(/[*_#>`$\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
/** titre lisible d'un enregistrement (champ le plus parlant), sinon son id */
export function titreLisible(data, id) {
  const d = data && typeof data === 'object' ? data : {};
  const t = d.titre || d.title || d.nom || d.name || d.recto || d.question || d.consigne || d.concept || d.texte || d.pdfName || d.htmlName;
  return nettoyer(t) || String(id || '—');
}

/** raison lisible du dernier échec d'envoi des enregistrements */
function raisonEnvoi(e) {
  if (!e) return 'pas encore envoyé (envoi au prochain passage)';
  if (e.erreur === 'reseau') return 'pas de réseau au dernier essai';
  return 'refusé par le serveur' + (e.message ? ' : ' + nettoyer(e.message, 90) : '');
}

/* ---- la liste : un module, un état, des abonnés ---- */
let etat = null; // { elements, le, partiel } — le = ISO de la fin de la collecte
let partCloud = { aEnvoyer: [], introuvables: [], proprietaires: new Map() }; // dernière lecture du bucket
const abonnes = new Set();
export function surEnAttente(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
export const enAttenteActuel = () => etat;
let enVol = null; let rejouer = null;

/**
 * Liste de TOUT ce qui n'est pas encore au cloud depuis cet appareil.
 * @param {{ avecCloud?: boolean }} o — avecCloud : relit la liste du bucket (fichiers absents du cloud) ;
 *   sinon on réutilise la dernière lecture (les files locales, elles, sont toujours relues).
 * @returns {Promise<{ elements: object[], le: string }>}
 */
export function collecterEnAttente({ avecCloud = false } = {}) {
  if (enVol) { rejouer = { avecCloud: avecCloud || (rejouer && rejouer.avecCloud) }; return enVol; }
  enVol = (async () => {
    const elements = [];
    // 1. enregistrements (file `medrevise-outbox`)
    const echec = dernierEchecEnvoi();
    for (const [, v] of await outboxEntries()) {
      if (!v) continue;
      elements.push({
        cle: 'r:' + v.store + ':' + v.record_id, type: 'enregistrement', genre: nomStore(v.store), store: v.store, id: v.record_id,
        titre: v.deleted ? 'suppression de « ' + titreLisible(v.data, v.record_id) + ' »' : titreLisible(v.data, v.record_id),
        depuis: v.updated_at || null, raison: raisonEnvoi(echec),
      });
    }
    // 2. réponses du journal des révisions (file `medrevise-review_log_outbox`)
    const NOTES = { 1: 'À revoir', 2: 'Difficile', 3: 'Correct', 4: 'Facile' };
    for (const j of await fileEnvoiLecture()) {
      const carte = j.carte ? await getOne('questions', j.carte).catch(() => null) : null;
      const titre = (carte ? '« ' + titreLisible(carte, j.carte) + ' »' : 'réponse à une carte') + (NOTES[j.note] ? ' · ' + NOTES[j.note] : '');
      elements.push({
        cle: 'j:' + j.id, type: 'revision', genre: 'Révision', id: j.id, titre,
        depuis: j.depuis || null, raison: j.orpheline ? 'entrée de journal absente de cet appareil (ignorée à l’envoi)' : 'pas encore envoyée (envoi au prochain passage)',
      });
    }
    // 3. fichiers : file d'envoi (`medrevise-blob-outbox`), puis absents du cloud (lecture du bucket)
    if (avecCloud) {
      const b = await etatBlobs().catch(() => null);
      if (b) partCloud = { aEnvoyer: b.aEnvoyer || [], introuvables: b.introuvablesDetail || [], proprietaires: b.proprietaires || new Map() };
    }
    const prop = (id) => partCloud.proprietaires.get(id) || null;
    const nomFichier = (id) => { const p = prop(id); return p ? [p.pdfName || p.htmlName, p.titre].filter(Boolean).join(' · ') || 'fichier de ' + nomStore(p.store) : 'fichier ' + id; };
    const enFile = new Set();
    for (const f of await blobOutboxEntries()) {
      enFile.add(f.id);
      elements.push({
        cle: 'b:' + f.id, type: 'fichier', genre: 'Fichier', id: f.id, titre: nomFichier(f.id), depuis: f.queuedAt || null,
        raison: f.bloque ? 'refusé par le cloud (trop volumineux) — réessayé seulement par « Forcer la synchro »'
          : f.lastError ? 'dernier essai échoué : ' + nettoyer(f.lastError, 80) : 'envoi en cours',
      });
    }
    for (const id of partCloud.aEnvoyer) if (!enFile.has(id)) elements.push({ cle: 'b:' + id, type: 'fichier', genre: 'Fichier', id, titre: nomFichier(id), depuis: null, raison: 'présent ici, absent du cloud : remis en file au prochain passage' });
    for (const d of partCloud.introuvables) if (!enFile.has(d.id)) {
      elements.push({
        cle: 'b:' + d.id, type: 'fichier', genre: 'Fichier', id: d.id, titre: [d.pdfName || d.htmlName, d.titre].filter(Boolean).join(' · ') || 'fichier de ' + nomStore(d.store),
        depuis: null, raison: 'ni sur cet appareil ni au cloud : à renvoyer depuis l’appareil qui l’a importé',
      });
    }
    elements.sort((a, b) => String(a.depuis || '9').localeCompare(String(b.depuis || '9')));
    etat = { elements, le: new Date().toISOString() };
    abonnes.forEach((fn) => { try { fn(etat); } catch (e) { /* écran démonté */ } });
    return etat;
  })().finally(() => {
    enVol = null;
    if (rejouer) { const r = rejouer; rejouer = null; collecterEnAttente(r); }
  });
  return enVol;
}

/**
 * LE calcul de l'état affiché (en-tête ET Réglages). Fonction pure.
 * @param porte  état de la porte de synchro ({ phase, at, depuis, progression })
 * @param liste  résultat de collecterEnAttente ({ elements, le }) ou null
 * @returns {{ code: 'local'|'attente'|'ajour'|'enattente'|'horsligne'|'echec'|'incomplet', n: number, libelle: string|null, elements: object[] }}
 */
export function calculerEtatSynchro(porte, liste) {
  const phase = (porte && porte.phase) || 'local';
  const elements = (liste && liste.elements) || [];
  const n = elements.length;
  const enPlus = n ? ` · ${n} en attente` : '';
  if (phase === 'local') return { code: 'local', n: 0, libelle: null, elements: [] };
  if (phase === 'attente') return { code: 'attente', n, libelle: libelleBandeau(porte), elements };
  if (phase === 'horsligne' || phase === 'echec' || phase === 'incomplet') return { code: phase, n, libelle: libelleBandeau(porte) + enPlus, elements };
  // phase 'ajour' : le serveur a confirmé la passe. La liste doit avoir été recalculée APRÈS elle.
  if (!liste || !liste.le || (porte.at && liste.le < porte.at)) return { code: 'attente', n, libelle: 'Synchronisation…', elements };
  if (!n) return { code: 'ajour', n: 0, libelle: `À jour · ${heureCourte(porte.at)}`, elements };
  return { code: 'enattente', n, libelle: `${n} en attente`, elements };
}
