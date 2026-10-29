// (29/10) La transcription marque le cours (docs/compte-rendu-transcription-marque-cours.md) : vraies fonctions de tags
// (lib/tagsPages.js, IndexedDB simulé) + suite d'états du moteur identique à une vraie session (engine.js#publier).
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.stubGlobal('window', { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' });
const memoire = new Map();
const stockage = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)), removeItem: (k) => memoire.delete(k) };
const { poserTag, modifierTag, lireTags, tagsDe, seances } = await import('../../src/medrevise/lib/tagsPages.js');
const S = await import('../../src/medrevise/lib/storage.js');
const { marquerDebutCours, suiveurArret, cleFinAuto } = await import('../../src/medrevise/transcription/marquerCours.js');

const C = 'cours-trx';
const tagsDuCours = async () => tagsDe(await lireTags(), C).map((t) => ({ kind: t.kind, page: t.page, doc: t.document, sid: t.transcriptSessionId || null }));
let page; let avis;
// lireTags synchrone attendu : on lui passe la dernière lecture
let derniers = [];
const suiveur = (phase = 'idle') => suiveurArret({ courseId: C, phaseInitiale: phase, lirePage: () => page, lireTags: () => derniers, poserTag, modifierTag, stockage, onAvis: (t) => { avis = t; } });
const rafraichir = async () => { derniers = tagsDe(await lireTags(), C); };
/** une vraie séquence d'états publiée par le moteur : starting → live → stopping → idle */
async function session(f, { sid = 'ts1', derniere = sid } = {}) {
  await f({ phase: 'starting', courseId: C }); await f({ phase: 'live', courseId: C });
  await f({ phase: 'stopping', courseId: C });
  await rafraichir();
  return f({ phase: 'idle', courseId: C, derniereFinie: derniere });
}

beforeEach(async () => { for (const t of (await S.getAll('page_tag')) || []) await S.remove('page_tag', t.id); memoire.clear(); avis = null; derniers = []; page = { page: 5, cle: 5, doc: 'original' }; });

describe('la transcription marque le cours', () => {
  it('début p.5 au démarrage, fin p.9 à l’arrêt, liés à la session ; la séance « p. 5–9 » existe', async () => {
    const t = await marquerDebutCours({ courseId: C, page, sessionId: 'ts1', tags: [], poserTag, modifierTag, stockage });
    expect(t.page).toBe(5);
    expect(await tagsDuCours()).toEqual([{ kind: 'debut', page: 5, doc: 'original', sid: 'ts1' }]);
    page = { page: 9, cle: 9, doc: 'original' };
    await session(suiveur(), { sid: 'ts1' });
    expect(await tagsDuCours()).toEqual([{ kind: 'debut', page: 5, doc: 'original', sid: 'ts1' }, { kind: 'fin', page: 9, doc: 'original', sid: 'ts1' }]);
    const s = seances(tagsDe(await lireTags(), C, 'original'));
    expect(s.map((x) => [x.de, x.a, x.transcriptSessionId])).toEqual([[5, 9, 'ts1']]);
    expect(avis).toBe('Fin du cours marquée page 9');
    expect(memoire.has(cleFinAuto(C))).toBe(false); // plus rien en attente
  });
  it('case décochée (rien de mémorisé) : l’arrêt ne pose rien', async () => {
    page = { page: 9, cle: 9, doc: 'original' };
    await session(suiveur());
    expect(await tagsDuCours()).toEqual([]);
  });
  it('une AUTRE session s’arrête : rien n’est posé, la mémoire reste pour la bonne', async () => {
    await marquerDebutCours({ courseId: C, page, sessionId: 'ts1', tags: [], poserTag, modifierTag, stockage });
    page = { page: 9, cle: 9, doc: 'original' };
    await session(suiveur(), { derniere: 'ts-autre' });
    expect((await tagsDuCours()).map((t) => t.kind)).toEqual(['debut']);
    expect(memoire.has(cleFinAuto(C))).toBe(true);
  });
  it('session vide (rien dit, pas enregistrée) : fin posée, mais le début ne pointe plus vers une session inexistante', async () => {
    await marquerDebutCours({ courseId: C, page, sessionId: 'ts-vide', tags: [], poserTag, modifierTag, stockage });
    page = { page: 6, cle: 6, doc: 'original' };
    await session(suiveur(), { derniere: null });
    expect(await tagsDuCours()).toEqual([{ kind: 'debut', page: 5, doc: 'original', sid: null }, { kind: 'fin', page: 6, doc: 'original', sid: null }]);
  });
  it('à l’arrêt, la fiche est affichée (autre document) : pas de fin posée au mauvais endroit, un avis le dit', async () => {
    await marquerDebutCours({ courseId: C, page, sessionId: 'ts1', tags: [], poserTag, modifierTag, stockage });
    page = { page: 3, cle: 3, doc: 'fiche' };
    await session(suiveur());
    expect((await tagsDuCours()).map((t) => t.kind)).toEqual(['debut']);
    expect(avis).toMatch(/Fin du cours non marquée/);
  });
  it('rechargement pendant le cours : le lecteur rouvert (phase déjà « live ») pose quand même la fin', async () => {
    await marquerDebutCours({ courseId: C, page, sessionId: 'ts1', tags: [], poserTag, modifierTag, stockage });
    const f = suiveur('live'); // abonné pendant la session
    page = { page: 12, cle: 12, doc: 'original' };
    await f({ phase: 'stopping', courseId: C }); await rafraichir();
    await f({ phase: 'idle', courseId: C, derniereFinie: 'ts1' });
    expect((await tagsDuCours()).find((t) => t.kind === 'fin')).toEqual({ kind: 'fin', page: 12, doc: 'original', sid: 'ts1' });
  });
  it('un début déjà posé à la main sur la même page est réutilisé (pas de doublon), et lié à la session', async () => {
    await poserTag({ courseId: C, document: 'original', page: 5, kind: 'debut' });
    await rafraichir();
    await marquerDebutCours({ courseId: C, page, sessionId: 'ts1', tags: derniers, poserTag, modifierTag, stockage });
    expect(await tagsDuCours()).toEqual([{ kind: 'debut', page: 5, doc: 'original', sid: 'ts1' }]);
  });
  it('un autre cours qui s’arrête ne touche pas à celui-ci', async () => {
    await marquerDebutCours({ courseId: C, page, sessionId: 'ts1', tags: [], poserTag, modifierTag, stockage });
    const f = suiveur();
    await f({ phase: 'live', courseId: 'autre' }); await f({ phase: 'idle', courseId: 'autre', derniereFinie: 'ts1' });
    expect((await tagsDuCours()).map((t) => t.kind)).toEqual(['debut']);
  });
});
