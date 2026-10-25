/* ============================================================
   MedRevise — TAGS « DÉBUT / FIN DE COURS » : l'interface (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md).
   - PastilleTag : « ▶ Début · 22 oct. » / « ■ Fin · 22 oct. », discrète, dans le coin supérieur gauche de la page et de sa
     vignette ; un clic ouvre la session de transcript liée (sans lien : la fenêtre du tag).
   - FenetreTag : date (aujourd'hui par défaut, modifiable) + lien vers une session de transcript : aucune, la session en
     cours, ou une session existante du cours (liste) ; lien modifiable ou retirable ; « Retirer le tag ».
   - FenetreSeances (menu Fichier → Séances) : date, pages début–fin, transcript lié — un clic y va.
   - PanneauPages (mode « Pages » du panneau) : une vignette par page, ses pastilles, le liseré des pages en séance, « … ».
   Données et règles : lib/tagsPages.js.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { SORTES, libelleTag, dateCourte, aujourdhui } from '../lib/tagsPages.js';
import { sessionsDuCours } from '../transcription/sessions.js';
import { useTranscription } from '../transcription/useTranscription.js';
import { sessionActive } from '../transcription/engine.js';
import '../../styles/tags-pages.css';

const heure = (iso) => { try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
const isoJour = (iso) => { try { return aujourdhui(new Date(iso)); } catch (e) { return ''; } };
const duree = (s) => { const m = Math.round((s.durationS || 0) / 60); return m ? `${m} min` : ''; };
/** « 22 oct. · 14:05 · 52 min » */
export const libelleSession = (s) => [dateCourte(isoJour(s.startedAt)), heure(s.startedAt), duree(s)].filter(Boolean).join(' · ');

const racine = () => document.querySelector('[data-app="medrevise"]') || document.body;

export function PastilleTag({ tag, onOuvrir, compacte = false }) {
  return (
    <button type="button" className={'tgp-pastille ' + tag.kind + (tag.transcriptSessionId ? ' liee' : '') + (compacte ? ' compacte' : '')} data-tag={tag.kind}
      title={`${SORTES[tag.kind].libelle} de cours · ${dateCourte(tag.date)}${tag.transcriptSessionId ? ' — ouvrir le transcript lié' : ' — aucun transcript lié : modifier le tag'}`}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onOuvrir(tag); }}>
      {libelleTag(tag)}{tag.transcriptSessionId && <Icon name="mic" size={10} />}
    </button>
  );
}

/** sessions de transcript du cours, la plus récente d'abord */
export function useSessionsCours(courseId, ouvert = true) {
  const [l, setL] = useState([]);
  useEffect(() => {
    if (!ouvert || !courseId) return undefined;
    let vivant = true;
    sessionsDuCours(courseId).then((x) => { if (vivant) setL([...(x || [])].filter((s) => s && s.kind !== 'keyterms').sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))); }).catch(() => {});
    return () => { vivant = false; };
  }, [courseId, ouvert]);
  return l;
}

/**
 * Fenêtre d'un tag. `cible` = { kind, page, pageCle, tag? } ; onValider({ date, transcriptSessionId }) ; onRetirer() si le tag existe.
 */
export function FenetreTag({ courseId, cible, onValider, onRetirer, onFermer }) {
  const e = useTranscription();
  const enCours = sessionActive() && e.courseId === courseId && e.session ? e.session : null;
  const sessions = useSessionsCours(courseId);
  const t = cible.tag || null;
  const [date, setDate] = useState(t ? t.date : aujourdhui());
  // lien : '' = aucun ; sinon l'id de la session (la session en cours par défaut pour un nouveau tag)
  const [lien, setLien] = useState(t ? (t.transcriptSessionId || '') : enCours ? enCours.id : '');
  const ref = useRef(null);
  useEffect(() => {
    const k = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onFermer]);
  const autres = sessions.filter((s) => !enCours || s.id !== enCours.id);
  const lienInconnu = lien && !(enCours && enCours.id === lien) && !autres.some((s) => s.id === lien);
  return createPortal(
    <div className="day-pop-scrim" onClick={onFermer}>
      <div ref={ref} className="day-pop tgp-fenetre" role="dialog" aria-label={SORTES[cible.kind].menu} style={{ width: 'min(440px, 94vw)' }} onClick={(ev) => ev.stopPropagation()}>
        <div className="day-pop-head"><div className="serif" style={{ fontSize: 19 }}>{SORTES[cible.kind].symbole} {cible.kind === 'debut' ? 'Début' : 'Fin'} de cours · page {cible.page}</div></div>
        <div className="day-pop-body tgp-corps">
          <label className="tgp-champ"><span>Date</span>
            <input type="date" value={date} data-champ="date" onChange={(ev) => setDate(ev.target.value)} />
          </label>
          <div className="tgp-champ" role="radiogroup" aria-label="Session de transcript liée">
            <span>Transcript lié</span>
            <label className="tgp-choix"><input type="radio" name="tgp-lien" checked={!lien} onChange={() => setLien('')} data-lien="aucun" /> Aucun</label>
            {enCours && (
              <label className="tgp-choix"><input type="radio" name="tgp-lien" checked={lien === enCours.id} onChange={() => setLien(enCours.id)} data-lien="en-cours" />
                <span className="pm-live" aria-hidden="true"><i /></span> Session en cours <span className="hint">({heure(enCours.startedAt)})</span></label>
            )}
            <label className="tgp-choix"><input type="radio" name="tgp-lien" checked={!!lien && !(enCours && lien === enCours.id)} disabled={!autres.length && !lienInconnu}
              onChange={() => setLien(autres[0] ? autres[0].id : lien)} data-lien="existante" /> Une session existante</label>
            {(autres.length > 0 || lienInconnu) && !!lien && !(enCours && lien === enCours.id) && (
              <select className="tgp-select" value={lien} onChange={(ev) => setLien(ev.target.value)} data-champ="session" aria-label="Session existante">
                {lienInconnu && <option value={lien}>Session liée (pas encore sur cet appareil)</option>}
                {autres.map((s) => <option key={s.id} value={s.id}>{libelleSession(s)}</option>)}
              </select>
            )}
            {!autres.length && !enCours && <div className="hint tgp-aide">Aucune session de transcript pour ce cours.</div>}
          </div>
        </div>
        <div className="day-pop-foot">
          {t && <button type="button" className="btn danger" onClick={onRetirer} data-action="retirer">Retirer le tag</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button type="button" className="btn primary" data-action="valider" disabled={!date} onClick={() => onValider({ date, transcriptSessionId: lien || null })}>{t ? 'Enregistrer' : 'Marquer'}</button>
        </div>
      </div>
    </div>, racine());
}

/** menu Fichier → « Séances » : une ligne par séance (date, pages, transcript lié), un clic y va */
export function FenetreSeances({ courseId, listes, onAllerPage, onOuvrirSession, onFermer }) {
  const sessions = useSessionsCours(courseId);
  const parId = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  useEffect(() => {
    const k = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onFermer]);
  const lignes = listes.flatMap(({ document, nom, seances }) => seances.map((s) => ({ ...s, document, nom }))).sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.de - b.de);
  return createPortal(
    <div className="day-pop-scrim" onClick={onFermer}>
      <div className="day-pop tgp-seances" role="dialog" aria-label="Séances" style={{ width: 'min(520px, 94vw)' }} onClick={(ev) => ev.stopPropagation()}>
        <div className="day-pop-head"><div className="serif" style={{ fontSize: 19 }}>Séances</div></div>
        <div className="day-pop-body">
          {!lignes.length && <div className="hint">Aucune séance : marque le début et la fin du cours sur les pages (clic droit ou « … » d’une page).</div>}
          <ul className="tgp-liste">
            {lignes.map((s) => {
              const ses = s.transcriptSessionId ? parId.get(s.transcriptSessionId) : null;
              return (
                <li key={s.debut.id} className="tgp-ligne" data-seance={s.debut.id}>
                  <button type="button" className="tgp-aller" onClick={() => onAllerPage(s.document, s.de)} title={`Aller à la page ${s.de}`}>
                    <span className="tgp-date">{dateCourte(s.date)}</span>
                    <span className="tgp-pages tnum">{s.a != null ? `p. ${s.de}–${s.a}` : `p. ${s.de} → (sans fin)`}</span>
                    {listes.length > 1 && <span className="hint tgp-doc">{s.nom}</span>}
                  </button>
                  {s.transcriptSessionId
                    ? <button type="button" className="btn sm tgp-trx" onClick={() => onOuvrirSession(s.document, s.de, s.transcriptSessionId)} title="Ouvrir le transcript lié">
                      <Icon name="mic" size={12} /> {ses ? libelleSession(ses) : 'Transcript'}</button>
                    : <span className="hint tgp-sans">Sans transcript</span>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="day-pop-foot"><span style={{ flex: 1 }} /><button type="button" className="btn" onClick={onFermer}>Fermer</button></div>
      </div>
    </div>, racine());
}

/* ---- vignette d'une page du PDF, rendue à petite échelle quand elle approche de l'écran ---- */
function MiniPage({ pdfDoc, n, largeur, ratio }) {
  const ref = useRef(null), cv = useRef(null);
  const [vue, setVue] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || vue) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVue(true); return undefined; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setVue(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [vue]);
  useEffect(() => {
    if (!vue || !pdfDoc || typeof n !== 'number' || !cv.current) return undefined;
    let annule = false, tache = null;
    pdfDoc.getPage(n).then((p) => {
      if (annule) return;
      const v1 = p.getViewport({ scale: 1 });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = p.getViewport({ scale: (largeur * dpr) / v1.width });
      const c = cv.current; if (!c) return;
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      tache = p.render({ canvasContext: c.getContext('2d'), viewport: vp });
      tache.promise.catch(() => {});
    }).catch(() => {});
    return () => { annule = true; if (tache) { try { tache.cancel(); } catch (e) { /* ignore */ } } };
  }, [vue, pdfDoc, n, largeur]);
  return (
    <div ref={ref} className="tgp-mini" style={{ width: largeur, height: Math.round(largeur * ratio) }}>
      {typeof n === 'number' && pdfDoc ? <canvas ref={cv} /> : <span className="tgp-mini-vide" aria-hidden="true" />}
    </div>
  );
}

/**
 * Mode « Pages » du panneau : vignettes, pastilles, liseré, page courante ; clic = y aller, « … » = menu de la page.
 * `pages` = [{ idx (0…), cle, ratio, pdf: n° du PDF | null }]
 */
export function PanneauPages({ pdfDoc, pages, tagsParPage, enSeance, pageCourante, onAller, onMenu, onPastille }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current && ref.current.querySelector('.tgp-vignette.courante');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [pageCourante]);
  return (
    <div ref={ref} className="tgp-panneau" data-panneau-pages="">
      {pages.map((p) => {
        const num = p.idx + 1;
        const tags = tagsParPage.get(num) || [];
        return (
          <div key={String(p.cle)} className={'tgp-vignette' + (num === pageCourante ? ' courante' : '') + (enSeance.has(num) ? ' en-seance' : '')} data-vignette={num}
            onContextMenu={(e) => { e.preventDefault(); onMenu(p.idx, e.clientX, e.clientY); }}>
            <button type="button" className="tgp-vbouton" onClick={() => onAller(num)} title={`Aller à la page ${num}`}>
              <MiniPage pdfDoc={pdfDoc} n={p.pdf} largeur={132} ratio={p.ratio} />
            </button>
            {tags.length > 0 && <div className="tgp-coin">{tags.map((t) => <PastilleTag key={t.id} tag={t} compacte onOuvrir={onPastille} />)}</div>}
            <div className="tgp-vpied">
              <span className="tnum">{num}</span>
              <button type="button" className="tgp-plus" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu(p.idx, r.left, r.bottom + 4); }}
                title={`Page ${num} : marquer début / fin de cours`} aria-label={`Menu de la page ${num}`}><Icon name="more" size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
