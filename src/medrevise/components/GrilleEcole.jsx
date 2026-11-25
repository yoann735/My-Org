/* ============================================================
   MedRevise — EMPLOI DU TEMPS « ÉCOLE » : UN VRAI CALENDRIER HORAIRE (17/10,
   docs/compte-rendu-fichier-carnet-calendrier.md), façon Apple Calendar.
   - colonne des heures à gauche (première heure de cours de la semaine − 1 h → dernière + 1 h,
     au moins 8 h–19 h), jours en colonnes (lun → ven ; sam./dim. seulement s'il y a cours) ;
   - cours à leur hauteur EXACTE (proportionnelle à la durée), trous visibles, chevauchements
     côte à côte ; ligne rouge de l'heure actuelle, jour actuel surligné, cours en cours pulsant ;
   - bloc : couleur du cours (bordure gauche + fond teinté), intitulé, prof, salle/Teams, tronqués
     selon la hauteur ; tap → fiche détaillée (horaire, prof, salle, matière reliée, Ouvrir,
     Transcrire si Teams en cours) ;
   - Jour · 3 jours · Semaine ; précédent / suivant, glissement horizontal, « Aujourd'hui » ;
     en-tête des jours et colonne des heures collants, défilement vertical.
   Toutes les heures sont celles de BRUXELLES (lib/emploiDuTemps.js#mural), quel que soit le fuseau
   de l'appareil. Lecture seule : rien n'est écrit (ni J, ni cartes).
   ============================================================ */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal, matiereMeta } from './ui.jsx';
import { mural, lundiDe, plusJours, debutJour, hm, dateCourte, nomJour, estEnCours, lieuDe } from '../lib/emploiDuTemps.js';
import { libellePages, MENTIONS } from '../lib/seancesAgenda.js';
import '../../styles/seances-agenda.css';

/* (26/11, docs/compte-rendu-seances-liees-agenda.md) SÉANCES LIÉES : sur un créneau lié, une ligne discrète par séance
   (« p. 157–192 · <document> », « à partir de p. 157 » sans fin). Un lien dont le créneau a disparu reste affiché sur
   sa COPIE (bloc en pointillés « cours retiré de l'agenda ») ; un créneau qui a bougé porte « horaire modifié ».
   Sans séance liée, le bloc et sa fiche sont exactement ceux d'avant. */
const AUCUNE = [];
export function LignesSeances({ seances, compacte = false }) {
  if (!seances || !seances.length) return null;
  return seances.map((s) => (
    <span key={s.debut.id} className={'edtg-seance' + (compacte ? ' compacte' : '')} data-seance={s.debut.id} title={`${libellePages(s)} · ${s.nom}`}>
      <span className="tnum">{libellePages(s)}</span> · {s.nom}
    </span>
  ));
}
const mentionDe = (e, seances) => (e.copie === 'retire' ? MENTIONS.retire : (seances || []).some((s) => s.etat === 'modifie') ? MENTIONS.modifie : '');

export const VUES = [{ id: 'jour', label: 'Jour' }, { id: '3jours', label: '3 jours' }, { id: 'semaine', label: 'Semaine' }];
const CLE_VUE = 'medrevise.edt.vue';
const lireVue = () => { try { const v = localStorage.getItem(CLE_VUE); return VUES.some((x) => x.id === v) ? v : null; } catch (e) { return null; } };
const ecrireVue = (v) => { try { localStorage.setItem(CLE_VUE, v); } catch (e) { /* stockage indisponible : la vue reste celle de la session */ } };
/** vue par défaut selon l'APPAREIL : téléphone → Jour ; tablette (< 1 200 px ou tactile) → 3 jours ; ordinateur → Semaine.
    Un conteneur très étroit (< 420 px) passe en Jour, quel que soit l'appareil. */
export const vueParDefaut = (largeur, mobile) => {
  if (mobile || (largeur > 0 && largeur < 420)) return 'jour';
  const fenetre = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const tactile = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return fenetre < 1200 || tactile ? '3jours' : 'semaine';
};

const minutesDuJour = (ms) => { const m = mural(ms); return m.h * 60 + m.mi; };
const estWeekEnd = (debut) => { const m = mural(debut); const j = new Date(Date.UTC(m.y, m.mo - 1, m.d)).getUTCDay(); return j === 0 || j === 6; };
const coursDuJour = (events, debut) => { const fin = plusJours(debut, 1); return events.filter((e) => Date.parse(e.start) < fin && Date.parse(e.end) > debut); };

/** les jours affichés pour une vue et un jour d'ancrage (minuit, Bruxelles) */
export function joursAffiches(vue, ancre, events) {
  if (vue === 'jour') return [ancre];
  if (vue === 'semaine') {
    const lundi = lundiDe(ancre);
    const l = [];
    for (let i = 0; i < 7; i++) { const d = plusJours(lundi, i); if (i < 5 || coursDuJour(events, d).some((e) => !e.allDay)) l.push(d); }
    return l;
  }
  // 3 jours : à partir de l'ancre, en sautant un samedi / dimanche sans cours
  const l = [];
  for (let i = 0; l.length < 3 && i < 9; i++) { const d = plusJours(ancre, i); if (!estWeekEnd(d) || coursDuJour(events, d).length) l.push(d); }
  return l;
}

/** plage horaire (heures entières) : première heure de cours de la (des) semaine(s) − 1 h → dernière + 1 h, au moins 8 h–19 h */
export function plageHoraire(events, jours) {
  const lundis = [...new Set(jours.map((d) => lundiDe(d)))];
  let min = Infinity, max = -Infinity;
  lundis.forEach((lundi) => {
    for (let i = 0; i < 7; i++) {
      const d = plusJours(lundi, i);
      coursDuJour(events, d).filter((e) => !e.allDay).forEach((e) => {
        const a = Math.max(d, Date.parse(e.start)), b = Math.min(plusJours(d, 1), Date.parse(e.end));
        min = Math.min(min, minutesDuJour(a));
        max = Math.max(max, b >= plusJours(d, 1) ? 24 * 60 : minutesDuJour(b));
      });
    }
  });
  const debut = Number.isFinite(min) ? Math.max(0, Math.min(8, Math.floor(min / 60) - 1)) : 8;
  const fin = Number.isFinite(max) ? Math.min(24, Math.max(19, Math.ceil(max / 60) + 1)) : 19;
  return { debut, fin };
}

/** disposition d'un jour : chaque cours → { a, b (minutes), col, n (colonnes de son groupe) } ; chevauchements côte à côte */
export function disposer(events, debut) {
  const fin = plusJours(debut, 1);
  const l = events.filter((e) => !e.allDay).map((e) => {
    const s = Date.parse(e.start), t = Date.parse(e.end);
    return { e, a: s <= debut ? 0 : minutesDuJour(s), b: t >= fin ? 24 * 60 : minutesDuJour(t) };
  }).sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a));
  let groupe = [], cols = [], finGroupe = -1;
  const clore = () => { groupe.forEach((x) => { x.n = cols.length; }); groupe = []; cols = []; };
  l.forEach((x) => {
    if (groupe.length && x.a >= finGroupe) clore();
    let c = cols.findIndex((f) => f <= x.a);
    if (c < 0) { c = cols.length; cols.push(x.b); } else cols[c] = x.b;
    x.col = c; groupe.push(x); finGroupe = Math.max(finGroupe, x.b);
  });
  clore();
  return l;
}

/* ---------- un bloc de cours ---------- */
function Bloc({ x, hDebut, pxH, info, maintenant, change, onOuvrir, seances = AUCUNE }) {
  const { e } = x;
  const mention = mentionDe(e, seances);
  const top = ((x.a - hDebut * 60) / 60) * pxH;
  const h = Math.max(18, ((x.b - x.a) / 60) * pxH - 2);
  const enCours = !e.copie && estEnCours(e, maintenant); // (26/11) la copie d'un cours retiré n'est jamais « en cours »
  const lieu = [lieuDe(e), e.modality === 'pratique' ? 'pratique' : ''].filter(Boolean).join(' · ');
  const densite = h < 34 ? 'xs' : h < 72 ? 's' : 'm'; // xs : titre · heure ; s : heure, titre, lieu ; m : + prof, titre sur plusieurs lignes
  const lignesTitre = densite === 'm' ? Math.max(1, Math.floor((h - 8 - 14 - (e.teacher ? 15 : 0) - (lieu ? 15 : 0) - seances.length * 15) / 15)) : 1;
  return (
    <button type="button" className={'edtg-bloc ' + densite + (e.cancelled ? ' annule' : '') + (enCours ? ' en-cours' : '') + (change ? ' change' : '') + (seances.length ? ' lie' : '') + (e.copie ? ' copie' : '')}
      style={{ '--edt-c': info.couleur, top, height: h, left: `calc(${(x.col / x.n) * 100}% + 2px)`, width: `calc(${100 / x.n}% - 4px)`, '--lignes': lignesTitre }}
      data-uid={e.uid} data-titre={e.title} data-h={`${hm(e.start)}–${hm(e.end)}`} data-p={e.teacher || ''} data-l={lieu} aria-label={`${e.title}, ${hm(e.start)}–${hm(e.end)}${e.teacher ? ', ' + e.teacher : ''}${lieu ? ', ' + lieu : ''}${e.cancelled ? ', annulé' : ''}${mention ? ', ' + mention : ''}${seances.length ? ', ' + seances.map((s) => `${libellePages(s)} ${s.nom}`).join(', ') : ''}`}
      title={seances.length ? [mention, ...seances.map((s) => `${libellePages(s)} · ${s.nom}`)].filter(Boolean).join('\n') : undefined}
      onClick={() => onOuvrir(e)}>
      {densite === 'xs'
        ? <span className="edtg-t">{e.title}<span className="edtg-heure"> · {hm(e.start)}</span></span>
        : <>
          {densite !== 'xs' && h >= 50 && <span className="edtg-heure">{hm(e.start)}–{hm(e.end)}{e.cancelled ? ' · annulé' : mention ? ' · ' + mention : change ? ' · modifié' : ''}</span>}
          <span className="edtg-t">{e.title}</span>
          {densite === 'm' && e.teacher && <span className="edtg-p">{e.teacher}</span>}
          {lieu && <span className="edtg-l">{e.modality === 'teams' && <Icon name="ext" size={9} />}{lieu}</span>}
          <LignesSeances seances={densite === 'm' ? seances : seances.slice(0, 1)} />
        </>}
    </button>
  );
}

/* ---------- fiche détaillée d'un cours ---------- */
function FicheCours({ e, info, maintenant, change, actions, onFermer, seances = AUCUNE }) {
  const mention = mentionDe(e, seances);
  const modifiee = seances.find((s) => s.etat === 'modifie');
  const enCours = !e.copie && estEnCours(e, maintenant);
  const lieu = lieuDe(e);
  const debut = Date.parse(e.start);
  const n = nomJour(debut, true);
  return (
    <Modal title={e.title} onClose={onFermer} width="min(440px, 94vw)">
      <div className="edtg-fiche" style={{ '--edt-c': info.couleur }} data-fiche-cours={e.uid}>
        <div className="edtg-fiche-bande" />
        <div className="edtg-fiche-ligne"><Icon name="clock" size={14} /><span>{n[0].toUpperCase() + n.slice(1)} {dateCourte(debut)} · <b>{e.allDay ? 'toute la journée' : `${hm(e.start)}–${hm(e.end)}`}</b>
          {enCours && <span className="edt-badge direct">En cours</span>}{e.cancelled && <span className="edt-badge annule">Annulé</span>}{!e.cancelled && change && !mention && <span className="edt-badge">Modifié</span>}{mention && <span className="edt-badge edtg-mention" data-mention={e.copie || 'modifie'}>{mention}</span>}</span></div>
        {modifiee && <div className="edtg-fiche-ligne hint"><Icon name="info" size={14} /><span>Horaire au moment du lien : {dateCourte(Date.parse(modifiee.lien.debut))} · {hm(modifiee.lien.debut)}–{hm(modifiee.lien.fin)}</span></div>}
        {seances.length > 0 && (
          <div className="edtg-fiche-ligne edtg-fiche-seances"><Icon name="filePdf" size={14} /><span className="edtg-fiche-seances-l">{seances.map((s) => <span key={s.debut.id} className="edtg-seance-fiche" data-seance={s.debut.id}><b className="tnum">{libellePages(s)}</b> · {s.nom}</span>)}</span></div>
        )}
        {e.teacher && <div className="edtg-fiche-ligne"><Icon name="grad" size={14} /><span>{e.teacher}</span></div>}
        {(lieu || e.modality === 'pratique') && <div className="edtg-fiche-ligne"><Icon name={e.modality === 'teams' ? 'ext' : 'home'} size={14} /><span>{lieu}{e.modality === 'pratique' ? `${lieu ? ' · ' : ''}pratique` : ''}</span></div>}
        <div className="edtg-fiche-ligne"><Icon name="book" size={14} /><span>{info.matiere ? <>Matière reliée : <b>{matiereMeta(info.matiere).label}</b></> : <span className="hint">Aucune matière reliée (Réglages › Emploi du temps)</span>}</span></div>
        {actions}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button type="button" className="btn ghost sm" onClick={onFermer}>Fermer</button></div>
      </div>
    </Modal>
  );
}

/* ---------- la grille ---------- */
export function GrilleEcole({ events, resoudre, maintenant, parUid, actions, largeur, mobile = false, entete = null, bandeau = null, periode = null, seancesParUid = null }) {
  const seancesDe = (e) => (seancesParUid && seancesParUid.get(e.uid)) || AUCUNE;
  const [vueChoisie, setVueChoisie] = useState(() => (mobile ? null : lireVue()));
  const vue = vueChoisie || vueParDefaut(largeur, mobile);
  const choisirVue = (v) => { setVueChoisie(v); if (!mobile) ecrireVue(v); };
  const aujourdhui = debutJour(maintenant);
  const [ancre, setAncre] = useState(aujourdhui);
  const jours = useMemo(() => joursAffiches(vue, vue === 'semaine' ? lundiDe(ancre) : ancre, events), [vue, ancre, events]);
  const { debut: hDebut, fin: hFin } = useMemo(() => plageHoraire(events, jours), [events, jours]);
  const pxH = mobile ? 62 : vue === 'semaine' ? 50 : 56;
  const pas = vue === 'semaine' ? 7 : vue === '3jours' ? 3 : 1;
  const aller = (s) => setAncre((a) => plusJours(vue === 'semaine' ? lundiDe(a) : a, s * pas));
  const surAujourdhui = jours.includes(aujourdhui) && (vue !== 'jour' || ancre === aujourdhui);

  // libellé de la période
  const premier = jours[0], dernier = jours[jours.length - 1];
  const decalSem = Math.round((lundiDe(premier) - lundiDe(aujourdhui)) / (7 * 864e5));
  const decalJour = Math.round((premier - aujourdhui) / 864e5);
  const titre = vue === 'semaine'
    ? (decalSem === 0 ? 'Cette semaine' : decalSem === 1 ? 'Semaine prochaine' : decalSem === -1 ? 'Semaine dernière' : `${dateCourte(premier)} – ${dateCourte(dernier)}`)
    : vue === 'jour'
      ? (decalJour === 0 ? 'Aujourd’hui' : decalJour === 1 ? 'Demain' : decalJour === -1 ? 'Hier' : (() => { const n = nomJour(premier, true); return n[0].toUpperCase() + n.slice(1); })())
      : `${dateCourte(premier)} – ${dateCourte(dernier)}`;
  const sousTitre = vue === 'jour' ? `${nomJour(premier)} ${dateCourte(premier)}` : `${dateCourte(premier)} – ${dateCourte(dernier)}`;

  // défilement vertical : à l'ouverture et au changement de période, l'heure actuelle (ou le premier cours) en haut
  const zone = useRef(null);
  const cleDefil = `${vue}:${premier}`;
  useLayoutEffect(() => {
    const el = zone.current; if (!el) return;
    const premiers = jours.flatMap((d) => disposer(coursDuJour(events, d), d)).map((x) => x.a);
    const cible = jours.includes(aujourdhui) && minutesDuJour(maintenant) / 60 >= hDebut && minutesDuJour(maintenant) / 60 <= hFin
      ? minutesDuJour(maintenant) / 60 - 1.5 : premiers.length ? Math.min(...premiers) / 60 - 0.5 : hDebut;
    el.scrollTop = Math.max(0, (cible - hDebut) * pxH);
  }, [cleDefil]); // eslint-disable-line react-hooks/exhaustive-deps

  // glissement horizontal : doigt (touch) et trackpad (défilement horizontal)
  const depart = useRef(null);
  const roue = useRef({ dx: 0, t: 0 });
  const toucher = {
    onTouchStart: (ev) => { const t = ev.touches[0]; depart.current = { x: t.clientX, y: t.clientY }; },
    onTouchEnd: (ev) => {
      const d = depart.current; depart.current = null; const t = ev.changedTouches[0];
      if (!d || !t) return;
      const dx = t.clientX - d.x, dy = t.clientY - d.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      aller(dx < 0 ? 1 : -1);
    },
    onWheel: (ev) => {
      if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
      const r = roue.current; const now = Date.now();
      if (now - r.t < 650) return;
      r.dx += ev.deltaX;
      if (Math.abs(r.dx) > 90) { aller(r.dx > 0 ? 1 : -1); r.dx = 0; r.t = now; }
    },
  };

  const [fiche, setFiche] = useState(null);
  const heures = []; for (let h = hDebut; h < hFin; h++) heures.push(h);
  const hauteur = (hFin - hDebut) * pxH;
  const minNow = minutesDuJour(maintenant);
  const ligneVisible = jours.includes(aujourdhui) && minNow >= hDebut * 60 && minNow <= hFin * 60;
  const journee = jours.map((d) => coursDuJour(events, d).filter((e) => e.allDay));

  return (
    <div className={'edtg' + (mobile ? ' mobile' : '')} data-vue={vue} lang="fr">
      <div className="wcal-nav edt-nav edtg-nav">
        <div className="weeknav">
          <button type="button" onClick={() => aller(-1)} title={vue === 'semaine' ? 'Semaine précédente' : vue === 'jour' ? 'Jour précédent' : '3 jours plus tôt'} aria-label="Précédent"><Icon name="chevL" size={18} /></button>
          <span className="wk">{titre}</span>
          <button type="button" onClick={() => aller(1)} title={vue === 'semaine' ? 'Semaine suivante' : vue === 'jour' ? 'Jour suivant' : '3 jours plus tard'} aria-label="Suivant"><Icon name="chevR" size={18} /></button>
        </div>
        {!mobile && <span className="wcal-range"><span>{sousTitre}</span></span>}
        {!(mobile && surAujourdhui) && <button type="button" className="btn ghost sm edtg-auj" disabled={surAujourdhui} onClick={() => setAncre(aujourdhui)}>Aujourd’hui</button>}
        <div className="seg edtg-vues" role="tablist" aria-label="Affichage">
          {VUES.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={vue === v.id} className={'seg-btn' + (vue === v.id ? ' active' : '')} data-vue={v.id} onClick={() => choisirVue(v.id)}>{v.label}</button>
          ))}
        </div>
        {entete}
      </div>

      {bandeau}
      {periode && periode.from && periode.to && (plusJours(dernier, 1) <= Date.parse(periode.from) || premier >= Date.parse(periode.to)) && (
        <div className="hint edt-hors">Cette période n’est pas encore publiée sur Hyperplanning (période chargée : semaine passée + 8 semaines).</div>
      )}
      <div className="edtg-zone" ref={zone} {...toucher} style={{ '--cols': jours.length, '--px-h': pxH + 'px' }} data-debut={hDebut} data-fin={hFin}>
        <div className="edtg-tete" role="row">
          <div className="edtg-coin" />
          {jours.map((d) => {
            const auj = d === aujourdhui;
            return (
              <div key={d} className={'edtg-jour-tete' + (auj ? ' today' : '') + (d < aujourdhui ? ' past' : '')} role="columnheader" data-jour={d}>
                <span className="edtg-dow">{nomJour(d).replace('.', '')}</span>
                <span className="edtg-num">{mural(d).d}</span>
              </div>
            );
          })}
        </div>
        {journee.some((l) => l.length) && (
          <div className="edtg-journee">
            <div className="edtg-coin edtg-coin-j">jour</div>
            {journee.map((l, i) => (
              <div key={jours[i]} className="edtg-journee-col">
                {l.map((e) => { const info = resoudre(e.title); return <button type="button" key={e.uid} className="edtg-puce" style={{ '--edt-c': info.couleur }} onClick={() => setFiche(e)}>{e.title}</button>; })}
              </div>
            ))}
          </div>
        )}
        <div className="edtg-corps" style={{ height: hauteur }}>
          <div className="edtg-heures" aria-hidden="true">
            {heures.map((h) => <div key={h} className="edtg-heure-lbl" style={{ top: (h - hDebut) * pxH }}>{h > hDebut ? `${h}:00` : ''}</div>)}
            {ligneVisible && <div className="edtg-maintenant-lbl" style={{ top: ((minNow - hDebut * 60) / 60) * pxH }}>{hm(maintenant)}</div>}
          </div>
          {jours.map((d) => {
            const auj = d === aujourdhui;
            const disp = disposer(coursDuJour(events, d), d);
            return (
              <div key={d} className={'edtg-col' + (auj ? ' today' : '')} role="group" aria-label={`${nomJour(d, true)} ${dateCourte(d)}`} data-jour={d}>
                {heures.map((h) => <div key={h} className="edtg-trait" style={{ top: (h - hDebut) * pxH }} />)}
                {heures.map((h) => <div key={h + .5} className="edtg-trait demi" style={{ top: (h - hDebut + 0.5) * pxH }} />)}
                {disp.map((x) => <Bloc key={x.e.uid} x={x} hDebut={hDebut} pxH={pxH} info={resoudre(x.e.title)} maintenant={maintenant} change={parUid.get(x.e.uid)} onOuvrir={setFiche} seances={seancesDe(x.e)} />)}
                {auj && ligneVisible && <div className="edtg-maintenant" style={{ top: ((minNow - hDebut * 60) / 60) * pxH }} />}
              </div>
            );
          })}
          {jours.every((d) => !coursDuJour(events, d).length) && <div className="edtg-rien">{jours[jours.length - 1] < aujourdhui ? 'Aucun cours sur cette période.' : 'Pas de cours.'}</div>}
        </div>
      </div>

      {fiche && (() => { const info = resoudre(fiche.title); return <FicheCours e={fiche} info={info} maintenant={maintenant} change={parUid.get(fiche.uid)} actions={actions(fiche, info, maintenant, true)} onFermer={() => setFiche(null)} seances={seancesDe(fiche)} />; })()}
    </div>
  );
}

