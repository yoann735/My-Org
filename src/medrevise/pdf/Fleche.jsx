/* ============================================================
   MedRevise — LE composant de flèche (21/10, docs/compte-rendu-pdfreader-reparation.md).

   Utilisé par les connecteurs d'une boîte (NoteBox) ET par les flèches de l'outil Formes (Forme) : même tracé
   (flechesGeo.js#cheminFleche), même zone de prise, mêmes points de contrôle, mêmes gestes :
     double-clic sur le trait   un point de contrôle EXACTEMENT à l'endroit cliqué (dans le bon segment, même
                                sur une courbe) — au doigt : appui long
     glisser un point           le déplacer (la courbe passe toujours par lui)
     double-clic sur un point   le retirer
   ============================================================ */
import { cheminFleche, indexInsertion, suivant, POINTES, TRAITS, EPAISSEURS_FLECHE } from './flechesGeo.js';
import { suivrePointeur, rectPage } from './pointeur.js';
import { IconeOutil } from './IconesOutils.jsx';

const arrondi = (v) => +v.toFixed(5);

/**
 * Le tracé (à poser dans un <svg>) : halo si sélectionnée, trait, pointes, zone de prise invisible.
 * `pts` : sommets en pixels du repère du <svg> ; `classes` : { g, halo, trait, tete, cible }.
 */
export function TraitFleche({ pts, st, largeur, geo, couleur, sel = false, halo = 9, classes, donnees = {}, cible = null, titre = null, idMarqueur = null }) {
  const ch = cheminFleche(pts, st, largeur, geo);
  if (!ch.d) return null;
  /* pointes pleines « classiques » : en marqueur SVG (la base du triangle est à 8,5/10 de sa longueur avant le bout du
     trait) — exactement le rendu des flèches d'avant ; les autres pointes sont des chemins */
  const enMarqueur = ch.marqueur && !!idMarqueur;
  const fin = enMarqueur && st.pointes.fin === 'pleine' ? `url(#${idMarqueur})` : undefined;
  const debut = enMarqueur && st.pointes.debut === 'pleine' ? `url(#${idMarqueur})` : undefined;
  const tetes = enMarqueur ? ch.tetes.filter((t) => !t.pleine) : ch.tetes;
  const trait = { className: classes.trait, stroke: couleur, strokeWidth: largeur, strokeLinecap: 'round', strokeDasharray: ch.dash || undefined, markerEnd: fin, markerStart: debut };
  return (
    <g className={classes.g} {...donnees}>
      {enMarqueur && (fin || debut) && (
        <defs>
          <marker id={idMarqueur} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth={ch.t} markerHeight={ch.t} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={couleur} />
          </marker>
        </defs>
      )}
      {sel && <path className={classes.halo} d={ch.d} fill="none" stroke={couleur} strokeWidth={halo} strokeOpacity={0.22} strokeLinecap="round" strokeLinejoin="round" />}
      {ch.segment
        ? <line x1={ch.segment[0].x} y1={ch.segment[0].y} x2={ch.segment[1].x} y2={ch.segment[1].y} {...trait} />
        : <path d={ch.d} fill="none" strokeLinejoin="round" {...trait} />}
      {tetes.map((t, i) => (t.pleine
        ? <path key={i} className={classes.tete} d={t.d} fill={couleur} stroke={ch.contour > 0 ? couleur : 'none'} strokeWidth={ch.contour > 0 ? ch.contour : undefined} strokeLinejoin="round" />
        : <path key={i} className={classes.tete} d={t.d} fill="none" stroke={couleur} strokeWidth={largeur} strokeLinecap="round" strokeLinejoin="round" />))}
      {cible && (
        <path className={classes.cible} d={ch.d} fill="none" stroke="transparent" strokeLinecap="round" strokeLinejoin="round" {...cible}>
          {titre && <title>{titre}</title>}
        </path>
      )}
    </g>
  );
}

/**
 * Points de contrôle après un double-clic en (clientX, clientY) sur la flèche : le nouveau point est À
 * L'ENDROIT CLIQUÉ (fractions de page), inséré dans le segment de la flèche le plus proche.
 * `pts` : sommets en pixels du repère local ; `origine` : position de ce repère dans la page (px).
 */
export function pointsAvecAjout(pts, st, clientX, clientY, r, W, H, origine = { x: 0, y: 0 }) {
  if (!r || !r.width || !r.height) return null;
  const fx = Math.max(0, Math.min(1, (clientX - r.left) / r.width)), fy = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
  const i = indexInsertion(pts, { x: fx * W - origine.x, y: fy * H - origine.y }, st.type === 'souple');
  const points = [...st.points];
  points.splice(i, 0, { x: arrondi(fx), y: arrondi(fy) });
  return points;
}

/** glisser le point de contrôle `i` (gestionnaire de pointeur unique) : aperçu à chaque mouvement, écriture au relâchement */
export function glisserPointFleche(e, { points, i, onGeste = () => {}, onApercu, onFin }) {
  const r = rectPage(e.currentTarget);
  if (!r || !r.width) return;
  const x0 = e.clientX, y0 = e.clientY;
  let dernier = null;
  const suivi = suivrePointeur(e, {
    seuil: 3, arreter: true,
    move: (ev) => {
      dernier = points.map((p, j) => (j === i ? { x: arrondi(Math.max(0, Math.min(1, p.x + (ev.clientX - x0) / r.width))), y: arrondi(Math.max(0, Math.min(1, p.y + (ev.clientY - y0) / r.height))) } : p));
      onApercu(dernier);
    },
    fin: (ev, { annule }) => { onGeste(false); onApercu(null); if (!annule && dernier) onFin(dernier); },
  });
  if (suivi) onGeste(true);
}

/** appui long au doigt (550 ms sans bouger de plus de 8 px) — l'équivalent tactile du double-clic */
export function appuiLong(e, action) {
  if (e.pointerType !== 'touch') return;
  const x0 = e.clientX, y0 = e.clientY, r = rectPage(e.currentTarget);
  const minuterie = setTimeout(() => action(x0, y0, r), 550);
  const fin = () => { clearTimeout(minuterie); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin); window.removeEventListener('pointermove', bouge); };
  const bouge = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) fin(); };
  window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin); window.addEventListener('pointermove', bouge);
}

/** rayon de prise d'un point de contrôle (px) : au-delà, l'appui est pour le trait */
export const RAYON_POINT = 8;
/** les points de contrôle, sur le trait (HTML, au-dessus du tracé) ; `position(p)` → style left / top ; `onTrait(e)` :
    un appui à plus de RAYON_POINT du centre (le navigateur au doigt « aimante » le toucher vers le point) va au trait */
export function PoigneesFleche({ points, couleur, position, donnees = {}, classe = 'nb-ctl', onGlisser, onRetirer, onTrait = null }) {
  const appui = (e, i) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (onTrait && Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) > RAYON_POINT) { onTrait(e); return; }
    onGlisser(e, i);
  };
  return points.map((p, i) => (
    <span key={i} className={classe} data-i={i} {...donnees} style={{ ...position(p), borderColor: couleur }}
      title="Point de la flèche — glisser pour le déplacer · double-clic : le retirer"
      onPointerDown={(e) => appui(e, i)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onRetirer(i); }} />
  ));
}

/* ---------- LA MINI BARRE D'UNE FLÈCHE (la même pour un connecteur de boîte et une flèche / ligne de Formes) ----------
   type droite / courbe · pointe de début · pointe de fin · style du trait · épaisseur (3) · couleur · supprimer */
const IC_POINTE = { aucune: 'pointeAucune', ouverte: 'pointeOuverte', pleine: 'pointePleine' };
const IC_TRAIT = { continu: 'traitContinu', tirets: 'traitTirets', pointilles: 'traitPointilles' };
const LIB_POINTE = { aucune: 'aucune', ouverte: 'ouverte', pleine: 'pleine' };
const LIB_TRAIT = { continu: 'continu', tirets: 'tirets', pointilles: 'pointillés' };
export function itemsFleche(st, { couleurDefaut, onStyle, onSupprimer }) {
  const ic = (n, style) => <IconeOutil nom={n} size={16} style={style} />;
  const iEp = EPAISSEURS_FLECHE.indexOf(st.epaisseur);
  const courbe = st.type === 'souple';
  return [
    { cle: 'type', icone: ic(courbe ? 'courbe' : 'droite'), actif: courbe, titre: courbe ? 'Courbe (passe par chaque point) — cliquer pour une flèche droite' : 'Droite (segments) — cliquer pour une courbe',
      onClick: () => onStyle({ type: courbe ? 'dure' : 'souple' }, 'Type de la flèche') },
    { cle: 'debut', icone: ic(IC_POINTE[st.pointes.debut], { transform: 'scaleX(-1)' }), titre: `Pointe de début : ${LIB_POINTE[st.pointes.debut]} (aucune, ouverte, pleine)`,
      onClick: () => onStyle({ pointes: { ...st.pointes, debut: suivant(POINTES, st.pointes.debut) } }, 'Pointe de début') },
    { cle: 'fin', icone: ic(IC_POINTE[st.pointes.fin]), titre: `Pointe de fin : ${LIB_POINTE[st.pointes.fin]} (aucune, ouverte, pleine)`,
      onClick: () => onStyle({ pointes: { ...st.pointes, fin: suivant(POINTES, st.pointes.fin) } }, 'Pointe de fin') },
    { cle: 'trait', icone: ic(IC_TRAIT[st.trait]), titre: `Style : ${LIB_TRAIT[st.trait]} (continu, tirets, pointillés)`,
      onClick: () => onStyle({ trait: suivant(TRAITS, st.trait) }, 'Style du trait') },
    { cle: 'epaisseur', icone: ic('epaisseur' + (iEp < 0 ? 1 : iEp + 1)), titre: 'Épaisseur (fine, moyenne, épaisse)',
      onClick: () => onStyle({ epaisseur: EPAISSEURS_FLECHE[(Math.max(-1, iEp) + 1) % EPAISSEURS_FLECHE.length] }, 'Épaisseur de la flèche') },
    { cle: 'couleur', couleur: st.couleur || couleurDefaut, titre: 'Couleur de la flèche', onCouleur: (c) => onStyle({ couleur: c }, 'Couleur de la flèche') },
    { cle: '|' },
    { cle: 'supprimer', titre: 'Supprimer la flèche (Suppr)', onClick: onSupprimer },
  ];
}

/** objet sous le pointeur au relâchement d'un bout de flèche : l'id d'une boîte (sauf `exclure`), ou null */
export function boiteSous(clientX, clientY, exclure = null) {
  const els = typeof document !== 'undefined' && document.elementsFromPoint ? document.elementsFromPoint(clientX, clientY) : [];
  for (const el of els) { const n = el.closest && el.closest('.note-box[data-boite]'); if (n && n.dataset.boite !== exclure) return n.dataset.boite; }
  return null;
}
