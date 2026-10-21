/* ============================================================
   MedRevise — RÉGLAGES D'UNE FLÈCHE (20/10 soir ; une seule rangée pour toutes les flèches depuis le 21/10,
   docs/compte-rendu-pdfreader-reparation.md). Connecteur d'une boîte OU flèche de l'outil Formes : affichés dans
   la RANGÉE CONTEXTUELLE sous la barre d'outils (son emplacement est réservé : rien ne bouge), jamais sur la page,
   où ils recouvraient le trait. Chaque réglage est une écriture (une entrée d'Annuler) : droite / courbe, pointes,
   trait, épaisseur, couleur.
   ============================================================ */
import { styleFleche, suivant, POINTES, TRAITS, EPAISSEURS } from './flechesGeo.js';
import { BoutonCouleur } from './Couleurs.jsx';

const LIB_POINTE = { aucune: 'Aucune', ouverte: 'Ouverte', pleine: 'Pleine' };
const LIB_TRAIT = { continu: 'Continu', tirets: 'Tirets', pointilles: 'Pointillés' };

export function BarreFleche({ connecteur, defauts = {}, onStyle }) {
  const st = styleFleche(connecteur, defauts);
  const courbe = st.type === 'souple';
  const bt = (reglage, contenu, titre, patch, libelle, actif = false) => (
    <button type="button" className={'et-btn ptb-reglage-fleche' + (actif ? ' active' : '')} data-reglage={reglage} title={titre}
      onMouseDown={(e) => e.preventDefault()} onClick={() => onStyle(patch, libelle)}>{contenu}</button>
  );
  return (
    <div className="pdfr-edit-toolbar barre-fleche" role="toolbar" aria-label="Style de la flèche">
      <span className="ptb-contexte-titre">Flèche</span>
      {bt('type', courbe ? 'Courbe' : 'Droite', courbe ? 'Courbe : passe par chaque point — cliquer pour une flèche droite (segments)' : 'Droite : segments entre les points — cliquer pour une courbe qui passe par chaque point', { type: courbe ? 'dure' : 'souple' }, 'Type de la flèche', courbe)}
      <span className="et-sep" />
      {bt('debut', <>◂ {LIB_POINTE[st.pointes.debut]}</>, `Pointe au départ : ${LIB_POINTE[st.pointes.debut]} (aucune, ouverte, pleine)`, { pointes: { ...st.pointes, debut: suivant(POINTES, st.pointes.debut) } }, 'Pointe de départ')}
      {bt('fin', <>{LIB_POINTE[st.pointes.fin]} ▸</>, `Pointe à l’arrivée : ${LIB_POINTE[st.pointes.fin]} (aucune, ouverte, pleine)`, { pointes: { ...st.pointes, fin: suivant(POINTES, st.pointes.fin) } }, 'Pointe d’arrivée')}
      <span className="et-sep" />
      {bt('trait', LIB_TRAIT[st.trait], `Trait : ${LIB_TRAIT[st.trait]} (continu, tirets, pointillés)`, { trait: suivant(TRAITS, st.trait) }, 'Style du trait')}
      {bt('epaisseur', <>×{String(st.epaisseur).replace('.', ',')}</>, 'Épaisseur du trait (× 0,5 à 3)', { epaisseur: suivant(EPAISSEURS, st.epaisseur) }, 'Épaisseur de la flèche')}
      <BoutonCouleur couleur={st.couleur || null} titre="Couleur de la flèche" onCouleur={(c) => onStyle({ couleur: c }, 'Couleur de la flèche')} />
      <span style={{ flex: 1 }} />
      <span className="hint ptb-contexte-aide">Double-clic (ou appui long) sur la flèche : un point à cet endroit · glisser un point : le déplacer · double-clic sur un point : le retirer</span>
    </div>
  );
}
