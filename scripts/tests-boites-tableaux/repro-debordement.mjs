// Reproduit le débordement : une boîte-tableau de 10 × 8 dans le lecteur (plusieurs zooms) et dans le tableau Miro.
import { banc } from './commun.mjs';
const b = await banc();
const lignes = Array.from({ length: 10 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === 0 ? 'Titre ' + j : 'C' + i + '.' + j + (j % 3 === 0 ? ' plus long' : ''))));
const g = { v: 1, cols: Array(8).fill(0.125), lignes, entete: true };
const G2 = { v: 1, cols: [0.5, 0.5], entete: true, lignes: [['Rein', 'Rôle'], ['Néphron', 'Filtration'], ['Anse', 'Concentration'], ['Tube', 'Réabsorption']] };
await b.preparer({ annotations: [b.boiteGrille('bt-repro', g, { taille1000: 9 }), b.boiteGrille('bt-petit', G2, { x: 0.55, y: 0.6, width: 0.3, height: 0.05, gabarit: 'carte', largeurFixe: false })] });
await b.S(`await S.put('board',{id:'board:f-simpl',ficheId:'f-simpl',kind:'board',v:1,objects:[{id:'c-repro',type:'carte',x:40,y:40,w:380,h:160,couleur:'jaune-franc',z:1,titre:'',corps:'',grille:${JSON.stringify(G2)}},{id:'c-grand',type:'carte',x:460,y:40,w:380,h:160,couleur:'bleu-franc',z:1,titre:'',corps:'',grille:${JSON.stringify(g)}}],edges:[],viewport:{x:80,y:80,z:1},theme:'sombre'});return 1`);
const mesure = (sel, inner) => b.ev(`[...document.querySelectorAll('${sel}')].map(bx=>{const t=bx.querySelector('${inner}');const r=bx.getBoundingClientRect(),q=t.getBoundingClientRect();return {id:bx.dataset.boite,boite:[Math.round(r.top),Math.round(r.bottom),Math.round(r.right)],table:[Math.round(q.top),Math.round(q.bottom),Math.round(q.right)],debordeBas:Math.round(q.bottom-r.bottom),debordeDroite:Math.round(q.right-r.right)}})`);
for (const z of [1]) {
  await b.ouvrirCours({ zoom: z });
  console.log('lecteur zoom', z, JSON.stringify(await mesure('.note-box.boite-tableau', '.btab-table')));
}
await b.capRect('bt-repro-lecteur', `document.querySelector('[data-boite="bt-petit"]')`, 30);
await b.ouvrirCours({});
const re = '^(Tableau|Le tableau en plein)$';
await b.clic(await b.pos(`[...document.querySelectorAll('button:not(.pm-seg-btn)')].find(e=>e.offsetParent&&new RegExp(${JSON.stringify(re)}).test(e.innerText.trim()||e.getAttribute('aria-label')||e.title||''))`, false), { att: 2000 });
console.log('tableau Miro', JSON.stringify(await mesure('.tb2-carte', '.btab-table')));
await b.capRect('bt-repro-miro', `document.querySelector('.tb2-carte')`, 30);
process.exit(0);
