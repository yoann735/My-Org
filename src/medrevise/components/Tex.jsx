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

/** rend une chaîne en mélangeant texte brut et formules KaTeX */
export function Tex({ children }) {
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
        ? <span key={i}>{p.v}</span>
        : <span key={i} style={p.display ? { display: 'block', margin: '6px 0' } : undefined}
            dangerouslySetInnerHTML={{ __html: p.v }} />))}
    </>
  );
}
