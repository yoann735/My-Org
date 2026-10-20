// (20/10 soir) Règle de scoring des mots-clés proposés (transcription/keyterms.js#proposerTermesDetail) —
// docs/compte-rendu-pdfreader-v4.md. Texte seul (sans PDF) : rareté × fréquence × (1 + bonus).
import { describe, it, expect } from 'vitest';
import { proposerTermesDetail, proposerTermes } from '../../src/medrevise/transcription/keyterms.js';
import { rarete, singulier } from '../../src/medrevise/transcription/motsFrequents.js';

const COURS = `Les acides aminés forment les protéines. Les acides aminés sont reliés par une liaison peptidique.
La glycolyse transforme le glucose. L'ATPase hydrolyse l'ATP. Le canal de Havers est entouré d'ostéocytes.
Les acides aminés essentiels. La glycolyse produit du pyruvate. Une hépatite est une inflammation du foie.
Chapitre 2 — diapositive 14 — figure 3. Le glucose est un monosaccharide. Le musculus soleus.
Le canal de Havers, encore. La glycolyse, toujours. Les protéines et les acides aminés. L'ATP, encore.
© 2020 Elsevier, reproduced with permission. Chapitre trois. Une petite maison, une grande ville.`;

describe('mots-clés proposés', () => {
  it('rareté : mots courants exclus ou affaiblis, pluriels ramenés au singulier', () => {
    expect(rarete('les')).toBe(0);
    expect(rarete('maison')).toBe(0.25);
    expect(rarete('glycolyse')).toBe(1);
    expect(singulier('protéines')).toBe('protéine');
    expect(singulier('fémoraux')).toBe('fémoral');
  });
  it('propose les termes techniques, triés par score, avec leur explication', async () => {
    const l = await proposerTermesDetail(null, { texteEnPlus: COURS });
    const termes = l.map((x) => x.terme);
    expect(termes).toContain('acides aminés'); // terme de deux mots répété
    expect(termes).toContain('glycolyse'); // rare et fréquent
    expect(termes).toContain('ATPase'); // majuscule interne
    expect(termes).toContain('canal de Havers'); // éponyme
    expect(termes).toContain('hépatite'); // suffixe médical
    for (let i = 1; i < l.length; i++) expect(l[i - 1].score).toBeGreaterThanOrEqual(l[i].score);
    expect(l[0].pourquoi).toMatch(/^score [\d,]+ = rareté [\d,]+ × fréquence \d+ fois/);
  });
  it('exclut mots vides, mise en page, crédits de figure et mots courants', async () => {
    const t = (await proposerTermes(null, { texteEnPlus: COURS })).map((x) => x.toLocaleLowerCase('fr'));
    for (const exclu of ['les', 'chapitre', 'diapositive', 'figure', 'elsevier', 'permission', 'reproduced', 'maison', 'ville', 'petite']) expect(t).not.toContain(exclu);
  });
  it('au plus 50 termes', async () => {
    const long = Array.from({ length: 120 }, (_, i) => `hépatocyte${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}ose`).join(' ').repeat(2);
    expect((await proposerTermes(null, { texteEnPlus: long })).length).toBeLessThanOrEqual(50);
  });
});
