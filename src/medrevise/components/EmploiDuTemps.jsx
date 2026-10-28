/* ============================================================
   MedRevise — emploi du temps HELHa dans le calendrier de l'Accueil (17/10,
   docs/compte-rendu-emploi-du-temps.md).

   - SelecteurCalendrier : les deux segments « Mes J · École » en tête du calendrier ;
   - CalendrierEcole     : (17/10) un calendrier HORAIRE (components/GrilleEcole.jsx) —
     Jour · 3 jours · Semaine, cours à leur hauteur exacte ; au-dessus : prochain cours,
     changements détectés, rappel du jeudi 16 h ;
   - CalendrierMobile    : le bloc « Calendrier » de l'accueil téléphone ;
   - ReglagesEmploiDuTemps : Réglages → Emploi du temps (couleur, matière reliée).
   En mode « Mes J », rien de ce fichier n'est rendu à la place du calendrier des J :
   seul le sélecteur s'ajoute à l'en-tête.
   ============================================================ */
import { Chiffre, useEnSynchro } from './Chiffre.jsx';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { matiereMeta, PALETTE_MATIERES } from './ui.jsx';
import {
  useEmploiDuTemps, rafraichir, coursEnAvant, quandLibelle, estEnCours, hm, dateCourte,
  nomJour, lieuDe, rappelJeudiVisible, ilYaCourt, changementsVisibles, marquerChangementsVus, debutJour, plusJours,
} from '../lib/emploiDuTemps.js';
import { completer, resoudreCours, titresDansLOrdre, cleCours, correspondanceAuto } from '../lib/edtCouleurs.js';
import { dernierCoursDe } from '../lib/derniersCours.js';
import { weekData } from '../lib/planning.js';
import { GrilleEcole } from './GrilleEcole.jsx';
import '../../styles/emploi-du-temps.css';
import '../../styles/edt-grille.css';


/* ---------- horloge (re-rendu toutes les 30 s : « Dans 25 min », cours en cours) ---------- */
function useMaintenant(pas = 30000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), pas); return () => clearInterval(i); }, [pas]);
  return t;
}

/* ---------- couleurs / matières des cours (attribution automatique à la première apparition) ---------- */
export function useCoursResolus(ctx, events) {
  const titres = useMemo(() => titresDansLOrdre(events), [events]);
  const reglages = ctx.edtReglages;
  const matieres = ctx.db ? ctx.db.matieres : [];
  // couleur imposée (choix de Réglages, matière reliée) → index de palette, pour l'attribution
  const indexImpose = useCallback((titre, c) => {
    if (Number.isInteger(c.couleur)) return c.couleur;
    const m = c.matiereId === null ? null : c.matiereId ? (matieres || []).find((x) => x.id === c.matiereId) : correspondanceAuto(titre, matieres);
    if (!m) return null;
    const i = PALETTE_MATIERES.findIndex((h) => h.toLowerCase() === String(matiereMeta(m).tint).toLowerCase());
    return i >= 0 ? i : null;
  }, [matieres]);
  const complet = useMemo(() => completer(reglages, titres, PALETTE_MATIERES.length, undefined, indexImpose), [reglages, titres, indexImpose]);
  const cleNouveaux = complet.nouveaux.join('|');
  useEffect(() => {
    if (!cleNouveaux || !ctx.majEdtReglages) return;
    ctx.majEdtReglages((cur) => { const r = completer(cur, titres, PALETTE_MATIERES.length, undefined, indexImpose); return r.nouveaux.length ? r.reglages : null; });
  }, [cleNouveaux]); // eslint-disable-line react-hooks/exhaustive-deps
  return useCallback((titre) => resoudreCours(titre, complet.reglages, matieres, {
    palette: PALETTE_MATIERES, teinteMatiere: (m) => matiereMeta(m).tint,
  }), [complet.reglages, matieres]);
}

/* ---------- sélecteur « Mes J · École » ---------- */
export function SelecteurCalendrier({ mode, onMode }) {
  const edt = useEmploiDuTemps();
  const nonConfigure = edt.statut === 'non_configure';
  return (
    <div className="edt-selecteur">
      <div className="seg edt-seg" role="tablist" aria-label="Contenu du calendrier">
        <button type="button" role="tab" aria-selected={mode === 'j'} className={'seg-btn' + (mode === 'j' ? ' active' : '')} onClick={() => onMode('j')}>Mes J</button>
        <button type="button" role="tab" aria-selected={mode === 'ecole'} className={'seg-btn' + (mode === 'ecole' ? ' active' : '')}
          title={nonConfigure ? 'Emploi du temps non configuré' : 'Emploi du temps HELHa (Hyperplanning)'} onClick={() => onMode('ecole')}>École</button>
      </div>
      {nonConfigure && <span className="edt-non-config" role="status">Emploi du temps non configuré</span>}
    </div>
  );
}

/* ---------- libellés d'un changement ---------- */
function detailsChangement(c) {
  const a = c.avant; const n = c.apres;
  if (!a) return ['Nouveau cours', `${hm(n.start)}–${hm(n.end)}`];
  if (!n) return ['Retiré de l’emploi du temps', `${hm(a.start)}–${hm(a.end)}`];
  const d = [];
  if (a.start !== n.start || a.end !== n.end) {
    const jourChange = debutJour(Date.parse(a.start)) !== debutJour(Date.parse(n.start));
    d.push(`${jourChange ? `${nomJour(Date.parse(a.start))} ${dateCourte(Date.parse(a.start))} ` : ''}${hm(a.start)}–${hm(a.end)} → ${jourChange ? `${nomJour(Date.parse(n.start))} ${dateCourte(Date.parse(n.start))} ` : ''}${hm(n.start)}–${hm(n.end)}`);
  }
  if ((a.room || '') !== (n.room || '') || (a.campus || '') !== (n.campus || '') || a.modality !== n.modality) {
    d.push(`${lieuDe(a) || 'sans salle'} → ${lieuDe(n) || 'sans salle'}`);
  }
  if (a.cancelled !== n.cancelled) d.push(n.cancelled ? 'Annulé' : 'Rétabli');
  return d;
}

function LigneChangements({ changements, resoudre }) {
  const [ouvert, setOuvert] = useState(false);
  if (!changements.length) return null;
  const n = changements.length;
  const nonVus = changements.some((c) => !c.vu);
  return (
    <div className="edt-changements">
      <button type="button" className={'edt-ligne lien' + (nonVus ? ' nouveau' : '')} aria-expanded={ouvert}
        onClick={() => { setOuvert((o) => !o); if (!ouvert && nonVus) marquerChangementsVus(); }}>
        <Icon name="alert" size={12} /> {n} changement{n > 1 ? 's' : ''} cette semaine
        <Icon name={ouvert ? 'chevD' : 'chevR'} size={12} />
      </button>
      {ouvert && (
        <ul className="edt-chg-liste">
          {changements.map((c) => {
            const ref = c.apres || c.avant;
            const info = resoudre(ref.title);
            return (
              <li key={c.uid} style={{ '--edt-c': info.couleur }}>
                <div className="edt-chg-t">{ref.title} <span>· {nomJour(Date.parse(ref.start))} {dateCourte(Date.parse(ref.start))}</span></div>
                {detailsChangement(c).map((d, i) => <div className="edt-chg-d" key={i}>{d}</div>)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- boutons Ouvrir / Transcrire ---------- */
function useActions(ctx, avecLecteur) {
  return useCallback((e, info, maintenant, grand = false) => {
    if (!avecLecteur || !info.matiere || e.cancelled) return null;
    const fiche = dernierCoursDe(ctx.db, info.matiere.id);
    if (!fiche) return null;
    const transcrire = e.modality === 'teams' && estEnCours(e, maintenant);
    return (
      <div className={'edt-actions' + (grand ? ' grand' : '')}>
        <button type="button" className="btn ghost sm" title={`Ouvrir « ${fiche.titre} »`}
          onClick={(ev) => { ev.stopPropagation(); ctx.openPdfReader(fiche.id, 'dashboard'); }}>
          <Icon name="book" size={12} /> Ouvrir
        </button>
        {transcrire && (
          <button type="button" className="btn sm edt-transcrire" title={`Transcrire le cours Teams dans « ${fiche.titre} »`}
            onClick={(ev) => { ev.stopPropagation(); ctx.openPdfReader(fiche.id, 'dashboard', undefined, { transcrire: 'onglet' }); }}>
            <Icon name="mic" size={12} /> Transcrire
          </button>
        )}
      </div>
    );
  }, [ctx, avecLecteur]);
}

/* ---------- glissement horizontal (vue jour) ---------- */
function useGlissement(onGauche, onDroite) {
  const depart = useRef(null);
  return {
    onTouchStart: (ev) => { const t = ev.touches[0]; depart.current = { x: t.clientX, y: t.clientY }; },
    onTouchEnd: (ev) => {
      const d = depart.current; depart.current = null;
      const t = ev.changedTouches[0];
      if (!d || !t) return;
      const dx = t.clientX - d.x; const dy = t.clientY - d.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      if (dx < 0) onGauche(); else onDroite();
    },
  };
}

/* ---------- largeur du conteneur (mesure immédiate + ResizeObserver) ---------- */
function useLargeur() {
  const [el, setEl] = useState(null); // ref « fonction » : suit le changement d'élément (chargement → grille)
  const [l, setL] = useState(0);
  useLayoutEffect(() => {
    if (!el) return undefined;
    const mesurer = () => setL(el.getBoundingClientRect().width);
    mesurer();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mesurer) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', mesurer);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', mesurer); };
  }, [el]);
  return [setEl, l];
}

/* ---------- état sans données ---------- */
function EtatVide({ edt }) {
  if (edt.statut === 'non_configure') {
    return (
      <div className="edt-vide">
        <Icon name="calendar" size={18} />
        <div><b>Emploi du temps non configuré</b>
          <div className="hint">Le lien iCal Hyperplanning de la promo se règle côté serveur (variable HELHA_ICAL_URL sur Vercel). Le calendrier des J reste disponible avec « Mes J ».</div></div>
      </div>
    );
  }
  if (edt.statut === 'init' || edt.enCours) return <div className="edt-vide"><Icon name="refresh" size={16} /> Chargement de l’emploi du temps…</div>;
  return (
    <div className="edt-vide">
      <Icon name="alert" size={16} />
      <div><b>Emploi du temps indisponible</b><div className="hint">{edt.message || 'Réessaie dans un instant.'}</div></div>
      <button type="button" className="btn ghost sm" onClick={() => rafraichir()}>Réessayer</button>
    </div>
  );
}

/* ---------- état de fraîcheur ---------- */
function Fraicheur({ edt, maintenant }) {
  const d = edt.donnees;
  if (!d) return null;
  const quand = ilYaCourt(d.generatedAt || d.recuLe, maintenant);
  const horsLigne = edt.statut === 'hors_ligne';
  const souci = edt.statut === 'erreur' || edt.statut === 'non_configure' || !!edt.message;
  return (
    <span className={'edt-fraicheur' + (horsLigne || souci ? ' souci' : '')} title={edt.message || undefined}>
      {horsLigne ? 'Hors ligne · ' : ''}mis à jour {quand}
      <button type="button" className="edt-actualiser" title={edt.forceLimite ? 'Déjà actualisé il y a moins d’une minute' : 'Actualiser maintenant'}
        disabled={edt.enCours} onClick={() => rafraichir({ force: true })} aria-label="Actualiser l’emploi du temps">
        <Icon name="refresh" size={12} className={edt.enCours ? 'edt-tourne' : ''} />
      </button>
    </span>
  );
}

/* ---------- calendrier « École » ---------- */
export function CalendrierEcole({ ctx, mobile = false }) {
  const edt = useEmploiDuTemps();
  const maintenant = useMaintenant();
  const events = useMemo(() => (edt.donnees && edt.donnees.events) || [], [edt.donnees]);
  const resoudre = useCoursResolus(ctx, events);
  const actions = useActions(ctx, !mobile && !!ctx.openPdfReader);
  const [ref, largeur] = useLargeur();
  const changements = useMemo(() => changementsVisibles(maintenant), [edt.changements, maintenant]); // eslint-disable-line react-hooks/exhaustive-deps
  const parUid = useMemo(() => new Map(changements.map((c) => [c.uid, c])), [changements]);
  const avant = useMemo(() => coursEnAvant(events, maintenant), [events, maintenant]);

  if (!edt.donnees) return <div ref={ref}><EtatVide edt={edt} /></div>;

  // (17/10) au-dessus de la grille : prochain cours, changements détectés, rappel du jeudi 16 h
  const tete = (
    <>
      {avant && (() => {
        const info = resoudre(avant.cours.title);
        const e = avant.cours;
        const lieu = lieuDe(e);
        return (
          <div className={'edt-avant' + (avant.enCours ? ' en-cours' : '')} style={{ '--edt-c': info.couleur }}>
            <div className="edt-avant-txt">
              <span className="edt-avant-quand">{quandLibelle(avant, maintenant)}</span>
              {' · '}<span className="edt-avant-titre">{e.title}</span>
              {e.teacher && <> · {e.teacher}</>}
              {lieu && <> · {lieu}</>}
            </div>
            {actions(e, info, maintenant, true)}
          </div>
        );
      })()}
      <div className="edt-lignes">
        <LigneChangements changements={changements} resoudre={resoudre} />
        {rappelJeudiVisible(maintenant) && (
          <span className="edt-ligne rappel"><Icon name="clock" size={12} /> Horaires définitifs à partir du jeudi 16 h pour la semaine suivante</span>
        )}
      </div>
    </>
  );

  /* (17/10) un VRAI calendrier horaire (components/GrilleEcole.jsx) : Jour · 3 jours · Semaine.
     La largeur n'est connue qu'après la première mesure : la grille attend (sinon la vue par défaut sauterait). */
  return (
    <div ref={ref} className={'edt edt-horaire' + (mobile ? ' mobile' : '')}>
      {(largeur > 0 || mobile) && (
        <GrilleEcole events={events} resoudre={resoudre} maintenant={maintenant} parUid={parUid} actions={actions} largeur={largeur} mobile={mobile}
          entete={<Fraicheur edt={edt} maintenant={maintenant} />} bandeau={tete} periode={edt.donnees} />
      )}
    </div>
  );
}

/* ---------- accueil téléphone : « Mes J » du jour, ou l'école ---------- */
function JourJMobile({ ctx }) {
  const [jour, setJour] = useState(0);
  const enSynchro = useEnSynchro(); // (28/10) calendrier calculé : attend la fin de la synchro
  const glisse = useGlissement(() => setJour((j) => j + 1), () => setJour((j) => j - 1));
  const { db } = ctx;
  // même source que le calendrier desktop (planning.js#weekData) : semaine + jour
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const cible = new Date(aujourdhui); cible.setDate(cible.getDate() + jour);
  const lundiAuj = new Date(aujourdhui); lundiAuj.setDate(lundiAuj.getDate() - ((lundiAuj.getDay() + 6) % 7));
  const lundiCible = new Date(cible); lundiCible.setDate(lundiCible.getDate() - ((lundiCible.getDay() + 6) % 7));
  const wk = Math.round((lundiCible - lundiAuj) / (7 * 864e5));
  const day = useMemo(() => weekData(db, wk).days[(cible.getDay() + 6) % 7], [db, wk, jour]); // eslint-disable-line react-hooks/exhaustive-deps
  const libelle = jour === 0 ? 'Aujourd’hui' : jour === 1 ? 'Demain' : jour === -1 ? 'Hier' : cible.toLocaleDateString('fr-FR', { weekday: 'long' });
  return (
    <div className="edt edt-jour">
      <div className="wcal-nav edt-nav">
        <div className="weeknav">
          <button type="button" onClick={() => setJour((j) => j - 1)} title="Jour précédent"><Icon name="chevL" size={18} /></button>
          <span className="wk">{libelle[0].toUpperCase() + libelle.slice(1)}</span>
          <button type="button" onClick={() => setJour((j) => j + 1)} title="Jour suivant"><Icon name="chevR" size={18} /></button>
        </div>
        <span className="wcal-range"><span>{cible.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></span>
        {jour !== 0 && <button type="button" className="btn ghost sm" onClick={() => setJour(0)}>Aujourd'hui</button>}
      </div>
      <div className="edt-jour-liste" {...glisse} data-jour={jour}>
        {enSynchro ? <div className="wcal-empty edt-rien" data-cal-attente><Chiffre /></div>
          : (!day || (day.byFiche.length === 0 && (day.schemas || []).length === 0))
          ? <div className="wcal-empty edt-rien">Rien à réviser ce jour-là.</div>
          : [...day.byFiche, ...(day.schemas || [])].map((c) => {
            const meta = matiereMeta(c.matiere);
            return (
              <div className="wcal-course edt-j" key={c.fiche.id + (c.jLabel || '')}>
                <span className="wcc-bar" style={{ background: meta.tint }} />
                <div className="wcc-text">
                  <div className="wcc-cat" style={{ color: meta.tint }}>{meta.label}</div>
                  <div className="wcc-title">{c.fiche.titre} <span className="wcc-j">{c.jLabel || (c.items ? `${c.items.length} carte${c.items.length > 1 ? 's' : ''}` : 'schéma')}</span></div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export function CalendrierMobile({ ctx, mode, onMode }) {
  return (
    <div className="mrm-section edt-mobile">
      <div className="mrm-section-head edt-mobile-head">
        <Icon name="calendar" size={15} /> <span>Calendrier</span>
        <SelecteurCalendrier mode={mode} onMode={onMode} />
      </div>
      <div className="mrm-card edt-mobile-carte">
        {mode === 'ecole' ? <CalendrierEcole ctx={ctx} mobile /> : <JourJMobile ctx={ctx} />}
      </div>
    </div>
  );
}

/* ---------- Réglages → Emploi du temps ---------- */
export function ReglagesEmploiDuTemps({ ctx }) {
  const edt = useEmploiDuTemps();
  const maintenant = useMaintenant(60000);
  const events = useMemo(() => (edt.donnees && edt.donnees.events) || [], [edt.donnees]);
  const resoudre = useCoursResolus(ctx, events);
  const matieres = useMemo(() => (ctx.db.matieres || []).filter((m) => !m.archive)
    .map((m) => ({ m, src: (ctx.db.sources || []).find((s) => s.id === m.sourceId) }))
    .sort((a, b) => a.m.nom.localeCompare(b.m.nom, 'fr')), [ctx.db]);
  const cours = useMemo(() => {
    const vus = new Map();
    Object.entries((ctx.edtReglages && ctx.edtReglages.cours) || {}).forEach(([cle, c]) => vus.set(cle, c.titre));
    titresDansLOrdre(events).forEach((t) => { const k = cleCours(t); if (!vus.has(k)) vus.set(k, t); });
    const n = new Map(); events.forEach((e) => { const k = cleCours(e.title); n.set(k, (n.get(k) || 0) + 1); });
    return [...vus.entries()].map(([cle, titre]) => ({ cle, titre, n: n.get(cle) || 0 })).sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  }, [ctx.edtReglages, events]);

  const maj = (cle, titre, champs) => ctx.majEdtReglages((cur) => {
    const c = { ...(cur.cours[cle] || { titre, vuLe: new Date().toISOString() }) };
    Object.entries(champs).forEach(([k, v]) => { if (v === undefined) delete c[k]; else c[k] = v; });
    return { ...cur, cours: { ...cur.cours, [cle]: c } };
  });

  return (
    <div className="edt-reglages">
      <div className="hint" style={{ marginBottom: 12 }}>
        Emploi du temps HELHa (Hyperplanning) affiché par « École » dans le calendrier de l’Accueil. Chaque cours garde une couleur fixe :
        celle de la matière reliée, sinon une couleur attribuée à sa première apparition. Rien ici ne touche aux J ni aux cartes.
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span className={'edt-statut ' + edt.statut}>
          {edt.statut === 'non_configure' ? 'Emploi du temps non configuré (variable HELHA_ICAL_URL sur Vercel)'
            : edt.donnees ? `${events.length} cours chargés · mis à jour ${ilYaCourt(edt.donnees.generatedAt || edt.donnees.recuLe, maintenant)}${edt.statut === 'hors_ligne' ? ' · hors ligne' : ''}`
            : edt.statut === 'erreur' ? (edt.message || 'Emploi du temps indisponible') : 'Chargement…'}
        </span>
        {edt.statut !== 'non_configure' && (
          <button type="button" className="btn ghost sm" disabled={edt.enCours} onClick={() => rafraichir({ force: true })}><Icon name="refresh" size={13} /> Actualiser</button>
        )}
      </div>
      {cours.length === 0 ? <div className="hint">Aucun cours détecté pour l’instant.</div> : (
        <div className="edt-reg-liste">
          {cours.map(({ cle, titre, n }) => {
            const info = resoudre(titre);
            const r = (ctx.edtReglages && ctx.edtReglages.cours && ctx.edtReglages.cours[cle]) || {};
            const auto = correspondanceAuto(titre, ctx.db.matieres);
            const valeur = r.matiereId === undefined ? '__auto' : r.matiereId === null ? '__aucune' : r.matiereId;
            return (
              <div className="edt-reg-ligne" key={cle} data-cle={cle} style={{ '--edt-c': info.couleur }}>
                <span className="edt-reg-pastille" aria-hidden="true" />
                <div className="edt-reg-nom">
                  <div className="edt-reg-titre">{titre}</div>
                  <div className="hint">{n ? `${n} cours` : 'plus au programme'} · couleur {info.source === 'perso' ? 'choisie' : info.source === 'matiere' ? 'de la matière' : 'automatique'}</div>
                </div>
                <div className="edt-reg-palette" role="radiogroup" aria-label={`Couleur de ${titre}`}>
                  {PALETTE_MATIERES.map((hex, i) => (
                    <button type="button" key={hex} role="radio" aria-checked={r.couleur === i} className={'edt-reg-teinte' + (r.couleur === i ? ' active' : '')}
                      style={{ background: hex }} title={`Couleur ${i + 1}`} onClick={() => maj(cle, titre, { couleur: i })} />
                  ))}
                  <button type="button" className={'edt-reg-auto' + (r.couleur == null ? ' active' : '')} title="Couleur automatique (matière reliée, sinon couleur attribuée)"
                    onClick={() => maj(cle, titre, { couleur: undefined })}>Auto</button>
                </div>
                <select className="input edt-reg-matiere" value={valeur} aria-label={`Matière reliée à ${titre}`}
                  onChange={(ev) => { const v = ev.target.value; maj(cle, titre, { matiereId: v === '__auto' ? undefined : v === '__aucune' ? null : v }); }}>
                  <option value="__auto">{auto ? `Auto : ${auto.nom}` : 'Auto : aucune'}</option>
                  <option value="__aucune">Aucune matière</option>
                  {matieres.map(({ m, src }) => <option key={m.id} value={m.id}>{m.nom}{src ? ` — ${src.nom}` : ''}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
