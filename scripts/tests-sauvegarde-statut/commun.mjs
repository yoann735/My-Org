// Banc « sauvegarde + statut de synchro » (07/11, docs/compte-rendu-sauvegarde-et-statut-synchro.md).
// Installation (profils Chrome NEUFS, jamais le vrai cloud ni le vrai GitHub) :
//   faux Supabase :54399 (scripts/faux-supabase.mjs, JOURNAL=1), faux GitHub :54398 (./faux-github.mjs),
//   Vite :5303 (VITE_SUPABASE_URL=http://localhost:54399, GITHUB_API_URL=http://localhost:54398) — config « medrevise-banc-sauvegarde »,
//   Chrome headless 9335 (ordinateur 1440×900), 9336 (téléphone 390×844 tactile), 9337 (tablette 1024×1366 tactile).
// L'adresse ouverte contient « 5300 » (?banc=5300) pour réutiliser tels quels les outils des bancs précédents.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appareil as appSynchro } from '../tests-synchro-affichage/commun.mjs';
import { banc as bancAA } from '../tests-a-apprendre/commun.mjs';

export const URL_APP = 'http://localhost:5303/?banc=5300';
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/sauvegarde-statut/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });
export const FAUX_SB = 'http://localhost:54399';
export const FAUX_GH = 'http://localhost:54398';
export const poste = (base, chemin) => fetch(base + chemin, { method: 'POST' }).then((r) => r.json());
export const etatGh = () => fetch(FAUX_GH + '/__etat').then((r) => r.json());

/** ouvre (ou réutilise) un onglet sur l'app dans le Chrome du port donné */
async function onglet(port) {
  const l = await (await fetch(`http://localhost:${port}/json`)).json();
  if (!l.some((x) => x.type === 'page' && x.url.includes('5300'))) await fetch(`http://localhost:${port}/json/new?${URL_APP}`, { method: 'PUT' });
}

/** type : 'ordi' | 'tel' | 'tablette' */
export async function dispositif(type) {
  const port = { ordi: 9335, tel: 9336, tablette: 9337 }[type];
  await onglet(port);
  let b;
  if (type === 'tablette') {
    process.env.CDP_FILTRE = '5300'; process.env.CDP_PORT = '9337';
    b = await bancAA(1024, 1366, { tactile: true });
    b.echecs = 0;
    b.v = (c, m, d = '') => { if (!b.ok(c, m, d)) b.echecs++; return c; };
    b.phase = () => b.ev(`document.documentElement.getAttribute('data-mr-synchro')`);
    b.attendrePhase = async (ph, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const p = await b.phase(); if (ph.includes(p)) return p; await b.dormir(100); } return await b.phase(); };
  } else b = await appSynchro(type === 'tel');
  b.type = type;
  b.nom = { ordi: 'ordinateur', tel: 'téléphone', tablette: 'tablette' }[type];
  await b.send('Page.enable'); await b.send('Network.enable');
  // ENREGISTREUR : à chaque mutation, le bandeau de l'en-tête ET la ligne d'état de Réglages (s'ils sont affichés)
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { window.__etats = []; let d = '';
    const lire = () => { const h = document.querySelector('[data-bandeau-synchro]'); const r = document.querySelector('[data-etat-synchro]');
      return JSON.stringify({ h: h ? h.dataset.bandeauSynchro : null, ht: h ? h.innerText.trim() : null, hn: h && h.dataset.enAttente != null ? +h.dataset.enAttente : null,
        r: r ? r.dataset.etatSynchro : null, rt: r ? (r.querySelector('[data-etat-texte]') || r).innerText.trim() : null, rn: r ? +r.dataset.enAttente : null }); };
    new MutationObserver(() => { const v = lire(); if (v !== d) { d = v; window.__etats.push([Math.round(performance.now()), JSON.parse(v)]); } }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true }); })();` });
  b.etats = () => b.ev(`JSON.stringify(window.__etats || [])`).then(JSON.parse);
  b.viderEtats = () => b.ev(`(window.__etats = [], 1)`);
  /** chaque instant où l'en-tête ET la ligne de Réglages sont affichés : même code et même nombre ? */
  b.divergences = async () => (await b.etats()).filter(([, e]) => e.h && e.r && (e.h !== e.r || (e.hn ?? 0) !== (e.rn ?? 0)));
  b.ligne = () => b.ev(`(() => { const r = document.querySelector('[data-etat-synchro]'); return r ? { code: r.dataset.etatSynchro, n: +r.dataset.enAttente, texte: (r.querySelector('[data-etat-texte]') || r).innerText.trim() } : null; })()`);
  b.entete = () => b.ev(`(() => { const h = document.querySelector('[data-bandeau-synchro]'); return h ? { code: h.dataset.bandeauSynchro, n: h.dataset.enAttente != null ? +h.dataset.enAttente : null, texte: h.innerText.trim() } : null; })()`);
  /** l'état unique tel que l'app le calcule (même valeur que les deux affichages) */
  b.etatUnique = () => b.ev(`(async () => { const E = ${b.mod('etatSynchro.js')}; const l = E.enAttenteActuel(); return l ? { n: l.elements.length, le: l.le, elements: l.elements.map((e) => ({ type: e.type, titre: e.titre, raison: e.raison })) } : null; })()`);
  b.capture = async (nom) => { const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + nom + '.png', Buffer.from(s.data, 'base64')); };
  b.recharger = async () => { await b.send('Page.navigate', { url: URL_APP }); await b.dormir(2500); await b.ouvrirApp({ recharger: false }); };
  /** Réglages (ordinateur, tablette) ou section Synchronisation de l'accueil (téléphone) */
  b.reglages = async () => {
    if (type === 'tel') { await b.ev(`(() => { const s = [...document.querySelectorAll('.mrm-section-head')].find((x) => /Synchronisation/.test(x.innerText)); s && s.scrollIntoView({ block: 'start' }); return 1; })()`); await b.dormir(400); return; }
    await b.ev(`(() => { const x = [...document.querySelectorAll('.sb-item')].find((e) => (e.title || '').startsWith('Réglages')); x && x.click(); return 1; })()`);
    await b.attendre(`!!document.querySelector('[data-testid=carte-sauvegardes]')`, 15000); await b.dormir(500);
  };
  b.voirSynchro = () => b.ev(`(() => { const r = document.querySelector('[data-etat-synchro]'); r && r.scrollIntoView({ block: 'center' }); return !!r; })()`);
  b.voirSauvegardes = () => b.ev(`(() => { const r = document.querySelector('[data-testid=carte-sauvegardes]'); r && r.scrollIntoView({ block: 'center' }); return !!r; })()`);
  b.horsLigne = async (oui) => {
    await b.send('Network.emulateNetworkConditions', { offline: !!oui, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await b.ev(`(window.dispatchEvent(new Event(${JSON.stringify(oui ? 'offline' : 'online')})), 1)`);
  };
  return b;
}
