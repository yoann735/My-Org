// (29/10) Listes dans les boîtes (docs/compte-rendu-synchro-rapide-surlignage-listes.md) : collage depuis Word / Google
// Docs / Notion (lib/collageListes.js), imbrication dans les cartes (lib/boiteVersCarte.js) et à l'export PDF
// (pdf/exportAnnote.js). DOMParser : linkedom (pas de navigateur).
import { describe, it, expect } from 'vitest';
import { DOMParser } from 'linkedom';
import { nettoyerCollage } from '../../src/medrevise/lib/collageListes.js';
import { decouperBoite } from '../../src/medrevise/lib/boiteVersCarte.js';

// blancs entre balises retirés pour comparer (« de <b> » → « de<b> »)
const net = (h) => nettoyerCollage(h, DOMParser).replace(/\s+</g, '<').replace(/>\s+/g, '>');

// extrait réel d'un collage Word (Mac / Windows) : paragraphes MsoListParagraph, marque dans un span mso-list:Ignore
const WORD = `<div class=WordSection1>
<p class=MsoNormal>Les fonctions du rein :</p>
<p class=MsoListParagraphCxSpFirst style='margin-left:36.0pt;mso-add-space:auto;text-indent:-18.0pt;mso-list:l0 level1 lfo1'><!--[if !supportLists]--><span style='font-family:Symbol;mso-fareast-font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><!--[endif]-->Filtrer le sang<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:72.0pt;mso-add-space:auto;text-indent:-18.0pt;mso-list:l0 level2 lfo1'><!--[if !supportLists]--><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><!--[endif]-->glomérule<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:72.0pt;mso-add-space:auto;text-indent:-18.0pt;mso-list:l0 level2 lfo1'><!--[if !supportLists]--><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><!--[endif]-->capsule de <b>Bowman</b><o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='margin-left:36.0pt;mso-add-space:auto;text-indent:-18.0pt;mso-list:l0 level1 lfo1'><!--[if !supportLists]--><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><!--[endif]-->Réabsorber<o:p></o:p></p>
<p class=MsoNormal>Étapes :</p>
<p class=MsoListParagraphCxSpFirst style='margin-left:36.0pt;text-indent:-18.0pt;mso-list:l1 level1 lfo2'><!--[if !supportLists]--><span><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><!--[endif]-->Filtration<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='margin-left:72.0pt;text-indent:-18.0pt;mso-list:l1 level2 lfo2'><!--[if !supportLists]--><span><span style='mso-list:Ignore'>a.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><!--[endif]-->pression nette<o:p></o:p></p>
</div>`;
// Google Docs : sous-liste posée directement dans la liste, styles en ligne partout
const GDOCS = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;margin-left:0;" aria-level="1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;">Filtrer</span></p></li><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:circle;" aria-level="2"><p dir="ltr" style="line-height:1.38;margin-top:0pt;"><span>glomérule</span></p></li></ul><li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr" style="line-height:1.38;"><span>Réabsorber</span></p></li></ul></b>`;
// Notion : liste propre, imbrication dans l'élément
const NOTION = `<ul><li>Filtrer<ul><li>glomérule</li></ul></li><li>Réabsorber</li></ul>`;

describe('listes collées', () => {
  it('Word : paragraphes « mso-list » → vraies listes imbriquées, puces / numéros retirés du texte', () => {
    const h = net(WORD);
    expect(h).toContain('<ul><li><p>Filtrer le sang</p><ul><li><p>glomérule</p></li><li><p>capsule de<b>Bowman</b></p></li></ul></li><li><p>Réabsorber</p></li></ul>');
    expect(h).toContain('<ol><li><p>Filtration</p><ol><li><p>pression nette</p></li></ol></li></ol>');
    expect(h).toContain('<p class="MsoNormal">Les fonctions du rein :</p>'); // le reste n'est pas touché
    expect(h).not.toMatch(/·|mso-list|text-indent/);
  });
  it('Google Docs : sous-liste rangée dans son élément, styles de liste retirés', () => {
    const h = net(GDOCS);
    expect(h).toContain('<ul><li dir="ltr" aria-level="1"><p dir="ltr" role="presentation"><span>Filtrer</span></p><ul><li dir="ltr" aria-level="2"><p dir="ltr"><span>glomérule</span></p></li></ul></li><li dir="ltr" aria-level="1">');
    expect(net('<ul><li><span style="font-size:11pt;font-weight:700;color:#000000">Gras</span></li></ul>')).toBe('<ul><li><span style="font-weight:700">Gras</span></li></ul>');
    expect(h).not.toMatch(/padding-inline-start|list-style-type|line-height/);
  });
  it('Notion : déjà propre, inchangé', () => {
    expect(net(NOTION)).toBe(NOTION);
  });
  it('sans liste : HTML rendu tel quel', () => {
    const h = '<p style="color:red">Texte</p>';
    expect(nettoyerCollage(h, DOMParser)).toBe(h);
  });
});

const T = (t, marks) => ({ type: 'text', text: t, ...(marks ? { marks: marks.map((m) => ({ type: m })) } : {}) });
const P = (...c) => ({ type: 'paragraph', content: c });
const LI = (...c) => ({ type: 'listItem', content: c });
const UL = (...li) => ({ type: 'bulletList', content: li });
const OL = (...li) => ({ type: 'orderedList', attrs: { start: 1 }, content: li });
const doc = (...c) => ({ type: 'doc', content: c });

describe('listes imbriquées dans une carte (boîte → flashcard)', () => {
  it('2 niveaux gardés : deux espaces par niveau, 2ᵉ niveau numéroté en lettres', () => {
    const r = decouperBoite(doc(P(T('Rein')), UL(LI(P(T('Filtrer')), UL(LI(P(T('glomérule'))), LI(P(T('capsule'))))), LI(P(T('Réabsorber')))),
      OL(LI(P(T('Filtration')), OL(LI(P(T('pression'))), LI(P(T('débit'))))), LI(P(T('Réabsorption'))))));
    expect(r.verso).toBe('- Filtrer\n  - glomérule\n  - capsule\n- Réabsorber\n1. Filtration\n  a. pression\n  b. débit\n2. Réabsorption');
  });
  it('deux lignes dans un élément : la seconde en retrait sous le texte', () => {
    const r = decouperBoite(doc(P(T('Rein')), UL(LI(P(T('Filtrer'), { type: 'hardBreak' }, T('le sang'))))));
    expect(r.verso).toBe('- Filtrer\n  le sang');
  });
});

describe('listes à l’export PDF', () => {
  // pdf.js (importé par l'export) réclame ces classes du navigateur au chargement
  for (const k of ['DOMMatrix', 'Path2D', 'ImageData']) if (!globalThis[k]) globalThis[k] = class {};
  const exp = () => import('../../src/medrevise/pdf/exportAnnote.js');
  const police = { widthOfTextAtSize: (t, s) => [...t].length * s * 0.5 }; // chasse fixe : 1 caractère = 0,5 corps
  it('niveaux : • puis –, 1. puis a. ; une sous-liste commence sous le texte de son élément', async () => {
    const { paragraphesDe } = await exp();
    const c = doc(UL(LI(P(T('Filtrer')), UL(LI(P(T('glomérule'))))), LI(P(T('Réabsorber')))), OL(LI(P(T('Filtration')), OL(LI(P(T('pression')))))));
    expect(paragraphesDe(c)).toEqual(['• Filtrer', '  – glomérule', '• Réabsorber', '1. Filtration', '   a. pression']);
  });
  it('retour à la ligne aligné sous le texte, pas sous la puce', async () => {
    const { couperLignes } = await exp();
    const l = couperLignes(['• un élément de liste assez long pour passer à la ligne'], police, 10, 120); // 24 caractères par ligne
    expect(l[0].startsWith('• ')).toBe(true);
    expect(l.slice(1).every((x) => x.startsWith('  ') && x[2] !== ' ')).toBe(true);
    const l2 = couperLignes(['   a. une sous-liste numérotée qui déborde elle aussi'], police, 10, 120);
    expect(l2.slice(1).every((x) => /^ {6}\S/.test(x))).toBe(true);
  });
});
