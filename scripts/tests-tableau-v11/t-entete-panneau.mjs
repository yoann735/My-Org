// v1.1 — EN-TÊTE DU PANNEAU EN SESSION DE TRANSCRIPT (docs/compte-rendu-tableau-flashcards.md « v1.1 — corrections »).
// Panneau à 320, 360, 420 et 520 px : sélecteur de modes (libellés abrégés, sinon défilement doux avec fondu), rangée
// de contrôles de session (deux lignes propres sous 400 px) ; AUCUN chevauchement ni coupure.
// Vue « lecture » d'une session enregistrée, puis session EN DIRECT (faux Deepgram, micro simulé), arrêtée à la fin.
// Usage : node t-entete-panneau.mjs <prefixe-captures> [ordinateur|ipad|mobile] [mesure]
import { banc } from '../tests-pdfreader-v3/commun.mjs';
const pref = process.argv[2] || 'v11-entete';
const app = process.argv[3] || 'ordinateur';
const mesureSeule = process.argv[4] === 'mesure';
const b = await banc(1440, 900, { tactile: app !== 'ordinateur' });
const COURS = 'f-v3-rein';
const S = { id: 'ts-v11', kind: 'session', courseId: COURS, startedAt: '2026-10-21T08:51:00.000Z', endedAt: '2026-10-21T10:50:00.000Z', source: 'micro', keyterms: [],
  segments: Array.from({ length: 40 }, (_, i) => ({ id: 'sg-v' + i, t0: i * 24, t1: i * 24 + 20, text: `Ligne ${i + 1} : le néphron filtre le plasma.`, status: 'final' })),
  notes: [], fontSize: 'm', durationS: 7140, createdAt: '2026-10-21T08:51:00.000Z', updatedAt: '2026-10-21T10:50:00.000Z' };
await b.S(`for(const r of await S.getAll('transcript_session'))if(r.courseId===${JSON.stringify(COURS)})await S.remove('transcript_session',r.id);await S.put('transcript_session',${JSON.stringify(S)});return 1`);
await b.ev(`localStorage.setItem('medrevise.disposition.${COURS}','pdf');1`);
await b.biblio({ recharger: true });
await b.ouvrir('Rein v3'); await b.dormir(1500);
if (app === 'ipad') await b.c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true });
if (app === 'mobile') await b.c.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true });
if (app !== 'ordinateur') await b.dormir(1800);
const tape = async (p) => (app === 'ordinateur' ? b.clic(p, { att: 700 }) : (await b.tape(p), b.dormir(500)));
await tape(await b.pos(`[...document.querySelectorAll('.pm-seg-btn')].find(x=>/^(Transcript|Trans)/.test(x.innerText.trim()))`, false));
const vues = [['lecture', async () => { await tape(await b.pos(`document.querySelector('.trx-session[data-session="ts-v11"]')`, true)); await b.dormir(800); }],
  ['direct', async () => {
    await tape(await b.pos(`document.querySelector('.trx-retour')`, false)); await b.dormir(500);
    await tape(await b.pos(`[...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText))`, false)); await b.dormir(1200);
    for (let i = 0; i < 20 && !(await b.ev(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop();return !!x&&!x.disabled})()`)); i++) await b.dormir(300);
    await tape(await b.pos(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop()`, true)); await b.dormir(3000);
    if (!(await b.ev(`!!(window.__transcription&&window.__transcription.lireEtat().phase==='live')`))) throw new Error('session en direct non démarrée');
  }]];
// chevauchements : toute paire d'éléments visibles « feuilles » de l'en-tête dont les rectangles se croisent ; coupures :
// un élément qui dépasse de son conteneur visible (hors zone de défilement voulue) ou dont le texte est rogné sans ellipse
const MESURE = `(()=>{const pis=document.querySelector('.pis-body');const P=pis.getBoundingClientRect();
  const zone=[...pis.querySelectorAll('.pm-seg-btn, .trx-panneau .trx-entete-lecture > *, .trx-panneau .trx-controles *, .trx-panneau .trx-barre > *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden]')});
  const feuilles=zone.filter(e=>!zone.some(f=>f!==e&&e.contains(f)));
  const R=feuilles.map(e=>({e,r:e.getBoundingClientRect()}));
  const croise=[];for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length;j++){const a=R[i].r,c=R[j].r;const ix=Math.min(a.right,c.right)-Math.max(a.left,c.left),iy=Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top);if(ix>1&&iy>1&&!R[i].e.contains(R[j].e)&&!R[j].e.contains(R[i].e))croise.push((R[i].e.className||R[i].e.tagName)+' × '+(R[j].e.className||R[j].e.tagName))}
  const defil=pis.querySelector('.pm-seg-defil');const D=defil?defil.getBoundingClientRect():P;
  const hors=R.filter(({e,r})=>{const dansSeg=e.closest('.pm-seg-defil');const B=dansSeg?D:P;return !dansSeg&&(r.left<B.left-1||r.right>B.right+1)}).map(({e})=>e.className||e.tagName);
  const rogne=R.filter(({e})=>e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).textOverflow!=='ellipsis'&&e.children.length===0).map(({e})=>(e.className||e.tagName)+':'+e.textContent.trim());
  const segs=[...pis.querySelectorAll('.pm-seg-btn')].map(x=>{const r=x.getBoundingClientRect();return {t:x.innerText.replace(/\\s+/g,' ').trim(),l:Math.round(r.left),w:Math.round(r.width),sw:x.scrollWidth,cw:x.clientWidth}});
  const ctl=[...pis.querySelectorAll('.trx-panneau > .trx-barre.secondaire > :not(.trx-ressort)')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return Math.round(r.top+r.height/2)}).sort((x,y)=>x-y).reduce((l,c)=>(l.length&&c-l[l.length-1]<10?l:[...l,c]),[]);
  return {larg:Math.round(P.width),croise,hors,rogne,segs,lignesCtl:ctl.length,defil:defil?{sw:defil.scrollWidth,cw:defil.clientWidth,fondu:getComputedStyle(defil).maskImage||getComputedStyle(defil).webkitMaskImage}:null}})()`;
// largeur du PANNEAU = celle de son corps (.pis-body ; la poignée de repli est à côté)
const largeur = (w) => b.ev(`(()=>{const p=document.querySelector('.pis');const poignee=p.getBoundingClientRect().width-document.querySelector('.pis-body').getBoundingClientRect().width;const t=${w}+poignee;
  if(document.querySelector('.lecteur-tab')){const ws=document.querySelector('.pdfr-workshop');ws.style.gridTemplateColumns='';p.style.justifySelf='end'}p.style.flex='0 0 '+t+'px';p.style.width=t+'px';p.style.maxWidth=t+'px';return 1})()`);
for (const [vue, aller] of vues) {
  await largeur(520); await b.dormir(400);
  await aller();
  for (const w of [520, 420, 360, 320]) {
    await largeur(w); await b.dormir(700);
    const m = await b.ev(MESURE);
    if (mesureSeule) console.log(vue, w, JSON.stringify(m));
    else b.ok(Math.abs(m.larg - w) <= 1 && !m.croise.length && !m.hors.length && !m.rogne.length && (w >= 400 || m.lignesCtl <= 2), `${vue} — panneau de ${m.larg} px : aucun chevauchement, rien de coupé${w < 400 ? ', contrôles sur deux lignes propres' : ''}`, JSON.stringify(m));
    await b.capture(`${pref}-${vue}-${w}-${app}`, await b.ev(`(()=>{const r=document.querySelector('.pis-body').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:${vue === 'direct' ? 200 : 150}}})()`));
  }
}
// arrêter la session en direct (base locale)
await b.ev(`(()=>{const x=document.querySelector('.trx-stop');x&&x.click();return 1})()`); await b.dormir(2500);
await b.ev(`(()=>{const p=document.querySelector('.pis');p.style.flex='';p.style.width='';p.style.maxWidth='';p.style.justifySelf='';return 1})()`);
if (!mesureSeule) b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
