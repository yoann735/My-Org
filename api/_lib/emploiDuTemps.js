/* ============================================================
   My Org — lecture d'un emploi du temps iCal (Hyperplanning HELHa) pour
   /api/timetable. Module pur (aucun réseau, aucune variable d'environnement) :
   testé tel quel par tests/emploi-du-temps/.

   Ce qu'il gère :
   - FUSEAU : toute heure « murale » (TZID connu d'Intl, TZID inconnu, ou heure
     flottante) est lue comme une heure de Europe/Brussels, par Intl — pas par les
     règles du VTIMEZONE du fichier, souvent simplifiées. Une heure en UTC (…Z)
     reste en UTC. Le changement d'heure (25/10/2026) est donc juste dans les deux
     cas : 08:00 murale → 06:00Z avant, 07:00Z après.
   - RÉCURRENCES (RRULE, EXDATE) et MODIFICATIONS (RECURRENCE-ID) via ical.js ;
   - ANNULATIONS : STATUS:CANCELLED, ou « annulé » dans l'intitulé / le statut.
   Hyperplanning range ses champs dans DESCRIPTION (« Matière : … », « Enseignant :
   … », « Salle : … ») ; à défaut, l'intitulé « Matière - Prof - Promo - Salle ».
   ============================================================ */
import ICAL from 'ical.js';

import { FUSEAU, fuseauValide, muralEnUtc, lundiDe, plusJours } from './heures.js';

export { FUSEAU, mural, muralEnUtc, lundiDe, plusJours } from './heures.js';

function tzDe(composant, nomProp) {
  const p = composant && composant.getFirstProperty(nomProp);
  return p ? p.getParameter('tzid') : null;
}
/** ICAL.Time → ms UTC. `tzid` = paramètre TZID de la propriété d'origine. */
function versMs(t, tzid) {
  if (t.isDate) return muralEnUtc(t.year, t.month, t.day);
  const zone = t.zone;
  if (zone === ICAL.Timezone.utcTimezone || (zone && zone.tzid === 'UTC')) return t.toJSDate().getTime();
  const tz = tzid || t.timezone;
  if (fuseauValide(tz)) return muralEnUtc(t.year, t.month, t.day, t.hour, t.minute, t.second, tz);
  if (zone && zone !== ICAL.Timezone.localTimezone && zone.tzid && zone.tzid !== 'floating') return t.toJSDate().getTime();
  return muralEnUtc(t.year, t.month, t.day, t.hour, t.minute, t.second, FUSEAU);
}

/* ---------- champs Hyperplanning ---------- */
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const CLES = [
  ['title', /^(matieres?|cours|intitule|ue|activite)$/],
  ['teacher', /^(enseignants?|professeurs?|profs?|intervenants?|titulaires?)$/],
  ['room', /^(salles?|locaux|local|lieu)$/],
  ['campus', /^(sites?|campus|implantations?|batiments?)$/],
  ['type', /^(types?|nature|modalites?|mode)$/],
  ['memo', /^(memos?|remarques?|commentaires?|notes?|infos?)$/],
  ['statut', /^(statut|etat|status)$/],
];
function lireDescription(desc) {
  const champs = {};
  String(desc || '').split(/\r?\n|\\n/).forEach((ligne) => {
    const m = /^\s*([^:]{2,40}?)\s*:\s*(.*?)\s*$/.exec(ligne);
    if (!m) return;
    const cle = sansAccents(m[1]).toLowerCase().replace(/\s*\(s\)\s*$/, 's').replace(/[^a-z]/g, '');
    const trouve = CLES.find(([, re]) => re.test(cle));
    if (trouve && m[2] && !champs[trouve[0]]) champs[trouve[0]] = m[2];
  });
  return champs;
}

const RE_ANNULE = /\bannul(e|é|ée|ee)s?\b/i;
const RE_PREFIXE_ANNULE = /^\s*(?:[([]\s*)?(?:cours\s+)?annul(?:e|é|ée|ee)s?\s*(?:[)\]]\s*)?(?:[:\-–—]\s*)?/i;
function nettoyerTitre(s) {
  return String(s || '').replace(RE_PREFIXE_ANNULE, '').replace(/\s*[([]\s*annul\w*\s*[)\]]\s*$/i, '').replace(/\s+/g, ' ').trim();
}

const CIVILITES = { mme: 'Mme', madame: 'Mme', mlle: 'Mlle', m: 'M.', mr: 'M.', monsieur: 'M.', dr: 'Dr', docteur: 'Dr', pr: 'Pr', prof: 'Pr' };
const capitaliser = (mot) => mot.toLowerCase().replace(/(^|[-'’\s])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
/** « LEYH Mme » → « Mme Leyh » ; « DUPONT Anne » → « Anne Dupont » ; plusieurs profs → « , » */
export function formaterProf(brut) {
  if (!brut) return '';
  return String(brut).split(/\s*[,;/]\s*|\s+et\s+/).map((un) => {
    const mots = un.trim().split(/\s+/).filter(Boolean);
    if (!mots.length) return '';
    let civ = null;
    const noms = []; const prenoms = [];
    for (const m of mots) {
      const c = CIVILITES[sansAccents(m).toLowerCase().replace(/\./g, '')];
      if (c && !civ) { civ = c; continue; }
      if (m.length > 1 && m === m.toUpperCase() && /\p{L}/u.test(m)) noms.push(capitaliser(m));
      else prenoms.push(m);
    }
    if (!noms.length && prenoms.length) { noms.push(...prenoms.splice(prenoms.length - 1)); }
    return [civ, ...prenoms, ...noms].filter(Boolean).join(' ');
  }).filter(Boolean).join(', ');
}

function modaliteDe(textes, type) {
  const tout = textes.filter(Boolean).join(' \n ');
  if (/\bteams\b|distanciel|en ligne|à distance|a distance|visio|zoom/i.test(tout)) return 'teams';
  if (/\b(tp|aip|labo|laboratoire|pratique|travaux pratiques|atelier|stage|skills?)\b/i.test(sansAccents(type || '') + ' ' + sansAccents(tout))) return 'pratique';
  return 'presentiel';
}

/** salle « C02 (Montignies) » → { room: 'C02', campus: 'Montignies' } */
function salleEtCampus(salle, campus) {
  let room = String(salle || '').trim();
  let site = String(campus || '').trim();
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(room);
  if (m && !site) { room = m[1].trim(); site = m[2].trim(); }
  if (/^\s*teams\s*$/i.test(room)) room = '';
  return { room, campus: site };
}

function champsDe(composant) {
  const lire = (nom) => { const v = composant.getFirstPropertyValue(nom); return v == null ? '' : String(v); };
  const summary = lire('summary');
  const description = lire('description');
  const location = lire('location');
  const status = lire('status').toUpperCase();
  const kv = lireDescription(description);
  const morceaux = summary.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
  const titre = nettoyerTitre(kv.title || morceaux[0] || summary) || 'Cours';
  let profBrut = kv.teacher;
  if (!profBrut && morceaux.length > 1) profBrut = morceaux.find((m, i) => i > 0 && /\b(mme|mr|m\.|madame|monsieur|dr)\b/i.test(m)) || '';
  const { room, campus } = salleEtCampus(kv.room || location, kv.campus);
  const cancelled = status === 'CANCELLED' || RE_ANNULE.test(summary) || RE_ANNULE.test(kv.statut || '') || /^\s*annul/i.test(kv.memo || '');
  const modality = modaliteDe([location, kv.room, kv.memo, kv.type, summary], kv.type);
  return { title: titre, teacher: formaterProf(profBrut), room, campus, modality, cancelled, type: kv.type || '' };
}

/* ---------- analyse ---------- */
const MAX_OCCURRENCES = 5000;

/**
 * Texte .ics → cours entre `debut` et `fin` (ms UTC), triés par début.
 * { uid, start, end, title, teacher, room, campus, modality, cancelled, allDay }
 */
export function analyserIcs(texte, { debut, fin }) {
  const racine = new ICAL.Component(ICAL.parse(String(texte)));
  const vevents = racine.getAllSubcomponents('vevent');
  const parUid = new Map();
  for (const v of vevents) {
    const uid = String(v.getFirstPropertyValue('uid') || '') || `sans-uid-${parUid.size}`;
    if (!parUid.has(uid)) parUid.set(uid, { maitre: null, exceptions: [] });
    const g = parUid.get(uid);
    if (v.hasProperty('recurrence-id')) g.exceptions.push(v); else if (!g.maitre) g.maitre = v;
  }

  const sortie = [];
  const pousser = (uid, composant, startT, endT) => {
    const s = versMs(startT, tzDe(composant, 'dtstart'));
    const e = endT ? versMs(endT, tzDe(composant, 'dtend') || tzDe(composant, 'dtstart')) : s;
    if (e <= debut || s >= fin) return;
    sortie.push({
      uid, start: new Date(s).toISOString(), end: new Date(Math.max(e, s)).toISOString(),
      ...champsDe(composant), allDay: !!startT.isDate,
    });
  };

  for (const [uid, { maitre, exceptions }] of parUid) {
    if (!maitre) { // modifications orphelines : chacune est un cours à part entière
      for (const ex of exceptions) {
        const ev = new ICAL.Event(ex);
        pousser(`${uid}@${ev.recurrenceId ? ev.recurrenceId.toString() : ''}`, ex, ev.startDate, ev.endDate);
      }
      continue;
    }
    const ev = new ICAL.Event(maitre);
    exceptions.forEach((ex) => ev.relateException(ex));
    if (!ev.isRecurring()) { pousser(uid, maitre, ev.startDate, ev.endDate); continue; }
    const it = ev.iterator();
    let t; let n = 0;
    while ((t = it.next()) && n++ < MAX_OCCURRENCES) {
      const d = ev.getOccurrenceDetails(t);
      if (versMs(d.startDate, tzDe(d.item.component, 'dtstart')) >= fin && versMs(t, tzDe(maitre, 'dtstart')) >= fin) break;
      pousser(`${uid}@${d.recurrenceId.toString()}`, d.item.component, d.startDate, d.endDate);
    }
  }
  sortie.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)));
  return sortie;
}

/** fenêtre servie : lundi de la semaine passée → 9 semaines plus tard (semaine en cours + 8) */
export function fenetre(maintenant = Date.now()) {
  const debut = plusJours(lundiDe(maintenant), -7);
  return { debut, fin: plusJours(debut, 7 * 10) };
}
