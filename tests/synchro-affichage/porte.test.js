// (28/10) Synchro complète avant affichage : la porte (lib/synchroAffichage.js), sans réseau.
import { describe, it, expect } from 'vitest';
import { creerPorte, libelleBandeau, empreintesOk, dateDonnees } from '../../src/medrevise/lib/synchroAffichage.js';

function horlogeManuelle() {
  let t = Date.parse('2026-10-28T17:42:00Z'); const minuteurs = [];
  return {
    maintenant: () => new Date(t).toISOString(),
    attendre: (ms, fn) => { const m = { a: t + ms, fn, actif: true }; minuteurs.push(m); return () => { m.actif = false; }; },
    avancer: (ms) => { t += ms; for (const m of minuteurs) if (m.actif && m.a <= t) { m.actif = false; m.fn(); } },
    enAttente: () => minuteurs.filter((m) => m.actif).length,
  };
}
const differe = () => { let ok; const p = new Promise((r) => { ok = r; }); return { p, ok }; };

describe('porte de synchro', () => {
  it('attente → ajour quand la passe réussit et que les empreintes concordent', async () => {
    const etats = []; const h = horlogeManuelle(); let marque = null;
    const porte = creerPorte({ passe: async () => ({ ok: true }), verifier: async () => ({ local: 'a', cloud: 'a', enAttente: 0 }), poser: (e) => etats.push(e.phase), marquer: (x) => { marque = x; }, horloge: h });
    const fin = await porte.lancer();
    expect(etats).toEqual(['attente', 'ajour']);
    expect(fin.at).toBe(marque);
    expect(h.enAttente()).toBe(0);
  });
  it('empreintes différentes : une seule relance, puis « incomplet »', async () => {
    let passes = 0; const h = horlogeManuelle();
    const porte = creerPorte({ passe: async () => { passes++; return { ok: true }; }, verifier: async () => ({ local: 'a', cloud: 'b', enAttente: 0 }), poser: () => {}, horloge: h });
    expect((await porte.lancer()).phase).toBe('incomplet');
    expect(passes).toBe(2);
  });
  it('2ᵉ passe qui rattrape l’écart → ajour', async () => {
    let n = 0;
    const porte = creerPorte({ passe: async () => ({ ok: true }), verifier: async () => (++n === 1 ? { local: 'a', cloud: 'b' } : { local: 'b', cloud: 'b', enAttente: 0 }), poser: () => {}, horloge: horlogeManuelle() });
    expect((await porte.lancer()).phase).toBe('ajour');
  });
  it('échec : hors ligne avec la date des données, nouvel essai en fond', async () => {
    let ok = false; const h = horlogeManuelle();
    const porte = creerPorte({ passe: async () => ({ ok }), verifier: async () => ({ local: 'x', cloud: 'x', enAttente: 0 }), poser: () => {}, derniere: () => '2026-10-27T21:10:00Z', horloge: h });
    const e = await porte.lancer();
    expect(e.phase).toBe('horsligne');
    expect(e.depuis).toBe('2026-10-27T21:10:00Z');
    ok = true; h.avancer(30000); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
    expect(porte.etat().phase).toBe('ajour');
  });
  it('plus de 8 s : hors ligne pendant la passe, puis à jour quand elle aboutit', async () => {
    const h = horlogeManuelle(); const d = differe();
    const porte = creerPorte({ passe: () => d.p, verifier: async () => ({ local: 'x', cloud: 'x', enAttente: 0 }), poser: () => {}, horloge: h });
    const fin = porte.lancer();
    h.avancer(7999); expect(porte.etat().phase).toBe('attente');
    h.avancer(1); expect(porte.etat().phase).toBe('horsligne');
    d.ok({ ok: true });
    expect((await fin).phase).toBe('ajour');
  });
  it('une seule passe à la fois (ouverture + visibilitychange + focus)', async () => {
    let passes = 0; const d = differe();
    const porte = creerPorte({ passe: () => { passes++; return d.p; }, verifier: async () => ({ local: 'x', cloud: 'x', enAttente: 0 }), poser: () => {}, horloge: horlogeManuelle() });
    const a = porte.lancer(); const b = porte.lancer(); const c = porte.lancer();
    expect(a).toBe(b); expect(b).toBe(c);
    d.ok({ ok: true }); await a;
    expect(passes).toBe(1);
  });
  it('écritures encore en attente d’envoi : pas « à jour »', () => {
    expect(empreintesOk({ local: 'a', cloud: 'a', enAttente: 2 })).toBe(false);
    expect(empreintesOk(null)).toBe(false);
  });
  it('libellés', () => {
    expect(libelleBandeau({ phase: 'attente' })).toBe('Synchronisation…');
    expect(libelleBandeau({ phase: 'ajour', at: new Date(2026, 9, 28, 18, 42).toISOString() })).toBe('À jour · 18:42');
    expect(dateDonnees(new Date(2026, 9, 27, 22, 10).toISOString())).toBe('27 oct. 22:10');
    expect(libelleBandeau({ phase: 'horsligne', depuis: new Date(2026, 9, 27, 22, 10).toISOString() })).toBe('Hors ligne · données du 27 oct. 22:10');
    expect(libelleBandeau({ phase: 'local' })).toBe(null);
  });
});
