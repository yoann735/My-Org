/* ============================================================
   MedRevise — DATES DE TRANSCRIPT dans l'arbre de la Bibliothèque (25/11/2026,
   docs/compte-rendu-filtre-dates-transcript.md). Affichage seulement : les jours
   viennent de lib/datesTranscript.js (calcul unique, mémorisé).
   - BoutonCalendrier : icône de l'en-tête d'une matière (actif = accent).
   - LigneDates : UNE ligne de pastilles sous le titre d'un cours, jamais plus ;
     ce qui ne tient pas devient « +N » (toucher = déplier ce cours seulement,
     toucher encore = replier). Toucher une pastille = filtrer la matière sur ce jour.
     Heure et durée (« 17 nov. · 9h00 · 52 min ») : sur la pastille du jour filtré, et sur toutes
     quand la ligne est dépliée ; toujours dans l'infobulle. La ligne repliée reste une ligne de dates.
   ============================================================ */
import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { libelleJour, libelleJourEntier, libelleHeure, libelleDuree, detailJour } from '../lib/datesTranscript.js';
import '../../styles/dates-transcript.css';

/** le glisser des fiches (dnd-kit) ne démarre pas depuis une pastille */
const garder = { onPointerDown: (e) => e.stopPropagation(), onMouseDown: (e) => e.stopPropagation(), onTouchStart: (e) => e.stopPropagation(), onDoubleClick: (e) => e.stopPropagation() };

export function BoutonCalendrier({ actif, onBascule, persistant = false }) {
  return (
    <button type="button" className={'cd-ic ltd-cal' + (actif ? ' actif' : '') + (persistant ? ' ltd-cal-fixe' : '')}
      aria-pressed={actif} title={actif ? 'Masquer les dates de transcript' : 'Afficher les dates de transcript'}
      onClick={(e) => { e.stopPropagation(); onBascule(); }} onDoubleClick={(e) => e.stopPropagation()}>
      <Icon name="calendar" size={14} />
    </button>
  );
}

/* MÉMOIRE DES MESURES (module) : largeur de chaque texte de pastille, du « +N », de l'espacement, et
   dernière largeur de la ligne de chaque cours — par type d'écran (souris / tactile : tailles différentes).
   Un cours déjà affiché se réaffiche en UN rendu, sans passe de mesure. */
const memo = { l: new Map(), boite: new Map(), gap: new Map() };
const ecran = () => (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 't' : 's');

/** heure et durée du jour (« 9h00 · 52 min »), ou '' */
function heureDuree(id, j) {
  const d = detailJour(id, j);
  return d ? `${libelleHeure(d.debut)} · ${libelleDuree(d.duree)}` : '';
}
/** texte affiché d'une pastille : la date ; + heure et durée si c'est le jour filtré ou si la ligne est dépliée */
const texte = (id, j, detail, maintenant) => libelleJour(j, maintenant) + (detail ? ' · ' + heureDuree(id, j) : '');

/** jours visibles quand la ligne est repliée : les plus récents qui tiennent sur UNE ligne, « +N » compris ;
    le jour filtré y est toujours (sa place est réservée). null s'il manque une mesure. */
function visiblesDepuisMemo(id, jours, jourActif, maintenant) {
  const e = ecran(), W = memo.boite.get(e + id), gap = memo.gap.get(e), plus = memo.l.get(e + '+' + jours.length);
  if (!W || gap == null || plus == null) return null;
  const larg = (j) => memo.l.get(e + texte(id, j, j === jourActif, maintenant));
  if (jours.some((j) => larg(j) == null)) return null;
  const actif = jours.includes(jourActif) ? jourActif : null;
  const autres = jours.filter((j) => j !== actif);
  let total = actif ? larg(actif) : 0, n = actif ? 1 : 0;
  const pris = [];
  for (let k = 0; k < autres.length; k++) {
    const avec = total + (n ? gap : 0) + larg(autres[k]);
    if (avec + (k < autres.length - 1 ? gap + plus : 0) > W) break;
    total = avec; n++; pris.push(autres[k]);
  }
  return jours.filter((j) => j === actif || pris.includes(j));
}

export function LigneDates({ id, jours, jourActif, onChoisir, maintenant }) {
  const [deplie, setDeplie] = useState(false);
  const cle = jours.join() + '|' + (jourActif || '') + '|' + (jourActif ? heureDuree(id, jourActif) : '');
  const [etat, setEtat] = useState(() => { const v = visiblesDepuisMemo(id, jours, jourActif, maintenant); return v ? { cle, v } : { cle: null, v: jours }; });
  const boite = useRef(null);

  useLayoutEffect(() => {
    const el = boite.current;
    if (!el || deplie) return undefined;
    const e = ecran();
    if (etat.cle !== cle) {
      // passe de mesure : toutes les pastilles + un « +N » témoin, rendus invisibles, mesurés une fois
      el.querySelectorAll('[data-jour]').forEach((p) => memo.l.set(e + p.dataset.texte, p.offsetWidth));
      const pl = el.querySelector('.ltd-plus-mesure');
      memo.l.set(e + '+' + jours.length, pl ? pl.offsetWidth : 28);
      memo.gap.set(e, parseFloat(getComputedStyle(el).columnGap) || 0);
    }
    const calculer = () => {
      const W = el.clientWidth;
      if (!W) return;
      memo.boite.set(e + id, W);
      const v = visiblesDepuisMemo(id, jours, jourActif, maintenant);
      if (v) setEtat((o) => (o.cle === cle && o.v.join() === v.join() ? o : { cle, v }));
    };
    calculer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(calculer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cle, deplie]); // eslint-disable-line react-hooks/exhaustive-deps

  const mesure = !deplie && etat.cle !== cle; // dépliée : tout est montré, rien à mesurer (mesure au repli)
  const montres = deplie || mesure ? jours : etat.v;
  const caches = jours.length - montres.length;
  return (
    <div className={'ltd-ligne' + (deplie ? ' deplie' : '')} {...garder} onClick={(e) => e.stopPropagation()}>
      <span className="lt-pli" aria-hidden="true" /><span className="ltd-cale" aria-hidden="true" />
      <div ref={boite} className={'ltd-pastilles' + (mesure ? ' mesure' : '')} role="group" aria-label="Dates de transcript">
        {montres.map((j) => {
          const actif = j === jourActif, detail = actif || deplie, hd = heureDuree(id, j), d = detailJour(id, j);
          return (
            <button key={j} type="button" data-jour={j} data-texte={texte(id, j, detail, maintenant)} className={'ltd-p' + (actif ? ' actif' : '')} aria-pressed={actif}
              title={`${libelleJourEntier(j)}${hd ? ` — début ${hd.replace(' · ', ', ')} de transcript` : ''}${d && d.sessions > 1 ? ` (${d.sessions} sessions)` : ''}\n${actif ? 'Toucher : retirer le filtre' : 'Toucher : seulement les cours transcrits ce jour-là'}`}
              onClick={() => onChoisir(j)}>
              {libelleJour(j, maintenant)}
              {detail && hd && <span className="ltd-hd">{hd}</span>}
            </button>
          );
        })}
        {mesure && <span className="ltd-p ltd-plus ltd-plus-mesure" aria-hidden="true">+{jours.length}</span>}
        {!mesure && (caches > 0 || deplie) && (
          <button type="button" className="ltd-p ltd-plus" aria-expanded={deplie}
            title={deplie ? 'Replier les dates' : `Voir les ${caches} autre${caches > 1 ? 's' : ''} date${caches > 1 ? 's' : ''} (avec heure et durée)`}
            onClick={() => setDeplie((x) => !x)}>
            {deplie ? <Icon name="chevU" size={11} /> : `+${caches}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** rappel du filtre en tête de la liste des cours : « 17 nov. ✕ » */
export function RappelFiltre({ jour, onRetirer, maintenant }) {
  return (
    <div className="ltd-rappel" {...garder}>
      <span className="lt-pli" aria-hidden="true" />
      <button type="button" className="ltd-rappel-p" title={`Retirer le filtre (${libelleJourEntier(jour)})`} onClick={(e) => { e.stopPropagation(); onRetirer(); }}>
        <Icon name="calendar" size={11} /><span>{libelleJour(jour, maintenant)}</span><Icon name="x" size={11} />
      </button>
    </div>
  );
}
