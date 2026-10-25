/* ============================================================
   MedRevise — TAGS « DÉBUT / FIN DE COURS » : l'interface (25/10, docs/compte-rendu-apprentissage-v2-recherche-tags.md).
   - PastilleTag : l'étiquette « ▶ Début · 22 oct. » / « ■ Fin · 22 oct. », dans la MARGE GAUCHE de la page (26/10, nettoyage
     v2 §3 : la page taguée a un cadre vert / rouge) ; un clic ouvre la session de transcript liée (sans lien : la fenêtre du tag).
   - FenetreTag : date (aujourd'hui par défaut, modifiable) + lien vers une session de transcript : aucune, la session en
     cours, ou une session existante du cours (liste) ; lien modifiable ou retirable ; « Retirer le tag ».
   - FenetreSeances (menu Fichier → Séances) : date, pages début–fin, transcript lié — un clic y va.
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

/** (26/10) gouttière fixe (px) de chaque côté des pages du lecteur : l'icône et les étiquettes des tags y vivent */
export const MARGE_TAGS = 30;

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
