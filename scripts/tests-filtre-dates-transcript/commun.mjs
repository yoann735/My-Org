// Banc « dates de transcript dans la Bibliothèque » (25/11/2026, docs/compte-rendu-filtre-dates-transcript.md).
// DONNÉES DE TEST UNIQUEMENT : origines locales neuves (IndexedDB vidé avant chaque série), jamais le vrai cloud.
//   APRES  = code du chantier, sans cloud (config « medrevise-banc », :5302)
//   AVANT  = code d'avant le chantier (git archive HEAD, config « dates-avant », :5331)
//   CLOUD  = code du chantier + faux Supabase (configs « medrevise-faux-cloud » :5300 et « faux-supabase » :54399)
// Chrome headless MUET (--mute-audio) des bancs précédents (scripts/tests-section-exos/commun.mjs#appareil).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appareil as appareilBase, dormir } from '../tests-section-exos/commun.mjs';

export { dormir };
export const APRES = process.env.APRES || 'http://localhost:5302';
export const AVANT = process.env.AVANT || 'http://localhost:5331';
export const CLOUD = process.env.CLOUD || 'http://localhost:5300';
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/filtre-dates-transcript/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });

/* ---------------- données de test : section « Banc dates », matière « Chimie » (8 cours) + « Physique » ---------------- */
const J = (iso, h = 9) => `${iso}T${String(h).padStart(2, '0')}:00:00.000Z`;
const segs = (n, pref = 'seg', t = 0, pas = 6) => Array.from({ length: n }, (_, i) => ({ id: `${pref}${i}`, t0: t + i * pas, t1: t + i * pas + 5, text: `Phrase ${i + 1} du cours de chimie, acide faible et base conjuguée.`, status: 'final' }));
const session = (id, courseId, startedAt, segments, extra = {}) => ({
  id, kind: 'session', courseId, startedAt, endedAt: new Date(Date.parse(startedAt) + 3600e3).toISOString(),
  source: 'micro', keyterms: [], segments, notes: [], fontSize: 'm', durationS: 3600, createdAt: startedAt, ...extra,
});
export const COURS = {
  A: { id: 'f_banc_a', titre: 'Acides et bases' },
  B: { id: 'f_banc_b', titre: 'Thermochimie' },
  C: { id: 'f_banc_c', titre: 'Oxydoréduction' },
  D: { id: 'f_banc_d', titre: 'Cinétique chimique' },
  E: { id: 'f_banc_e', titre: 'Liaisons chimiques' },
  F: { id: 'f_banc_f', titre: 'Acides aminés' },
  G: { id: 'f_banc_g', titre: 'Solutions tampons' },
  H: { id: 'f_banc_h', titre: 'Équilibres chimiques' },
};
// jours attendus (Europe/Brussels), du plus récent au plus ancien
export const ATTENDU = {
  A: ['2026-11-24', '2026-11-20', '2026-11-17', '2026-11-13', '2026-11-10', '2026-11-06', '2026-10-30', '2026-10-16', '2025-12-03'],
  B: [], C: ['2026-11-17', '2026-11-12'], D: ['2026-11-17'], E: ['2026-11-19'], F: ['2026-11-17'], G: [], H: ['2026-11-18', '2026-11-05'],
};
// heure (Bruxelles) et durée attendues sur la pastille du jour filtré
export const HEURE_DUREE = {
  'A|2026-11-17': '10h00 · 50 min', 'C|2026-11-17': '11h00 · 30 min', 'D|2026-11-17': '14h00 · < 1 min', 'F|2026-11-17': '0h30 · < 1 min',
  'A|2026-11-24': '9h00 · < 1 min', 'A|2026-11-20': '10h00 · < 1 min',
};
export function donnees({ lourd = false } = {}) {
  const sources = [{ id: 's_banc', nom: 'Banc dates', rappelsJ: true, archive: false, icon: 'folder', tint: '#7C6FE0' }];
  const matieres = [{ id: 'm_banc_chimie', sourceId: 's_banc', nom: 'Chimie', icon: 'book' }, { id: 'm_banc_physique', sourceId: 's_banc', nom: 'Physique', icon: 'book' }];
  const dossiers = [{ id: 'd_banc_orga', matiereId: 'm_banc_chimie', nom: 'Chimie organique', ordre: 0 }];
  const fiche = (k, i, extra = {}) => ({ id: COURS[k].id, matiereId: 'm_banc_chimie', dossierId: null, titre: COURS[k].titre, sousTitre: '', type: 'standard', dateImport: '2026-11-01', ordre: i, ...extra });
  const fiches = [
    fiche('A', 0, { docNotes: true, sousTitre: 'Document' }), fiche('B', 1), fiche('C', 2), fiche('D', 3, { dossierId: 'd_banc_orga' }),
    fiche('E', 4), fiche('F', 5), fiche('G', 6), fiche('H', 7),
    { id: 'f_banc_p1', matiereId: 'm_banc_physique', dossierId: null, titre: 'Optique', sousTitre: '', type: 'standard', dateImport: '2026-11-01', ordre: 0 },
  ];
  const s = [];
  // A : 9 jours, dont une session REPRISE le 24/11 (commencée le 20/11) et une de l'an dernier
  s.push(session('ts_banc_a1', COURS.A.id, J('2026-11-20'), [...segs(5, 'a1-'),
    { id: 'a1-r', t0: 30, t1: 30, text: 'reprise à 09:00', status: 'gap', reprise: true, repriseLe: J('2026-11-24', 8) }, ...segs(4, 'a1b-', 30)]));
  // 17/11 : 6 segments espacés de 10 min (0 → 50 min 05 s) ; les autres jours : quelques secondes
  ['2026-11-17', '2026-11-13', '2026-11-10', '2026-11-06', '2026-10-30', '2026-10-16', '2025-12-03'].forEach((d, i) => s.push(session('ts_banc_a' + (i + 2), COURS.A.id, J(d), segs(6, `a${i + 2}-`, 0, i === 0 ? 600 : 6))));
  s.push(session('ts_banc_a9', COURS.A.id, J('2026-11-17', 14), segs(3, 'a9-'))); // 2ᵉ session le 17/11 : dédoublonnée
  s.push(session('ts_banc_c1', COURS.C.id, J('2026-11-17', 10), segs(4, 'c1-', 0, 600))); // 11h00 (Bruxelles), 30 min 05 s
  s.push(session('ts_banc_c2', COURS.C.id, J('2026-11-12'), segs(4, 'c2-')));
  s.push(session('ts_banc_d1', COURS.D.id, J('2026-11-17', 13), segs(4, 'd1-')));
  s.push(session('ts_banc_e1', COURS.E.id, J('2026-11-19'), segs(4, 'e1-')));
  // F : commencée le 16/11 à 23 h 30 UTC = 17/11 à 0 h 30 à Bruxelles → 17 nov.
  s.push(session('ts_banc_f1', COURS.F.id, '2026-11-16T23:30:00.000Z', segs(4, 'f1-')));
  // G : une session ouverte où rien n'a été dit (seulement une marque) → aucune date
  s.push(session('ts_banc_g1', COURS.G.id, J('2026-11-15'), [{ id: 'g1-r', t0: 0, t1: 0, text: 'reprise à 10:00', status: 'gap', reprise: true, repriseLe: J('2026-11-15', 10) }]));
  s.push(session('ts_banc_h1', COURS.H.id, J('2026-11-18'), segs(4, 'h1-')));
  s.push(session('ts_banc_h2', COURS.H.id, J('2026-11-05'), segs(4, 'h2-')));
  s.push(session('ts_banc_p1', 'f_banc_p1', J('2026-11-17'), segs(4, 'p1-')));
  s.push({ id: 'kt:' + COURS.A.id, kind: 'keyterms', courseId: COURS.A.id, terms: ['pKa'], manuels: ['pKa'], decoches: [], connus: [] });
  if (lourd) {
    // matière la plus chargée pour les mesures : 60 sessions de plus × 400 segments, sur des jours déjà présents
    const jours = { A: ATTENDU.A, C: ATTENDU.C, H: ATTENDU.H };
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const k = ['A', 'C', 'H'][i % 3]; const d = jours[k][i % jours[k].length];
      s.push(session('ts_banc_lourd' + (n++), COURS[k].id, J(d, 8 + (i % 8)), segs(400, `l${i}-`)));
    }
  }
  return { sources, matieres, dossiers, fiches, transcript_session: s };
}

/* ---------------- appareil + gestes ---------------- */
export async function appareil(type) {
  const b = await appareilBase(type);
  b.capture = async (nom, clip = null) => {
    const s = await b.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    const png = Buffer.from(s.result.data, 'base64');
    if (nom) fs.writeFileSync(DOSSIER_IMG + nom + '.png', png);
    return png;
  };
  /** origine neuve : IndexedDB et localStorage vidés (hors de l'app), données de test écrites par l'API de l'app, rechargée */
  b.preparer = async (base, opts = {}) => {
    await b.send('Page.navigate', { url: base + '/favicon.svg' }); await dormir(600);
    await b.ev(`(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of (await indexedDB.databases())) await new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`);
    await b.ouvrir(base);
    if (opts.vide) return;
    const d = donnees(opts);
    await b.S(`const d = ${JSON.stringify(d)}; for (const k of Object.keys(d)) await S.putMany(k, d[k]); return 1`);
    await b.ouvrir(base);
  };
  b.ouvrir = async (base) => {
    await b.send('Page.navigate', { url: base + '/' }); await b.attendre(`document.readyState === 'complete'`, 20000);
    await b.ev(`(localStorage.setItem('app.current', '"medrevise"'), 1)`);
    await b.send('Page.reload'); await b.attendre(`document.readyState === 'complete'`, 20000);
    for (let k = 0; k < 60; k++) {
      if (await b.ev(`!!document.querySelector('.sb-item, .mrm-app')`).catch(() => false)) break;
      await b.ev(`(() => { const x = [...document.querySelectorAll('.hub-card, [role=button], button, a')].find((e) => /MedRevise/.test(e.innerText || '') && /Ouvrir|Révise/.test(e.innerText || '')); x && x.click(); return 1; })()`).catch(() => {});
      await dormir(500);
    }
    await b.attendre(`!!document.querySelector('.sb-item, .mrm-app')`, 30000);
    await dormir(1200);
  };
  b.biblio = async () => {
    if (!(await b.ev(`!!document.querySelector('.lib-tree')`))) await b.clic(`[...document.querySelectorAll('.sb-item')].find((e) => (e.title || '').startsWith('Bibliothèque'))`, 700);
    const ok = await b.attendre(`!!document.querySelector('.lib-tree')`, 8000);
    await b.ev(`(() => { const s = document.querySelector('.lib-master-body'); if (s) s.scrollTop = 0; document.querySelector('.screen.scroll') && (document.querySelector('.screen.scroll').scrollTop = 0); return 1; })()`);
    return ok;
  };
  // sélecteurs
  b.qMat = (nom) => `[...document.querySelectorAll('.lt-mat')].find((e) => e.querySelector('.lt-nom') && e.querySelector('.lt-nom').innerText.trim() === ${JSON.stringify(nom)})`;
  b.qFiche = (titre) => `[...document.querySelectorAll('.lt-fiche')].find((e) => (e.querySelector('.lt-nom') || {}).innerText && e.querySelector('.lt-nom').innerText.trim() === ${JSON.stringify(titre)})`;
  b.qCal = (mat) => `(() => { const m = ${b.qMat(mat)}; return m && ([...m.querySelectorAll('.ltd-cal')].find((x) => x.offsetParent && getComputedStyle(x).visibility !== 'hidden') || null); })()`;
  b.cliquerCal = async (mat) => {
    await b.ev(`(document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1)`); await dormir(150);
    if (!b.tactile) { const r = await b.rect(b.qMat(mat)); await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + r.w / 2, y: r.cy }); await dormir(200); }
    const ok = await b.clic(b.qCal(mat), 350);
    if (!b.tactile) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: b.H - 2 }); await dormir(200); }
    return ok;
  };
  b.blocMat = (mat) => `(() => { let x = ${b.qMat(mat)}; while (x && !(x.parentElement && x.parentElement.classList.contains('lt-enfants-sec'))) x = x.parentElement; return x; })()`;
  b.fichesVisibles = (mat = 'Chimie') => b.ev(`[...(${b.blocMat(mat)} || document.createElement('i')).querySelectorAll('.lt-fiche .lt-rangee .lt-nom')].map((e) => e.innerText.trim())`);
  b.pastilles = (titre) => b.ev(`(() => { const f = ${b.qFiche(titre)}; if (!f) return null; const l = f.querySelector('.ltd-ligne'); if (!l) return []; return [...l.querySelectorAll('.ltd-p')].map((p) => p.dataset.jour ? p.dataset.jour + (p.classList.contains('actif') ? '*' : '') : 'PLUS:' + p.innerText.trim()); })()`);
  b.pastille = (titre, jour) => `(() => { const f = ${b.qFiche(titre)}; return f && f.querySelector('.ltd-p[data-jour="${jour}"]'); })()`;
  b.plus = (titre) => `(() => { const f = ${b.qFiche(titre)}; return f && f.querySelector('.ltd-plus'); })()`;
  b.sansAnim = async () => { await b.ev(`document.fonts.ready.then(() => 1)`); await dormir(300); return b.ev(`(document.querySelectorAll('*').forEach((e) => { e.style.animation = 'none'; e.style.transition = 'none'; e.style.caretColor = 'transparent'; e.style.webkitFontSmoothing = 'antialiased'; }), 1)`); }; // lissage du texte figé : captures comparables
  /** pixels différents entre deux PNG (décodés par Chrome) : { n, boite } */
  b.diffPng = (p1, p2) => b.ev(`(async () => {
    const img = async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const c = new OffscreenCanvas(i.width, i.height); const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height); };
    const a = await img('${p1.toString('base64')}'), c = await img('${p2.toString('base64')}');
    if (a.width !== c.width || a.height !== c.height) return { n: -1 };
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== c.data[i] || a.data[i + 1] !== c.data[i + 1] || a.data[i + 2] !== c.data[i + 2]) { n++; const p = i / 4, x = p % a.width, y = Math.floor(p / a.width); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { n, boite: n ? [x0, y0, x1, y1] : null };
  })()`);
  b.zoneArbre = () => b.rect(`document.querySelector('.lib-master')`);
  return b;
}
