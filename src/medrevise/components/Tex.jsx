/* ============================================================
   MedRevise — rendu LaTeX (KaTeX), 100 % local, aucun appel réseau.
   <Tex>chaîne pouvant contenir $inline$ ou $$display$$</Tex>
   Sécurisé (throwOnError:false : une formule cassée s'affiche en rouge
   au lieu de planter). Le math hérite de la couleur du texte (currentColor)
   → compatible thème clair/sombre sans style supplémentaire.
   ============================================================ */
import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import '../../styles/listes.css';

function render(tex, displayMode) {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode, output: 'htmlAndMathml' });
  } catch (e) {
    return null;
  }
}

// $$…$$ (display) OU $…$ (inline, sur une seule ligne)
const TOKEN = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

/* (25/10, docs/compte-rendu-boites-tableaux.md §2) BALISAGE LÉGER — seulement pour une carte qui le demande
   (`versoFormat: 'leger'`, cartes faites depuis une boîte : lib/boiteVersCarte.js) : **gras**, *italique*, une ligne par
   retour à la ligne, « - » en puce. Les autres cartes s'affichent exactement comme avant. */
const MARQUE = /\*\*\*([^*\n]+?)\*\*\*|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
function marques(corps) {
  const out = []; let last = 0; let m;
  MARQUE.lastIndex = 0;
  while ((m = MARQUE.exec(corps))) {
    if (m.index > last) out.push(corps.slice(last, m.index));
    out.push(m[1] != null ? <strong key={m.index}><em>{m[1]}</em></strong> : m[2] != null ? <strong key={m.index}>{m[2]}</strong> : <em key={m.index}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < corps.length) out.push(corps.slice(last));
  return out;
}
/* (29/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md) LISTES : « - », « 1. », « a. » en tête de ligne (deux
   espaces par niveau, lib/boiteVersCarte.js) → une vraie ligne de liste (styles/listes.css) : puce / numéro sur la 1ʳᵉ
   ligne, retour à la ligne aligné sous le texte ; • puis ◦. Ligne en retrait juste après : suite du même élément. */
const LIGNE_LISTE = /^( *)(- |\d+\. |[a-z]\. )(.*)$/;
function leger(texte, cle) {
  const lignes = String(texte).split('\n');
  let niveauListe = null; // niveau du dernier élément de liste (null : hors liste)
  return lignes.map((l, i) => {
    const k = cle + ':' + i;
    const li = LIGNE_LISTE.exec(l);
    if (li) {
      const niv = Math.min(1, Math.floor(li[1].length / 2));
      niveauListe = niv;
      const puce = li[2] === '- ';
      return <span key={k} className={'tex-li' + (puce ? '' : ' num')} style={{ '--niv': niv }}><span className="tex-marque">{puce ? (niv ? '◦' : '•') : li[2].trim()}</span><span className="tex-txt">{marques(li[3])}</span></span>;
    }
    if (niveauListe != null && /^ +\S/.test(l)) return <span key={k} className="tex-suite" style={{ '--niv': niveauListe }}>{marques(l.trim())}</span>;
    niveauListe = null;
    const suivanteBloc = i < lignes.length - 1 && (LIGNE_LISTE.test(lignes[i + 1]));
    return <span key={k}>{marques(l)}{i < lignes.length - 1 && !suivanteBloc ? <br /> : null}</span>;
  });
}

/** rend une chaîne en mélangeant texte brut et formules KaTeX (`leger` : balisage léger, voir plus haut) */
export function Tex({ children, leger: avecLeger = false }) {
  const text = typeof children === 'string' ? children : children == null ? '' : String(children);
  const parts = useMemo(() => {
    if (!text || text.indexOf('$') === -1) return [{ t: 'text', v: text }];
    const out = [];
    let last = 0; let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text))) {
      if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
      const display = m[1] != null;
      const html = render(display ? m[1] : m[2], display);
      out.push(html ? { t: 'tex', v: html, display } : { t: 'text', v: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
    return out;
  }, [text]);

  return (
    <>
      {parts.map((p, i) => (p.t === 'text'
        ? <span key={i}>{avecLeger ? leger(p.v, i) : p.v}</span>
        : <span key={i} style={p.display ? { display: 'block', margin: '6px 0' } : undefined}
            dangerouslySetInnerHTML={{ __html: p.v }} />))}
    </>
  );
}
