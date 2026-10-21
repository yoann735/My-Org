// TEXTE ET ÉPAISSEURS UNIFORMES ENTRE FORMATS (22/10) — trois cours : A4 portrait, diapo 16:9, capture d'écran 390 × 844.
//   node t-formats.mjs geo avant|apres   relève la géométrie des annotations d'AVANT (boîtes des trois gabarits, zone de
//                                        texte, trait, forme avec texte) ; « apres » compare au relevé « avant » (rien
//                                        ne doit bouger : position, taille, police, épaisseurs)
//   node t-formats.mjs uniforme          une boîte « M », un trait et une forme récents : la même proportion de la
//                                        largeur de la page sur les trois formats ; captures
import { banc } from './commun.mjs';
import fs from 'node:fs';
const [mode, quand] = process.argv.slice(2);
const b = await banc(1440, 900);
const SP = process.env.SP || '/private/tmp/claude-501/-Users-yoannlmr/001c2781-18de-49ca-9554-dc815a48abe9/scratchpad';
const COURS = [['f-fmt-a4', 'Format A4 portrait', 'format-a4.pdf'], ['f-fmt-169', 'Format diapo 16:9', 'format-169.pdf'], ['f-fmt-cap', 'Format capture', 'format-capture.pdf']];
const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const base = (f) => ({ ficheId: f, page: 1, createdAt: '2026-10-20T12:00:00.000Z' });
const anciennes = (f) => [
  { ...base(f), id: 'g-bandeau', kind: 'libre', type: 'boite', x: 0.06, y: 0.08, width: 0.3, height: 0.08, couleur: 'jaune', content: doc('Boîte d’avant, bandeau') },
  { ...base(f), id: 'g-compacte', kind: 'libre', type: 'boite', compacte: true, x: 0.06, y: 0.22, width: 0.2, height: 0.03, couleur: 'rose', fond: 'plein', content: doc('Compacte') },
  { ...base(f), id: 'g-mot', kind: 'libre', type: 'boite', gabarit: 'mot', x: 0.06, y: 0.32, width: 0.05, height: 0.02, couleur: 'jaune-franc', fond: 'plein', content: doc('Néphron') },
  { ...base(f), id: 'g-texte', kind: 'texte', type: 'texte', gabarit: 'mot', x: 0.06, y: 0.42, width: 0.05, height: 0.02, couleur: 'bleu-franc', content: doc('Hile rénal') },
  { ...base(f), id: 'g-trait', kind: 'trait', type: 'trait', mode: 'dessin', rendu: 'cr', couleur: 'rose-franc', epaisseur: 0.0042, opacite: 1, points: [[0.06, 0.55], [0.2, 0.58], [0.34, 0.55]] },
  { ...base(f), id: 'g-forme', kind: 'forme', type: 'forme', forme: 'rectangle', x: 0.06, y: 0.62, width: 0.3, height: 0.08, couleur: 'rouge-franc', epaisseur: 0.0025, texte: 'Forme' },
];
const recentes = (f) => [
  { ...base(f), id: 'u-boite', kind: 'libre', type: 'boite', gabarit: 'carte', tailleTexte: 1.0, x: 0.06, y: 0.08, width: 0.05, height: 0.02, couleur: 'jaune-franc', fond: 'plein', content: doc('Néphron') },
  { ...base(f), id: 'u-trait', kind: 'trait', type: 'trait', mode: 'dessin', rendu: 'cr', couleur: 'rose-franc', epaisseurL: 0.003, epaisseur: 0.003, opacite: 1, points: [[0.06, 0.3], [0.5, 0.3]] },
  { ...base(f), id: 'u-forme', kind: 'forme', type: 'forme', forme: 'rectangle', x: 0.06, y: 0.4, width: 0.4, height: 0.1, couleur: 'rouge-franc', epaisseurL: 0.003, epaisseur: 0.003, tailleTexte: 1.0, texte: 'Néphron' },
];
const mesurer = () => b.ev(`(()=>{const p=document.querySelector('.pdfr-page[data-cle="1"]').getBoundingClientRect();const o={page:{w:+p.width.toFixed(2),h:+p.height.toFixed(2)}};
  const rel=(r)=>({x:+(r.x-p.x).toFixed(2),y:+(r.y-p.y).toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)});
  for(const e of document.querySelectorAll('[data-objet]')){const id=e.dataset.objet;if(!/^[gu]-/.test(id))continue;const corps=e.querySelector('.nb-body,.pf-texte');const sc=parseFloat(getComputedStyle(e).scale)||1;
    const t=corps&&corps.querySelector('p, span');let tw=null;if(t&&t.firstChild){const g=document.createRange();g.selectNodeContents(t);tw=+g.getBoundingClientRect().width.toFixed(2)}
    const trace=e.querySelector('.pf-trace');o[id]={...rel(e.getBoundingClientRect()),police:corps?+(parseFloat(getComputedStyle(corps).fontSize)*sc).toFixed(2):null,texte:tw,bord:trace?+parseFloat(trace.getAttribute('stroke-width')).toFixed(3):null}}
  for(const t of document.querySelectorAll('.pdfr-inklayer path')){o['trait'+(o.trait1?2:1)]={ep:+parseFloat(t.getAttribute('stroke-width')).toFixed(3)}}
  return o})()`);
const ouvrir = async (id, titre, fichier, annotations) => {
  const existe = await b.S(`return !!(await S.getOne('fiches',${JSON.stringify(id)}))`);
  if (!existe) await b.semer(id, titre, fichier);
  await b.S(`for(const a of await S.getAll('annotations'))if(a.ficheId===${JSON.stringify(id)})await S.remove('annotations',a.id);for(const r of await S.getAll('reading_position'))if(String(r.id).startsWith('rp:${id}'))await S.remove('reading_position',r.id);
    for(const a of ${JSON.stringify(annotations)})await S.put('annotations',a);return 1`);
  await b.biblio({ recharger: true }); await b.ouvrir(titre); await b.dormir(1500);
  await b.ev(`window.__mrZoom(1);1`); await b.dormir(1200);
  await b.ev(`document.querySelector('.pdfr-scroll').scrollTop=0;1`); await b.dormir(900);
  await b.outil('Sélection'); await b.dormir(300);
};
if (mode === 'geo') {
  const releve = {};
  for (const [id, titre, fichier] of COURS) { await ouvrir(id, titre, fichier, anciennes(id)); releve[id] = await mesurer();
    const p = await b.page(1); await b.capture(`formats-anciennes-${id}-${quand}`, { x: Math.round(p.x), y: Math.round(Math.max(0, p.y)), width: Math.round(Math.min(p.w, 900)), height: Math.round(Math.min(p.h, 800)) }); }
  fs.writeFileSync(`${SP}/formats-${quand}.json`, JSON.stringify(releve, null, 1));
  if (quand === 'apres') {
    const avant = JSON.parse(fs.readFileSync(`${SP}/formats-avant.json`, 'utf8'));
    for (const [id] of COURS) {
      const ecarts = [];
      for (const k of Object.keys(avant[id])) {
        const a = avant[id][k], c = releve[id][k];
        if (!c) { ecarts.push(k + ' absent'); continue; }
        for (const ch of Object.keys(a)) if (a[ch] != null && Math.abs(a[ch] - (c[ch] ?? 1e9)) > 0.6) ecarts.push(`${k}.${ch} ${a[ch]} → ${c[ch]}`);
      }
      b.ok(!ecarts.length, `${id} : annotations d’avant inchangées (position, taille, police, épaisseurs) avec le nouveau style`, ecarts.join(' | ') || `${Object.keys(avant[id]).length - 1} objets identiques`);
    }
  } else console.log('relevé', Object.keys(releve));
} else {
  const r = {};
  for (const [id, titre, fichier] of COURS) { await ouvrir(id, titre, fichier, recentes(id)); r[id] = await mesurer();
    const p = await b.page(1); await b.capture(`formats-uniforme-${id}`, { x: Math.round(p.x), y: Math.round(Math.max(0, p.y)), width: Math.round(Math.min(p.w, 900)), height: Math.round(Math.min(p.h * 0.6, 520)) }); }
  const prop = (id, v) => v / r[id].page.w;
  const lignes = COURS.map(([id]) => ({ id, page: r[id].page.w, police: +(prop(id, r[id]['u-boite'].police) * 100).toFixed(3), mot: +(prop(id, r[id]['u-boite'].texte) * 100).toFixed(3), forme: +(prop(id, r[id]['u-forme'].police) * 100).toFixed(3), trait: +(prop(id, r[id].trait1.ep) * 100).toFixed(4), bord: +(prop(id, r[id]['u-forme'].bord) * 100).toFixed(4) }));
  const egal = (cle, tol) => Math.max(...lignes.map((l) => l[cle])) - Math.min(...lignes.map((l) => l[cle])) <= tol;
  b.ok(egal('police', 0.01) && Math.abs(lignes[0].police - 1.0) < 0.01, '« M » : la police fait 1 % de la largeur de la page sur les trois formats', JSON.stringify(lignes.map((l) => [l.id, l.police])));
  b.ok(egal('mot', 0.05), 'le mot « Néphron » occupe la même proportion de la largeur sur les trois formats', JSON.stringify(lignes.map((l) => [l.id, l.mot])));
  b.ok(egal('forme', 0.01), 'texte d’une forme : même proportion', JSON.stringify(lignes.map((l) => [l.id, l.forme])));
  b.ok(egal('trait', 0.002) && egal('bord', 0.002), 'trait de crayon et bordure de forme : même proportion de la largeur', JSON.stringify(lignes.map((l) => [l.id, l.trait, l.bord])));
  console.log(['| Format | Largeur affichée | Police « M » | « Néphron » | Texte de forme | Trait | Bordure |', '|---|---|---|---|---|---|---|', ...lignes.map((l) => `| ${l.id} | ${l.page} px | ${l.police} % | ${l.mot} % | ${l.forme} % | ${l.trait} % | ${l.bord} % |`)].join('\n'));
}
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
