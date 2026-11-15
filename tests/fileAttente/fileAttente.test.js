// (15/11/2026) Mode file d'attente — docs/compte-rendu-mode-file-attente.md. Simulation jour par jour avec les VRAIS
// modules (categoriser, noterFlashcard, dateEffective) et une horloge simulée (fuseau Europe/Brussels, npm test).
// Données de test uniquement.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { categoriser, composerSeance } from '../../src/medrevise/lib/categoriesFC.js';
import { noterFlashcard, passerEnRevision } from '../../src/medrevise/scheduler/noter.js';
import { nextDate, dateBase, dateEffective } from '../../src/medrevise/lib/planning.js';
import { todayISO } from '../../src/medrevise/lib/sm2.js';
import { ajouterJours } from '../../src/medrevise/scheduler/jours.js';
import {
  cloturerJours, jourFile, etatActivation, plusVieuxRetard, apercu7Jours, decalageAffiche, retirerDernierePause,
  paquetSuivantVisible, cartesQuiRepassentEnRetard, departageFile, normaliserEtat, definirEtatFile, ETAT_INACTIF, jourDerniereRevision,
} from '../../src/medrevise/lib/fileAttente.js';

afterEach(() => { vi.useRealTimers(); definirEtatFile(null); });

const TOUT = { nouvelles: { coche: true, max: 'tout' }, revisions: { coche: true, max: 'tout' }, retard: { coche: true, max: 'tout' } };
/** carte de révision ordinaire : due `jour`, dernière révision `vue` */
const carte = (id, jour, vue, o = {}) => ({ id, type: 'flashcard', ficheId: 'f' + (id.charCodeAt(id.length - 1) % 3), recto: id, verso: '', intervalDays: 3, dueDate: jour, j0Date: vue, nouvelle: false, historique: [{ date: vue, qualite: 5 }], ...o });
/** `n` cartes par jour, du `debut` pendant `nbJours` jours. Dernière révision : la veille du début (réaliste : aucune
 *  carte ne peut avoir été revue un jour où l'on n'a pas révisé). */
function paquets(debut, nbJours, n, prefixe = 'c', vue = ajouterJours(debut, -1)) {
  const out = [];
  for (let k = 0; k < nbJours; k++) { const j = ajouterJours(debut, k); for (let i = 0; i < n; i++) out.push(carte(`${prefixe}${j}-${i}`, j, vue)); }
  return out;
}
const aMidi = (jour) => vi.setSystemTime(new Date(`${jour}T10:00:00+01:00`));

/** un « appareil » simulé : cartes + état du mode ; ouvrir = clôture ; reviser = note les Retard + Révisions */
function monde(cartes, etat = ETAT_INACTIF) {
  const m = {
    cartes: cartes.map((q) => ({ ...q })), etat: normaliserEtat(etat),
    ouvrir() { const r = cloturerJours(m.etat, m.cartes, dateBase, jourFile()); m.etat = r.etat; return r; },
    cats() { return categoriser(m.cartes, todayISO(), (q) => dateEffective(q, m.etat), departageFile(dateBase, m.etat)); },
    seance() { return composerSeance(m.cats(), TOUT, (id) => (m.cartes.find((q) => q.id === id) || {}).ficheId, () => 0.5, null, departageFile(dateBase, m.etat)).ids; },
    noter(ids, note = 'good') { const s = new Set(ids); m.cartes = m.cartes.map((q) => (s.has(q.id) ? noterFlashcard(q, note).carte : q)); },
    reviser(part = 1) { const c = m.cats(); const ids = [...c.retard, ...c.revisions].map((q) => q.id); const k = Math.round(ids.length * part); m.noter(m.seance().filter((id) => ids.includes(id)).slice(0, k)); return ids; },
    decalage() { return decalageAffiche(m.etat, m.cartes, dateBase); },
  };
  return m;
}
const idsDe = (l) => l.map((q) => q.id).sort();
const duJour = (cartes, jour) => cartes.filter((q) => q.id.startsWith('c' + jour)).map((q) => q.id).sort();

describe('règle dateEffective', () => {
  it('mode désactivé : dateEffective === dateBase pour toutes les cartes (et nextDate inchangé)', () => {
    const cs = [...paquets('2026-11-01', 20, 5), carte('t', null, '2026-11-01', { termine: true }), { id: 'n', type: 'flashcard', historique: [], dueDate: '2026-11-03' }];
    for (const q of cs) { expect(dateEffective(q)).toBe(dateBase(q)); expect(nextDate(q)).toBe(dateBase(q)); expect(dateEffective(q, ETAT_INACTIF)).toBe(dateBase(q)); }
  });
  it('dueDate + jours en pause STRICTEMENT après la dernière révision', () => {
    const e = normaliserEtat({ actif: true, pauses: ['2026-11-10', '2026-11-12', '2026-11-13'] });
    expect(dateEffective(carte('a', '2026-11-14', '2026-11-09'), e)).toBe('2026-11-17');
    expect(dateEffective(carte('b', '2026-11-14', '2026-11-12'), e)).toBe('2026-11-15'); // la pause du 12 = jour de révision : pas comptée
    expect(dateEffective(carte('c', '2026-11-20', '2026-11-13'), e)).toBe('2026-11-20');
    const nouvelle = { id: 'n', type: 'flashcard', historique: [], dueDate: '2026-11-01' };
    expect(dateEffective(nouvelle, e)).toBe(null); // les Nouvelles n'ont pas de date
  });
  it('jour de dernière révision : note la plus récente ou passage en révision', () => {
    expect(jourDerniereRevision({ historique: [{ date: '2026-11-01', qualite: 5 }, { date: '2026-11-04', qualite: 1 }], nouvellePasseeLe: '2026-10-30' })).toBe('2026-11-04');
    expect(jourDerniereRevision({ historique: [], nouvellePasseeLe: '2026-11-02' })).toBe('2026-11-02');
  });
});

describe('scénarios du cahier des charges', () => {
  it('20 révisions/jour, mardi et mercredi oubliés : jeudi = mardi, vendredi = mercredi, samedi = jeudi ; décalage 2 j', () => {
    vi.useFakeTimers(); aMidi('2026-11-16');
    const m = monde(paquets('2026-11-16', 14, 20), etatActivation('2026-11-16', '2026-11-16'));
    const orig = Object.fromEntries(m.cartes.map((q) => [q.id, q]));
    m.ouvrir(); expect(m.cats().revisions.length).toBe(20); m.reviser(); // lundi fait
    // mardi, mercredi : l'app n'est pas ouverte
    aMidi('2026-11-19'); const r = m.ouvrir(); // jeudi
    expect(r.ajoutes).toEqual(['2026-11-17', '2026-11-18']);
    expect(idsDe(m.cats().revisions)).toEqual(duJour(m.cartes, '2026-11-17'));
    expect(m.cats().retard.length).toBe(0);
    expect(m.decalage()).toBe(2);
    m.reviser();
    aMidi('2026-11-20'); m.ouvrir(); expect(idsDe(m.cats().revisions)).toEqual(duJour(m.cartes, '2026-11-18')); m.reviser();
    aMidi('2026-11-21'); m.ouvrir(); expect(idsDe(m.cats().revisions)).toEqual(duJour(m.cartes, '2026-11-19'));
    expect(m.decalage()).toBe(2);
    // aucune carte non révisée modifiée (dueDate, FSRS, historique)
    for (const q of m.cartes) if (!q.historique.some((h) => h.date >= '2026-11-16')) expect(q).toEqual(orig[q.id]);
  });

  it('activation : 100 retards sur 3 jours + 50/jour — date proposée, aperçu exact, date plus récente', () => {
    vi.useFakeTimers(); aMidi('2026-11-20');
    const V = '2026-11-16'; // dernière séance faite
    const retards = [...paquets('2026-11-17', 1, 30, 'c', V), ...paquets('2026-11-18', 1, 30, 'c', V), ...paquets('2026-11-19', 1, 40, 'c', V)];
    const avenir = paquets('2026-11-20', 10, 50, 'c', V);
    const cs = [...retards, ...avenir];
    const auj = jourFile();
    expect(plusVieuxRetard(cs, dateBase, auj)).toBe('2026-11-17');
    const e = etatActivation('2026-11-17', auj); // 3 j de décalage
    expect(e.pauses).toEqual(['2026-11-17', '2026-11-18', '2026-11-19']);
    const ap = apercu7Jours(cs, (q) => dateEffective(q, e), auj);
    expect(ap.map((l) => [l.retard, l.revisions])).toEqual([[0, 30], [0, 30], [0, 40], [0, 50], [0, 50], [0, 50], [0, 50]]);
    // date plus récente (le 19) : les retards du 17 et du 18 restent en Retard
    const e2 = etatActivation('2026-11-19', auj);
    const ap2 = apercu7Jours(cs, (q) => dateEffective(q, e2), auj);
    expect(ap2.map((l) => [l.retard, l.revisions])).toEqual([[60, 40], [0, 50], [0, 50], [0, 50], [0, 50], [0, 50], [0, 50]]);
    const cats = categoriser(cs, todayISO(), (q) => dateEffective(q, e2), departageFile(dateBase, e2));
    expect(cats.retard.length).toBe(60); expect(cats.retard.every((q) => q.dueDate < '2026-11-19')).toBe(true);
    expect(cats.revisions.length).toBe(40);
    // aujourd'hui = aucun décalage
    expect(etatActivation(auj, auj).pauses).toEqual([]);
  });

  it('carte notée « À revoir » pendant le mode : revient le lendemain RÉEL', () => {
    vi.useFakeTimers(); aMidi('2026-11-20');
    const m = monde([...paquets('2026-11-17', 1, 5), ...paquets('2026-11-20', 6, 5, 'c', '2026-11-16')], etatActivation('2026-11-17', '2026-11-20'));
    const c = m.cats().revisions[0];
    expect(c.id.startsWith('c2026-11-17')).toBe(true);
    m.noter([c.id], 'again');
    const apres = m.cartes.find((q) => q.id === c.id);
    expect(apres.dueDate).toBe('2026-11-21');
    expect(dateEffective(apres, m.etat)).toBe('2026-11-21'); // pas décalé par les 3 pauses passées
    // le lendemain, même si le 20 devient un jour en pause (journée pas finie), elle est là
    aMidi('2026-11-21'); m.ouvrir();
    expect(m.etat.pauses).toContain('2026-11-20');
    expect(m.cats().revisions.map((q) => q.id)).toContain(c.id);
  });

  it('deux trous successifs (2 j puis 3 j) : décalage 5 j, alerte, ordre des cartes', () => {
    vi.useFakeTimers(); aMidi('2026-11-16');
    const m = monde(paquets('2026-11-16', 20, 10), etatActivation('2026-11-16', '2026-11-16'));
    m.reviser(); // lun 16
    aMidi('2026-11-19'); m.ouvrir(); m.reviser(); // trou 17-18, jeu 19 : cartes du 17
    aMidi('2026-11-20'); m.ouvrir(); m.reviser(); // ven 20 : cartes du 18
    aMidi('2026-11-24'); const r = m.ouvrir(); // trou sam 21, dim 22, lun 23
    expect(r.ajoutes).toEqual(['2026-11-21', '2026-11-22', '2026-11-23']);
    expect(m.decalage()).toBe(5);
    expect(idsDe(m.cats().revisions)).toEqual(duJour(m.cartes, '2026-11-19'));
    expect(m.cats().retard.length).toBe(0);
    m.reviser();
    aMidi('2026-11-25'); m.ouvrir(); expect(idsDe(m.cats().revisions)).toEqual(duJour(m.cartes, '2026-11-20'));
  });

  it('journée à moitié faite : le reste arrive en premier le lendemain', () => {
    vi.useFakeTimers(); aMidi('2026-11-16');
    const m = monde(paquets('2026-11-16', 10, 20), etatActivation('2026-11-16', '2026-11-16'));
    const faites = new Set(); const avant = m.cats().revisions.map((q) => q.id);
    m.reviser(0.5); m.cartes.forEach((q) => { if (q.historique.length > 1) faites.add(q.id); });
    expect(faites.size).toBe(10);
    aMidi('2026-11-17'); const r = m.ouvrir();
    expect(r.ajoutes).toEqual(['2026-11-16']);
    const restes = avant.filter((id) => !faites.has(id));
    const seance = m.seance();
    expect(seance.slice(0, 10).sort()).toEqual(restes.sort()); // le reste du 16 d'abord
    expect(seance.length).toBe(10); // les cartes du 17 suivent le jour d'après (planning en pause d'un jour)
    m.reviser();
    aMidi('2026-11-18'); m.ouvrir();
    expect(idsDe(m.cats().revisions)).toEqual(duJour(m.cartes, '2026-11-17'));
  });

  it('« Faire le paquet suivant » : visible quand Retard + Révisions sont finies, décalage −1', () => {
    vi.useFakeTimers(); aMidi('2026-11-20');
    const m = monde(paquets('2026-11-17', 10, 10), etatActivation('2026-11-17', '2026-11-20'));
    expect(m.decalage()).toBe(3);
    expect(paquetSuivantVisible(m.cats(), m.decalage())).toBe(false);
    m.reviser();
    expect(paquetSuivantVisible(m.cats(), m.decalage())).toBe(true);
    m.etat = retirerDernierePause(m.etat);
    expect(m.decalage()).toBe(2);
    expect(idsDe(m.cats().revisions)).toEqual(duJour(m.cartes, '2026-11-18'));
    expect(paquetSuivantVisible(m.cats(), m.decalage())).toBe(false);
  });

  it('ouverture après 4 jours sans ouvrir, et sur 2 appareils : même résultat ; idempotent', () => {
    vi.useFakeTimers(); aMidi('2026-11-16');
    const base = paquets('2026-11-16', 12, 15);
    const A = monde(base, etatActivation('2026-11-16', '2026-11-16'));
    const B = monde(base, etatActivation('2026-11-16', '2026-11-16'));
    A.reviser(0.4); B.cartes = A.cartes.map((q) => ({ ...q })); // les réponses de A arrivent sur B (synchro)
    // A est ouvert chaque jour sans réviser ; B seulement 4 jours plus tard
    for (const j of ['2026-11-17', '2026-11-18', '2026-11-19']) { aMidi(j); A.ouvrir(); }
    aMidi('2026-11-20'); A.ouvrir(); B.ouvrir();
    expect(B.etat).toEqual(A.etat);
    expect(A.etat.pauses).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
    for (let k = 0; k < 10; k++) { const r = B.ouvrir(); expect(r.change).toBe(false); }
    expect(B.etat).toEqual(A.etat);
    expect(idsDe(B.cats().revisions)).toEqual(idsDe(A.cats().revisions));
  });

  it('désactivation : le nombre annoncé est exact, retour au comportement actuel', () => {
    vi.useFakeTimers(); aMidi('2026-11-20');
    const cs = [...paquets('2026-11-17', 3, 10), ...paquets('2026-11-20', 5, 10, 'c', '2026-11-16')];
    const e = etatActivation('2026-11-17', '2026-11-20');
    const n = cartesQuiRepassentEnRetard(cs, dateBase, e, jourFile());
    expect(n).toBe(30);
    const sans = categoriser(cs, todayISO(), nextDate);
    expect(sans.retard.length).toBe(30);
    expect(categoriser(cs, todayISO(), (q) => dateEffective(q, e)).retard.length).toBe(0);
    expect(categoriser(cs, todayISO(), (q) => dateEffective(q, normaliserEtat({ actif: false, pauses: e.pauses })))).toEqual(sans);
  });

  it('jours en pause qui ne décalent plus aucune carte : retirés automatiquement', () => {
    vi.useFakeTimers(); aMidi('2026-11-20');
    const m = monde(paquets('2026-11-17', 1, 4), etatActivation('2026-11-17', '2026-11-20'));
    expect(m.decalage()).toBe(3);
    m.reviser(); // toutes les cartes revues le 20 : plus rien n'est décalé
    aMidi('2026-11-21'); const r = m.ouvrir();
    expect(r.retires).toEqual(['2026-11-17', '2026-11-18', '2026-11-19']);
    expect(m.etat.pauses).toEqual([]);
  });

  it('jamais aujourd’hui, jamais avant l’activation ; bascule à 4 h', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-21T02:30:00+01:00')); // 02:30 : journée de révision = le 20
    expect(jourFile()).toBe('2026-11-20');
    const m = monde(paquets('2026-11-10', 15, 3), { actif: true, pauses: [], activeLe: '2026-11-19', verifieJusquau: '2026-11-18' });
    const r = m.ouvrir();
    expect(r.ajoutes).toEqual(['2026-11-19']); // ni le 20 (en cours), ni avant le 19
  });

  it('passage en révision pendant le mode : due au J suivant réel', () => {
    vi.useFakeTimers(); aMidi('2026-11-20');
    const e = etatActivation('2026-11-17', '2026-11-20');
    const n = { id: 'nv', type: 'flashcard', ficheId: 'f1', historique: [], dueDate: '2026-11-01', j0Date: '2026-11-01' };
    const { carte: p } = passerEnRevision(n, { today: todayISO() });
    expect(dateEffective(p, e)).toBe('2026-11-21');
  });
});
