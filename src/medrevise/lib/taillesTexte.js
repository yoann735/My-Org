/* ============================================================
   MedRevise — TAILLES DU TEXTE : une seule règle (20/11/2026,
   docs/compte-rendu-police-duplication-remplacement-pdf.md §1). Module PUR (testé dans tests/tailles-texte).

   CAUSE DU BUG « choisir une taille ne change rien » :
   - OBJETS (boîte, post-it, texte libre, sur un diapo comme sur un document) : la taille choisie est bien écrite
     (`taille1000`, px d'une page de 1000 px) et posée sur le corps de la boîte (`font-size: calc(var(--lp) * …)`),
     MAIS le texte portait déjà sa propre taille en dur — une marque `textStyle.fontSize` venue d'un COLLAGE (couche
     texte du diapo : `font-size: 23.4px` ; Word, Google Docs, page web) ou d'une taille donnée avant à une partie
     sélectionnée. La marque, sur le <span> du texte, l'emporte sur le corps : rendu inchangé.
   - TEXTE D'UN DOCUMENT créé dans l'app : la liste proposait des px de la page A4 de MISE EN PAGE (595 px de large,
     agrandie ensuite à l'écran), pas des px d'une page de 1000 px ; le texte par défaut (12,5 px de mise en page =
     21 px de référence) s'affichait « — », et 12, 13, 14 changeaient à peine le rendu.
   Règle : la taille d'un OBJET vaut pour tout son texte (les tailles en dur sont retirées) ; une taille donnée à une
   SÉLECTION est en px de référence ; un collage dans un objet n'apporte pas de taille absolue.
   ============================================================ */
export const PAGE_REF = 1000;

/** HTML collé → le même, sans aucune déclaration `font-size` dans les attributs style */
export function sansTaillesCollees(html) {
  if (!html || !/font-size/i.test(html)) return html;
  return String(html).replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (m, pre, q, st) => {
    const reste = st.split(';').map((x) => x.trim()).filter((x) => x && !/^font-size\s*:/i.test(x)).join('; ');
    return reste ? `${pre}${q}${reste}${q}` : '';
  });
}

const sansTailleMarque = (m) => {
  if (!m || m.type !== 'textStyle' || !m.attrs || m.attrs.fontSize == null || m.attrs.fontSize === '') return m;
  const attrs = { ...m.attrs, fontSize: null };
  return Object.values(attrs).some((v) => v != null && v !== '') ? { ...m, attrs } : null;
};
/** contenu ProseMirror (JSON) → le même, sans aucune taille de texte en dur (les autres styles gardés) */
export function contenuSansTailles(doc) {
  const w = (n) => {
    if (!n || typeof n !== 'object') return n;
    const o = { ...n };
    if (Array.isArray(n.marks)) { const ms = n.marks.map(sansTailleMarque).filter(Boolean); if (ms.length) o.marks = ms; else delete o.marks; }
    if (Array.isArray(n.content)) o.content = n.content.map(w);
    return o;
  };
  return w(doc);
}
/** le contenu porte-t-il une taille en dur ? */
export function contientTailles(doc) {
  let oui = false;
  const w = (n) => { if (oui || !n) return; if ((n.marks || []).some((m) => m.type === 'textStyle' && m.attrs && m.attrs.fontSize)) { oui = true; return; } (n.content || []).forEach(w); };
  w(doc); return oui;
}

/* ---- TEXTE D'UN DOCUMENT : la page est mise en page à `largeurPage` px (A4 : 595) puis agrandie ---- */
/** px de référence (page de 1000 px) → valeur CSS de mise en page */
export const px1000VersPage = (v, largeurPage = 595) => `${+((v * largeurPage) / PAGE_REF).toFixed(3)}px`;
/** valeur CSS de mise en page (« 14.28px », « 24px ») → px de référence, arrondis au demi-px ; null si illisible */
export function pageVersPx1000(css, largeurPage = 595) {
  const v = parseFloat(css);
  if (!Number.isFinite(v) || v <= 0 || !/px\s*$/i.test(String(css))) return null;
  return Math.round(((v * PAGE_REF) / largeurPage) * 2) / 2;
}
/** px rendus à l'écran → px de référence, pour une page affichée de `largeurAffichee` px */
export const renduVersPx1000 = (px, largeurAffichee) => (largeurAffichee > 0 ? (px * PAGE_REF) / largeurAffichee : null);
