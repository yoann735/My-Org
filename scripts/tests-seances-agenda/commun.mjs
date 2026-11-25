// Banc « séances liées à l'agenda » (26/11/2026, docs/compte-rendu-seances-liees-agenda.md).
// DONNÉES DE TEST UNIQUEMENT, jamais le vrai cloud ni le vrai Hyperplanning :
//   - Vite :5300 + faux Supabase :54399 (configs « medrevise-faux-cloud » / « faux-supabase » de .claude/launch.json) ;
//   - /api/timetable INTERCEPTÉ dans Chrome (CDP Fetch) : la réponse est calculée par le VRAI analyseur du serveur
//     (api/_lib/emploiDuTemps.js#analyserIcs) sur l'agenda de test tests/seances-agenda/agenda.mjs (Histologie 10 et
//     17 nov. 10 h–12 h même UID, Chimie 17 nov. 13 h–15 h ; variantes « supprime » et « deplace ») ;
//   - horloge simulée (le 17 nov. à 10 h 30, Bruxelles) par un script injecté avant l'app ;
//   - Chrome headless MUET (--mute-audio) des bancs précédents (scripts/tests-section-exos/commun.mjs#appareil).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { appareil as appareilBase, dormir, TRAVAIL } from '../tests-section-exos/commun.mjs';
import { analyserIcs } from '../../api/_lib/emploiDuTemps.js';
import { ics } from '../../tests/seances-agenda/agenda.mjs';

export { dormir };
export const BASE = process.env.BASE || 'http://localhost:5300'; // avec le faux cloud (ordinateur A, synchro)
export const LOCAL = process.env.LOCAL || 'http://localhost:5302'; // sans cloud (iPad, téléphone) : chaque série part d'une base vide
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/seances-liees-agenda/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });
export const H_17_1030 = '2026-11-17T09:30:00.000Z'; // 17 nov. 10 h 30 à Bruxelles

/* ---------------- données ---------------- */
export const F = {
  histo: { id: 'f_sea_histo', titre: 'Histologie — tissus', pages: 300 },
  atlas: { id: 'f_sea_atlas', titre: 'Atlas d’histologie', pages: 40 },
  chimie: { id: 'f_sea_chimie', titre: 'Chimie générale', pages: 8 },
};
async function pdf(chemin, titre, pages, teinte) {
  if (fs.existsSync(chemin)) return;
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.HelveticaBold); const g = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = d.addPage([595, 842]);
    p.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: rgb(...teinte) });
    p.drawText(titre, { x: 40, y: 785, size: 24, font: f, color: rgb(1, 1, 1) });
    p.drawText(`Page ${i} / ${pages}`, { x: 40, y: 760, size: 13, font: g, color: rgb(1, 1, 1) });
    p.drawText(String(i), { x: 230, y: 380, size: 120, font: f, color: rgb(0.85, 0.87, 0.9) });
    for (let l = 0; l < 6; l++) p.drawText(`${l + 1}. Épithélium, tissu conjonctif, cartilage, os — notion ${i}.${l + 1}`, { x: 40, y: 700 - l * 24, size: 11, font: g, color: rgb(0.12, 0.12, 0.16) });
  }
  fs.writeFileSync(chemin, await d.save());
}
export async function fichiersPdf() {
  const dir = path.join(TRAVAIL, 'seances-agenda'); fs.mkdirSync(dir, { recursive: true });
  await pdf(path.join(dir, 'histo.pdf'), 'Histologie — tissus', F.histo.pages, [0.1, 0.45, 0.42]);
  await pdf(path.join(dir, 'atlas.pdf'), 'Atlas d’histologie', F.atlas.pages, [0.35, 0.2, 0.6]);
  await pdf(path.join(dir, 'chimie.pdf'), 'Chimie générale', F.chimie.pages, [0.7, 0.4, 0.1]);
  return { histo: path.join(dir, 'histo.pdf'), atlas: path.join(dir, 'atlas.pdf'), chimie: path.join(dir, 'chimie.pdf') };
}
function donnees() {
  const sources = [{ id: 's_sea', nom: 'Banc séances', rappelsJ: true, archive: false, icon: 'folder', tint: '#2bb3a3' }];
  const matieres = [{ id: 'm_sea_histo', sourceId: 's_sea', nom: 'Histologie', icon: 'microscope' }, { id: 'm_sea_chimie', sourceId: 's_sea', nom: 'Chimie', icon: 'flask' }];
  const fiche = (k, m, date, extra = {}) => ({ id: F[k].id, matiereId: m, dossierId: null, titre: F[k].titre, sousTitre: '', type: 'standard', dateImport: date, ordre: 0, ...extra });
  return { sources, matieres, fiches: [fiche('histo', 'm_sea_histo', '2026-11-05'), fiche('atlas', 'm_sea_histo', '2026-11-01'), fiche('chimie', 'm_sea_chimie', '2026-11-03')] };
}

/* ---------------- agenda intercepté ---------------- */
const FEN = { debut: Date.parse('2026-11-02T00:00:00Z'), fin: Date.parse('2027-01-11T00:00:00Z') };
export function reponseAgenda(variante) {
  return { ok: true, generatedAt: '2026-11-17T09:00:00.000Z', from: new Date(FEN.debut).toISOString(), to: new Date(FEN.fin).toISOString(), timezone: 'Europe/Brussels',
    events: analyserIcs(ics(variante), FEN), cachedAt: '2026-11-17T09:00:00.000Z', stale: false, forceLimite: false, reessaiForce: 0 };
}

/* ---------------- appareil ---------------- */
// horloge COMMUNE à tous les appareils d'une série : 17 nov. 10 h 30 à l'instant « ancre » (fichier $TRAVAIL/seances-agenda/ancre,
// remis à zéro par tout.sh), puis elle avance normalement — les écritures restent dans l'ordre réel (synchro « la plus récente gagne »)
const FICHIER_ANCRE = path.join(TRAVAIL, 'seances-agenda', 'ancre');
export function ancre() {
  fs.mkdirSync(path.dirname(FICHIER_ANCRE), { recursive: true });
  let a = null; try { a = +fs.readFileSync(FICHIER_ANCRE, 'utf8'); } catch (e) { /* pas encore */ }
  if (!a || Date.now() - a > 2 * 3600e3) { a = Date.now(); fs.writeFileSync(FICHIER_ANCRE, String(a)); }
  return a;
}
const HORLOGE = `(() => { let v = null, a = null; try { v = localStorage.getItem('__horloge'); a = +localStorage.getItem('__ancre'); } catch (e) {} if (!v) return; const D = Date; const delta = Date.parse(v) - (a || D.now());
  class FD extends D { constructor(...a) { if (a.length === 0) super(D.now() + delta); else super(...a); } static now() { return D.now() + delta; } } window.Date = FD; })();`;
export async function appareil(type, { base = BASE } = {}) {
  const b = await appareilBase(type);
  b.base = base;
  b.variante = 'v1'; b.lecturesAgenda = 0;
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: HORLOGE });
  // « 157/300 » : indicateur de page du lecteur (barre ordinateur « 157 / 300 » ou barre tablette « 157/300 »)
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'PAGES', { configurable: true, get: () => ((document.querySelector('.tab-pages, .ptb-pages .tnum') || {}).textContent || '').replace(/\\s/g, '') });` });
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/timetable*' }] });
  b.ecouter((m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    b.lecturesAgenda++;
    const corps = Buffer.from(JSON.stringify(reponseAgenda(b.variante))).toString('base64');
    b.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: corps }).catch(() => {});
  });
  b.capture = async (nom, clip = null) => {
    const s = await b.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    fs.writeFileSync(DOSSIER_IMG + nom + '.png', Buffer.from(s.result.data, 'base64'));
    return nom;
  };
  b.captureEl = async (nom, js, marge = 8) => { const r = await b.ev(`(() => { const e = ${js}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`); return r ? b.capture(nom, { x: Math.max(0, r.x - marge), y: Math.max(0, r.y - marge), width: Math.min(b.W, r.w + 2 * marge), height: Math.min(b.H, r.h + 2 * marge) }) : null; };
  /** origine neuve (IndexedDB + localStorage vidés), horloge, mode École, données de test (+ PDF), app rechargée */
  b.preparer = async ({ horloge = H_17_1030, avecDonnees = true, pdfs = null } = {}) => {
    await b.send('Page.navigate', { url: b.base + '/favicon.svg' }); await dormir(600);
    await b.ev(`(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of (await indexedDB.databases())) await new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`);
    await b.ev(`(localStorage.setItem('__horloge', ${JSON.stringify(horloge)}), localStorage.setItem('__ancre', '${ancre()}'), localStorage.setItem('medrevise.accueil.calendrier', '"ecole"'), 1)`);
    await b.ouvrirApp();
    if (!avecDonnees) return;
    // le faux cloud garde les tags des passages précédents : ceux du banc sont RETIRÉS (supprime: true, comme l'app) avant de commencer
    if (b.base === BASE) await b.attendreSynchro(30000);
    await b.S(`for (const t of await S.getAll('page_tag')) if (/^f_sea_/.test(t.courseId) && !t.supprime) await S.put('page_tag', { ...t, supprime: true }); return 1`);
    const d = donnees();
    await b.S(`const d = ${JSON.stringify(d)}; for (const k of Object.keys(d)) await S.putMany(k, d[k]); return 1`);
    if (pdfs) for (const [k, chemin] of Object.entries(pdfs)) {
      const b64 = fs.readFileSync(chemin).toString('base64');
      await b.S(`const f = await S.getOne('fiches', ${JSON.stringify(F[k].id)}); const r = await fetch('data:application/pdf;base64,${b64}'); const blob = new Blob([await r.arrayBuffer()], { type: 'application/pdf' }); const id = await S.putBlob(blob); await S.put('fiches', { ...f, pdfId: id, pdfName: ${JSON.stringify(k + '.pdf')} }); return 1`);
    }
    await b.ouvrirApp();
  };
  b.ouvrirApp = async () => {
    await b.send('Page.navigate', { url: b.base + '/' }); await b.attendre(`document.readyState === 'complete'`, 20000);
    await b.ev(`(localStorage.setItem('app.current', '"medrevise"'), 1)`);
    await b.send('Page.reload'); await b.attendre(`document.readyState === 'complete'`, 20000);
    for (let k = 0; k < 60; k++) {
      if (await b.ev(`!!document.querySelector('.sb-item, .mrm-app')`).catch(() => false)) break;
      await b.ev(`(() => { const x = [...document.querySelectorAll('.hub-card, [role=button], button, a')].find((e) => /MedRevise/.test(e.innerText || '') && /Ouvrir|Révise/.test(e.innerText || '')); x && x.click(); return 1; })()`).catch(() => {});
      await dormir(500);
    }
    await b.attendre(`!!document.querySelector('.sb-item, .mrm-app')`, 30000);
    await dormir(1500);
  };
  b.horloge = async (iso) => { await b.ev(`(localStorage.setItem('__horloge', ${JSON.stringify(iso)}), 1)`); };
  b.recharger = async () => { await b.send('Page.reload'); await b.attendre(`document.readyState === 'complete'`, 20000); await b.attendre(`!!document.querySelector('.sb-item, .mrm-app')`, 30000); await dormir(1500); };
  b.tags = (courseId) => b.S(`return (await S.getAll('page_tag')).filter((t) => t.courseId === ${JSON.stringify(courseId)} && !t.supprime).sort((a, c) => a.page - c.page)`);

  /* ---- accueil : agenda « École » ---- */
  b.accueil = async () => {
    if (type === 'tel') return b.attendre(`!!document.querySelector('.edtg')`, 15000);
    if (!(await b.ev(`!!document.querySelector('.edtg')`))) await b.clic(`[...document.querySelectorAll('.sb-item')].find((e) => /^Accueil/.test(e.title || e.innerText || ''))`, 800);
    return b.attendre(`!!document.querySelector('.edtg .edtg-bloc')`, 15000);
  };
  b.vue = async (v) => { if (await b.ev(`!!document.querySelector('.edtg-vues [data-vue="${v}"]')`)) await b.clic(`document.querySelector('.edtg-vues [data-vue="${v}"]')`, 400); };
  b.precedent = () => b.clic(`document.querySelector('.edtg-nav .weeknav button[aria-label="Précédent"]')`, 500);
  b.suivant = () => b.clic(`document.querySelector('.edtg-nav .weeknav button[aria-label="Suivant"]')`, 500);
  b.aujourdhui = async () => { if (await b.ev(`!!(document.querySelector('.edtg-auj') && !document.querySelector('.edtg-auj').disabled)`)) await b.clic(`document.querySelector('.edtg-auj')`, 500); };
  /** blocs affichés : [{ uid, titre, h, jour, lignes, cls, aria }] */
  b.blocs = () => b.ev(`[...document.querySelectorAll('.edtg .edtg-bloc')].map((e) => ({ uid: e.dataset.uid, titre: e.dataset.titre, h: e.dataset.h, jour: (e.closest('.edtg-col') || {}).ariaLabel || null,
    lignes: [...e.querySelectorAll('.edtg-seance')].map((x) => x.textContent), cls: e.className, heure: (e.querySelector('.edtg-heure') || {}).textContent || '', aria: e.getAttribute('aria-label') }))`);
  b.bloc = (titre, jour) => `[...document.querySelectorAll('.edtg .edtg-bloc')].find((e) => e.dataset.titre === ${JSON.stringify(titre)} && ((e.closest('.edtg-col') || {}).ariaLabel || '').includes(${JSON.stringify(jour)}))`;
  b.ouvrirFicheCours = async (titre, jour) => { await b.clic(b.bloc(titre, jour), 600); return b.attendre(`!!document.querySelector('[data-fiche-cours]')`, 4000); };
  b.fermerModale = async () => { await b.touche('Escape', 'Escape', 27); await dormir(300); };

  /* ---- lecteur ---- */
  b.attendrePdf = () => b.attendre(`!!document.querySelector('.pdfr-page[data-cle] canvas') && !document.querySelector('.pdfr-attente')`, 30000);
  b.pageAffichee = () => b.ev(`(() => { const t = PAGES || ''; return +(t.split('/')[0]) || null; })()`);
  b.titreLecteur = () => b.ev(`(() => { const e = document.querySelector('.pdfr-page[data-cle] canvas'); return document.title + '|' + ((document.querySelector('.pdfr-titre, .ptb-titre, [data-titre-cours]') || {}).textContent || ''); })()`);
  b.fermerLecteur = async () => { await b.clic(`[...document.querySelectorAll('button')].find((x) => x.title === 'Revenir à la liste')`, 1200); return b.attendre(`!document.querySelector('.pdfr-scroll')`, 8000); };
  b.versPage = async (n) => {
    // saut proportionnel d'abord (300 pages), puis ajustement
    await b.ev(`(() => { const s = document.querySelector('.pdfr-scroll'); const tot = +((PAGES || '').split('/')[1]) || 1; if (!document.querySelector('.pdfr-page[data-cle="${n}"]')) s.scrollTop = s.scrollHeight * (${n} - 1) / tot; return 1; })()`);
    await dormir(400);
    for (let i = 0; i < 60; i++) {
      const ok = await b.ev(`(() => { const s = document.querySelector('.pdfr-scroll'); const all = [...document.querySelectorAll('.pdfr-page[data-cle]')]; const e = document.querySelector('.pdfr-page[data-cle="${n}"]');
        if (e) { s.scrollTop += e.getBoundingClientRect().top - s.getBoundingClientRect().top - 20; return true; } const max = Math.max(...all.map((x) => +x.dataset.cle)); s.scrollTop += (${n} > max ? 1 : -1) * s.clientHeight * 0.8; return false; })()`);
      await dormir(ok ? 700 : 150); if (ok) return true;
    }
    return false;
  };
  b.menuPage = async (n) => { await b.versPage(n); if (!b.tactile) await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.W / 2, y: b.H / 2 }); await b.clic(`document.querySelector('.pdfr-page[data-cle="${n}"] .pdfr-tag-ic')`, 500); return b.attendre(`!!document.querySelector('.ctx-menu-item')`, 3000); };
  b.itemsMenu = () => b.ev(`[...document.querySelectorAll('.ctx-menu-item')].map((x) => x.innerText.trim())`);
  b.item = async (txt) => b.clic(`[...document.querySelectorAll('.ctx-menu-item')].find((x) => x.innerText.trim() === ${JSON.stringify(txt)})`, 700);
  /** menu de la page → « Marquer début/fin de cours » → fenêtre du tag (date éventuelle) → Marquer */
  b.marquer = async (n, kind, date = null) => {
    await b.menuPage(n);
    await b.item(kind === 'debut' ? 'Marquer début de cours' : 'Marquer fin de cours');
    await b.attendre(`!!document.querySelector('.tgp-fenetre')`, 3000);
    if (date) await b.ev(`(() => { const i = document.querySelector('.tgp-fenetre [data-champ=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '${date}'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await dormir(250);
    await b.clic(`document.querySelector('.tgp-fenetre [data-action=valider]')`, 900);
  };
  /* ---- fenêtre « Lier à un cours de l'agenda » ---- */
  b.fenetre = () => b.ev(`(() => { const f = document.querySelector('.sea-fenetre'); if (!f) return null; return { titre: f.querySelector('.day-pop-head .serif').textContent, sous: (f.querySelector('.sea-sous') || {}).textContent,
    jour: +(f.querySelector('[data-sea-jour]') || { dataset: {} }).dataset.seaJour, libJour: (f.querySelector('.wcal-range') || {}).textContent,
    blocs: [...f.querySelectorAll('.sea-bloc')].map((e) => ({ uid: e.dataset.uid, titre: e.dataset.titre, propose: e.classList.contains('propose'), lie: e.classList.contains('lie-ici') })),
    boutons: [...f.querySelectorAll('.day-pop-foot button')].map((x) => x.textContent.trim()) }; })()`);
  b.attendreFenetre = () => b.attendre(`!!document.querySelector('.sea-fenetre .day-pop-head')`, 5000);
  b.toucherCreneau = (titre) => b.clic(`[...document.querySelectorAll('.sea-fenetre .sea-bloc')].find((e) => e.dataset.titre === ${JSON.stringify(titre)})`, 900);
  b.marge = (n) => b.ev(`(() => { const p = document.querySelector('.pdfr-page[data-cle="${n}"]'); if (!p) return null; return { pastilles: [...p.querySelectorAll('.pdfr-marge-tags .tgp-pastille')].map((x) => x.textContent),
    lien: [...p.querySelectorAll('.tgp-lien-agenda')].map((x) => ({ texte: x.textContent, title: x.title })) }; })()`);
  return b;
}

/** réponse attendue « p. a–b · nom » */
export const ligne = (de, a, nom) => (a != null ? `p. ${de}–${a} · ${nom}` : `à partir de p. ${de} · ${nom}`);
