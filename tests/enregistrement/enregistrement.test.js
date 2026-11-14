// Moteur d'enregistrement des documents + historique des versions + annuler/rétablir sans perte de texte
// (14/11/2026, docs/compte-rendu-boites-disparues-et-sauvegarde-continue.md). IndexedDB simulé (fake-indexeddb).
import { describe, it, expect, beforeEach } from 'vitest';
import { put, remove, getOne, getAll, lireDocument, newNoteBox, newHighlight } from '../../src/medrevise/lib/storage.js';
import { etatEnregistrement, ecrireVerifie, etatMoteur } from '../../src/medrevise/lib/enregistrement.js';
import {
  garderVersion, listerVersions, ouvertureDocument, recupererManquantes, restaurerVersion, manquantesDe, compter, ignorerDisparitions,
} from '../../src/medrevise/lib/historiqueDoc.js';
import { cmdCreer, cmdModifier, creerPile } from '../../src/medrevise/lib/annotHistory.js';

const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] }] });
let n = 0;
const nsNeuf = () => 'fTest' + (++n) + Date.now().toString(36);
const boite = (ns, texte, page = 1) => ({ ...newNoteBox({ ficheId: ns, page, x: 0.1, y: 0.1 * page, width: 0.3, height: 0.05 }), content: doc(texte) });

describe('moteur d’enregistrement', () => {
  it('écriture confirmée par relecture → « Enregistré sur l’appareil » (sans synchro configurée)', async () => {
    const ns = nsNeuf();
    const b = await put('annotations', boite(ns, 'a'));
    expect((await getOne('annotations', b.id)).content).toEqual(doc('a'));
    expect(etatEnregistrement(ns)).toMatchObject({ code: 'appareil', libelle: 'Enregistré sur l’appareil' });
  });
  it('relecture différente 3 fois → erreur persistante, jamais « Enregistré » ; une écriture réussie l’efface', async () => {
    const ns = nsNeuf();
    await expect(ecrireVerifie({ store: 'annotations', elements: [{ id: 'x', rec: { id: 'x', ficheId: ns, updatedAt: 'A' } }],
      ecrire: async () => {}, relire: async () => [{ id: 'x', updatedAt: 'AUTRE' }] })).rejects.toThrow();
    expect(etatEnregistrement(ns).code).toBe('erreur');
    expect(etatMoteur().erreur).toMatchObject({ store: 'annotations', id: 'x' });
    await put('annotations', boite(ns, 'ok'));
    expect(etatEnregistrement(ns).code).toBe('appareil');
  });
  it('échec d’écriture IndexedDB (exception) → 3 essais puis erreur', async () => {
    let essais = 0;
    await expect(ecrireVerifie({ store: 'annotations', elements: [{ id: 'y', rec: { id: 'y', ficheId: 'f', updatedAt: 'B' } }],
      ecrire: async () => { essais++; throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); }, relire: async () => [] })).rejects.toThrow();
    expect(essais).toBe(3);
    expect(etatEnregistrement('f').detail).toMatch(/espace de stockage plein/);
    await put('annotations', boite('f', 'remis'));
  });
  it('une suppression est vérifiée (plus rien relu) et notée au registre', async () => {
    const ns = nsNeuf();
    const b = await put('annotations', boite(ns, 'à supprimer'));
    await garderVersion(ns, 'test');
    await remove('annotations', b.id);
    expect(await getOne('annotations', b.id)).toBeUndefined();
    const r = await ouvertureDocument(ns);
    expect(r.disparues).toEqual([]); // supprimée par l'app → pas d'alerte
  });
});

describe('historique des versions', () => {
  beforeEach(() => {});
  it('version gardée une fois ; identique → pas de doublon ; forcée → gardée', async () => {
    const ns = nsNeuf();
    await put('annotations', boite(ns, 'un'));
    expect(await garderVersion(ns, 'v1')).toBeTruthy();
    expect(await garderVersion(ns, 'v2')).toBeNull();
    expect(await garderVersion(ns, 'v3', { force: true })).toBeTruthy();
    expect((await listerVersions(ns)).length).toBe(2);
  });
  it('garde-fou : une boîte disparue SANS suppression enregistrée est signalée, rien n’est modifié', async () => {
    const ns = nsNeuf();
    const a = await put('annotations', boite(ns, 'reste'));
    const b = await put('annotations', boite(ns, 'disparue', 2));
    await ouvertureDocument(ns); // référence
    // disparition hors de l'app (comme une copie de données sans elle) : effacement direct d'IndexedDB
    const { del, createStore } = await import('idb-keyval');
    await del(b.id, createStore('medrevise-annotations', 'v1'));
    const r = await ouvertureDocument(ns);
    expect(r.disparues.map((x) => x.id)).toEqual([b.id]);
    expect((await lireDocument(ns)).annotations.map((x) => x.id)).toEqual([a.id]); // rien restauré tout seul
    // l'alerte reste tant qu'on n'a rien fait
    expect((await ouvertureDocument(ns)).disparues.length).toBe(1);
    await ignorerDisparitions(ns, [b.id]);
    expect((await ouvertureDocument(ns)).disparues.length).toBe(0);
  });
  it('« Récupérer les boîtes manquantes » n’ajoute que les absentes, sans toucher aux existantes', async () => {
    const ns = nsNeuf();
    const a = await put('annotations', boite(ns, 'existante'));
    const b = await put('annotations', boite(ns, 'perdue', 2));
    const h = await put('highlights', newHighlight({ ficheId: ns, page: 1, texte: 'surligné', rects: [{ x: 0, y: 0, width: 0.1, height: 0.02 }] }));
    const v = await garderVersion(ns, 'référence', { force: true });
    await remove('annotations', b.id); await remove('highlights', h.id);
    await put('annotations', { ...(await getOne('annotations', a.id)), content: doc('existante modifiée depuis') });
    expect((await manquantesDe(ns, v)).annotations.map((x) => x.id)).toEqual([b.id]);
    const r = await recupererManquantes(ns, v);
    expect(r.ajoutees).toBe(2);
    const apres = await lireDocument(ns);
    expect(apres.annotations.find((x) => x.id === a.id).content).toEqual(doc('existante modifiée depuis')); // pas écrasée
    expect(apres.annotations.find((x) => x.id === b.id).content).toEqual(doc('perdue'));
    expect(apres.highlights.map((x) => x.id)).toEqual([h.id]);
    const vs = await listerVersions(ns);
    expect(vs.some((x) => /Avant « Récupérer/.test(x.raison))).toBe(true);
  });
  it('« Restaurer » remet la version et garde d’abord l’actuelle : restaurer la version d’avant annule', async () => {
    const ns = nsNeuf();
    const a = await put('annotations', boite(ns, 'v1'));
    const v1 = await garderVersion(ns, 'v1', { force: true });
    const c = await put('annotations', boite(ns, 'ajoutée après', 3));
    await put('annotations', { ...(await getOne('annotations', a.id)), content: doc('v2') });
    await restaurerVersion(ns, v1);
    let d = await lireDocument(ns);
    expect(d.annotations.map((x) => x.id)).toEqual([a.id]);
    expect(d.annotations[0].content).toEqual(doc('v1'));
    const avant = (await listerVersions(ns)).find((x) => x.raison === 'Avant restauration');
    expect(avant).toBeTruthy();
    await restaurerVersion(ns, avant); // annuler la restauration
    d = await lireDocument(ns);
    expect(new Set(d.annotations.map((x) => x.id))).toEqual(new Set([a.id, c.id]));
    expect(d.annotations.find((x) => x.id === a.id).content).toEqual(doc('v2'));
    // les éléments retirés par la restauration ne sont pas « disparus » (suppression enregistrée)
    expect(compter(d).boites).toBe(2);
  });
  it('une version partielle (sauvegarde locale) ne se restaure pas', async () => {
    const ns = nsNeuf();
    const v = await garderVersion(ns, 'partielle', { contenu: { annotations: [], highlights: [] }, source: 'locale', partielle: true, id: 'loc:x' });
    await expect(restaurerVersion(ns, v)).rejects.toThrow(/partielle/);
  });
});

describe('annuler / rétablir ne perdent jamais le texte tapé', () => {
  it('annuler la création d’une boîte où l’on a écrit puis rétablir → le texte revient', async () => {
    const ns = nsNeuf();
    const pile = creerPile();
    const rec = boite(ns, '');
    await pile.appliquer(cmdCreer('annotations', rec));
    await put('annotations', { ...(await getOne('annotations', rec.id)), content: doc('texte tapé ensuite') }); // frappe (hors pile)
    await pile.annuler();
    expect(await getOne('annotations', rec.id)).toBeUndefined();
    await pile.retablir();
    expect((await getOne('annotations', rec.id)).content).toEqual(doc('texte tapé ensuite'));
  });
  it('annuler un déplacement garde le texte tapé après ce déplacement', async () => {
    const ns = nsNeuf();
    const pile = creerPile();
    const b = await put('annotations', boite(ns, 'avant'));
    await pile.appliquer(cmdModifier('annotations', b, { ...b, x: 0.5 }, 'Déplacement'));
    await put('annotations', { ...(await getOne('annotations', b.id)), content: doc('avant puis complété') });
    await pile.annuler();
    const r = await getOne('annotations', b.id);
    expect(r.x).toBe(0.1);
    expect(r.content).toEqual(doc('avant puis complété'));
  });
});

describe('route des versions dans les copies (lecture seule)', () => {
  it('une version par contenu distinct, rien d’écrit au dépôt', async () => {
    const { retrouverVersionsDoc } = await import('../../api/_lib/sauvegarde.js');
    const ns = 'fX::fiche:1';
    const lignes = (ids) => ids.map((id) => JSON.stringify({ store: 'annotations', id, data: { id, ficheId: ns, updatedAt: id }, deleted: false })).join('\n');
    const commits = [
      { sha: 'c3', commit: { message: 'backup 2026-11-14', committer: { date: '2026-11-14T02:05:00Z' }, tree: { sha: 't3' } } },
      { sha: 'c2', commit: { message: 'backup 2026-11-13', committer: { date: '2026-11-13T02:05:00Z' }, tree: { sha: 't2' } } },
      { sha: 'c1', commit: { message: 'backup 2026-11-12', committer: { date: '2026-11-12T02:05:00Z' }, tree: { sha: 't1' } } },
    ];
    const blobs = { b3: lignes(['an1', 'an2']), b2: lignes(['an1', 'an2']), b1: lignes(['an1']) };
    const methodes = [];
    const fetchFn = async (url, o = {}) => {
      methodes.push(o.method || 'GET');
      const u = String(url);
      let corps;
      if (/\/commits\?/.test(u)) corps = commits;
      else if (/\/git\/trees\/t(\d)/.test(u)) { const k = u.match(/t(\d)/)[1]; corps = { tree: [{ type: 'blob', path: 'data/records.jsonl', sha: 'b' + k }] }; }
      else if (/\/git\/blobs\/b(\d)/.test(u)) { const k = u.match(/blobs\/(b\d)/)[1]; corps = { content: Buffer.from(blobs[k]).toString('base64'), encoding: 'base64' }; }
      else corps = {};
      return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) };
    };
    const r = await retrouverVersionsDoc({ ns, env: { BACKUP_GITHUB_TOKEN: 'x', BACKUP_GITHUB_REPO: 'o/d', GITHUB_BACKUP_TOKEN: 'x', GITHUB_BACKUP_REPO: 'o/d' }, fetchFn });
    expect(r.ok).toBe(true);
    expect(r.versions.map((v) => [v.copie, v.annotations.length])).toEqual([['2026-11-13', 2], ['2026-11-12', 1]]);
    expect(methodes.every((m) => m === 'GET')).toBe(true);
  });
});
