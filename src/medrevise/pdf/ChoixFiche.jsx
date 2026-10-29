/* ============================================================
   MedRevise — PLUSIEURS FICHES PAR COURS (29/10, docs/compte-rendu-plusieurs-fiches.md).
   - ChoixFiche : menu de la barre du lecteur, À CÔTÉ du segment « Original · Fiche » (inchangé). Il
     n'apparaît qu'à partir de 2 fiches : la fiche affichée côté « Fiche », et la liste des fiches
     du cours RANGÉES PAR SÉANCE (tags Début / Fin de la diapo), plus « Ajouter une fiche de résumé… ».
   - ChoixSeanceFiche : dans la fenêtre d'import, le nom de la fiche et LA question « Elle résume
     quelle séance ? » (séance proposée d'après les pages de la diapo que reprend la fiche).
   Rien n'est écrit ici : le lecteur enregistre (lib/ficheJumelle.js#modifierFiche).
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { nomFiche, seanceProposee } from '../lib/ficheJumelle.js';

/** « mer. 8 oct. » depuis 'AAAA-MM-JJ' */
export function dateSeance(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
const pagesSeance = (s) => (s.a != null ? `p. ${s.de}–${s.a}` : `p. ${s.de}–…`);
/** l'instantané enregistré sur une fiche pour une séance */
export const instantSeance = (s) => (s ? { tagId: s.debut && s.debut.id, date: s.date || null, de: s.de, a: s.a } : null);

/** séance (actuelle si ses tags existent encore, sinon l'instantané) et son n° dans la liste */
function seanceDe(rec, seances) {
  const x = rec.seance;
  if (!x) return null;
  const i = seances.findIndex((s) => s.debut && s.debut.id === x.tagId);
  if (i >= 0) return { ...seances[i], n: i + 1, cle: x.tagId };
  return { date: x.date, de: x.de, a: x.a, n: null, cle: x.tagId || `${x.date}:${x.de}` };
}

export function ChoixFiche({ fiches, active, surFiche, seances = [], nomOriginal = 'Diapo originale', onChoisir, onOriginal, onAjouter }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);
  const menu = useRef(null);
  // le menu est posé sur document.body (position fixe sous le bouton) : dans la barre, la zone des pages
  // passait PAR-DESSUS lui (empilement de la barre) et recevait les clics — même principe que le menu Fichier
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!ouvert || !racine.current) return undefined;
    const placer = () => { const r = racine.current.getBoundingClientRect(); setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 320)), top: r.bottom + 6 }); };
    placer();
    window.addEventListener('resize', placer); window.addEventListener('scroll', placer, true);
    return () => { window.removeEventListener('resize', placer); window.removeEventListener('scroll', placer, true); };
  }, [ouvert]);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target) && !(menu.current && menu.current.contains(e.target))) setOuvert(false); };
    const echap = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); } };
    document.addEventListener('pointerdown', dehors, true); document.addEventListener('keydown', echap, true);
    return () => { document.removeEventListener('pointerdown', dehors, true); document.removeEventListener('keydown', echap, true); };
  }, [ouvert]);

  // fiches rangées par séance (dans l'ordre des pages), puis « Sans séance »
  const groupes = new Map();
  for (const f of fiches) {
    const s = seanceDe(f, seances);
    const cle = s ? s.cle : '';
    if (!groupes.has(cle)) groupes.set(cle, { s, fiches: [] });
    groupes.get(cle).fiches.push(f);
  }
  const liste = [...groupes.values()].sort((a, b) => (a.s ? a.s.de : Infinity) - (b.s ? b.s.de : Infinity));
  const sActive = active ? seanceDe(active, seances) : null;
  const choisir = (fn) => { setOuvert(false); fn(); };

  return (
    <div className="pdfr-fiche-choix" ref={racine}>
      <button type="button" className={'pdfr-fiche-choix-btn' + (surFiche ? ' affichee' : '')} aria-haspopup="menu" aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)} title="Choisir la fiche (les fiches du cours, rangées par séance)" data-choix-fiche="">
        {sActive && sActive.n ? <span className="pdfr-fiche-s">S{sActive.n}</span> : null}
        <span className="pdfr-fiche-nom">{active ? nomFiche(active) : 'Fiche'}</span>
        <Icon name="chevD" size={13} />
      </button>
      {ouvert && pos && createPortal(
        <div className="pdfr-fiche-menu" role="menu" aria-label="Fiches du cours" ref={menu} style={{ left: pos.left, top: pos.top }}>
          <button type="button" role="menuitem" className={'pdfr-fiche-item' + (!surFiche ? ' actif' : '')} onClick={() => choisir(onOriginal)}>
            <Icon name="filePdf" size={14} /><span>{nomOriginal}</span>
          </button>
          <div className="pdfr-fiche-sep" />
          {liste.map((g) => (
            <div key={g.s ? g.s.cle : 'sans'} role="group">
              <div className="pdfr-fiche-groupe">{g.s ? <>{g.s.n ? `Séance ${g.s.n}` : 'Séance'}{g.s.date ? ` · ${dateSeance(g.s.date)}` : ''} · {pagesSeance(g.s)}</> : 'Sans séance'}</div>
              {g.fiches.map((f) => (
                <button key={f.id} type="button" role="menuitem" data-fiche={f.id} className={'pdfr-fiche-item sous' + (surFiche && active && f.id === active.id ? ' actif' : '')} onClick={() => choisir(() => onChoisir(f.id))}>
                  <Icon name="filePdf" size={14} /><span>{nomFiche(f)}</span><small>{f.nbPagesFiche} p.</small>
                </button>
              ))}
            </div>
          ))}
          {onAjouter && (<>
            <div className="pdfr-fiche-sep" />
            <button type="button" role="menuitem" className="pdfr-fiche-item" onClick={() => choisir(onAjouter)}><Icon name="upload" size={14} /><span>Ajouter une fiche de résumé…</span></button>
          </>)}
        </div>, document.body,
      )}
    </div>
  );
}

/** nom + séance d'une fiche qu'on vient d'importer. `onChange({ titre, seance })` à chaque modification. */
export function ChoixSeanceFiche({ rec, seances = [], onChange }) {
  const propose = rec.seance ? null : seanceProposee(rec.pageMap, seances);
  const initial = rec.seance ? (seances.find((s) => s.debut && s.debut.id === rec.seance.tagId) || null) : propose;
  const [titre, setTitre] = useState(() => nomFiche(rec));
  const [cle, setCle] = useState(() => (initial && initial.debut ? initial.debut.id : ''));
  useEffect(() => { onChange && onChange({ titre, seance: instantSeance(seances.find((s) => s.debut && s.debut.id === cle) || null) }); }, [titre, cle]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fj-seance">
      <label className="fj-champ"><span>Nom de la fiche</span>
        <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} data-champ="nom-fiche" /></label>
      <label className="fj-champ"><span>Elle résume quelle séance ?</span>
        <select value={cle} onChange={(e) => setCle(e.target.value)} data-champ="seance-fiche" disabled={!seances.length}>
          <option value="">{seances.length ? 'Aucune séance en particulier' : 'Aucune séance marquée sur la diapo'}</option>
          {seances.map((s, i) => (
            <option key={s.debut.id} value={s.debut.id}>Séance {i + 1}{s.date ? ` · ${dateSeance(s.date)}` : ''} · {pagesSeance(s)}</option>
          ))}
        </select>
        {propose && cle === propose.debut.id && <small className="fj-aide">Proposée : la fiche reprend surtout les pages {pagesSeance(propose).slice(3)} de la diapo.</small>}
        {!seances.length && <small className="fj-aide">Les séances viennent des tags « Début / Fin de cours » posés sur la diapo.</small>}
      </label>
    </div>
  );
}
