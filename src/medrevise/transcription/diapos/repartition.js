/* ============================================================
   MedRevise — SUIVI AUTOMATIQUE DES DIAPOS : « Relier aux diapos automatiquement »
   (répartition après coup, 24/11/2026, docs/compte-rendu-suivi-auto-diapos.md).

   Une session enregistrée depuis un onglet garde ses changements de diapo (`diapos[]` : heure,
   petite image recadrée locale, masque des cases ignorées). Ici, la MÊME reconnaissance
   (worker.js → moteur.js, OCR de l'app si hésitation) est relancée sur ces images contre le PDF
   ACTUEL du document — par exemple après avoir remplacé un document vierge par le PDF du prof.

   1. analyser() : rien n'est écrit ; rend l'aperçu « 48 passages → 31 diapos, 3 non reconnus »
      et la session telle qu'elle serait.
   2. appliquer() : putBackup de la session, version « Avant … » dans l'Historique du document
      (lib/historiqueDoc.js, restaurable), puis écriture de la session et synchro ciblée.
   Le worker du direct n'est pas utilisé : un second worker, du même code, le temps de l'analyse.
   ============================================================ */
import { getMeta, putBackup, lireDocument } from '../../lib/storage.js';
import { garderVersion } from '../../lib/historiqueDoc.js';
import { ecrireSession, lireSession, viderEcritures } from '../sessions.js';
import { pousser } from '../synchro.js';
import { preparerPages, numerotation } from './pagesCours.js';
import { lireTexte } from './suivi.js';
import { pageAuTemps } from './moteur.js';

export const aDesDiapos = (s) => !!s && (s.diapos || []).some((d) => d && d.img);

function workerAnalyse() {
  const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const att = new Map(); let n = 0;
  w.onmessage = (ev) => { const m = ev.data || {}; if (att.has(m.id)) { att.get(m.id)(m); att.delete(m.id); } };
  const appel = (msg, tr = []) => new Promise((r) => { const id = 'a' + (++n); att.set(id, r); w.postMessage({ ...msg, id }, tr); });
  return { w, appel, fin: () => w.terminate() };
}

/**
 * @param {object} session session de transcript (avec `diapos[]`)
 * @param {{ onProgres?: (fait, total) => void }} o
 * @returns {Promise<{ ok, message?, resultats, stats: { passages, diapos, nonReconnus, sansImage }, session }>}
 */
export async function analyser(session, { onProgres = null } = {}) {
  const changements = (session.diapos || []).slice().sort((a, b) => a.t - b.t);
  if (!changements.length) return { ok: false, message: 'Cette session n’a gardé aucun changement de diapo (elle n’a pas été enregistrée depuis un onglet).' };
  const W = workerAnalyse();
  try {
    const rendre = (pdf) => W.appel({ type: 'preparer', pdf, largeur: 480 }, [pdf]);
    const prep = await preparerPages(session.courseId, rendre);
    if (!prep.sigs.length) return { ok: false, message: 'Ce document n’a pas encore de PDF : remplace-le par le PDF du cours, puis relance.' };
    W.w.postMessage({ type: 'pages', sigs: prep.sigs, textes: prep.textes, aspects: prep.aspects });
    const numero = await numerotation(session.courseId);
    const resultats = [];
    let courant = null, sansImage = 0;
    for (let i = 0; i < changements.length; i++) {
      const d = changements[i];
      const blob = d.img ? await getMeta(d.img).catch(() => null) : null;
      if (!blob) { sansImage++; resultats.push({ n: d.n, t: d.t, page: null, pageCle: null, nonReconnue: true, sansImage: true }); continue; }
      const reconnaitre = async (texte) => { const bitmap = await createImageBitmap(blob); return W.appel({ type: 'reconnaitre', bitmap, masque: d.masque || null, courant, texte }, [bitmap]); };
      let r = await reconnaitre(d.texte || null);
      if (r.ambigu && !d.texte) {
        const texte = await lireTexte(await createImageBitmap(blob, { resizeWidth: 1440, resizeQuality: 'high' }));
        if (texte) r = await reconnaitre(texte);
      }
      if (r.page) courant = r.page;
      resultats.push({ n: d.n, t: d.t, pageCle: r.page || null, page: r.page ? numero(r.page) : null, nonReconnue: !!r.nonReconnue, ambigu: !!r.ambigu, score: r.score, marge: r.marge });
      if (onProgres) onProgres(i + 1, changements.length);
    }
    const f = pageAuTemps(resultats);
    const re = (x, t) => { const p = f(t); return p ? { ...x, page: p.page, pageCle: p.pageCle, doc: 'original' } : x; };
    const parN = new Map(resultats.map((r) => [r.n, r]));
    const apres = {
      ...session,
      segments: (session.segments || []).map((g) => (g.status === 'gap' ? g : re(g, g.t0))),
      notes: (session.notes || []).map((x) => re(x, x.t)),
      diapos: (session.diapos || []).map((d) => { const r = parN.get(d.n); return r ? { ...d, page: r.page, pageCle: r.pageCle, nonReconnue: r.nonReconnue, relie: true } : d; }),
    };
    const stats = {
      passages: resultats.length,
      diapos: new Set(resultats.filter((r) => r.pageCle).map((r) => r.pageCle)).size,
      nonReconnus: resultats.filter((r) => !r.pageCle).length,
      sansImage,
    };
    return { ok: true, resultats, stats, session: apres };
  } finally { W.fin(); }
}

/** Applique l'aperçu : sauvegarde locale + version dans l'Historique AVANT, puis écriture. */
export async function appliquer(analyse) {
  const s = analyse.session;
  await viderEcritures();
  const avant = (await lireSession(s.id)) || s;
  await putBackup(`pre-relier-diapos-${s.id}-${Date.now()}`, avant);
  await garderVersion(s.courseId, 'Avant « Relier aux diapos automatiquement »', { force: true, contenu: { ...(await lireDocument(s.courseId)), transcript: avant } });
  const ecrite = await ecrireSession({ ...avant, segments: s.segments, notes: s.notes, diapos: s.diapos });
  await viderEcritures();
  pousser(s.id).catch(() => {});
  return ecrite;
}

/** Texte de l'aperçu : « 48 passages → 31 diapos, 3 non reconnus » */
export function resumeAnalyse(st) {
  const pl = (n, a, b = a + 's') => `${n} ${n > 1 ? b : a}`;
  return `${pl(st.passages, 'passage')} → ${pl(st.diapos, 'diapo')}, ${pl(st.nonReconnus, 'non reconnu')}`;
}
