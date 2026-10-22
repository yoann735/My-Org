// v1.1 (22/10) — CARTES DU TABLEAU : capture du même jeu de cartes, ancien tableau (code d'avant 721a422, store
// `tableau`) ou tableau actuel (store `board`), fond clair, caméra identique. Usage : node cap-cartes.mjs <nom> [ancien]
import { banc, COURS } from '../tests-flashcards-refonte/commun.mjs';
const nom = process.argv[2] || 'cartes';
const ancien = process.argv[3] === 'ancien';
const b = await banc(1440, 900);
const CARTES = [
  { x: 0, y: 0, texte: 'Néphron\nUnité fonctionnelle du rein', couleur: 'jaune' },
  { x: 260, y: 0, texte: 'Glomérule : filtration du plasma', couleur: 'bleu' },
  { x: 520, y: 0, texte: 'Tubule contourné proximal', couleur: 'vert' },
  { x: 0, y: 140, texte: 'Anse de Henle — concentration', couleur: 'rose' },
  { x: 260, y: 140, texte: 'Tube collecteur (ADH)', couleur: 'blanc' },
  { x: 520, y: 140, texte: 'Carte foncée : violet', couleur: 'violet' },
  { x: 0, y: 280, texte: '', couleur: 'jaune' },
];
const cartes = CARTES.map((c, i) => ({ id: 'cv11-' + i, ficheId: COURS, type: 'carte', w: 220, h: 96, z: i, ...c }));
await b.S(`await S.remove('board','board:${COURS}').catch(()=>{});for(const t of await S.getAll('tableau'))if(t.ficheId===${JSON.stringify(COURS)})await S.remove('tableau',t.id);
  ${ancien ? `for(const c of ${JSON.stringify(cartes)})await S.put('tableau',c);`
    : `await S.put('board',{id:'board:${COURS}',ficheId:${JSON.stringify(COURS)},kind:'board',v:1,theme:'blanc',viewport:{x:80,y:80,z:1},edges:[],objects:${JSON.stringify(cartes.map((c) => ({ id: c.id, type: 'carte', x: c.x, y: c.y, w: c.w, h: c.h, z: c.z, couleur: c.couleur, titre: '', corps: c.texte })))}});`}
  return 1`);
await b.ev(`localStorage.setItem('medrevise.disposition.${COURS}','tableau');localStorage.setItem('medrevise.tableau.cam.${COURS}',JSON.stringify({x:80,y:80,z:1}));1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(2000);
if (!(await b.ev(`!!document.querySelector('.tb-vue')`))) {
  if (ancien) await b.clic(await b.pos(`[...document.querySelectorAll('button')].find(x=>/tableau/i.test(x.title||x.innerText)&&x.offsetParent)`, false), { att: 800 });
  else { await b.clic(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Tableau'))`, false), { att: 600 }); await b.clic(await b.pos(`document.querySelector('.ptb2 [data-act="plein"]')`, false), { att: 1200 }); }
}
const V = await b.rect(`document.querySelector('.tb-vue')`);
await b.capture(nom, { x: Math.round(V.x), y: Math.round(V.y), width: 860, height: 470 });
const m = await b.ev(`(()=>{const e=document.querySelector('.tb-carte,.tb2-carte');const s=getComputedStyle(e);const t=e.querySelector('.tb-texte,.tb2-corps,.tb2-vide');const st=t?getComputedStyle(t):{};return {r:s.borderRadius,pad:s.padding,ombre:s.boxShadow,bord:s.border,fond:s.backgroundColor,encre:s.color,police:st.font,lh:st.lineHeight}})()`);
console.log(JSON.stringify(m));
await b.ev(`localStorage.setItem('medrevise.disposition.${COURS}','pdf');1`);
process.exit(0);
