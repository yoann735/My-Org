/* ============================================================
   MedRevise — ICÔNES DES OUTILS DU LECTEUR (05/10).

   Retour de l'utilisateur : « la gomme n'a pas d'icône de gomme, le crayon
   pareil ». Les outils empruntaient des icônes génériques du jeu partagé
   (« ban » pour la gomme, « sparkle » pour le crayon, « list » pour la boîte…).
   Chaque outil a maintenant SON dessin, reconnaissable d'un coup d'œil :
   une gomme, un crayon, un feutre surligneur, une bulle de texte, des formes.

   Jeu propre à MedRevise (le jeu partagé `shared/Icon.jsx` n'est pas touché) :
   même grille 24×24, même trait (currentColor, 1.8, bouts ronds) pour rester
   cohérent avec le reste de l'interface.
   ============================================================ */

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
  // aimant (lissage du trait)
  aimant: <path d="M6 3h4v8a2 2 0 0 0 4 0V3h4v8a6 6 0 0 1-12 0V3Zm0 4h4m4 0h4" />,
  // remplissage (pot de peinture simplifié : forme pleine)
  remplir: (<>
    <path d="M5 11 11 5l7 7-6 6a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8Z" />
    <path d="M5.5 12.5h12" />
    <path d="M20 15.5s1.5 1.8 1.5 3a1.5 1.5 0 0 1-3 0c0-1.2 1.5-3 1.5-3Z" />
  </>),
};

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
