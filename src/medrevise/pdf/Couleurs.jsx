/* ============================================================
   MedRevise — SÉLECTEUR DE COULEURS de tous les outils (02/10, refait le 15/10).

     ● ● ● ● ● ●  │  ● ● ●  │  ◐ Personnalisée
     6 couleurs de base     récentes   panneau « type Figma »

   - Les 6 couleurs de base (pdfShared.js#COLORS, lib/palette.js) : toujours là, elles ont
     un SENS (ambre = prioritaire, rose poudré = cloze).
   - « Récentes » : les 5 dernières couleurs personnalisées validées (lib/couleursPerso.js,
     synchronisées entre appareils), retirables d'un clic sur leur petite croix.
   - « Personnalisée » ouvre un petit panneau : carré saturation × luminosité, curseur de
     teinte, champ hex (6 caractères, avec ou sans #, validé en direct, collage accepté),
     aperçu avant / après. Chaque geste est montré EN DIRECT sur la boîte ou l'annotation
     sélectionnée (`onApercu`) sans rien écrire ; Entrée, « OK » ou un clic ailleurs valide
     (une seule écriture, donc UNE entrée d'annuler) ; Échap ou « Annuler » rend l'ancienne
     couleur. Curseurs de 36 px au moins : utilisables au doigt.

   UN SEUL SYSTÈME POUR TOUS LES OUTILS : surligneur, crayon, formes, boîtes, texte libre,
   couleur et fond du texte d'une boîte, cartes du tableau, dessin du téléphone.
   Une couleur d'avant qui n'est ni de base ni récente (noir d'un texte libre, carte
   blanche…) reste affichée, sélectionnée, en tête : rien ne change sur la page.

   CAUSE DU BUG DU 15/10 (docs/compte-rendu-fiche-jumelle.md) : le panneau de la roue était
   rendu par un portail React DANS le petit panneau `.sc-pop` des barres flottantes. Les
   événements React remontent l'arbre des composants, pas celui du DOM : le `onMouseDown →
   preventDefault()` de `.sc-pop` (posé pour garder la sélection de l'éditeur) s'appliquait
   aussi au champ hex et au curseur — le champ ne prenait jamais le focus (la frappe partait
   dans le texte de la boîte !) et le curseur ne glissait pas. Et la fenêtre n'était pas
   bornée en hauteur : ouverte depuis une boîte du bas de l'écran, son champ et ses curseurs
   sortaient de la fenêtre, et viser à côté la refermait. Désormais le panneau arrête la
   propagation React de ses événements (aucun parent ne les voit) et se replace dans l'écran.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { COLORS, couleurHex } from './pdfShared.js';
import { useCouleursPerso, hsvVersHex, hexVersHsv } from '../lib/couleursPerso.js';

/** éléments flottants du sélecteur : un « clic dehors » d'une bulle ou d'un panneau
    ne doit pas les compter comme extérieurs (sinon le panneau fermerait sa bulle). */
export const SELECTEUR_FLOTTANT = '.sc-fenetre, .sc-pop';
export const dansSelecteurFlottant = (el) => !!(el && el.closest && el.closest(SELECTEUR_FLOTTANT));

const NB_RECENTES = 5;
/** extrait un code hex de 6 caractères d'une saisie ou d'un collage (« #1E88E5 », « 1e88e5 »,
    « color: #1e88e5; ») — null si rien de valable */
export function lireHex(texte) {
  const t = String(texte || '').trim();
  const m = t.match(/^#?([0-9a-f]{6})$/i) || t.match(/#([0-9a-f]{6})\b/i) || t.match(/\b([0-9a-f]{6})\b/i);
  return m ? '#' + m[1].toLowerCase() : null;
}
/** pose un élément flottant dans l'écran : sous l'ancre, au-dessus s'il n'y a pas la place */
function placer(el, x, y, ancreHaut) {
  const w = el.offsetWidth, h = el.offsetHeight, W = window.innerWidth, H = window.innerHeight;
  const left = Math.max(8, Math.min(x, W - w - 8));
  let top = y;
  if (top + h > H - 8) top = ancreHaut != null && ancreHaut - h - 8 >= 8 ? ancreHaut - h - 8 : H - h - 8;
  return { left, top: Math.max(8, top) };
}
/** arrête la remontée REACT d'un événement (portail : sinon les parents de l'arbre des
    composants le reçoivent — voir « Cause du bug » plus haut) */
const isoler = { onPointerDown: (e) => e.stopPropagation(), onMouseDown: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation(), onKeyDown: (e) => e.stopPropagation(), onTouchStart: (e) => e.stopPropagation(), onDoubleClick: (e) => e.stopPropagation() };

/** `enTete` (facultatif) : pastilles fixes placées AVANT les couleurs de base — sert au
    dessin du téléphone, sur fond noir, pour l'ENCRE (blanc à l'écran, noir sur la page).
    `onApercu(hex | null)` (facultatif) : aperçu en direct pendant le réglage d'une couleur
    personnalisée ; null = rendre la couleur d'avant. */
export function SelecteurCouleurs({ couleur, onCouleur, onApercu = null, titre = 'Couleur', enTete = [], libelle = false }) {
  const [perso, ajouter, retirer] = useCouleursPerso();
  const recentes = perso.slice(0, NB_RECENTES);
  const [panneau, setPanneau] = useState(null); // { x, y, haut } : position du panneau
  const btnRef = useRef(null);
  const fermeA = useRef(0);
  const actuelleHorsListe = !!couleur && couleur !== 'off' && !COLORS.some((c) => c.id === couleur) && !recentes.includes(String(couleur).toLowerCase()) && !enTete.some((c) => c.id === couleur);
  const ouvrir = () => {
    if (Date.now() - fermeA.current < 350) return; // le clic qui vient de valider (clic ailleurs) ne rouvre pas
    const r = btnRef.current.getBoundingClientRect();
    setPanneau({ x: r.left, y: r.bottom + 8, haut: r.top });
  };
  const fermer = () => { fermeA.current = Date.now(); setPanneau(null); };
  return (
    <div className="sc-couleurs" role="group" aria-label={titre}>
      {actuelleHorsListe && (<>
        <button type="button" title="Couleur actuelle" className="sc-pastille actif" style={{ background: couleurHex(couleur, '#888888') }} onClick={() => onCouleur(couleur)} />
        <span className="sc-sep" aria-hidden="true" />
      </>)}
      {enTete.map((c) => (
        <button key={c.id} type="button" title={c.label} onClick={() => onCouleur(c.id)}
          className={'sc-pastille' + (couleur === c.id ? ' actif' : '')} style={{ background: c.hex }} />
      ))}
      {COLORS.map((c) => (
        <button key={c.id} type="button" title={c.label} aria-label={c.label} onClick={() => onCouleur(c.id)}
          className={'sc-pastille' + (couleur === c.id ? ' actif' : '')} style={{ background: c.hex }} />
      ))}
      {recentes.length > 0 && <span className="sc-sep" aria-hidden="true" />}
      {recentes.map((hex) => (
        <span key={hex} className="sc-perso">
          <button type="button" title={`Récente ${hex}`} aria-label={`Couleur récente ${hex}`} onClick={() => onCouleur(hex)}
            className={'sc-pastille' + (String(couleur).toLowerCase() === hex ? ' actif' : '')} style={{ background: hex }} />
          <button type="button" className="sc-retirer" title="Retirer des récentes" onClick={() => retirer(hex)}><Icon name="x" size={8} /></button>
        </span>
      ))}
      <button ref={btnRef} type="button" className={'sc-roue-btn' + (panneau ? ' actif' : '') + (libelle ? ' avec-libelle' : '')}
        title="Personnalisée — code hex, saturation, luminosité et teinte" aria-label="Couleur personnalisée" aria-expanded={!!panneau}
        onClick={() => (panneau ? fermer() : ouvrir())}>
        <span className="sc-roue-mini" />{libelle ? <span>Personnalisée</span> : <Icon name="plus" size={10} />}
      </button>
      {panneau && createPortal(
        <FenetreRoue x={panneau.x} y={panneau.y} ancreHaut={panneau.haut} depart={couleurHex(couleur, '#e5383b')}
          onApercu={onApercu}
          onFermer={fermer}
          onValider={(hex) => { ajouter(hex); onCouleur(hex); fermer(); }} />,
        document.body,
      )}
    </div>
  );
}

/* BOUTON COULEUR COMPACT (02/10 soir) : une pastille de la couleur courante ; un clic
   ouvre, dans un petit panneau flottant, LE MÊME sélecteur. Pour les barres où la place
   manque (barre d'une boîte, d'une forme, mise en forme du texte). `onMouseDown` empêché :
   la sélection de texte de l'éditeur reste. */
export function BoutonCouleur({ couleur, onCouleur, onApercu = null, titre = 'Couleur', icone = null }) {
  const [pop, setPop] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  useEffect(() => {
    if (!pop) return undefined;
    const dehors = (e) => {
      if (popRef.current && popRef.current.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.sc-fenetre')) return;
      setPop(null);
    };
    const touche = (e) => { if (e.key === 'Escape') setPop(null); };
    window.addEventListener('pointerdown', dehors);
    window.addEventListener('keydown', touche);
    return () => { window.removeEventListener('pointerdown', dehors); window.removeEventListener('keydown', touche); };
  }, [pop]);
  // dans l'écran : sous le bouton, au-dessus s'il n'y a pas la place (boîte en bas de l'écran)
  useLayoutEffect(() => {
    if (!pop || pop.place || !popRef.current) return;
    const p = placer(popRef.current, pop.x, pop.y, pop.haut);
    setPop((o) => (o ? { ...o, ...p, place: true } : o));
  }, [pop]);
  return (
    <>
      <button ref={btnRef} type="button" className={'sc-bouton' + (pop ? ' actif' : '')} title={titre} aria-label={titre}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (pop) { setPop(null); return; }
          const r = btnRef.current.getBoundingClientRect();
          setPop({ x: Math.max(8, Math.min(r.left, window.innerWidth - 330)), y: r.bottom + 6, haut: r.top });
        }}>
        {icone}
        <span className="sc-bouton-pastille" style={{ background: couleur ? couleurHex(couleur, '#888888') : 'transparent' }} />
      </button>
      {pop && createPortal(
        <div ref={popRef} className="sc-pop" style={{ left: pop.left ?? pop.x, top: pop.top ?? pop.y, visibility: pop.place ? 'visible' : 'hidden' }} onMouseDown={(e) => e.preventDefault()}>
          <SelecteurCouleurs couleur={couleur} titre={titre} libelle onApercu={onApercu} onCouleur={(c) => { onCouleur(c); setPop(null); }} />
        </div>,
        document.body,
      )}
    </>
  );
}

/* ============================================================
   LE PANNEAU « PERSONNALISÉE » (15/10) : carré saturation × luminosité (HSV, comme Figma),
   curseur de teinte, champ hex, aperçu avant / après.
   `onApercu(hex)` à chaque geste, `onApercu(null)` à l'annulation ou si le panneau
   disparaît sans validation ; `onValider(hex)` une seule fois. `ancreHaut` : haut de
   l'élément qui l'a ouvert (le panneau passe au-dessus s'il n'y a pas la place dessous).
   ============================================================ */
export function FenetreRoue({ x, y, ancreHaut = null, depart, onFermer, onValider, onApercu = null, classe = '' }) {
  const [hsv, setHsvBrut] = useState(() => hexVersHsv(depart));
  const [saisie, setSaisie] = useState(() => String(depart).toLowerCase());
  const [saisieValide, setSaisieValide] = useState(true);
  const hex = hsvVersHex(hsv.h, hsv.s, hsv.v);
  // un geste sur le carré ou la teinte réécrit le champ ; une frappe dans le champ, non
  const setHsv = (f) => setHsvBrut((p) => { const n = typeof f === 'function' ? f(p) : f; setSaisie(hsvVersHex(n.h, n.s, n.v)); setSaisieValide(true); return n; });

  const rappels = useRef({}); rappels.current = { onApercu, onFermer, onValider, hex };
  const touche = useRef(false); // un changement a été fait (sinon rien à prévisualiser)
  useEffect(() => { if (touche.current && rappels.current.onApercu) rappels.current.onApercu(hex); }, [hex]);
  const fini = useRef(false);
  const valider = () => { if (fini.current) return; fini.current = true; const r = rappels.current; if (r.onApercu) r.onApercu(null); r.onValider(r.hex); };
  const annuler = () => { if (fini.current) return; fini.current = true; const r = rappels.current; if (r.onApercu) r.onApercu(null); r.onFermer(); };
  // démonté sans décision (barre refermée, boîte supprimée…) : on rend l'ancienne couleur
  useEffect(() => () => { if (!fini.current && rappels.current.onApercu) rappels.current.onApercu(null); }, []);

  const boiteRef = useRef(null);
  const hexRef = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => { if (boiteRef.current) setPos(placer(boiteRef.current, x, y, ancreHaut)); }, [x, y, ancreHaut]);
  // à la souris, le champ hex a le focus d'emblée (taper un code tout de suite) ; au doigt,
  // non : le clavier virtuel ne doit pas surgir. Une fois le panneau PLACÉ : avant, il est
  // masqué (visibility: hidden) et un élément masqué ne peut pas prendre le focus.
  const focusDonne = useRef(false);
  useEffect(() => {
    if (!pos || focusDonne.current) return;
    focusDonne.current = true;
    const doigt = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!doigt && hexRef.current) { hexRef.current.focus({ preventScroll: true }); hexRef.current.select(); }
  }, [pos]);
  useEffect(() => {
    const dehors = (e) => {
      if (!boiteRef.current || boiteRef.current.contains(e.target)) return;
      valider(); // clic ailleurs (y compris sur « Personnalisée ») = valider
    };
    const clavier = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); annuler(); return; }
      if (e.key === 'Enter' && (!document.activeElement || document.activeElement === document.body || (boiteRef.current && boiteRef.current.contains(document.activeElement)))) {
        if (document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement.dataset.action === 'annuler') return;
        e.preventDefault(); e.stopPropagation();
        if (saisieRef.current.valide) valider();
      }
    };
    window.addEventListener('pointerdown', dehors, true);
    window.addEventListener('keydown', clavier, true);
    return () => { window.removeEventListener('pointerdown', dehors, true); window.removeEventListener('keydown', clavier, true); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const saisieRef = useRef({ valide: true }); saisieRef.current = { valide: saisieValide };

  const changerSaisie = (v) => {
    setSaisie(v);
    const h = lireHex(v);
    setSaisieValide(!!h || v.trim() === '');
    if (h) { touche.current = true; setHsvBrut(hexVersHsv(h)); }
  };

  /* glisser au pointeur (souris, doigt, stylet) : capture du pointeur, suivi jusqu'au relâchement */
  const glisser = (ref, maj) => (e) => {
    e.preventDefault();
    const el = ref.current; if (!el) return;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const suivre = (ev) => { const r = el.getBoundingClientRect(); touche.current = true; maj(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))); };
    suivre(e);
    const fin = () => { el.removeEventListener('pointermove', suivre); el.removeEventListener('pointerup', fin); el.removeEventListener('pointercancel', fin); };
    el.addEventListener('pointermove', suivre);
    el.addEventListener('pointerup', fin);
    el.addEventListener('pointercancel', fin);
  };
  const carreRef = useRef(null);
  const teinteRef = useRef(null);
  const auClavier = (axe) => (e) => {
    const pas = e.shiftKey ? 0.1 : 0.01;
    const d = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, pas], ArrowDown: [0, -pas] }[e.key];
    if (!d) return;
    e.preventDefault(); touche.current = true;
    if (axe === 'sv') setHsv((p) => ({ ...p, s: Math.max(0, Math.min(1, p.s + d[0])), v: Math.max(0, Math.min(1, p.v + d[1])) }));
    else setHsv((p) => ({ ...p, h: (p.h + (d[0] || d[1]) * 360 + 360) % 360 }));
  };
  const teintePure = hsvVersHex(hsv.h, 1, 1);

  return (
    <div ref={boiteRef} className={'sc-fenetre sc-perso-panneau' + (classe ? ' ' + classe : '')} style={{ left: pos ? pos.left : x, top: pos ? pos.top : y, visibility: pos ? 'visible' : 'hidden' }}
      role="dialog" aria-label="Couleur personnalisée" {...isoler}>
      <div ref={carreRef} className="sc-carre" role="slider" tabIndex={0} aria-label="Saturation et luminosité"
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)} %, luminosité ${Math.round(hsv.v * 100)} %`}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${teintePure})` }}
        onPointerDown={(e) => { e.stopPropagation(); glisser(carreRef, (fx, fy) => setHsv((p) => ({ ...p, s: fx, v: 1 - fy })))(e); }}
        onKeyDown={auClavier('sv')}>
        <span className="sc-repere" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div ref={teinteRef} className="sc-teinte" role="slider" tabIndex={0} aria-label="Teinte" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)}
        onPointerDown={(e) => { e.stopPropagation(); glisser(teinteRef, (fx) => setHsv((p) => ({ ...p, h: Math.min(359.9, fx * 360) })))(e); }}
        onKeyDown={auClavier('h')}>
        <span className="sc-teinte-piste" />
        <span className="sc-repere sc-repere-teinte" style={{ left: `${(hsv.h / 360) * 100}%`, background: teintePure }} />
      </div>
      <div className="sc-ligne">
        <span className="sc-apercu" title="Avant / après">
          <i style={{ background: depart }} /><i style={{ background: hex }} />
        </span>
        <label className={'sc-hex-champ' + (saisieValide ? '' : ' invalide')}>
          <span aria-hidden="true">#</span>
          <input ref={hexRef} className="sc-hex" value={saisie.replace(/^#/, '')} spellCheck={false} autoComplete="off" inputMode="text"
            aria-label="Code hexadécimal (6 caractères)" aria-invalid={!saisieValide}
            onChange={(e) => changerSaisie(e.target.value)}
            onPaste={(e) => { const t = e.clipboardData && e.clipboardData.getData('text'); const h = lireHex(t); if (h) { e.preventDefault(); changerSaisie(h); } }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (saisieValide) valider(); } }} />
        </label>
      </div>
      <div className="sc-actions">
        <button type="button" data-action="annuler" className="btn ghost sm" onClick={annuler} title="Annuler (Échap) — rend l’ancienne couleur">Annuler</button>
        <button type="button" className="btn primary sm" disabled={!saisieValide} onClick={valider} title="Valider (Entrée) — ajoutée aux récentes"><Icon name="check" size={12} /> OK</button>
      </div>
    </div>
  );
}

/* ============================================================
   RÉGLAGES DU TRAIT (crayon, 03/10) : deux curseurs fins, TAILLE et OPACITÉ, et
   un aperçu du trait tel qu'il sera posé (couleur, épaisseur réelle à ce zoom,
   transparence). Bornes propres à chaque mode : un surligneur est plus épais.
   ============================================================ */
const BORNES = { dessin: { min: 0.001, max: 0.016 }, surligneur: { min: 0.006, max: 0.04 } };
export function ReglagesTrait({ mode, reglage, couleur, hauteurPage = 1000, onChange }) {
  const b = BORNES[mode] || BORNES.dessin;
  const pct = Math.round(((reglage.taille - b.min) / (b.max - b.min)) * 100);
  const px = Math.max(1, Math.min(22, reglage.taille * hauteurPage));
  return (
    <div className="rt" aria-label="Réglages du trait">
      <span className="rt-apercu" title="Aperçu du trait">
        <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden="true">
          <path d="M3 17 C 10 4, 20 22, 31 7" fill="none" stroke={couleur} strokeOpacity={reglage.opacite} strokeWidth={px} strokeLinecap="round" />
        </svg>
      </span>
      <label className="rt-curseur" title="Taille du trait">
        <span>Taille</span>
        <input type="range" min="0" max="100" value={Math.max(0, Math.min(100, pct))}
          onChange={(e) => onChange({ taille: b.min + ((b.max - b.min) * Number(e.target.value)) / 100 })} />
      </label>
      <label className="rt-curseur" title="Opacité du trait">
        <span>Opacité</span>
        <input type="range" min="10" max="100" value={Math.round(reglage.opacite * 100)}
          onChange={(e) => onChange({ opacite: Number(e.target.value) / 100 })} />
        <i className="rt-valeur">{Math.round(reglage.opacite * 100)} %</i>
      </label>
    </div>
  );
}
