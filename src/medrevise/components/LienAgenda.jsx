/* ============================================================
   MedRevise — FENÊTRE « LIER À UN COURS DE L'AGENDA » (26/11, docs/compte-rendu-seances-liees-agenda.md).
   Ouverte quand un tag « Début de cours » vient d'être posé (menu de la page ou « Transcrire le cours »), et
   depuis le menu du tag Début (« Lier à l'agenda » / « Changer le cours lié »).
   - la JOURNÉE de l'agenda à la date du marqueur (aujourd'hui par défaut), au style de l'agenda (GrilleEcole :
     mêmes blocs, mêmes couleurs), flèches jour précédent / suivant ;
   - le créneau proposé d'office est MIS EN ÉVIDENCE (lib/seancesAgenda.js#proposerCreneau), jamais validé seul :
     toucher un créneau = le lier ;
   - « Passer » : aucun lien (le marqueur reste celui d'avant).
   Lecture seule de l'emploi du temps : rien n'est écrit dans Hyperplanning.
   ============================================================ */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { useEmploiDuTemps, hm, dateCourte, nomJour, debutJour, plusJours, lieuDe, estEnCours, mural } from '../lib/emploiDuTemps.js';
import { useCoursResolus } from './EmploiDuTemps.jsx';
import { disposer, plageHoraire } from './GrilleEcole.jsx';
import { proposerCreneau, minuitDe, retrouverCreneau } from '../lib/seancesAgenda.js';
import '../../styles/emploi-du-temps.css';
import '../../styles/edt-grille.css';
import '../../styles/seances-agenda.css';

const racine = () => document.querySelector('[data-app="medrevise"]') || document.body;
const minutes = (ms) => { const m = mural(ms); return m.h * 60 + m.mi; };

/**
 * `tag` : le tag Début (posé) ; `matiereId` : matière du document ; `page`, `nomDoc` : rappel en tête.
 * onLier(cours) ; onPasser() ; onDelier() (si déjà lié) ; onFermer().
 */
export function FenetreLienAgenda({ ctx, tag, matiereId = null, page, nomDoc = '', onLier, onPasser, onDelier = null, onFermer }) {
  const edt = useEmploiDuTemps();
  const events = useMemo(() => (edt.donnees && edt.donnees.events) || [], [edt.donnees]);
  const resoudre = useCoursResolus(ctx, events);
  const [maintenant] = useState(() => Date.now());
  const lien = tag && tag.agenda;
  // jour affiché : celui du cours lié, sinon la date du marqueur (aujourd'hui par défaut)
  const [jour, setJour] = useState(() => {
    const d = lien ? debutJour(Date.parse(lien.debut)) : minuitDe(tag && tag.date);
    return Number.isFinite(d) ? d : debutJour(maintenant);
  });
  const aujourdhui = debutJour(maintenant);
  const duJour = useMemo(() => events.filter((e) => !e.allDay && Date.parse(e.start) < plusJours(jour, 1) && Date.parse(e.end) > jour), [events, jour]);
  const actuel = useMemo(() => (lien ? retrouverCreneau(lien, events, edt.donnees) : null), [lien, events, edt.donnees]);
  const propose = useMemo(() => (lien ? null : proposerCreneau(events, { jour, maintenant, matiereId, matiereDe: (e) => { const i = resoudre(e.title); return i.matiere ? i.matiere.id : null; } })),
    [events, jour, maintenant, matiereId, resoudre, lien]);
  const { debut: hDebut, fin: hFin } = useMemo(() => plageHoraire(duJour, [jour]), [duJour, jour]);
  const pxH = 46;
  const disp = useMemo(() => disposer(duJour, jour), [duJour, jour]);
  const heures = []; for (let h = hDebut; h < hFin; h++) heures.push(h);

  // Échap = Passer (nouveau marqueur) ou Fermer (changement)
  useEffect(() => {
    const k = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); (lien ? onFermer : onPasser)(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [lien, onFermer, onPasser]);
  // le créneau proposé (ou lié), sinon le premier cours, en vue
  const zone = useRef(null);
  useLayoutEffect(() => {
    const el = zone.current; if (!el) return;
    const cible = (propose || (actuel && actuel.e) || disp[0] || {}).start;
    el.scrollTop = cible ? Math.max(0, ((minutes(Date.parse(cible)) / 60) - hDebut - 0.6) * pxH) : 0;
  }, [jour, propose && propose.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const decal = Math.round((jour - aujourdhui) / 864e5);
  const nj = nomJour(jour, true);
  const titreJour = decal === 0 ? 'Aujourd’hui' : decal === -1 ? 'Hier' : decal === 1 ? 'Demain' : nj[0].toUpperCase() + nj.slice(1);
  const sansDonnees = !edt.donnees;
  const minNow = minutes(maintenant);
  const ligne = jour === aujourdhui && minNow >= hDebut * 60 && minNow <= hFin * 60;

  return createPortal(
    <div className="day-pop-scrim" onClick={lien ? onFermer : onPasser}>
      <div className="day-pop sea-fenetre" role="dialog" aria-label="Lier à un cours de l’agenda" style={{ width: 'min(440px, 94vw)' }} onClick={(ev) => ev.stopPropagation()}>
        <div className="day-pop-head">
          <div className="serif" style={{ fontSize: 19 }}>{lien ? 'Changer le cours lié' : 'Lier à un cours de l’agenda'}</div>
          <div className="hint sea-sous">▶ Début · page {page}{nomDoc ? ` · ${nomDoc}` : ''}</div>
        </div>
        <div className="day-pop-body sea-corps">
          <div className="wcal-nav edt-nav edtg-nav sea-nav">
            <div className="weeknav">
              <button type="button" onClick={() => setJour((j) => plusJours(j, -1))} title="Jour précédent" aria-label="Jour précédent" data-sea="prec"><Icon name="chevL" size={18} /></button>
              <span className="wk" data-sea-jour={jour}>{titreJour}</span>
              <button type="button" onClick={() => setJour((j) => plusJours(j, 1))} title="Jour suivant" aria-label="Jour suivant" data-sea="suiv"><Icon name="chevR" size={18} /></button>
            </div>
            <span className="wcal-range"><span>{nomJour(jour)} {dateCourte(jour)}</span></span>
            {jour !== aujourdhui && <button type="button" className="btn ghost sm" onClick={() => setJour(aujourdhui)} title="Revenir à aujourd’hui">Aujourd’hui</button>}
          </div>
          {sansDonnees ? (
            <div className="edt-vide"><Icon name="calendar" size={16} /><div><b>{edt.statut === 'non_configure' ? 'Emploi du temps non configuré' : 'Emploi du temps indisponible'}</b><div className="hint">Le marqueur est posé ; tu pourras le lier plus tard depuis son menu.</div></div></div>
          ) : (
            <div className="edtg sea-grille" data-vue="jour">
              <div className="edtg-zone sea-zone" ref={zone} style={{ '--cols': 1, '--px-h': pxH + 'px' }}>
                <div className="edtg-corps" style={{ height: (hFin - hDebut) * pxH }}>
                  <div className="edtg-heures" aria-hidden="true">
                    {heures.map((h) => <div key={h} className="edtg-heure-lbl" style={{ top: (h - hDebut) * pxH }}>{h > hDebut ? `${h}:00` : ''}</div>)}
                  </div>
                  <div className={'edtg-col' + (jour === aujourdhui ? ' today' : '')} role="listbox" aria-label={`Cours du ${nomJour(jour, true)} ${dateCourte(jour)}`}>
                    {heures.map((h) => <div key={h} className="edtg-trait" style={{ top: (h - hDebut) * pxH }} />)}
                    {disp.map((x) => {
                      const e = x.e; const info = resoudre(e.title);
                      const top = ((x.a - hDebut * 60) / 60) * pxH; const h = Math.max(22, ((x.b - x.a) / 60) * pxH - 2);
                      const estPropose = propose && propose.uid === e.uid;
                      const estLie = actuel && actuel.e && actuel.e.uid === e.uid;
                      const lieu = lieuDe(e);
                      return (
                        <button key={e.uid} type="button" role="option" aria-selected={!!(estPropose || estLie)}
                          className={'edtg-bloc sea-bloc ' + (h < 40 ? 'xs' : 's') + (estPropose ? ' propose' : '') + (estLie ? ' lie-ici' : '') + (e.cancelled ? ' annule' : '') + (estEnCours(e, maintenant) ? ' en-cours' : '')}
                          style={{ '--edt-c': info.couleur, top, height: h, left: `calc(${(x.col / x.n) * 100}% + 2px)`, width: `calc(${100 / x.n}% - 4px)` }}
                          data-uid={e.uid} data-titre={e.title} title={`Lier au cours ${e.title} · ${hm(e.start)}–${hm(e.end)}${lieu ? ' · ' + lieu : ''}`}
                          onClick={() => onLier(e)}>
                          {h >= 40 && <span className="edtg-heure">{hm(e.start)}–{hm(e.end)}{e.cancelled ? ' · annulé' : ''}</span>}
                          <span className="edtg-t">{e.title}{h < 40 && <span className="edtg-heure"> · {hm(e.start)}</span>}</span>
                          {h >= 58 && lieu && <span className="edtg-l">{lieu}</span>}
                          {estPropose && <span className="sea-etiquette">Proposé</span>}
                          {estLie && <span className="sea-etiquette lie">Lié</span>}
                        </button>
                      );
                    })}
                    {ligne && <div className="edtg-maintenant" style={{ top: ((minNow - hDebut * 60) / 60) * pxH }} />}
                  </div>
                  {!disp.length && <div className="edtg-rien">Pas de cours ce jour-là.</div>}
                </div>
              </div>
              <div className="hint sea-aide">{propose ? 'Touche un cours pour le lier (le cours proposé est mis en évidence).' : 'Touche un cours pour le lier.'}</div>
            </div>
          )}
        </div>
        <div className="day-pop-foot">
          {lien && onDelier && <button type="button" className="btn danger" onClick={onDelier} data-action="delier" title="Retirer le lien avec l’agenda (le marqueur reste)">Délier</button>}
          <span style={{ flex: 1 }} />
          {lien
            ? <button type="button" className="btn" onClick={onFermer} data-action="annuler">Annuler</button>
            : <button type="button" className="btn" onClick={onPasser} data-action="passer" title="Ne pas lier ce début de cours à l’agenda">Passer</button>}
        </div>
      </div>
    </div>, racine());
}

/** discret, sous l'étiquette du tag Début lié : « 17 nov. · Histologie » (infobulle : l'heure du créneau) */
export function MentionLien({ lien, onOuvrir }) {
  if (!lien) return null;
  const debut = Date.parse(lien.debut);
  const nj = nomJour(debut, true);
  return (
    <button type="button" className="tgp-lien-agenda" data-lien-agenda={lien.cle}
      title={`Lié au cours ${lien.titre} — ${nj} ${dateCourte(debut)}, ${hm(lien.debut)}–${hm(lien.fin)}${lien.salle ? ' · ' + lien.salle : ''} (changer ou délier)`}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onOuvrir(); }}>
      <Icon name="calendar" size={10} /><span>{dateCourte(debut)} · {lien.titre}</span>
    </button>
  );
}
