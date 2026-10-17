// Banc de l'emploi du temps (17/10) : Chrome headless 9333 + Vite :5199 SANS Supabase, avec
// HELHA_ICAL_URL=http://localhost:54410/edt.ics (faux-hyperplanning.mjs). Jamais le vrai cloud.
// ouvrir({ date, tz, W, H, tactile }) : une connexion = un scénario (l'émulation saute à la déconnexion).
import { banc as bancFJ } from '../tests-fiche-jumelle/commun.mjs';
import fs from 'node:fs';

export const HP = 'http://localhost:54410';
export const hp = (chemin) => fetch(HP + chemin).then((r) => r.text());
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** relit Hyperplanning côté serveur (force=1, en respectant la limite d'une fois par minute) */
export async function forcerServeur() {
  for (let i = 0; i < 3; i++) {
    const r = await fetch('http://localhost:5199/api/timetable?force=1', { method: 'POST', headers: { Origin: 'http://localhost:5199', 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json();
    if (!j.forceLimite) return j;
    await dormir((j.reessaiForce + 1) * 1000);
  }
  throw new Error('force impossible');
}

// horloge décalée : `iso` = instant simulé au chargement (l'horloge continue d'avancer)
const scriptDate = (iso) => `(()=>{const D=Date;const delta=${Date.parse(iso)}-D.now();class FD extends D{constructor(...a){if(a.length===0)super(D.now()+delta);else super(...a);}static now(){return D.now()+delta;}}window.Date=FD;})()`;

export async function ouvrir({ date = null, tz = null, W = 1440, H = 900, tactile = false, ecran = 'accueil' } = {}) {
  const b = await bancFJ(W, H, { tactile });
  await b.c.send('Page.enable');
  await b.c.send('Network.enable');
  await b.c.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (tz) await b.c.send('Emulation.setTimezoneOverride', { timezoneId: tz });
  if (date) await b.c.send('Page.addScriptToEvaluateOnNewDocument', { source: scriptDate(date) });
  b.recharger = async () => { await b.c.send('Page.reload', { ignoreCache: true }); await b.dormir(3800); await b.assurerMedRevise(); };
  b.assurerMedRevise = async () => {
    const app = await b.ev(`document.body.innerText.includes('Choisis ton espace') ? 'hub' : document.body.innerText.includes('PLANNING REPAS') ? 'mealweek' : 'medrevise'`);
    if (app === 'mealweek') { await b.ev(`[...document.querySelectorAll('button')].find(b=>/Retour à l.accueil|Changer d.app/.test(b.title||b.getAttribute('aria-label')||''))?.click();1`); await b.dormir(1200); }
    if (await b.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await b.ev(`[...document.querySelectorAll('.hub-card')].find(b=>/^\\s*MedRevise/i.test(b.innerText))?.click();1`); await b.dormir(1800); }
  };
  b.accueil = async () => { if (W >= 761) { await b.allerA('Accueil'); await b.dormir(600); } };
  b.mode = async (m) => { // 'j' | 'ecole' — clic réel sur le segment
    const p = await b.pos(`[...document.querySelectorAll('.edt-seg .seg-btn')].find(x=>x.innerText.trim()===${JSON.stringify(m === 'j' ? 'Mes J' : 'École')})`, false);
    if (W < 761 || tactile) await b.tape(p); else await b.clic(p, { att: 600 });
  };
  b.cartes = () => b.ev(`[...document.querySelectorAll('.edt-cours')].map(e=>({uid:e.dataset.uid,t:e.querySelector('.edt-t').textContent,h:e.querySelector('.edt-h').textContent,p:(e.querySelector('.edt-p')||{}).textContent||'',l:(e.querySelector('.edt-l')||{}).textContent||'',c:e.style.getPropertyValue('--edt-c'),cls:e.className,jour:(e.closest('.wcal-day')||{}).ariaLabel||null}))`);
  b.avant = () => b.ev(`(()=>{const e=document.querySelector('.edt-avant');return e?{txt:e.querySelector('.edt-avant-txt').textContent,cls:e.className,boutons:[...e.querySelectorAll('button')].map(x=>x.textContent.trim())}:null})()`);
  b.debordement = () => b.ev(`(()=>{const d=document.scrollingElement;const hors=[...document.querySelectorAll('.edt *, .edt-selecteur *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.right>innerWidth+0.5||r.left<-0.5)}).map(e=>e.className||e.tagName).slice(0,5);return {sw:d.scrollWidth,iw:innerWidth,hors}})()`);
  // capture d'un élément entier : la fenêtre est agrandie le temps de la prise si l'élément dépasse
  b.png = async (nom, sel = null, marge = 0) => {
    let clip = null; let agrandi = false;
    if (sel) {
      let r = await b.rect(`document.querySelector(${JSON.stringify(sel)})`);
      if (r && r.b + marge > H) {
        await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.ceil(r.b + marge + 40), deviceScaleFactor: 1, mobile: W < 1200 });
        agrandi = true; await b.dormir(500);
        r = await b.rect(`document.querySelector(${JSON.stringify(sel)})`);
      }
      if (r) clip = { x: Math.max(0, r.x - marge), y: Math.max(0, r.y - marge), width: r.w + 2 * marge, height: r.h + 2 * marge };
    }
    await b.capture(nom, clip);
    if (agrandi) { await b.c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 1200 }); await b.dormir(300); }
    return `../cap/${nom}.png`;
  };
  // remet le banc à zéro pour l'emploi du temps (base LOCALE du banc seulement)
  b.reinit = async ({ mode = 'j' } = {}) => {
    await b.ev(`(()=>{for(const k of ['medrevise.edt.cache.v1','medrevise.edt.changements.v1','medrevise.derniersCours.v1'])localStorage.removeItem(k);localStorage.setItem('medrevise.accueil.calendrier',JSON.stringify(${JSON.stringify(mode)}));return 1})()`);
    await b.S(`await S.remove('prompts','edtReglages');return 1`);
  };
  b.attendre = async (js, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await b.ev(`!!(${js})`)) return true; await b.dormir(150); } return false; };
  b.attendreEcole = () => b.attendre(`document.querySelector('.edt-nav') && !document.querySelector('.edt-actualiser:disabled')`);
  // /api/timetable « hors ligne » (le reste de l'app se charge normalement)
  b.couperApi = async () => {
    await b.c.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/timetable*' }] });
    b.c.on((m) => { if (m.method === 'Fetch.requestPaused') b.c.send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'InternetDisconnected' }).catch(() => {}); });
  };
  b.selectionner = (sel, valeur) => b.ev(`(()=>{const s=${sel};const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,${JSON.stringify(valeur)});s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()`);
  await b.recharger();
  if (ecran === 'accueil') await b.accueil();
  return b;
}
export const identiques = (a, b) => fs.readFileSync(a).equals(fs.readFileSync(b));
