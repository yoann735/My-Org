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
function leger(texte, cle) {
  const lignes = String(texte).split('\n');
  return lignes.map((l, i) => {
    const puce = /^\s*- /.test(l);
    const corps = puce ? l.replace(/^(\s*)- /, '$1') : l;
    const out = []; let last = 0; let m;
    MARQUE.lastIndex = 0;
    while ((m = MARQUE.exec(corps))) {
      if (m.index > last) out.push(corps.slice(last, m.index));
      out.push(m[1] != null ? <strong key={m.index}><em>{m[1]}</em></strong> : m[2] != null ? <strong key={m.index}>{m[2]}</strong> : <em key={m.index}>{m[3]}</em>);
      last = m.index + m[0].length;
    }
    if (last < corps.length) out.push(corps.slice(last));
    return <span key={cle + ':' + i}>{puce ? '• ' : ''}{out}{i < lignes.length - 1 ? <br /> : null}</span>;
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
