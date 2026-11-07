/* ============================================================
   MedRevise — indicateur « œil + nombre » : fois où la carte a été notée en séance (07/11,
   docs/compte-rendu-compteur-vues-et-zoom-image.md). Le nombre vient du SEUL calcul lib/vuesCartes.js.
   Volontairement distinct du badge « ×N » du mode Apprentissage (pastille pleine) : ici ni fond ni bord, une icône.
   Une carte jamais révisée affiche 0. Pendant la première lecture du journal : rien (pas de 0 trompeur).
   ============================================================ */
import { libelleVues } from '../lib/vuesCartes.js';

export function BadgeVues({ n, pret = true }) {
  if (!pret) return null;
  const titre = libelleVues(n);
  return (
    // l'œil est dessiné en CSS (masque, styles/apprentissage-libre.css) : aucun nœud SVG par vignette — le panneau
    // Apprendre affiche des centaines de cartes, son ouverture ne doit pas ralentir
    <span className={'alib2-nbvues tnum' + (n === 0 ? ' zero' : '')} data-vues={n} title={titre} aria-label={titre}>{n}</span>
  );
}
