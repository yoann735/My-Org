/* ============================================================
   MedRevise — ICÔNES DES OUTILS DU LECTEUR (02/10 soir).

   Retour de l'utilisateur : « la gomme n'a pas d'icône de gomme, le crayon
   pareil ». Les outils empruntaient des icônes génériques du jeu partagé
   (« ban » pour la gomme, « sparkle » pour le crayon, « list » pour la boîte…).
   Chaque outil a maintenant SON dessin, reconnaissable d'un coup d'œil :
   une gomme, un crayon, un feutre surligneur, une bulle de texte, des formes.

   Jeu propre à MedRevise (le jeu partagé `shared/Icon.jsx` n'est pas touché) :
   même grille 24×24, même trait (currentColor, 1.8, bouts ronds) pour rester
   cohérent avec le reste de l'interface.
   ============================================================ */
import { cheminForme, estTrait } from './formes.js';

const DESSINS = {
  // flèche de sélection (curseur)
  selection: <path d="M5 3.5 18.5 10l-6 1.8-2.6 6.2L5 3.5Z" />,
  // feutre surligneur à pointe biseautée + la bande qu'il laisse
  surligneur: (<>
    <path d="m14.5 3.5 5 5-7.8 7.8-5-5 7.8-7.8Z" />
    <path d="m6.7 11.3-1.9 4.9 2 2 4.9-1.9" />
    <path d="M3 21h9" strokeWidth="3" opacity=".55" />
  </>),
  // crayon : corps, mine, gomme du bout
  crayon: (<>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" />
    <path d="m14.5 5.5 3 3" />
    <path d="m5 15 4 4" opacity=".5" />
  </>),
  // gomme : un pavé incliné à deux tons + la ligne effacée
  gomme: (<>
    <path d="m7.5 19.5-4-4a1.5 1.5 0 0 1 0-2.1l9.4-9.4a1.5 1.5 0 0 1 2.1 0l5 5a1.5 1.5 0 0 1 0 2.1L12 19.5H7.5Z" />
    <path d="m8.2 9.2 7 7" />
    <path d="M12 19.5h8.5" />
  </>),
  // boîte de note : un cadre avec des lignes de texte et une petite queue
  boite: (<>
    <path d="M4 4.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-4.5 3.5v-3.5H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
    <path d="M7 8.5h10M7 12.5h6" />
  </>),
  // texte libre : un T avec empattements
  texte: <path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6" />,
  // formes : carré + rond + triangle
  forme: (<>
    <rect x="3" y="3" width="8.5" height="8.5" rx="1" />
    <circle cx="17" cy="7.2" r="4.2" />
    <path d="M12 13.5 17 21H7l5-7.5Z" />
  </>),
  // « je n'ai pas compris » : un ? dans un rond
  question: (<>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8" />
    <path d="M12 17.2h.01" strokeWidth="2.4" />
  </>),
  // image : cadre, soleil, montagne
  image: (<>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="9.5" r="1.8" />
    <path d="m3.5 17.5 5-5 4 4 2.5-2.5 5.5 5" />
  </>),
  // page blanche avec un +
  page: (<>
    <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v4h4M11.5 11v6M8.5 14h6" />
  </>),
  // main (se déplacer)
  main: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v5.5m0-3a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4.3 15.6a1.6 1.6 0 0 1 2.4-2.1L8 15" />,
  // annuler / rétablir : vraies flèches courbes
  annuler: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  retablir: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  // carte du tableau
  carte: (<>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M7 9.5h10M7 13h7" />
  </>),
  // pipette (sélecteur de couleur, 20/10)
  pipette: <path d="m14.5 6.5 3 3M4 20l1.5-.5 9.8-9.8-3-3-9.8 9.8L4 20Zm11.2-15.7a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3l-1.7 1.7-4-4 1.7-1.7Z" />,
  // flèche (lien d'une boîte)
  fleche: <path d="M4 20 19 5m0 0h-7.5M19 5v7.5" />,
  // épingle
  epingle: (<>
    <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" />
    <circle cx="12" cy="11" r="2.2" />
  </>),
  // légende : bulle reliée à une forme
  legende: (<>
    <rect x="3" y="13" width="7" height="7" rx="1" />
    <path d="M10 13 14 9" />
    <rect x="13" y="3" width="8" height="6" rx="1" />
  </>),
  // dessins reçus du téléphone : un téléphone et un trait
  dessins: (<>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M9 14c1.2-2.5 2.2-2.6 3-1s1.8 1.5 3-1" />
    <path d="M11 18.5h2" />
  </>),
  // étiquette de texte dans une forme
  etiquette: (<>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M9 9.5h6M12 9.5v5.5" />
  </>),
  // remplissage (pot de peinture simplifié : forme pleine)
  remplir: (<>
    <path d="M5 11 11 5l7 7-6 6a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8Z" />
    <path d="M5.5 12.5h12" />
    <path d="M20 15.5s1.5 1.8 1.5 3a1.5 1.5 0 0 1-3 0c0-1.2 1.5-3 1.5-3Z" />
  </>),
  /* (21/10) GRAMMAIRE DE LA MINI BARRE (pdf/Selection.jsx) : une icône par réglage, son état se lit sur l'icône */
  rogner: <path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" />,
  cadenas: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  cadenasOuvert: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.6-1.7" /></>),
  reduire: <path d="M5 12h14" />,
  droite: <path d="M4 18 10 8l5 6 5-9" />,
  courbe: <path d="M4 18c3-9 6-11 8-6s5 3 8-7" />,
  pointeAucune: <path d="M4 12h16" />,
  pointeOuverte: <path d="M4 12h16m-5-5 5 5-5 5" />,
  pointePleine: (<><path d="M4 12h11" /><path d="M20 12l-6-5v10l6-5Z" fill="currentColor" /></>),
  traitContinu: <path d="M3 12h18" />,
  traitTirets: <path d="M3 12h4m3 0h4m3 0h4" />,
  traitPointilles: <path d="M4 12h.01M8 12h.01M12 12h.01M16 12h.01M20 12h.01" strokeWidth="2.6" />,
  epaisseur1: <path d="M4 12h16" strokeWidth="1.2" />,
  epaisseur2: <path d="M4 12h16" strokeWidth="2.6" />,
  epaisseur3: <path d="M4 12h16" strokeWidth="4.6" />,
  vide: <rect x="5" y="5" width="14" height="14" rx="2" />,
  /* (22/10, docs/compte-rendu-simplification-outils.md) barre à 6 outils, sous-barres, mini barres */
  // Dessin : un pinceau et son trait
  dessin: (<>
    <path d="M14.5 4.5 19.5 9.5 11 18l-5-5 8.5-8.5Z" />
    <path d="M6 13c-2 .5-3 2-3 4.5V20h2.5c2.5 0 4-1 4.5-3" />
  </>),
  // Insérer : un carré et un +
  inserer: (<><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M12 8v8M8 12h8" /></>),
  // Post-it : une note carrée au coin replié
  postit: (<><path d="M4 4h16v10l-6 6H4V4Z" /><path d="M14 20v-6h6" /></>),
  // boîte-tableau : un cadre arrondi et sa grille
  boiteTableau: (<><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9.5h18M3 14.8h18M10 4v16" /></>),
  // taille du texte : un T et une double flèche verticale
  // (25/10) taille du texte : un « A » et une petite flèche (même icône partout où l'on règle une taille de texte)
  tailleTexte: (<><path d="M3 20 9 4h1.5l6 16M5.4 14h9.2" /><path d="M20 13V4m-2.6 2.6L20 4l2.6 2.6" /></>),
  // alignements
  alignGauche: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  alignCentre: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  alignDroite: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  alignJustifie: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
  // listes
  listePuces: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  listeNum: <path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.2V9M3.5 13.5c.4-.9 2.6-1 2.4.5-.1.8-2.4 2-2.4 3h2.6" />,
  // police : « Aa »
  police: <path d="M3 18 7.5 6 12 18M4.6 14h5.8M16.5 11.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM19 11v7" />,
  // surligneur de fond (texte) : un A sur une bande
  fondTexte: (<><path d="M7 15 11 4h2l4 11M8.5 11h7" /><path d="M3 20h18" strokeWidth="3" opacity=".55" /></>),
  // → Tableau : une carte qui part vers le tableau
  versTableau: (<><rect x="3" y="7" width="11" height="9" rx="2" /><path d="M14 11.5h7m-2.5-2.5 2.5 2.5-2.5 2.5" /><path d="M6 10.5h5" /></>),
  // boîte-tableau : lignes / colonnes
  ligneAjout: (<><rect x="3" y="4" width="18" height="10" rx="2" /><path d="M3 9h18M12 16.5v5M9.5 19h5" /></>),
  colonneAjout: (<><rect x="3" y="3" width="10" height="18" rx="2" /><path d="M8 3v18M16.5 12h5M19 9.5v5" /></>),
  ligneMoins: (<><rect x="3" y="4" width="18" height="10" rx="2" /><path d="M3 9h18M9.5 19h5" /></>),
  colonneMoins: (<><rect x="3" y="3" width="10" height="18" rx="2" /><path d="M8 3v18M16.5 12h5" /></>),
  entete: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9.5h18" /><path d="M3.5 4.5h17v5h-17z" fill="currentColor" opacity=".35" stroke="none" /></>),
  // souligné / barré / gras / italique (lettres dessinées : même trait que le reste de la barre)
  gras: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7V5Zm0 7h7a3.5 3.5 0 0 1 0 7H7v-7Z" strokeWidth="2.4" />,
  italique: <path d="M10 5h8M6 19h8M14 5l-4 14" />,
  souligne: <path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />,
  barre: <path d="M16.5 7.5c-.5-1.8-2.2-3-4.5-3-2.8 0-4.5 1.5-4.5 3.3 0 4 9.5 2.6 9.5 7.2 0 2-2 3.5-5 3.5-2.4 0-4.4-1.2-5-3M4 12h16" />,
  titre1: <path d="M4 6v12M11 6v12M4 12h7M15.5 9 18 7v11" />,
  titre2: <path d="M4 6v12M11 6v12M4 12h7M15 9.5c.3-1.6 4.5-2 4.5.7 0 2-4.5 4.5-4.5 7.8h4.8" />,
  titre3: <path d="M4 6v12M11 6v12M4 12h7M15 8h4.5l-2.5 3.5c2 0 3 1 3 2.8 0 2.6-3.4 3.4-5.2 1.7" />,
  citation: <path d="M5 11h4v6H4v-5c0-3 1-5 4-6M15 11h4v6h-5v-5c0-3 1-5 4-6" />,
  cases: (<><rect x="3.5" y="4" width="6" height="6" rx="1.5" /><path d="m5 7 1.2 1.2L8.4 5.8M13 7h8M3.5 15h6v6h-6zM13 18h8" /></>),
  separateur: <path d="M3 12h18M7 6h10M7 18h10" opacity=".9" />,
  lien: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  grille: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></>),
  reinitialiser: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />,
  // (25/10) menu Tableau d'une boîte (pdf/BoiteTableau.jsx) : insérer, fusionner, bordures, alignement vertical, style
  ligneDessus: (<><rect x="3" y="10" width="18" height="10" rx="2" /><path d="M3 15h18M12 2.5v5M9.5 5h5" /></>),
  ligneDessous: (<><rect x="3" y="4" width="18" height="10" rx="2" /><path d="M3 9h18M12 16.5v5M9.5 19h5" /></>),
  colonneGauche: (<><rect x="11" y="3" width="10" height="18" rx="2" /><path d="M16 3v18M2.5 12h5M5 9.5v5" /></>),
  colonneDroite: (<><rect x="3" y="3" width="10" height="18" rx="2" /><path d="M8 3v18M16.5 12h5M19 9.5v5" /></>),
  repartir: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /><path d="M4.8 12h2.4m9.6 0h2.4m-6.4 0h-.8" opacity=".7" /></>),
  fusionner: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h10m-3-3 3 3-3 3M10 9l-3 3 3 3" /></>),
  scinder: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14M5.5 12h3m-1.5-1.5L8.5 12 7 13.5m11.5-1.5h-3m1.5-1.5L15.5 12l1.5 1.5" /></>),
  bordToutes: (<><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 12h16M12 4v16" /></>),
  bordAucune: (<><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="1.5 2.5" opacity=".6" /><path d="M4 12h16M12 4v16" strokeDasharray="1.5 2.5" opacity=".6" /></>),
  bordExterieures: (<><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 12h16M12 4v16" strokeDasharray="1.5 2.5" opacity=".6" /></>),
  bordInterieures: (<><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="1.5 2.5" opacity=".6" /><path d="M4 12h16M12 4v16" /></>),
  alignHaut: <path d="M4 4h16M8 8h8M8 12h8" />,
  alignMilieu: <path d="M4 12h16M8 8h8M8 16h8" opacity=".95" />,
  alignBas: <path d="M4 20h16M8 12h8M8 16h8" />,
  lignesAlternees: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3.5 9.3h17v5.4h-17z" fill="currentColor" opacity=".3" stroke="none" /><path d="M3 9.3h18M3 14.7h18" /></>),
  styleAucun: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" opacity=".5" /><path d="m5 20 14-16" /></>),
  selLigne: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3.5 9.3h17v5.4h-17z" fill="currentColor" opacity=".45" stroke="none" /></>),
  selColonne: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9.3 4.5h5.4v15H9.3z" fill="currentColor" opacity=".45" stroke="none" /></>),
  selCellule: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" opacity=".45" /><path d="M9.5 10.5h5v4h-5z" fill="currentColor" opacity=".55" stroke="none" /></>),
};

/** <IconeForme type="ellipse" /> — dessinée avec LE MÊME tracé que la forme posée
    (formes.js) : ce que montre le bouton est exactement ce qui sera posé. */
export function IconeForme({ type, size = 16 }) {
  const trait = estTrait(type);
  const box = type === 'accolade' || type === 'crochet' ? { w: 8, h: 17 } : trait ? { w: 16, h: 16 } : type === 'rectangle' || type === 'arrondi' ? { w: 18, h: 13 } : { w: 17, h: 17 };
  const { d, pointes } = cheminForme(type, box.w, box.h, { fy: trait, tete: 6 });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform={`translate(${(24 - box.w) / 2} ${(24 - box.h) / 2})`}>
        <path d={d} />
        {pointes.map((p, i) => <path key={i} d={p} fill="currentColor" stroke="none" />)}
      </g>
    </svg>
  );
}

/** <IconeOutil nom="gomme" size={15} /> — repli sur un carré si le nom est inconnu. */
export function IconeOutil({ nom, size = 16, className, style }) {
  const d = DESSINS[nom];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      {d || <rect x="4" y="4" width="16" height="16" rx="2" />}
    </svg>
  );
}

export const NOMS_ICONES_OUTILS = Object.keys(DESSINS);
