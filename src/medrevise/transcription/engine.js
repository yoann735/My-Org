/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : le moteur (une seule session à la fois).

   Singleton HORS de React : la session survit à tout ce qui démonte l'interface
   — changer d'onglet du panneau, replier le panneau, passer en mode focus,
   quitter le lecteur. L'UI s'y abonne (useSyncExternalStore, voir useTranscription.js).

   FLUX
     micro/onglet ──(AudioWorklet, PCM16 16 kHz, blocs 100 ms)──▶ tampon de rejeu
        └──▶ WebSocket Deepgram (jeton temporaire de /api/deepgram-token)
               ◀── Results (interim / is_final) ──▶ segments ──▶ IndexedDB (à chaque final)

   LE TEMPS. Toute l'horloge est en « secondes de cours enregistré » : le nombre
   d'échantillons capturés hors pause ÷ 16 000. Les horodatages Deepgram sont
   relatifs au début de CHAQUE connexion ; `connOffset` (l'instant de cours du
   premier bloc envoyé sur cette connexion) les ramène sur l'horloge du cours.

   RECONNEXION SANS TROU NI DOUBLON. Les blocs audio restent dans un tampon tant
   qu'ils ne sont pas couverts par un segment validé (max 120 s, jamais écrit
   nulle part). À la reconnexion, on renvoie à Deepgram tout l'audio postérieur
   au dernier instant validé (`couvertJusqua`) : ce qui a été dit pendant la
   coupure est transcrit à retardement (pas de trou). Le texte provisoire qui
   était affiché au moment de la coupure est figé en segment « incertain » et
   `couvertJusqua` avance jusqu'à sa fin : ce passage n'est PAS renvoyé (pas de
   doublon). Garde-fou mot à mot : un mot validé qui finit avant `couvertJusqua`
   est écarté (chevauchement d'au plus un bloc à la frontière).

   ARRIÈRE-PLAN. Chrome bride les minuteurs d'un onglet caché (1/s, puis 1/min
   après 5 min) mais PAS le fil audio : le KeepAlive et le chien de garde sont
   donc cadencés par l'arrivée des blocs audio (toutes les 100 ms), pas par
   setInterval. Seul le délai de reconnexion utilise setTimeout (≥ 1 s : peu
   affecté par le bridage de premier niveau).
   ============================================================ */
import { demarrerCapture, SAMPLE_RATE } from './audio.js';
import { parametresKeyterms, termesEnvoyables } from './keyterms.js';
import {
  nouvelleSession, nouvelIdSegment, nouvelIdNote, ecrireSession, viderEcritures, ecrireMotsClesSession,
} from './sessions.js';
import { marquerVivante, pousserMaintenant } from './synchro.js';
import { tarifEffectif, actualiserCredits } from './credits.js';

const DUREE_BLOC = 0.1; // s
const TAMPON_MAX_S = 120;
const KEEPALIVE_MS = 5000;
const BACKOFF_S = [1, 2, 5, 10];
const SILENCE_ALERTE_MS = 5000;
const SEUIL_SON = 0.006; // RMS sous lequel on considère « pas de son »
const MUET_RESEAU_MS = 15000; // aucun message de Deepgram alors qu'on envoie → connexion morte
const ENGORGEMENT_OCTETS = SAMPLE_RATE * 2 * 6; // 6 s d'audio coincées dans le socket…
const ENGORGEMENT_MS = 5000; // …et qui ne diminuent pas en 5 s → connexion morte

export const PARAMS_DEEPGRAM = 'model=nova-3&language=fr&interim_results=true&smart_format=true&punctuate=true'
  + '&utterance_end_ms=1500&vad_events=true&encoding=linear16&sample_rate=16000&channels=1';

const ERREURS_FATALES = new Set(['missing_key', 'invalid_key', 'no_credits', 'forbidden', 'origin', 'method']);

/* ---------------- état observable ---------------- */
const ETAT_INITIAL = {
  phase: 'idle', // idle | starting | live | paused | stopping | error
  conn: 'closed', // closed | connecting | open | reconnecting
  courseId: null,
  session: null,
  interim: null, // { id, text, t0, t1 }
  erreur: null,
  sourceLibelle: null,
  secondes: 0,
  derniereFinie: null, // id de la dernière session terminée (le panneau l'affiche)
};
let etat = ETAT_INITIAL;
const abonnes = new Set();
export const lireEtat = () => etat;
export function abonner(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
function publier(patch) { etat = { ...etat, ...patch }; abonnes.forEach((fn) => fn()); }

/* niveau audio : flux séparé (10/s), pour ne pas re-rendre le panneau à chaque bloc */
let niveau = 0;
let dernierSon = 0;
const abonnesNiveau = new Set();
export function abonnerNiveau(fn) { abonnesNiveau.add(fn); return () => abonnesNiveau.delete(fn); }
export const lireNiveau = () => ({ niveau, silencieux: etat.phase === 'live' && Date.now() - dernierSon > SILENCE_ALERTE_MS });

/* ---------------- variables de session ---------------- */
let capture = null;
let generation = 0; // la capture en service ; les blocs d'une capture remplacée sont ignorés
let ws = null;
let connOffset = 0;
let tampon = []; // [{ t0, pcm }]
let echantillons = 0; // depuis le début de CETTE reprise
let base = 0; // secondes déjà enregistrées avant cette reprise
let couvertJusqua = 0; // instant de cours jusqu'où le texte est acquis (validé ou incertain)
let tentative = 0;
let minuteurReco = null;
let reconnecterA = 0; // échéance de la prochaine tentative (lue aussi par l'horloge audio)
let dernierEnvoi = 0;
let dernierMessage = 0;
let envoisDepuisMessage = 0;
let releveTampon = { t: 0, octets: 0 }; // dernier relevé de ws.bufferedAmount (chien de garde)
let finalizeAttendu = null; // resolve() quand la réponse au Finalize d'arrêt arrive
let fermetureVoulue = false;
let persistee = false;
let jetonPret = null; // jeton obtenu au démarrage, utilisé par la première connexion

const maintenantCours = () => base + echantillons / SAMPLE_RATE;

/* journal de diagnostic en mémoire (60 derniers événements réseau, jamais de jeton) */
const journal = [];
const noter = (m) => { journal.push(new Date().toISOString().slice(11, 23) + ' ' + m); if (journal.length > 60) journal.shift(); };

function enregistrer() {
  if (!etat.session || !persistee) return Promise.resolve();
  return ecrireSession({ ...etat.session, durationS: Math.round(maintenantCours() * 10) / 10 }).catch(() => {});
}

function majSession(fn, { ecrire = true } = {}) {
  publier({ session: fn(etat.session) });
  if (ecrire) enregistrer();
}

/* ---------------- démarrage / reprise ---------------- */
/**
 * @param {object} o
 * @param {string} o.courseId
 * @param {'micro'|'onglet'} o.source
 * @param {string} [o.deviceId]
 * @param {string[]} o.keyterms
 * @param {string} [o.fontSize]
 * @param {object} [o.reprendre] session interrompue à continuer
 */
export async function demarrer({ courseId, source = 'micro', deviceId = null, keyterms = [], fontSize = 'm', reprendre = null }) {
  if (etat.phase !== 'idle' && etat.phase !== 'error') throw new Error('Une transcription est déjà en cours.');
  reinitialiser();
  const session = reprendre
    ? { ...reprendre, endedAt: null, source, keyterms: keyterms.length ? keyterms : (reprendre.keyterms || []) }
    : nouvelleSession({ courseId, source, keyterms, fontSize });
  base = reprendre ? Math.max(reprendre.durationS || 0, ...(reprendre.segments || []).map((s) => s.t1 || 0), ...(reprendre.notes || []).map((n) => n.t || 0)) : 0;
  couvertJusqua = base;
  persistee = !!reprendre;
  marquerVivante(session.id); // pas d'envoi cloud tant qu'elle tourne
  publier({ ...ETAT_INITIAL, phase: 'starting', conn: 'connecting', courseId, session, secondes: Math.floor(base), derniereFinie: etat.derniereFinie });
  /* Jeton demandé AVANT d'ouvrir le micro : une clé absente/invalide ou des crédits
     épuisés s'affichent dans la feuille de démarrage, sans rien lancer. Un simple
     échec réseau, lui, n'empêche pas de démarrer (l'audio attend dans le tampon). */
  const premier = await obtenirJeton();
  noter('jeton initial ' + (premier.ok ? 'ok' : 'échec ' + (premier.code || '')));
  if (!premier.ok && (!premier.reseau || premier.code === 'no_api')) {
    publier({ phase: 'error', conn: 'closed', erreur: premier.message });
    marquerVivante(null);
    return false;
  }
  jetonPret = premier.ok ? premier : null;
  try {
    const gen = ++generation;
    capture = await demarrerCapture({ source, deviceId, onBloc: (d) => { if (gen === generation) onBloc(d); }, onFin: (raison) => { if (gen === generation) echec(raison, { garderSession: true }); } });
  } catch (e) {
    publier({ phase: 'error', conn: 'closed', erreur: (e && e.message) || 'Capture audio impossible.' });
    marquerVivante(null);
    return false;
  }
  dernierSon = Date.now();
  publier({ phase: 'live', sourceLibelle: capture.libelle });
  if (reprendre && (reprendre.segments || []).length) {
    // repère visible de la reprise (onglet rechargé, plantage)
    majSession((s) => ({ ...s, segments: [...s.segments, { id: nouvelIdSegment(), t0: base, t1: base, text: 'Reprise de la session', status: 'gap' }] }));
  }
  connecter();
  return true;
}

function reinitialiser() {
  clearTimeout(minuteurReco); minuteurReco = null; reconnecterA = 0;
  capture = null; ws = null; tampon = []; echantillons = 0; base = 0; couvertJusqua = 0;
  tentative = 0; dernierEnvoi = 0; dernierMessage = 0; envoisDepuisMessage = 0;
  finalizeAttendu = null; fermetureVoulue = false; persistee = false; niveau = 0;
}

/* ---------------- audio ---------------- */
function onBloc({ pcm, rms }) {
  const now = Date.now();
  // reconnexion cadencée AUSSI par l'audio : onglet caché depuis 5 min, Chrome ne
  // réveille plus le setTimeout qu'une fois par minute — les blocs, eux, arrivent.
  if (reconnecterA && now >= reconnecterA) { reconnecterA = 0; connecter(); }
  niveau = Math.min(1, rms * 6);
  if (rms > SEUIL_SON) dernierSon = now;
  abonnesNiveau.forEach((fn) => fn());

  const ouvert = ws && ws.readyState === WebSocket.OPEN;
  if (etat.phase === 'paused' || etat.phase === 'stopping') {
    // horloge du KeepAlive : les blocs continuent d'arriver même onglet caché
    if (ouvert && etat.phase === 'paused' && now - dernierEnvoi >= KEEPALIVE_MS) envoyerJson({ type: 'KeepAlive' });
    return;
  }
  if (etat.phase !== 'live') return;

  const t0 = maintenantCours();
  echantillons += pcm.byteLength / 2;
  tampon.push({ t0, pcm });
  if (ouvert) {
    ws.send(pcm);
    dernierEnvoi = now;
    envoisDepuisMessage++;
    /* chien de garde : wifi coupé sans que TCP le sache encore. Un gros tampon
       d'envoi juste après un REJEU est normal (on vient d'y verser la coupure) :
       il n'est suspect que s'il ne se vide plus du tout pendant 5 s. */
    const octets = ws.bufferedAmount;
    let engorge = false;
    if (now - releveTampon.t >= ENGORGEMENT_MS) {
      engorge = octets > ENGORGEMENT_OCTETS && octets >= releveTampon.octets;
      releveTampon = { t: now, octets };
    }
    if (engorge || (envoisDepuisMessage > 50 && now - dernierMessage > MUET_RESEAU_MS)) couper(engorge ? 'tampon bloqué' : 'aucune réponse depuis 15 s');
  }
  rognerTampon();
  const s = Math.floor(maintenantCours());
  if (s !== etat.secondes) publier({ secondes: s });
}

function rognerTampon() {
  while (tampon.length && tampon[0].t0 + DUREE_BLOC <= couvertJusqua - 0.5) tampon.shift();
  const max = TAMPON_MAX_S / DUREE_BLOC;
  if (tampon.length > max) {
    // coupure trop longue : l'audio le plus ancien est perdu, on le dit dans le transcript
    const perdus = tampon.splice(0, tampon.length - max);
    const debut = Math.max(couvertJusqua, perdus[0].t0);
    const fin = perdus[perdus.length - 1].t0 + DUREE_BLOC;
    if (fin > couvertJusqua) {
      couvertJusqua = fin;
      const derniers = etat.session.segments;
      const dernier = derniers[derniers.length - 1];
      if (dernier && dernier.status === 'gap' && dernier.perte) {
        majSession((ss) => ({ ...ss, segments: ss.segments.map((x) => (x.id === dernier.id ? { ...x, t1: fin } : x)) }), { ecrire: false });
      } else {
        majSession((ss) => ({ ...ss, segments: [...ss.segments, { id: nouvelIdSegment(), t0: debut, t1: fin, text: 'Audio non transcrit (coupure réseau trop longue)', status: 'gap', perte: true }] }), { ecrire: false });
      }
    }
  }
}

/* ---------------- réseau ---------------- */
function envoyerJson(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(obj)); dernierEnvoi = Date.now(); }
}

async function obtenirJeton() {
  let r;
  try {
    r = await fetch('/api/deepgram-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) });
  } catch (e) {
    return { ok: false, reseau: true, message: 'Serveur injoignable (hors ligne ?).' };
  }
  let json = null;
  try { json = await r.json(); } catch (e) { /* page HTML d'erreur, réponse vide */ }
  if (r.ok && json && json.access_token) return { ok: true, ...json };
  if (r.status === 404) return { ok: false, code: 'no_api', message: 'Fonction /api/deepgram-token introuvable sur ce serveur.' };
  const code = json && json.code;
  return { ok: false, code, reseau: !code || !ERREURS_FATALES.has(code), message: (json && json.message) || `Erreur serveur (HTTP ${r.status}).` };
}

let connexionEnCours = false;
async function connecter() {
  if (etat.phase === 'idle' || etat.phase === 'error') return;
  clearTimeout(minuteurReco); minuteurReco = null; reconnecterA = 0;
  if (connexionEnCours) return; // horloge audio et minuteur ont pu tirer ensemble
  connexionEnCours = true;
  try { await connecterUneFois(); } finally { connexionEnCours = false; }
}
async function connecterUneFois() {
  publier({ conn: tentative === 0 && !persistee ? 'connecting' : 'reconnecting' });
  noter('jeton…');
  const jeton = jetonPret || await obtenirJeton();
  jetonPret = null;
  noter('jeton ' + (jeton.ok ? 'ok' : 'échec ' + (jeton.code || '') + ' ' + jeton.message));
  if (etat.phase === 'idle' || etat.phase === 'error' || etat.phase === 'stopping') return;
  if (!jeton.ok) {
    if (!jeton.reseau || jeton.code === 'no_api') { echec(jeton.message, { garderSession: persistee }); return; }
    publier({ erreurReseau: jeton.message });
    programmerReconnexion();
    return;
  }
  const url = (jeton.listen_url || 'wss://api.deepgram.com/v1/listen') + '?' + PARAMS_DEEPGRAM
    + (etat.session.keyterms.length ? '&' + parametresKeyterms(etat.session.keyterms) : '');
  let sock;
  try { sock = new WebSocket(url, ['bearer', jeton.access_token]); } catch (e) { programmerReconnexion(); return; }
  sock.binaryType = 'arraybuffer';
  ws = sock;
  noter('ws ouverture…');
  let ouvert = false;
  sock.onopen = () => {
    if (ws !== sock) return;
    ouvert = true;
    tentative = 0;
    dernierMessage = Date.now(); envoisDepuisMessage = 0;
    releveTampon = { t: Date.now(), octets: 0 };
    if (!persistee) { persistee = true; enregistrer(); }
    // REJEU : tout l'audio pas encore couvert par du texte acquis
    const aRenvoyer = tampon.filter((b) => b.t0 + DUREE_BLOC > couvertJusqua + 1e-6);
    connOffset = aRenvoyer.length ? aRenvoyer[0].t0 : maintenantCours();
    aRenvoyer.forEach((b) => sock.send(b.pcm));
    dernierEnvoi = Date.now();
    publier({ conn: 'open', erreurReseau: null });
    noter(`ws ouvert, rejeu ${aRenvoyer.length} blocs depuis ${couvertJusqua.toFixed(1)} s`);
    if (etat.phase === 'paused') envoyerJson({ type: 'KeepAlive' });
  };
  sock.onmessage = (ev) => { if (ws === sock) recevoir(ev.data); };
  sock.onerror = () => { /* suivi d'un close : traité là */ };
  sock.onclose = (ev) => {
    if (ws !== sock) return;
    ws = null;
    noter(`ws fermé ${ev && ev.code} ${(ev && ev.reason) || ''}`);
    if (fermetureVoulue) return;
    figerProvisoire();
    if (!ouvert && ev && ev.reason && /auth|token|credit|balance|forbidden|unauthor/i.test(ev.reason)) {
      publier({ erreurReseau: 'Deepgram a refusé la connexion : ' + ev.reason });
    }
    if (etat.phase === 'live' || etat.phase === 'paused') programmerReconnexion();
  };
}

function programmerReconnexion() {
  if (etat.phase !== 'live' && etat.phase !== 'paused') return;
  clearTimeout(minuteurReco);
  const delai = BACKOFF_S[Math.min(tentative, BACKOFF_S.length - 1)];
  tentative++;
  noter(`reconnexion dans ${delai} s`);
  publier({ conn: 'reconnecting' });
  reconnecterA = Date.now() + delai * 1000;
  minuteurReco = setTimeout(connecter, delai * 1000);
}

/** Ferme la connexion courante pour en rouvrir une (chien de garde, passage hors ligne). */
function couper(raison = '') {
  const sock = ws;
  if (!sock) return;
  noter('coupure : ' + raison);
  ws = null;
  try { sock.close(4000, 'reconnexion'); } catch (e) { /* déjà fermé */ }
  figerProvisoire();
  programmerReconnexion();
}

/** Texte provisoire au moment d'une coupure → segment « incertain », gardé tel quel. */
function figerProvisoire() {
  const p = etat.interim;
  if (!p || !p.text) return;
  couvertJusqua = Math.max(couvertJusqua, p.t1);
  publier({ interim: null });
  majSession((s) => ({ ...s, segments: [...s.segments, { id: p.id, t0: p.t0, t1: p.t1, text: p.text, status: 'uncertain' }] }));
}

function recevoir(data) {
  dernierMessage = Date.now(); envoisDepuisMessage = 0;
  let msg;
  try { msg = JSON.parse(data); } catch (e) { return; }
  if (msg.type === 'Error' || msg.err_code) {
    publier({ erreurReseau: msg.description || msg.err_msg || 'Erreur Deepgram.' });
    return;
  }
  if (msg.type !== 'Results') return;
  const alt = msg.channel && msg.channel.alternatives && msg.channel.alternatives[0];
  if (!alt) return;
  const t0 = connOffset + (msg.start || 0);
  const t1 = t0 + (msg.duration || 0);
  if (msg.is_final) {
    let texte = (alt.transcript || '').trim();
    let debut = t0;
    const mots = alt.words || [];
    if (mots.length) {
      const gardes = mots.filter((w) => connOffset + (w.end || 0) > couvertJusqua + 0.02);
      if (gardes.length !== mots.length) texte = gardes.map((w) => w.punctuated_word || w.word).join(' ');
      if (gardes.length) debut = connOffset + gardes[0].start;
    } else if (t1 <= couvertJusqua + 0.02) texte = '';
    const fin = Math.max(couvertJusqua, t1);
    couvertJusqua = fin;
    const idProvisoire = etat.interim && etat.interim.id;
    publier({ interim: null });
    if (texte) {
      majSession((s) => ({ ...s, segments: [...s.segments, { id: idProvisoire || nouvelIdSegment(), t0: Math.round(debut * 100) / 100, t1: Math.round(fin * 100) / 100, text: texte, status: 'final' }] }));
    }
    rognerTampon();
    if (msg.from_finalize && finalizeAttendu) finalizeAttendu();
    return;
  }
  const texte = (alt.transcript || '').trim();
  if (!texte || t1 <= couvertJusqua + 0.02) return;
  /* fin du DERNIER MOT reconnu, et non fin de la fenêtre audio (t1) : la fenêtre
     contient souvent le début du mot suivant, encore non reconnu. Si la connexion
     tombe, c'est de là que l'audio sera rejoué — sinon ce mot serait perdu
     (constaté sur Deepgram réel : « La maladie de | [Paget] associe… »). */
  const mots = alt.words || [];
  const finMots = mots.length ? connOffset + (mots[mots.length - 1].end || 0) : t1;
  publier({ interim: { id: (etat.interim && etat.interim.id) || nouvelIdSegment(), text: texte, t0, t1: Math.min(t1, finMots) } });
}

/* ---------------- commandes ---------------- */
export function pause() {
  if (etat.phase !== 'live') return;
  publier({ phase: 'paused' });
  envoyerJson({ type: 'Finalize' }); // valide le texte en cours avant la pause
}
export function reprendreApresPause() {
  if (etat.phase !== 'paused') return;
  dernierSon = Date.now();
  publier({ phase: 'live' });
}

export async function arreter() {
  if (etat.phase !== 'live' && etat.phase !== 'paused' && etat.phase !== 'starting') return;
  publier({ phase: 'stopping' });
  clearTimeout(minuteurReco);
  const sock = ws;
  if (sock && sock.readyState === WebSocket.OPEN) {
    await new Promise((resolve) => {
      const fin = setTimeout(resolve, 3000);
      finalizeAttendu = () => { clearTimeout(fin); resolve(); };
      envoyerJson({ type: 'Finalize' });
    });
    fermetureVoulue = true;
    envoyerJson({ type: 'CloseStream' });
    await new Promise((resolve) => {
      const fin = setTimeout(resolve, 1500);
      sock.addEventListener('close', () => { clearTimeout(fin); resolve(); }, { once: true });
    });
    try { sock.close(1000); } catch (e) { /* déjà fermé */ }
  } else {
    fermetureVoulue = true;
    if (sock) try { sock.close(1000); } catch (e) { /* idem */ }
    const nonEnvoye = tampon.filter((b) => b.t0 + DUREE_BLOC > couvertJusqua + 1e-6);
    if (nonEnvoye.length > 10) {
      const d = nonEnvoye[0].t0, f = nonEnvoye[nonEnvoye.length - 1].t0 + DUREE_BLOC;
      majSession((s) => ({ ...s, segments: [...s.segments, { id: nouvelIdSegment(), t0: d, t1: f, text: 'Audio non transcrit (hors ligne à l’arrêt)', status: 'gap' }] }), { ecrire: false });
    }
  }
  ws = null;
  figerProvisoire();
  if (capture) capture.arreter();
  capture = null;
  tampon = [];
  const duree = Math.round(maintenantCours() * 10) / 10;
  // coût estimé localement : durée × tarif effectif connu (v1.1) — figé dans la session
  const fini = { ...etat.session, endedAt: new Date().toISOString(), durationS: duree, coutUsd: Math.round((duree / 3600) * tarifEffectif() * 1000) / 1000 };
  publier({ session: fini });
  if (persistee || fini.segments.length || fini.notes.length) {
    persistee = true;
    await enregistrer();
    await viderEcritures();
  }
  const id = persistee ? fini.id : null;
  reinitialiser();
  marquerVivante(null);
  publier({ ...ETAT_INITIAL, derniereFinie: id, courseId: fini.courseId });
  // synchro cloud : la session terminée part maintenant (conditionnelle, updated_at)
  if (id) pousserMaintenant(id).catch(() => {});
  actualiserCredits({ force: true }).catch(() => {}); // fin de session : crédits rafraîchis
  return id;
}

function echec(message, { garderSession = true } = {}) {
  clearTimeout(minuteurReco);
  fermetureVoulue = true;
  if (ws) try { ws.close(1000); } catch (e) { /* idem */ }
  ws = null;
  figerProvisoire();
  if (capture) capture.arreter();
  capture = null;
  tampon = [];
  if (garderSession && persistee) enregistrer(); // endedAt reste null : proposée en reprise
  marquerVivante(null);
  publier({ phase: 'error', conn: 'closed', erreur: message, interim: null });
}

/** Ferme l'erreur affichée (retour à l'état de repos). */
export function effacerErreur() {
  if (etat.phase !== 'error') return;
  const courseId = etat.courseId;
  reinitialiser();
  publier({ ...ETAT_INITIAL, courseId, derniereFinie: etat.derniereFinie });
}

export function changerMotsCles(termes) {
  if (!etat.session) return;
  majSession((s) => ({ ...s, keyterms: termes }));
  envoyerJson({ type: 'Configure', keyterms: termesEnvoyables(termes) });
  ecrireMotsClesSession(etat.session.courseId, termes).catch(() => {});
}

export function changerTaille(taille) {
  if (!etat.session) return;
  majSession((s) => ({ ...s, fontSize: taille }));
}

export function ajouterNote() {
  if (!etat.session) return null;
  const note = { id: nouvelIdNote(), t: Math.round(maintenantCours() * 10) / 10, text: '' };
  persistee = true;
  majSession((s) => ({ ...s, notes: [...s.notes, note] }));
  return note.id;
}
export function modifierNote(id, text) {
  if (!etat.session) return;
  majSession((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, text } : n)) }));
}
export function supprimerNote(id) {
  if (!etat.session) return;
  majSession((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));
}

/**
 * BASCULE DE SOURCE À CHAUD (05/10) : la nouvelle capture démarre AVANT l'arrêt de
 * l'ancienne ; la bascule est atomique (compteur `generation`) — l'horloge du cours,
 * le tampon et le WebSocket ne bougent pas, Deepgram reçoit un flux continu.
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function changerSource({ source = 'micro', deviceId = null }) {
  if (!capture || (etat.phase !== 'live' && etat.phase !== 'paused')) return { ok: false, message: 'Aucune session en cours.' };
  const gen = generation + 1;
  let nouvelle;
  try {
    nouvelle = await demarrerCapture({ source, deviceId, onBloc: (d) => { if (gen === generation) onBloc(d); }, onFin: (raison) => { if (gen === generation) echec(raison, { garderSession: true }); } });
  } catch (e) {
    return { ok: false, message: (e && e.message) || 'Source indisponible.' };
  }
  if (!capture) { nouvelle.arreter(); return { ok: false, message: 'La session s’est arrêtée entre-temps.' }; }
  const ancienne = capture;
  generation = gen;
  capture = nouvelle;
  ancienne.arreter();
  dernierSon = Date.now();
  noter('source → ' + nouvelle.libelle);
  publier({ sourceLibelle: nouvelle.libelle });
  majSession((s) => ({ ...s, source }));
  return { ok: true };
}

export const sessionActive = () => etat.phase === 'live' || etat.phase === 'paused' || etat.phase === 'starting' || etat.phase === 'stopping';

/* ---------------- événements de la page ---------------- */
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => { if (ws) couper('hors ligne'); });
  window.addEventListener('online', () => {
    if ((etat.phase === 'live' || etat.phase === 'paused') && !ws) { tentative = 0; connecter(); }
  });
  // fermeture / rechargement : le texte provisoire est sauvé comme « incertain »
  window.addEventListener('pagehide', () => {
    if (!sessionActive() || !etat.session || !persistee) return;
    const p = etat.interim;
    const s = p && p.text ? { ...etat.session, segments: [...etat.session.segments, { id: p.id, t0: p.t0, t1: p.t1, text: p.text, status: 'uncertain' }] } : etat.session;
    ecrireSession({ ...s, durationS: Math.round(maintenantCours() * 10) / 10 }).catch(() => {});
  });
}

/* accès de test (console, banc CDP) — sans effet sur l'app */
if (typeof window !== 'undefined') window.__transcription = { lireEtat, lireNiveau, journal, changerSource };
