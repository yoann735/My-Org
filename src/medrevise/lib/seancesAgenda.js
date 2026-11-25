/* ============================================================
   MedRevise — SÉANCES LIÉES À L'AGENDA (26/11, docs/compte-rendu-seances-liees-agenda.md).

   Une séance = le système EXISTANT des tags de page (lib/tagsPages.js) : un tag « Début »
   suivi de la fin la plus proche du même document. Le lien vers un créneau de l'emploi du
   temps est UN CHAMP AJOUTÉ au tag Début, `agenda`, synchronisé avec lui (store `page_tag`,
   medrevise_records, aucune migration) :
     agenda = { cle, uid, uidIcal, titre, date, debut, fin, salle, lieLe }
       - cle     : UID iCal + date/heure de début (« UID|2026-11-17T09:00:00.000Z ») — stable pour un
                   cours répété chaque semaine (chaque semaine a sa propre clé) ;
       - uid     : identifiant de l'occurrence servi par /api/timetable (UID, ou UID@RECURRENCE-ID) ;
       - titre, date ('AAAA-MM-JJ', Bruxelles), debut / fin (ISO), salle : COPIE du créneau.
   `agenda: null` = délié (rien n'est effacé). Une séance → un seul créneau ; un créneau → plusieurs
   séances possibles. L'emploi du temps reste en lecture seule (rien n'est écrit dans Hyperplanning).
   Fonctions pures (tests/seances-agenda) + écriture (putBackup avant chaque écriture).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { mural, muralEnUtc, plusJours } from '../../../api/_lib/heures.js';
import { getAll, putBackup } from './storage.js';
import { STORE, tagValide, seances, modifierTag } from './tagsPages.js';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const deux = (n) => String(n).padStart(2, '0');

/** 'AAAA-MM-JJ' (jour de Bruxelles) d'un instant */
export const jourIso = (ms) => { const m = mural(ms); return `${m.y}-${deux(m.mo)}-${deux(m.d)}`; };
/** minuit (Bruxelles) d'un jour 'AAAA-MM-JJ' → ms */
export const minuitDe = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? muralEnUtc(+m[1], +m[2], +m[3]) : NaN; };
export const hmDe = (iso) => { const m = mural(Date.parse(iso)); return `${deux(m.h)}:${deux(m.mi)}`; };
export const dateCourteDe = (iso) => { const m = mural(Date.parse(iso)); return `${m.d} ${MOIS[m.mo - 1]}`; };
export const uidIcalDe = (uid) => String(uid || '').split('@')[0];

/** lieu d'un cours (comme lib/emploiDuTemps.js#lieuDe) */
const lieu = (e) => (e.modality === 'teams' ? 'Teams' : [e.room, e.campus].filter(Boolean).join(' · '));

/** copie d'un créneau de l'agenda, stockée dans le tag Début */
export function instantaneCreneau(e, maintenant = Date.now()) {
  return {
    cle: `${uidIcalDe(e.uid)}|${new Date(Date.parse(e.start)).toISOString()}`,
    uid: String(e.uid), uidIcal: uidIcalDe(e.uid),
    titre: String(e.title || ''), date: jourIso(Date.parse(e.start)),
    debut: new Date(Date.parse(e.start)).toISOString(), fin: new Date(Date.parse(e.end)).toISOString(),
    salle: lieu(e) || null, lieLe: new Date(maintenant).toISOString(),
  };
}

/** le créneau d'aujourd'hui d'un lien, dans les cours chargés.
    → { e, etat: 'ok' | 'modifie' | 'retire' | 'hors_periode' } (e = null si introuvable) */
export function retrouverCreneau(lien, events, periode = null) {
  if (!lien) return null;
  const l = events || [];
  const memeOcc = l.filter((e) => String(e.uid) === String(lien.uid));
  let e = memeOcc.find((x) => Date.parse(x.start) === Date.parse(lien.debut)) || (memeOcc.length === 1 ? memeOcc[0] : null);
  if (!e) e = l.find((x) => uidIcalDe(x.uid) === lien.uidIcal && Date.parse(x.start) === Date.parse(lien.debut)) || null;
  if (e) {
    const bouge = Date.parse(e.start) !== Date.parse(lien.debut) || Date.parse(e.end) !== Date.parse(lien.fin);
    return { e, etat: bouge ? 'modifie' : 'ok' };
  }
  const d = Date.parse(lien.debut);
  const dans = periode && periode.from && periode.to ? d >= Date.parse(periode.from) && d < Date.parse(periode.to) : !!periode;
  return { e: null, etat: dans ? 'retire' : 'hors_periode' };
}

/**
 * Créneau proposé d'office (mis en évidence, jamais validé seul), dans l'ordre :
 *   1. le créneau EN COURS de la même matière que le document ;
 *   2. le plus proche (du moment visé) du même jour, de la même matière ;
 *   3. le créneau en cours.
 * `jour` = minuit (Bruxelles) du jour affiché ; `matiereDe(e)` → id de matière ou null.
 */
export function proposerCreneau(events, { jour, maintenant = Date.now(), matiereId = null, matiereDe = () => null }) {
  const fin = plusJours(jour, 1);
  const duJour = (events || []).filter((e) => !e.allDay && !e.cancelled && Date.parse(e.start) < fin && Date.parse(e.end) > jour);
  const enCours = (e) => Date.parse(e.start) <= maintenant && Date.parse(e.end) > maintenant;
  const meme = (e) => !!matiereId && matiereDe(e) === matiereId;
  const a = duJour.find((e) => enCours(e) && meme(e));
  if (a) return a;
  // moment visé : maintenant si c'est ce jour, sinon la même heure ce jour-là
  const m = mural(maintenant);
  const cible = maintenant >= jour && maintenant < fin ? maintenant : jour + (m.h * 60 + m.mi) * 60000;
  const ecart = (e) => { const s = Date.parse(e.start), t = Date.parse(e.end); return cible < s ? s - cible : cible > t ? cible - t : 0; };
  const memes = duJour.filter(meme).sort((x, y) => ecart(x) - ecart(y) || Date.parse(x.start) - Date.parse(y.start));
  if (memes.length) return memes[0];
  return duJour.find(enCours) || null;
}

/** « p. 157–192 » / « à partir de p. 157 » */
export const libellePages = (s) => (s.a != null ? (s.a === s.de ? `p. ${s.de}` : `p. ${s.de}–${s.a}`) : `à partir de p. ${s.de}`);

/** nom affiché d'un document de séance */
export function nomDocument(fiche, document) {
  const t = (fiche && (fiche.titre || fiche.nom)) || 'Cours';
  return document === 'fiche' ? `${t} (fiche)` : t;
}

/**
 * Toutes les séances liées, à partir de TOUS les tags : [{ cle, lien, courseId, document, de, a, debut, fin, nom }]
 * (fiches archivées ou absentes de cet appareil : gardées, nom « Cours »).
 */
export function seancesLiees(tags, fiches = []) {
  const parCours = new Map();
  for (const t of tags || []) {
    if (!tagValide(t)) continue;
    const k = `${t.courseId}\u0000${t.document || 'original'}`;
    if (!parCours.has(k)) parCours.set(k, []);
    parCours.get(k).push(t);
  }
  const fichesParId = new Map((fiches || []).map((f) => [f.id, f]));
  const out = [];
  for (const [k, l] of parCours) {
    const [courseId, document] = k.split('\u0000');
    for (const s of seances(l)) {
      const lien = s.debut.agenda;
      if (!lien || !lien.cle) continue;
      out.push({ cle: lien.cle, lien, courseId, document, de: s.de, a: s.a, debut: s.debut, fin: s.fin, nom: nomDocument(fichesParId.get(courseId), document) });
    }
  }
  return out.sort((x, y) => String(x.lien.lieLe || '').localeCompare(String(y.lien.lieLe || '')) || x.de - y.de);
}

/**
 * Séances liées rangées sur les cours chargés : { parUid: Map(uid → séances), fantomes: [cours « copie »], etats: Map(cle → état) }.
 * Un lien dont le créneau a disparu (ou est hors de la période chargée) devient un bloc « copie » à son ancien horaire.
 */
export function rangerSurAgenda(liees, events, periode = null) {
  const parUid = new Map(); const fantomesParCle = new Map(); const etats = new Map();
  for (const s of liees || []) {
    const r = retrouverCreneau(s.lien, events, periode);
    etats.set(s.cle, r.etat);
    if (r.e) {
      if (!parUid.has(r.e.uid)) parUid.set(r.e.uid, []);
      parUid.get(r.e.uid).push({ ...s, etat: r.etat });
      continue;
    }
    if (!fantomesParCle.has(s.cle)) {
      fantomesParCle.set(s.cle, {
        uid: 'copie:' + s.cle, start: s.lien.debut, end: s.lien.fin, title: s.lien.titre, teacher: '', room: s.lien.salle || '', campus: '',
        modality: null, cancelled: false, allDay: false, copie: r.etat,
      });
    }
    const f = fantomesParCle.get(s.cle);
    if (!parUid.has(f.uid)) parUid.set(f.uid, []);
    parUid.get(f.uid).push({ ...s, etat: r.etat });
  }
  return { parUid, fantomes: [...fantomesParCle.values()], etats };
}

/** mention à afficher pour l'état d'un lien */
export const MENTIONS = { modifie: 'horaire modifié', retire: 'cours retiré de l’agenda' };

/* ---- écriture : le tag Début existant reçoit (ou perd) le seul champ `agenda` ---- */
export async function lierSeance(tagDebut, e) {
  if (!tagDebut || tagDebut.kind !== 'debut') return null;
  await putBackup(`pre-lien-agenda-${tagDebut.id}-${Date.now()}`, { tag: tagDebut });
  return modifierTag(tagDebut, { agenda: instantaneCreneau(e) });
}
export async function delierSeance(tagDebut) {
  if (!tagDebut || !tagDebut.agenda) return null;
  await putBackup(`pre-delier-agenda-${tagDebut.id}-${Date.now()}`, { tag: tagDebut });
  return modifierTag(tagDebut, { agenda: null });
}

/** toutes les séances liées, tenues à jour (écriture locale, synchro d'un autre appareil) */
export function useSeancesLiees(fiches) {
  const [tags, setTags] = useState([]);
  useEffect(() => {
    let vivant = true;
    const lire = () => getAll(STORE).then((l) => {
      if (!vivant) return;
      const n = (l || []).filter((t) => tagValide(t));
      setTags((o) => (JSON.stringify(o) === JSON.stringify(n) ? o : n));
    }).catch(() => {});
    const ecriture = (e) => { if (!e.detail || e.detail.store === STORE) lire(); };
    lire();
    window.addEventListener('medrevise:ecriture', ecriture);
    window.addEventListener('medrevise:recharge', lire);
    return () => { vivant = false; window.removeEventListener('medrevise:ecriture', ecriture); window.removeEventListener('medrevise:recharge', lire); };
  }, []);
  return useMemo(() => seancesLiees(tags, fiches), [tags, fiches]);
}
