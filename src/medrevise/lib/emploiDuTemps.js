/* ============================================================
   MedRevise — emploi du temps HELHa (17/10, docs/compte-rendu-emploi-du-temps.md).

   Source : /api/timetable (lien iCal Hyperplanning lu CÔTÉ SERVEUR, jamais ici).
   Ce module ne fait AUCUNE écriture Supabase ni IndexedDB : l'emploi du temps vit
   dans un cache LOCAL (localStorage, cet appareil seulement) pour un affichage
   instantané et hors ligne. Seuls les réglages (couleur / matière reliée par cours)
   sont un enregistrement synchronisé, à part (lib/edtCouleurs.js).

   - rafraîchi à l'ouverture de l'app, puis toutes les 15 min, au retour du réseau
     et quand l'onglet redevient visible après 15 min ;
   - changements (horaire, salle, annulation, cours retiré ou ajouté) détectés sur
     les 7 prochains jours en comparant la nouvelle version au cache ;
   - heures et jours toujours ceux de Europe/Brussels (api/_lib/heures.js), quel
     que soit le fuseau de l'appareil.
   Aucun lien avec les J ni FSRS : rien ici ne lit ni n'écrit une carte.
   ============================================================ */
import { useSyncExternalStore } from 'react';
import { mural, muralEnUtc, lundiDe, plusJours } from '../../../api/_lib/heures.js';

export { mural, lundiDe, plusJours };

const CLE_CACHE = 'medrevise.edt.cache.v1';
const CLE_CHANGEMENTS = 'medrevise.edt.changements.v1';
const CLE_MODE = 'medrevise.accueil.calendrier';
const PERIODE_MS = 15 * 60 * 1000;
const JOUR_MS = 24 * 3600 * 1000;

const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; } };
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* quota / navigation privée */ } };

/* ---------- état partagé ---------- */
let etat = {
  statut: 'init', // 'init' | 'ok' | 'non_configure' | 'erreur' | 'hors_ligne'
  donnees: lire(CLE_CACHE, null), // { events, from, to, generatedAt, recuLe }
  changements: lire(CLE_CHANGEMENTS, []),
  message: '',
  enCours: false,
  forceLimite: false,
};
const abonnes = new Set();
function publier(maj) { etat = { ...etat, ...maj }; abonnes.forEach((f) => f()); }
const abonner = (f) => { abonnes.add(f); return () => abonnes.delete(f); };
export const lireEtat = () => etat;
export function useEmploiDuTemps() { return useSyncExternalStore(abonner, lireEtat, lireEtat); }

/* ---------- mode du calendrier de l'Accueil (« Mes J » | « École »), par appareil ---------- */
const abonnesMode = new Set();
export const lireMode = () => (lire(CLE_MODE, 'j') === 'ecole' ? 'ecole' : 'j');
export function ecrireMode(m) { ecrire(CLE_MODE, m === 'ecole' ? 'ecole' : 'j'); abonnesMode.forEach((f) => f()); }
export function useModeCalendrier() {
  const mode = useSyncExternalStore((f) => { abonnesMode.add(f); return () => abonnesMode.delete(f); }, lireMode, lireMode);
  return [mode, ecrireMode];
}

/* ---------- changements ---------- */
const CHAMPS = ['start', 'end', 'room', 'campus', 'modality', 'cancelled'];
const instantane = (e) => (e ? { start: e.start, end: e.end, room: e.room || '', campus: e.campus || '', modality: e.modality, cancelled: !!e.cancelled, title: e.title, teacher: e.teacher || '' } : null);
const differe = (a, b) => CHAMPS.some((k) => (a[k] || '') !== (b[k] || ''));
const memeJour = (a, b) => { const x = mural(Date.parse(a)); const y = mural(Date.parse(b)); return x.y === y.y && x.mo === y.mo && x.d === y.d; };
const titreNorm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** différences entre deux versions sur [maintenant, maintenant + 7 j] */
export function detecterChangements(ancien, nouveau, maintenant = Date.now()) {
  if (!ancien || !Array.isArray(ancien.events) || !nouveau) return [];
  const horizon = maintenant + 7 * JOUR_MS;
  const dans = (e) => Date.parse(e.end) > maintenant && Date.parse(e.start) < horizon;
  // l'ancienne version doit couvrir la fenêtre, sinon un cours « apparaît » à tort
  const couvre = (v) => !v.from || !v.to || (Date.parse(v.from) <= maintenant && Date.parse(v.to) >= horizon);
  if (!couvre(ancien)) return [];
  const A = new Map(ancien.events.map((e) => [e.uid, e]));
  const N = new Map(nouveau.events.map((e) => [e.uid, e]));
  const sortie = []; const retires = []; const ajoutes = [];
  for (const a of ancien.events) {
    if (!dans(a)) continue;
    const n = N.get(a.uid);
    if (!n) retires.push(a);
    else if (differe(a, n)) sortie.push({ uid: a.uid, avant: instantane(a), apres: instantane(n) });
  }
  for (const n of nouveau.events) if (dans(n) && !A.has(n.uid)) ajoutes.push(n);
  // cours « déplacé » sous un autre identifiant : retiré + ajouté, même intitulé, même jour
  for (const r of retires) {
    const i = ajoutes.findIndex((n) => titreNorm(n.title) === titreNorm(r.title) && memeJour(n.start, r.start));
    if (i >= 0) { const [n] = ajoutes.splice(i, 1); sortie.push({ uid: r.uid, avant: instantane(r), apres: instantane(n) }); }
    else sortie.push({ uid: r.uid, avant: instantane(r), apres: null });
  }
  for (const n of ajoutes) sortie.push({ uid: n.uid, avant: null, apres: instantane(n) });
  return sortie;
}

/** fusionne les nouveaux changements dans la liste gardée (même cours : on garde le tout premier
    « avant »), retire ceux revenus à l'identique et ceux qui sont passés */
export function fusionnerChangements(liste, nouveaux, maintenant = Date.now()) {
  const parUid = new Map((liste || []).map((c) => [c.uid, c]));
  for (const c of nouveaux) {
    const deja = parUid.get(c.uid);
    const avant = deja ? deja.avant : c.avant;
    if (avant && c.apres && !differe(avant, c.apres)) { parUid.delete(c.uid); continue; }
    parUid.set(c.uid, { uid: c.uid, avant, apres: c.apres, detecteLe: new Date(maintenant).toISOString(), vu: false });
  }
  const jour0 = debutJour(maintenant);
  return [...parUid.values()]
    .filter((c) => Date.parse((c.apres || c.avant).end) > jour0 && Date.parse((c.apres || c.avant).start) < maintenant + 7 * JOUR_MS)
    .sort((a, b) => ((a.apres || a.avant).start < (b.apres || b.avant).start ? -1 : 1));
}
export function changementsVisibles(maintenant = Date.now()) { return fusionnerChangements(etat.changements, [], maintenant); }
export function marquerChangementsVus() {
  const liste = etat.changements.map((c) => ({ ...c, vu: true }));
  ecrire(CLE_CHANGEMENTS, liste);
  publier({ changements: liste });
}

/* ---------- lecture du serveur ---------- */
let enVol = null;
export function rafraichir({ force = false } = {}) {
  if (enVol) return enVol;
  publier({ enCours: true });
  enVol = (async () => {
    let r; let json = null;
    try {
      r = await fetch('/api/timetable' + (force ? '?force=1' : ''), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store',
      });
      try { json = await r.json(); } catch { json = null; }
    } catch {
      publier({ statut: 'hors_ligne', message: 'Hors ligne : dernier emploi du temps connu.', enCours: false });
      return etat;
    }
    if (r.status === 503 && json && json.code === 'not_configured') {
      publier({ statut: 'non_configure', message: 'Emploi du temps non configuré', enCours: false });
      return etat;
    }
    if (!r.ok || !json || !json.ok || !Array.isArray(json.events)) {
      publier({ statut: 'erreur', message: (json && json.message) || `Emploi du temps indisponible (HTTP ${r.status}).`, enCours: false });
      return etat;
    }
    const maintenant = Date.now();
    const donnees = { events: json.events, from: json.from, to: json.to, generatedAt: json.generatedAt, recuLe: new Date(maintenant).toISOString() };
    const nouveaux = detecterChangements(etat.donnees, donnees, maintenant);
    const changements = fusionnerChangements(etat.changements, nouveaux, maintenant);
    ecrire(CLE_CACHE, donnees);
    ecrire(CLE_CHANGEMENTS, changements);
    publier({
      statut: 'ok', donnees, changements, enCours: false, forceLimite: !!json.forceLimite,
      message: json.stale ? (json.avertissement || 'Hyperplanning injoignable : dernière version connue.') : '',
    });
    return etat;
  })().finally(() => { enVol = null; });
  return enVol;
}

/** démarré UNE fois par l'app (MedReviseApp) : ouverture + toutes les 15 min + réseau + visibilité */
let demarre = false;
export function demarrerEmploiDuTemps() {
  if (demarre || typeof window === 'undefined') return () => {};
  demarre = true;
  rafraichir();
  const tic = () => { if (etat.statut !== 'non_configure') rafraichir(); };
  const minuteur = setInterval(tic, PERIODE_MS);
  const enLigne = () => rafraichir();
  const visible = () => {
    if (document.visibilityState !== 'visible') return;
    const d = etat.donnees && Date.parse(etat.donnees.recuLe);
    if (!d || Date.now() - d > PERIODE_MS) tic();
  };
  window.addEventListener('online', enLigne);
  document.addEventListener('visibilitychange', visible);
  return () => { clearInterval(minuteur); window.removeEventListener('online', enLigne); document.removeEventListener('visibilitychange', visible); demarre = false; };
}

/* ---------- calendrier ---------- */
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jourSemaine = (ms) => { const m = mural(ms); return new Date(Date.UTC(m.y, m.mo - 1, m.d)).getUTCDay(); };
export const debutJour = (ms) => { const m = mural(ms); return muralEnUtc(m.y, m.mo, m.d); };
export const hm = (iso) => { const m = mural(typeof iso === 'number' ? iso : Date.parse(iso)); return `${String(m.h).padStart(2, '0')}:${String(m.mi).padStart(2, '0')}`; };
export const dateCourte = (ms) => { const m = mural(ms); return `${m.d} ${MOIS[m.mo - 1]}`; };
export const nomJour = (ms, long = false) => (long ? JOURS_LONGS : JOURS)[jourSemaine(ms)];

/** les 7 jours (lundi → dimanche) de la semaine `decalage` (0 = celle d'aujourd'hui) */
export function semaineEcole(events, decalage = 0, maintenant = Date.now()) {
  const lundi = plusJours(lundiDe(maintenant), 7 * decalage);
  const aujourdhui = debutJour(maintenant);
  const jours = [];
  for (let i = 0; i < 7; i++) {
    const debut = plusJours(lundi, i);
    const fin = plusJours(lundi, i + 1);
    const cours = (events || []).filter((e) => Date.parse(e.start) < fin && Date.parse(e.end) > debut);
    jours.push({ debut, fin, dow: JOURS[(i + 1) % 7].replace('.', ''), num: mural(debut).d, isToday: debut === aujourdhui, isPast: fin <= aujourdhui, cours });
  }
  return { lundi, dimanche: plusJours(lundi, 6), jours };
}

/** le cours en cours, sinon le prochain (jamais un cours annulé) */
export function coursEnAvant(events, maintenant = Date.now()) {
  const valides = (events || []).filter((e) => !e.cancelled && !e.allDay);
  const enCours = valides.find((e) => Date.parse(e.start) <= maintenant && Date.parse(e.end) > maintenant);
  if (enCours) return { cours: enCours, enCours: true };
  const prochain = valides.find((e) => Date.parse(e.start) > maintenant);
  return prochain ? { cours: prochain, enCours: false } : null;
}
export const estEnCours = (e, maintenant = Date.now()) => !e.cancelled && Date.parse(e.start) <= maintenant && Date.parse(e.end) > maintenant;

/** « Dans 25 min » · « À 13:45 » · « Demain 08:30 » · « Lundi 26 oct. · 08:30 » · « En cours · jusqu'à 10:30 » */
export function quandLibelle(avant, maintenant = Date.now()) {
  const { cours, enCours } = avant;
  if (enCours) return `En cours · jusqu’à ${hm(cours.end)}`;
  const debut = Date.parse(cours.start);
  const min = Math.round((debut - maintenant) / 60000);
  if (min < 60) return `Dans ${Math.max(1, min)} min`;
  const j = Math.round((debutJour(debut) - debutJour(maintenant)) / JOUR_MS);
  if (j === 0) return min < 180 ? `Dans ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `À ${hm(debut)}`;
  if (j === 1) return `Demain ${hm(debut)}`;
  const n = nomJour(debut, true);
  return `${n[0].toUpperCase()}${n.slice(1)} ${dateCourte(debut)} · ${hm(debut)}`;
}

/** lieu affiché : « Teams », ou « C02 · Montignies » */
export const lieuDe = (e) => (e.modality === 'teams' ? 'Teams' : [e.room, e.campus].filter(Boolean).join(' · '));

/** rappel « horaires définitifs » : du lundi 00:00 au jeudi 16:00 (Bruxelles) */
export function rappelJeudiVisible(maintenant = Date.now()) {
  const lundi = lundiDe(maintenant);
  return maintenant >= lundi && maintenant < plusJours(lundi, 3) + 16 * 3600 * 1000;
}

/** « il y a 2 h » / « à l'instant » */
export function ilYaCourt(iso, maintenant = Date.now()) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((maintenant - Date.parse(iso)) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}
