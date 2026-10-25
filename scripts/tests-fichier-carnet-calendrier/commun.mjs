// Banc du chantier du 17/10 (menu Fichier en sections · carnet/apprentissage depuis la révision ·
// calendrier École) — Vite :5199 SANS Supabase + Chrome headless 9333, base LOCALE seulement.
import { banc as bancBF } from '../tests-bibliotheque-fichier/commun.mjs';
export const FX = process.env.FX || '/private/tmp/claude-501/-Users-yoannlmr/674331a8-6a8d-4fc3-b297-21ed022b7f02/scratchpad/banc/fx';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancBF(W, H, opts);
  // téléchargements : interceptés (nom gardé, rien n'est écrit sur le disque)
  b.pieger = () => b.ev(`(()=>{window.__dl=[];if(!window.__dlPiege){window.__dlPiege=1;const o=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__dl.push(this.download);return;}return o.call(this)}};return 1})()`);
  b.telecharges = () => b.ev(`window.__dl||[]`);
  b.ouvrirMenu = async () => { if (!(await b.ev(`!!document.querySelector('.mf-menu')`))) await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 450 }); };
  b.fermerMenu = async () => { if (await b.ev(`!!document.querySelector('.mf-menu')`)) { await b.T.Escape(); await b.dormir(200); } };
  // { sections: [{ cle, affiche, retrait, role, nom, entrees: [{ id, label, gris, titre, kbd }] }] }
  b.lireSections = () => b.ev(`[...document.querySelectorAll('.mf-menu .mf-section')].map(s=>({cle:s.dataset.section,affiche:s.classList.contains('affiche'),retrait:s.classList.contains('en-retrait'),
    role:(s.querySelector('.mf-tete-role')||{}).textContent||'',nom:(s.querySelector('.mf-tete-nom')||{}).innerText||'',marque:!!s.querySelector('.mf-affiche'),fond:getComputedStyle(s).backgroundColor,
    entrees:[...s.querySelectorAll('[data-entree]')].map(e=>({id:e.dataset.entree,label:(e.querySelector('.mf-label')||e).innerText.trim(),gris:e.getAttribute('aria-disabled')==='true'||e.classList.contains('indispo'),titre:e.title,kbd:(e.querySelector('.mf-kbd')||{}).innerText||'',danger:e.classList.contains('danger'),
      choix:[...e.querySelectorAll('[data-choix]')].map(c=>({id:c.dataset.choix,gris:c.getAttribute('aria-disabled')==='true',titre:c.title}))}))}))`);
  // clic sur l'entrée `id` de la section `cle` (et la pastille `choix`)
  // (25/10) un export ouvre d'abord le choix des pages (pdf/ChoixPages.jsx) : « Toutes » puis Exporter (attend la fenêtre)
  b.validerPages = async (attente = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < attente) {
      if (await b.ev(`!!document.querySelector('.cp-fenetre')`)) {
        await b.clic(await b.pos(`document.querySelector('.cp-fenetre .cp-mode[data-mode="toutes"]')`, false), { att: 200 });
        await b.clic(await b.pos(`document.querySelector('.cp-fenetre [data-action="exporter"]')`, false), { att: 400 });
        return true;
      }
      await b.dormir(200);
    }
    return false;
  };
  b.entree = async (cle, id, choix = null) => {
    await b.ouvrirMenu();
    const sel = `.mf-menu .mf-section[data-section=${cle}] [data-entree=${id}]` + (choix ? ` [data-choix=${choix}]` : '');
    await b.ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'nearest'});1`);
    const p = await b.pos(`document.querySelector(${JSON.stringify(sel)})`, false);
    if (!p) return false;
    await b.clic(p, { att: 500 });
    return true;
  };
  b.vue = () => b.ev(`(()=>{const a=document.querySelector('.pdfr-jumelle-bascule .seg-btn.active');return a?a.innerText.trim():null})()`);
  b.basculer = async (lbl) => { await b.ev(`(()=>{const x=[...document.querySelectorAll('.pdfr-jumelle-bascule .seg-btn')].find(x=>x.innerText.trim()===${JSON.stringify(lbl)});x&&x.click();return 1})()`); await b.dormir(1800); };
  return b;
}

/* ---- révision → carnet / apprentissage (17/10) ---- */
// diagnostic d'indépendance : ce que la méthode des J et FSRS possèdent pour les cartes q-rv*
// (export de diagnostic lib/diagnosticExport.js + champs bruts de planification + journal local + séance du jour)
export const DIAG = `(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const im=(p)=>import(u.find(n=>n.includes(p))||('/src/medrevise/'+p));
  const S=await im('lib/storage.js');const D=await im('lib/diagnosticExport.js');const J=await im('journal/journal.js');
  const d=await D.construireDiagnostic();
  const cartesDiag=(d.cartes||[]).filter(c=>String(c.id||c.cardId||'').startsWith('q-rv')).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const plan=(await S.getAll('questions')).filter(q=>q.id.startsWith('q-rv')).sort((a,b)=>a.id.localeCompare(b.id)).map(q=>({id:q.id,dueDate:q.dueDate,intervalDays:q.intervalDays,learnState:q.learnState,fsrs:q.fsrs||null,historique:q.historique,termine:q.termine,capped:q.capped,missed:q.missed||null}));
  const journal=(await J.toutLeJournal()).filter(e=>String(e.card_id).startsWith('q-rv')).map(e=>e.id).sort();
  const seance=await S.getMeta('seanceFC').catch(()=>null);
  return JSON.stringify({cartesDiag,plan,journal,seance:seance?{idx:seance.idx,faites:seance.faites,cartes:seance.cartes}:null});})()`;
export async function bancRevision(b) {
  b.diag = () => b.ev(DIAG);
  // sans `updatedAt` des cartes : le carnet ÉCRIT ses champs (carnetAt/Type/Raison) sur la carte — la planification, elle, ne doit pas bouger
  b.diagPlan = async () => { const d = JSON.parse(await b.diag()); d.cartesDiag = d.cartesDiag.map(({ updatedAt, ...r }) => r); return JSON.stringify(d); };
  b.carte = (id) => b.S(`return await S.getOne('questions',${JSON.stringify(id)})`);
  b.listeAppr = () => b.S(`const r=await S.getOne('learning_set','learning_set');return r?r.cardIds:[]`);
  // (17/10 soir) icônes carnet / apprentissage de la CARTE AFFICHÉE (components/ActionsCarte.jsx)
  b.ac = () => b.ev(`(()=>{const s=[...document.querySelectorAll('[data-actions-carte]')].find(e=>e.getBoundingClientRect().width>0);if(!s)return null;const r=s.getBoundingClientRect();return {id:s.dataset.actionsCarte,x:Math.round(r.x),y:Math.round(r.y),r:Math.round(r.right),b:Math.round(r.bottom),icones:[...s.querySelectorAll('.ac-icone')].map(x=>({sn:x.dataset.sn,label:x.getAttribute('aria-label'),h:Math.round(x.getBoundingClientRect().height),w:Math.round(x.getBoundingClientRect().width)}))}})()`);
  b.toast = () => b.ev(`(()=>{const t=document.querySelector('.sn-toast');return t?t.innerText.replace(/\\s+/g,' ').trim():null})()`);
  // glisser-déposer HTML5 réel (Chrome) : glisser intercepté puis déposé sur la cible
  b.glisserHTML5 = async (de, a) => {
    const c = b.c;
    await c.send('Input.setInterceptDrags', { enabled: true });
    const pris = new Promise((ok) => { c.on((m) => { if (m.method === 'Input.dragIntercepted') ok(m.params.data); }); });
    const souris = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
    await souris('mouseMoved', de[0], de[1]); await souris('mousePressed', de[0], de[1]);
    for (let k = 1; k <= 6; k++) { await souris('mouseMoved', de[0] + (a[0] - de[0]) * k / 6, de[1] + (a[1] - de[1]) * k / 6, { buttons: 1 }); await b.dormir(40); }
    const data = await Promise.race([pris, b.dormir(3000).then(() => null)]);
    if (data) {
      for (const type of ['dragEnter', 'dragOver']) { await c.send('Input.dispatchDragEvent', { type, x: a[0], y: a[1], data }); await b.dormir(120); }
      b.__surCible = await b.ev(`document.querySelector('.sb-appr').className`);
      await c.send('Input.dispatchDragEvent', { type: 'drop', x: a[0], y: a[1], data });
    }
    await souris('mouseReleased', a[0], a[1]);
    await c.send('Input.setInterceptDrags', { enabled: false });
    await b.dormir(600);
    return !!data;
  };
  return b;
}
