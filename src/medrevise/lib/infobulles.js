/* MedRevise — infobulles : séparation du raccourci clavier en fin de texte (pur, components/Infobulles.jsx). */
const RACCOURCI = /\s*(?:\(([^()]*(?:⌘|⇧|⌥|Ctrl|Maj|Échap|Entrée|Suppr|Espace|Tab|F\d{1,2}|←|→|↑|↓)[^()]*)\)|·\s*((?:⌘|⇧|⌥|Ctrl|Maj)[^\s—·]*))\s*$/;

/** « Rechercher dans le document (⌘F) » → { texte: 'Rechercher dans le document', raccourci: '⌘F' } */
export function separerRaccourci(t) {
  const s = String(t || '').trim();
  // un raccourci en fin de PREMIÈRE ligne (« Outil · ⌘1 — aide ») compte aussi
  const tiret = s.indexOf(' — ');
  const tete = tiret > 0 ? s.slice(0, tiret) : s, queue = tiret > 0 ? s.slice(tiret) : '';
  const m = RACCOURCI.exec(tete);
  if (!m) return { texte: s, raccourci: null };
  return { texte: (tete.slice(0, m.index) + queue).trim(), raccourci: (m[1] || m[2]).trim() };
}

