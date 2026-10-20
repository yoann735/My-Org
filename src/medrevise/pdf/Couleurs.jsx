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

   PANNEAU « FAÇON WORD » (20/10, docs/compte-rendu-pdfreader-v3.md) — le même pour TOUTES les couleurs
   (crayon, surligneur, formes, boîtes, texte, fond) :
     ┌ Couleurs du thème ─────────────────┐   10 teintes de la DA (lib/palette.js#COULEURS_THEME),
     │ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■               │   chacune avec 5 variantes plus claires / plus foncées
     │ ▪ ▪ ▪ ▪ ▪ ▪ ▪ ▪ ▪ ▪  (× 5)         │
     ├ Couleurs récentes ─────────────────┤   les 8 dernières (synchronisées, lib/couleursPerso.js)
     │ ● ● ● ● ● ● ● ●                    │
     ├────────────────────────────────────┤
     │ ✎ Pipette   ◐ Autres couleurs   ⊘ Aucune (fond seulement)
     └────────────────────────────────────┘
   Aperçu EN DIRECT au survol (et au clavier, flèches) ; un clic valide, Entrée valide la case choisie
   au clavier, Échap annule (l'ancienne couleur revient), un clic ailleurs valide la case choisie au
   clavier ou referme sans rien changer. Une seule écriture par choix : une seule entrée d'annuler.
   Pipette : l'API EyeDropper quand le navigateur l'a (Chrome, Edge), sinon un prélèvement sur le
   canvas du PDF au clic (aperçu sous le pointeur). Au doigt : cases de 32 px.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { COLORS, couleurHex } from './pdfShared.js';
import { useCouleursPerso, hsvVersHex, hexVersHsv } from '../lib/couleursPerso.js';
import { grilleTheme } from '../lib/palette.js';
import { IconeOutil } from './IconesOutils.jsx';
import '../../styles/couleurs-word.css';

/** éléments flottants du sélecteur : un « clic dehors » d'une bulle ou d'un panneau
    ne doit pas les compter comme extérieurs (sinon le panneau fermerait sa bulle). */
export const SELECTEUR_FLOTTANT = '.sc-fenetre, .sc-pop, .scw-pipette';
export const dansSelecteurFlottant = (el) => !!(el && el.closest && el.closest(SELECTEUR_FLOTTANT));

const NB_RECENTES = 3; // dans la rangée : les 3 dernières ; le panneau en montre 8
const NB_RECENTES_PANNEAU = 8;
/** valeur « aucune couleur » (fond du texte) */
export const AUCUNE = 'off';
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
export function SelecteurCouleurs({ couleur, onCouleur, onApercu = null, titre = 'Couleur', enTete = [], libelle = false, aucune = false }) {
  const [perso, , retirer] = useCouleursPerso();
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
        title="Plus de couleurs — couleurs du thème, récentes, pipette, autres couleurs" aria-label="Plus de couleurs" aria-expanded={!!panneau} aria-haspopup="dialog"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (panneau ? fermer() : ouvrir())}>
        <span className="sc-roue-mini" />{libelle ? <span>Plus de couleurs</span> : <Icon name="chevD" size={10} />}
      </button>
      {panneau && createPortal(
        <PanneauCouleurs x={panneau.x} y={panneau.y} ancreHaut={panneau.haut} couleur={couleur} titre={titre} aucune={aucune}
          onApercu={onApercu} onFermer={fermer} onValider={(c) => { onCouleur(c); fermer(); }} />,
        document.body,
      )}
    </div>
  );
}

/* BOUTON COULEUR COMPACT (02/10 soir) : une pastille de la couleur courante ; un clic
   ouvre, dans un petit panneau flottant, LE MÊME sélecteur. Pour les barres où la place
   manque (barre d'une boîte, d'une forme, mise en forme du texte). `onMouseDown` empêché :
   la sélection de texte de l'éditeur reste. */
export function BoutonCouleur({ couleur, onCouleur, onApercu = null, titre = 'Couleur', icone = null, aucune = false }) {
  const [pop, setPop] = useState(null);
  const btnRef = useRef(null);
  const fermeA = useRef(0);
  const fermer = () => { fermeA.current = Date.now(); setPop(null); };
  return (
    <>
      <button ref={btnRef} type="button" className={'sc-bouton' + (pop ? ' actif' : '')} title={titre} aria-label={titre} aria-haspopup="dialog" aria-expanded={!!pop}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (pop) { fermer(); return; }
          if (Date.now() - fermeA.current < 350) return; // le clic qui vient de refermer le panneau ne le rouvre pas
          const r = btnRef.current.getBoundingClientRect();
          setPop({ x: r.left, y: r.bottom + 6, haut: r.top });
        }}>
        {icone}
        <span className={'sc-bouton-pastille' + (!couleur || couleur === AUCUNE ? ' aucune' : '')} style={{ background: couleur && couleur !== AUCUNE ? couleurHex(couleur, '#888888') : 'transparent' }} />
      </button>
      {pop && createPortal(
        <PanneauCouleurs x={pop.x} y={pop.y} ancreHaut={pop.haut} couleur={couleur} titre={titre} aucune={aucune}
          onApercu={onApercu} onFermer={fermer} onValider={(c) => { onCouleur(c); fermer(); }} />,
        document.body,
      )}
    </>
  );
}

/* ============================================================
   PANNEAU « FAÇON WORD » (20/10) — voir l'en-tête du fichier.
   `onValider(valeur)` une seule fois (id de base, hex, ou AUCUNE) ; `onApercu(valeur | null)` pendant le
   choix, null pour rendre l'ancienne couleur ; `onFermer()` sans rien changer.
   ============================================================ */
const GRILLE = grilleTheme();
const NB_COL = GRILLE[0].length, NB_LIG = GRILLE.length;
/** couleur sous un point de l'écran, prélevée sur le canvas qui s'y trouve (page du PDF) — null sinon */
export function couleurSousPoint(x, y, ignorer = null) {
  const pile = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
  for (const el of pile) {
    if (ignorer && ignorer.contains(el)) continue;
    if (el.tagName !== 'CANVAS' || !el.width) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    try {
      const px = Math.floor(((x - r.left) / r.width) * el.width), py = Math.floor(((y - r.top) / r.height) * el.height);
      const d = el.getContext('2d').getImageData(Math.max(0, Math.min(el.width - 1, px)), Math.max(0, Math.min(el.height - 1, py)), 1, 1).data;
      if (d[3] === 0) continue; // canvas transparent à cet endroit (calque de sélection…) : celui de dessous
      return '#' + [d[0], d[1], d[2]].map((c) => c.toString(16).padStart(2, '0')).join('');
    } catch (e) { /* canvas inaccessible : le suivant */ }
  }
  return null;
}
export function PanneauCouleurs({ x, y, ancreHaut = null, couleur, onValider, onApercu = null, onFermer, aucune = false, titre = 'Couleur' }) {
  const [perso, ajouter] = useCouleursPerso();
  const recentes = perso.slice(0, NB_RECENTES_PANNEAU);
  const [roue, setRoue] = useState(null); // { x, y, haut } : « Autres couleurs » ouvert
  const [pipette, setPipette] = useState(null); // null | 'natif' | 'canvas'
  const [prise, setPrise] = useState(null); // pipette sur le canvas : { x, y, hex } sous le pointeur
  // case choisie au CLAVIER (flèches) : { zone: 'theme' | 'recentes', l, c } — Entrée ou un clic ailleurs la valide
  const [cle, setCle] = useState(null);
  const boiteRef = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => { if (boiteRef.current) setPos(placer(boiteRef.current, x, y, ancreHaut)); }, [x, y, ancreHaut]);
  const actuelle = String(couleur || '').toLowerCase();

  const rappels = useRef({}); rappels.current = { onApercu, onValider, onFermer, ajouter };
  const fini = useRef(false);
  const apercu = (v) => { if (!fini.current && rappels.current.onApercu) rappels.current.onApercu(v || null); };
  const valider = (v) => {
    if (fini.current) return;
    fini.current = true;
    const r = rappels.current;
    if (r.onApercu) r.onApercu(null);
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) r.ajouter(v.toLowerCase()); // les récentes
    r.onValider(v);
  };
  const annuler = () => { if (fini.current) return; fini.current = true; const r = rappels.current; if (r.onApercu) r.onApercu(null); r.onFermer(); };
  useEffect(() => () => { if (!fini.current && rappels.current.onApercu) rappels.current.onApercu(null); }, []);

  const caseActuelle = () => {
    for (let l = 0; l < NB_LIG; l++) for (let c = 0; c < NB_COL; c++) if (String(GRILLE[l][c].valeur).toLowerCase() === actuelle) return { zone: 'theme', l, c };
    const i = recRef.current.indexOf(actuelle);
    return i >= 0 ? { zone: 'recentes', l: 0, c: i } : null;
  };
  const valeurDe = (k) => (!k ? null : k.zone === 'theme' ? GRILLE[k.l][k.c].valeur : recentes[k.c] || null);
  const cleRef = useRef(cle); cleRef.current = cle;
  const recRef = useRef(recentes); recRef.current = recentes;
  // clavier et clic ailleurs — suspendus pendant « Autres couleurs » et la pipette (ils ont les leurs)
  useEffect(() => {
    if (roue || pipette) return undefined;
    const clavier = (e) => {
      const k = cleRef.current, nRec = recRef.current.length;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); annuler(); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const v = valeurDe(k); if (v) valider(v); else annuler(); return; }
      const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      let n;
      // première flèche : on part de la case de la couleur actuelle (si elle est dans la grille), sinon de la 1re case
      const depart = k || caseActuelle();
      if (!depart) n = { zone: 'theme', l: 0, c: 0 };
      else if (depart.zone === 'theme') {
        const k = depart;
        const l = k.l + d[0], c = Math.max(0, Math.min(NB_COL - 1, k.c + d[1]));
        n = l >= NB_LIG ? (nRec ? { zone: 'recentes', l: 0, c: Math.min(c, nRec - 1) } : { ...k, c }) : { zone: 'theme', l: Math.max(0, l), c };
      } else {
        const k = depart;
        n = d[0] < 0 ? { zone: 'theme', l: NB_LIG - 1, c: Math.min(k.c, NB_COL - 1) } : { zone: 'recentes', l: 0, c: Math.max(0, Math.min(nRec - 1, k.c + d[1])) };
      }
      setCle(n); apercu(valeurDe(n));
    };
    const dehors = (e) => {
      if (boiteRef.current && boiteRef.current.contains(e.target)) return;
      const v = valeurDe(cleRef.current);
      if (v) valider(v); else annuler();
    };
    window.addEventListener('keydown', clavier, true);
    window.addEventListener('pointerdown', dehors, true);
    return () => { window.removeEventListener('keydown', clavier, true); window.removeEventListener('pointerdown', dehors, true); };
  }, [roue, pipette]); // eslint-disable-line react-hooks/exhaustive-deps

  /* PIPETTE */
  const lancerPipette = async () => {
    if (typeof window !== 'undefined' && typeof window.EyeDropper === 'function') {
      setPipette('natif');
      try { const r = await new window.EyeDropper().open(); if (r && r.sRGBHex) { valider(lireHex(r.sRGBHex) || r.sRGBHex); return; } } catch (e) { /* Échap : retour au panneau */ }
      setPipette(null);
      return;
    }
    setPipette('canvas');
  };
  useEffect(() => {
    if (pipette !== 'canvas') return undefined;
    const quitter = () => { setPipette(null); setPrise(null); apercu(null); };
    const clavier = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); quitter(); } };
    window.addEventListener('keydown', clavier, true);
    return () => window.removeEventListener('keydown', clavier, true);
  }, [pipette]); // eslint-disable-line react-hooks/exhaustive-deps
  const voile = useRef(null);
  const surVoile = (e, final) => {
    const hex = couleurSousPoint(e.clientX, e.clientY, voile.current);
    if (final) { e.preventDefault(); e.stopPropagation(); if (hex) valider(hex); else { setPipette(null); setPrise(null); apercu(null); } return; }
    setPrise(hex ? { x: e.clientX, y: e.clientY, hex } : null);
    apercu(hex);
  };

  const cellule = (v, hex, label, k, extra = '') => {
    const choisie = cle && k && cle.zone === k.zone && cle.l === k.l && cle.c === k.c;
    return (
      <button key={label + hex} type="button" className={'scw-cellule' + extra + (String(v).toLowerCase() === actuelle ? ' actuelle' : '') + (choisie ? ' choisie' : '')}
        style={{ '--c': hex }} title={label} aria-label={label} data-valeur={v}
        onPointerEnter={() => apercu(v)} onFocus={() => apercu(v)}
        onClick={(e) => { e.stopPropagation(); valider(v); }} />
    );
  };
  return (
    <>
      <div ref={boiteRef} className="sc-fenetre scw-panneau" role="dialog" aria-label={titre}
        style={{ left: pos ? pos.left : x, top: pos ? pos.top : y, visibility: pos && !pipette && !roue ? 'visible' : 'hidden' }}
        {...isoler} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); /* garde la sélection de texte de l'éditeur */ }}
        onPointerLeave={() => apercu(valeurDe(cleRef.current))}>
        <div className="scw-titre">Couleurs du thème</div>
        <div className="scw-grille" role="group" aria-label="Couleurs du thème">
          {GRILLE.map((ligne, l) => (
            <div key={l} className={'scw-ligne' + (l === 0 ? ' base' : '')}>
              {ligne.map((cel, c) => cellule(cel.valeur, cel.hex, cel.label, { zone: 'theme', l, c }))}
            </div>
          ))}
        </div>
        <div className="scw-titre">Couleurs récentes</div>
        <div className="scw-ligne scw-recentes" role="group" aria-label="Couleurs récentes">
          {recentes.length ? recentes.map((h, c) => cellule(h, h, `Récente ${h}`, { zone: 'recentes', l: 0, c }, ' ronde'))
            : <span className="hint scw-vide">Les couleurs choisies ici s’y ajoutent.</span>}
        </div>
        <div className="scw-actions">
          <button type="button" className="scw-action" onClick={(e) => { e.stopPropagation(); lancerPipette(); }}
            title={typeof window !== 'undefined' && typeof window.EyeDropper === 'function' ? 'Pipette — prélever une couleur n’importe où à l’écran' : 'Pipette — cliquer sur la page pour y prélever une couleur (Échap : annuler)'}>
            <IconeOutil nom="pipette" size={14} /> Pipette
          </button>
          <button type="button" className="scw-action" onClick={(e) => { e.stopPropagation(); const r = boiteRef.current.getBoundingClientRect(); setRoue({ x: r.left, y: r.top, haut: null }); }}
            title="Autres couleurs — roue chromatique, saturation et luminosité, code hex">
            <span className="sc-roue-mini" /> Autres couleurs
          </button>
          {aucune && (
            <button type="button" className={'scw-action' + (!couleur || couleur === AUCUNE ? ' actif' : '')} onClick={(e) => { e.stopPropagation(); valider(AUCUNE); }} title="Aucune couleur de fond">
              <span className="scw-aucune" aria-hidden="true" /> Aucune
            </button>
          )}
        </div>
      </div>
      {roue && (
        <FenetreRoue x={roue.x} y={roue.y} ancreHaut={roue.haut} depart={couleurHex(couleur && couleur !== AUCUNE ? couleur : null, '#e5383b')}
          onApercu={onApercu} onFermer={() => { setRoue(null); }} onValider={(hex) => valider(hex)} />
      )}
      {pipette === 'canvas' && (
        <div ref={voile} className="scw-pipette" role="presentation" aria-label="Pipette : cliquer pour prélever"
          onPointerMove={(e) => surVoile(e, false)} onPointerDown={(e) => surVoile(e, true)} {...{ onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); }, onClick: (e) => e.stopPropagation() }}>
          <div className="scw-pipette-aide">Pipette : clique sur la page pour prélever une couleur · Échap pour revenir</div>
          {prise && <span className="scw-loupe" style={{ left: prise.x + 14, top: prise.y + 14, '--c': prise.hex }}><i />{prise.hex}</span>}
        </div>
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
