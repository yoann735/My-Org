/* ============================================================
   MealWeek — rotation automatique des semaines-types

   Quand le mode auto est actif, la semaine affichée avance d'un cran
   chaque DIMANCHE (le jour du drive), en boucle sur les 8 semaines-types.

   Le calcul repose sur le découpage ISO (semaines lundi→dimanche), mais
   décalé d'un jour pour que la frontière tombe le dimanche : on demande
   le numéro de semaine ISO de « demain ». Un dimanche, demain est lundi,
   donc le compteur avance ce jour-là.

   Tout est calculé en UTC à partir des seuls composants année/mois/jour
   de la date locale : le passage à l'heure d'été ne peut pas décaler une
   frontière de semaine.

   La rotation est ANCRÉE : à l'activation, on mémorise le numéro de
   semaine du jour et l'index de la semaine-type alors affichée. La suite
   n'est plus qu'une addition — deux appareils qui partagent le même
   ancrage (il transite par la sync) affichent forcément la même semaine.
   ============================================================ */

const MS_JOUR = 86400000;
const MS_SEMAINE = 7 * MS_JOUR;

/** Lundi de la semaine ISO qui gouverne `date`, décalé d'un jour pour que
    la bascule tombe le dimanche. Renvoie un minuit UTC. */
function lundiDeReference(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 1);        // le dimanche bascule déjà sur la semaine suivante
  const jour = (d.getUTCDay() + 6) % 7;    // lundi = 0 … dimanche = 6
  d.setUTCDate(d.getUTCDate() - jour);
  return d;
}

/** Compteur de semaines absolu et monotone. Il change chaque dimanche. */
export function numeroSemaine(date = new Date()) {
  return Math.round(lundiDeReference(date).getTime() / MS_SEMAINE);
}

/** Le dimanche qui SUIT `date` (donc dans 7 jours si l'on est dimanche :
    la bascule du jour a déjà eu lieu). Minuit, heure locale. */
export function prochainBasculement(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + (7 - d.getDay()));
  return d;
}

/** Ancrage à poser au moment où l'on active la rotation.
    @param {number} index index de la semaine-type affichée à cet instant */
export function creerAncre(index, date = new Date()) {
  return {
    semaine: numeroSemaine(date),
    index: Math.max(0, index | 0),
    poseLe: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  };
}

/** Index de la semaine-type à afficher aujourd'hui, d'après l'ancrage.
    @param {{semaine:number,index:number}} ancre
    @param {number} total nombre de semaines-types (8)  */
export function indexAuto(ancre, total, date = new Date()) {
  if (!ancre || !total || typeof ancre.semaine !== 'number') return 0;
  const ecart = numeroSemaine(date) - ancre.semaine;
  return (((ancre.index + ecart) % total) + total) % total;
}

/** « dimanche 7 septembre » */
export function formatJour(date) {
  try {
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch (e) {
    return date.toLocaleDateString();
  }
}
