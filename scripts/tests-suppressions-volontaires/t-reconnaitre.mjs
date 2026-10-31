// Banc « reconnaître les cartes disparues » (31/10, docs/diagnostic-elements-manquants.md). Même installation que
// t-suppressions.mjs (Vite :5302 SANS Supabase, Chrome headless 9337, profil neuf). Jeu : tests-par-cours-elements/seed.mjs.
//  1. référence d'hier AVEC libellés → carte effacée hors interface → écran Intégrité : recto + type + cours affichés
//     tout de suite, sans appel réseau ;
//  2. référence d'AVANT le 31/10 (sans libellés) → l'écran cherche dans les copies (/api/backup-cartes, réponse simulée
//     dans la page — jamais le vrai GitHub) → recto, cours, date de suppression et verso affichés ;
//  3. copies injoignables → message clair, identifiants toujours disponibles (repliés).
import { banc } from '../tests-par-cours-elements/commun.mjs';
const b = await banc(false);
const v = (c, m, d = '') => b.v(c, m, d);
const hier = await b.S(`const sm2=await import('/src/medrevise/lib/sm2.js');const d=new Date(sm2.todayISO()+'T12:00:00');d.setDate(d.getDate()-1);return d.toLocaleDateString('fr-CA')`);
const reference = (sansLibelles = false) => b.S(`const {instantane}=await import('/src/medrevise/integrite/controle.js');
  const i=instantane(await S.getAll('questions'),${JSON.stringify(hier)});${sansLibelles ? 'delete i.libelles;delete i.idsParType;' : ''}
  await S.setMeta('integrite.instantanes',{precedent:null,courant:i});return i.total`);
const effacer = (id) => b.S(`const {del,createStore}=await import('/node_modules/.vite/deps/idb-keyval.js');await del(${JSON.stringify(id)},createStore('medrevise-questions','v1'));return 1`);
const controle = () => b.S(`const E=await import('/src/medrevise/integrite/executer.js');const r=await E.lancerControle({avecCloud:false});return r.baisse`);
const clic = async (js) => { const p = await b.rect(js); if (!p) return false; for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: p.x + p.w / 2, y: p.y + p.h / 2, button: 'left', clickCount: 1 }); await b.dormir(900); return true; };
const lignes = () => b.ev(`[...document.querySelectorAll('[data-disparue]')].map(e=>({id:e.dataset.disparue,txt:e.innerText.replace(/\\s+/g,' ').trim()}))`);
const ouvrirEcran = async () => { await b.ouvrirApp({ recharger: true }); await b.dormir(1500); return clic(`document.querySelector('[data-testid="bandeau-baisse"]')`); };
// réponse de /api/backup-cartes simulée DANS la page (posée avant chaque chargement) : localStorage 'banc.copies' =
// JSON de la réponse, ou 'echec' (réseau coupé) ; chaque appel est noté dans 'banc.appels'
await b.send('Page.enable');
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const f = window.fetch; window.fetch = async (u, o) => {
  if (!String(u).includes('/api/backup-cartes')) return f(u, o);
  const appels = JSON.parse(localStorage.getItem('banc.appels') || '[]'); appels.push(JSON.parse((o && o.body) || '{}')); localStorage.setItem('banc.appels', JSON.stringify(appels));
  const rep = localStorage.getItem('banc.copies'); await new Promise((r) => setTimeout(r, 2500));
  if (!rep || rep === 'echec') throw new TypeError('Failed to fetch');
  return new Response(rep, { status: 200, headers: { 'Content-Type': 'application/json' } }); }; })();` });
const poserCopies = (rep) => b.ev(`localStorage.setItem('banc.copies', ${JSON.stringify(rep === 'echec' ? 'echec' : JSON.stringify(rep))}); localStorage.setItem('banc.appels','[]'); 1`);
const appels = () => b.ev(`JSON.parse(localStorage.getItem('banc.appels')||'[]')`);
const carteCopie = (id) => ({ id, type: 'flashcard', recto: 'Quels sont les 4 types de Synarthroses', verso: 'synostose (os), syndesmose (fibres), synchondrose (cartilage), symphyse', cours: 'Helha Kiné › Anatomie palpatoire › 1 3 Introduction à l’arthrologie', copie: '2026-10-28', supprimeeLe: '2026-10-28T16:11:52.513Z' });

// 1. libellés gardés dans l'instantané
await poserCopies('echec');
await reference();
await effacer('c2-rev1');
let baisse = await controle();
v(baisse && baisse.details && baisse.details[0].recto === 'Cours 2 · c2-rev1', 'alerte : recto gardé dans la référence', JSON.stringify(baisse && baisse.details));
v(await ouvrirEcran(), 'clic sur le bandeau → écran Intégrité');
let l = await lignes();
v(l.length === 1 && /Cours 2 · c2-rev1/.test(l[0].txt) && /Flashcard/.test(l[0].txt) && /Cours 2 — Cœur/.test(l[0].txt), 'écran : recto, type et cours de la carte disparue', JSON.stringify(l));
v((await appels()).length === 0, 'aucun appel aux copies (libellé déjà connu)');
await b.capture('../../docs/img/suppressions-volontaires/reconnaitre-libelle', null);

// 2. référence ancienne (sans libellés) : recherche dans les copies
await poserCopies({ ok: true, cartes: ['c2-rev1', 'c3-rev1'].map(carteCopie), introuvables: [] });
await reference(true);
await effacer('c3-rev1');
baisse = await controle();
v(baisse && baisse.idsManquants.length === 1 && baisse.details.every((d) => !d.recto), 'référence sans libellés : alerte sans recto', JSON.stringify(baisse && baisse.details));
await b.ev(`localStorage.setItem('banc.appels','[]'); 1`); // l'écran resté ouvert du point 1 a déjà cherché (autre chargement de page)
v(await ouvrirEcran(), 'écran Intégrité ouvert');
await b.dormir(200);
const pendant = await b.ev(`document.querySelector('[data-testid="cartes-disparues"]').innerText`);
v(/Recherche de ces cartes dans les copies/.test(pendant), '« Recherche… » affiché pendant la lecture des copies', pendant.slice(0, 80));
await b.dormir(3000);
l = await lignes();
v(l.length === 1 && l.every((x) => /Quels sont les 4 types de Synarthroses/.test(x.txt) && /Anatomie palpatoire/.test(x.txt) && /supprimée le 28\/10/.test(x.txt) && /synostose/.test(x.txt)), 'écran : recto, cours, date de suppression et verso venus des copies', JSON.stringify(l));
const ap = await appels();
v(ap.length === 1 && ap[0].ids[0] === 'c3-rev1', 'un seul appel aux copies', JSON.stringify(ap));
v(await b.ev(`!!document.querySelector('details.filet-ids')`), 'identifiants repliés sous « Identifiants »');
await b.capture('../../docs/img/suppressions-volontaires/reconnaitre-copies', null);

// 3. copies injoignables
await poserCopies('echec');
await ouvrirEcran();
await b.dormir(3500);
const texte = await b.ev(`document.querySelector('[data-testid="cartes-disparues"]').innerText`);
v(/Serveur injoignable/.test(texte) && /Introuvable dans les copies/.test(texte), 'copies injoignables : message clair', texte.slice(0, 160));
b.fin();
