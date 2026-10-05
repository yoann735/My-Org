/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : capture audio.

   Sortie : des blocs PCM linear16, mono, 16 kHz, de 100 ms (1 600 échantillons),
   plus le niveau RMS de chaque bloc (VU-mètre, « Pas de son ? »). Rien n'est
   conservé ici : chaque bloc part au moteur (engine.js) qui l'envoie et ne garde
   qu'un court tampon de rejeu, jamais l'audio du cours.

   POURQUOI UN AudioWorklet (et pas ScriptProcessor ni MediaRecorder) :
   - il tourne sur le fil audio, que Chrome NE BRIDE PAS en arrière-plan — les
     minuteurs d'un onglet caché, eux, tombent à 1/s puis 1/min (« intensive
     throttling »). Le moteur s'en sert aussi d'horloge pour le KeepAlive ;
   - MediaRecorder ne sait pas produire du PCM brut.
   Le contexte tourne à la fréquence native (44,1/48 kHz) : on décime nous-mêmes
   vers 16 kHz (moyenne des échantillons de chaque intervalle = passe-bas
   grossier, suffisant pour la parole). Créer un AudioContext à 16 kHz marche
   dans Chrome mais pas partout.
   ============================================================ */

export const SAMPLE_RATE = 16000;
const BLOC = 1600; // 100 ms à 16 kHz

/* Le processeur est écrit en chaîne et chargé par une URL blob : pas de fichier
   séparé à faire suivre par Vite, et aucune dépendance. */
const PROCESSEUR = `
class Pcm16Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = sampleRate / ${SAMPLE_RATE};
    this.acc = 0; this.nAcc = 0; this.pos = 0;
    this.out = new Int16Array(${BLOC}); this.n = 0; this.sq = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const nCanaux = input.length, len = input[0].length;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < nCanaux; c++) s += input[c][i];
      s /= nCanaux;
      this.acc += s; this.nAcc++; this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        let v = this.acc / this.nAcc; this.acc = 0; this.nAcc = 0;
        if (v > 1) v = 1; else if (v < -1) v = -1;
        this.sq += v * v;
        this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.n === ${BLOC}) {
          const buf = this.out.buffer;
          this.port.postMessage({ pcm: buf, rms: Math.sqrt(this.sq / ${BLOC}) }, [buf]);
          this.out = new Int16Array(${BLOC}); this.n = 0; this.sq = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm16-processor', Pcm16Processor);
`;

let urlProcesseur = null;
function processeurURL() {
  if (!urlProcesseur) urlProcesseur = URL.createObjectURL(new Blob([PROCESSEUR], { type: 'application/javascript' }));
  return urlProcesseur;
}

/** Liste des entrées audio. Les libellés ne sont remplis qu'après une première
 *  autorisation du micro : on la demande au besoin (flux aussitôt arrêté). */
export async function listerMicros({ demanderAutorisation = false } = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  let liste = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  if (demanderAutorisation && liste.length && !liste.some((d) => d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      liste = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    } catch (e) { /* refus : on garde la liste anonyme */ }
  }
  return liste.map((d, i) => ({ deviceId: d.deviceId, label: d.label || (d.deviceId === 'default' ? 'Micro par défaut' : `Entrée audio ${i + 1}`) }));
}

/** Erreur lisible pour l'étudiant. */
export class ErreurCapture extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function ouvrirFlux({ source, deviceId }) {
  if (!navigator.mediaDevices) throw new ErreurCapture('Ce navigateur ne donne pas accès au micro (page non sécurisée ?).', 'unsupported');
  if (source === 'onglet') {
    if (!navigator.mediaDevices.getDisplayMedia) throw new ErreurCapture('Ce navigateur ne sait pas capturer le son d’un onglet. Utilise Chrome sur ordinateur, ou la source « Micro ».', 'unsupported');
    let flux;
    try {
      // video: true est OBLIGATOIRE pour getDisplayMedia ; on arrête la piste vidéo aussitôt.
      flux = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        preferCurrentTab: false, selfBrowserSurface: 'exclude', systemAudio: 'include',
      });
    } catch (e) {
      if (e && e.name === 'NotAllowedError') throw new ErreurCapture('Partage annulé.', 'cancelled');
      throw new ErreurCapture('Impossible de capturer l’onglet : ' + ((e && e.message) || 'erreur inconnue'), 'display');
    }
    flux.getVideoTracks().forEach((t) => { t.stop(); flux.removeTrack(t); });
    if (!flux.getAudioTracks().length) {
      throw new ErreurCapture('Aucun son reçu : dans la fenêtre de partage de Chrome, choisis un ONGLET et coche « Partager aussi le son de l’onglet ». Pour Teams/Zoom en application, utilise la source « Micro » (ou un périphérique virtuel comme BlackHole).', 'no_audio');
    }
    return flux;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
        channelCount: 1,
        // un périphérique virtuel (BlackHole) porte un mixage propre : on n'y touche pas
        echoCancellation: false, noiseSuppression: false, autoGainControl: true,
      },
    });
  } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw new ErreurCapture('Accès au micro refusé : autorise-le dans la barre d’adresse de Chrome (icône 🔒).', 'denied');
    if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) throw new ErreurCapture('Micro introuvable : il a peut-être été débranché. Choisis-en un autre.', 'notfound');
    throw new ErreurCapture('Micro indisponible : ' + ((e && e.message) || 'erreur inconnue'), 'mic');
  }
}

/**
 * Démarre la capture. `onBloc({ pcm: ArrayBuffer, rms })` est appelé toutes les
 * 100 ms (fil principal, via MessagePort — délivré aussi onglet caché).
 * `onFin(raison)` : la piste s'est arrêtée toute seule (micro débranché, partage
 * stoppé par la barre de Chrome).
 * @returns {Promise<{ arreter: () => void, libelle: string }>}
 */
export async function demarrerCapture({ source = 'micro', deviceId = null, onBloc, onFin }) {
  const flux = await ouvrirFlux({ source, deviceId });
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC({ latencyHint: 'interactive' });
  let arrete = false;
  try {
    await ctx.audioWorklet.addModule(processeurURL());
    if (ctx.state === 'suspended') await ctx.resume();
  } catch (e) {
    flux.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
    throw new ErreurCapture('Le traitement audio n’a pas pu démarrer : ' + ((e && e.message) || ''), 'worklet');
  }
  const entree = ctx.createMediaStreamSource(flux);
  const noeud = new AudioWorkletNode(ctx, 'pcm16-processor', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
  noeud.port.onmessage = (e) => { if (!arrete) onBloc(e.data); };
  // un gain nul vers la sortie : certains navigateurs ne « tirent » le graphe que s'il aboutit à la destination
  const muet = ctx.createGain(); muet.gain.value = 0;
  entree.connect(noeud); noeud.connect(muet); muet.connect(ctx.destination);

  const piste = flux.getAudioTracks()[0];
  const surFin = () => { if (!arrete && onFin) onFin(source === 'onglet' ? 'Le partage de l’onglet s’est arrêté.' : 'Le micro s’est arrêté (débranché ?).'); };
  piste.addEventListener('ended', surFin);

  return {
    libelle: piste.label || (source === 'onglet' ? 'Onglet Chrome' : 'Micro'),
    arreter() {
      if (arrete) return;
      arrete = true;
      piste.removeEventListener('ended', surFin);
      try { noeud.port.onmessage = null; entree.disconnect(); noeud.disconnect(); muet.disconnect(); } catch (e) { /* déjà déconnecté */ }
      flux.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}
