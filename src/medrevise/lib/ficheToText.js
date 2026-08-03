/* ============================================================
   MedRevise — portage EXACT de ficheToText() (gabarit-fiche.html, script inline
   du gabarit HTML autonome) : même sortie caractère pour caractère, juste
   paramétré sur un élément racine (#doc de la fiche) au lieu d'une closure sur
   `doc`. Ne pas faire diverger cette logique de l'original sans mettre à jour
   les deux (le gabarit reste un fichier HTML autonome, sans dépendance JS externe).
   ============================================================ */

function inline(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('mark.hl').forEach((m) => {
    m.replaceWith(document.createTextNode('[PRIORITAIRE]' + m.textContent + '[/PRIORITAIRE]'));
  });
  return c.textContent.replace(/\s+/g, ' ').trim();
}

function tableToText(t) {
  const rows = [...t.querySelectorAll('tr')].map((tr) =>
    [...tr.children].map((c) => inline(c)).join(' | '));
  const cap = t.querySelector('caption');
  const head = rows.length ? ['| ' + rows[0] + ' |'] : [];
  if (rows.length) head.push('|' + rows[0].split('|').map(() => '---').join('|') + '|');
  const body = rows.slice(1).map((r) => '| ' + r + ' |');
  return (cap ? '[TABLEAU] ' + inline(cap) + '\n' : '[TABLEAU]\n') + head.concat(body).join('\n');
}

/** @param {HTMLElement} doc — l'élément #doc de la fiche (gabarit HTML) */
export function ficheToText(doc) {
  const out = [];
  [...doc.children].forEach((el) => {
    const cls = el.classList, tag = el.tagName;
    if (cls.contains('divider') || cls.contains('h2rule')) return;
    if (cls.contains('eyebrow')) { out.push('MATIÈRE / UNITÉ : ' + inline(el)); return; }
    if (tag === 'H1') { out.push('TITRE DU COURS : ' + inline(el)); return; }
    if (cls.contains('subtitle')) { out.push('SOUS-TITRE : ' + inline(el) + '\n' + '='.repeat(60)); return; }
    if (tag === 'H2') { out.push('\n## ' + inline(el)); return; }
    if (tag === 'H3') { out.push('\n### ' + inline(el)); return; }
    if (tag === 'TABLE') { out.push(tableToText(el)); return; }
    if (cls.contains('note')) {
      const tg = el.querySelector('.tag');
      const ps = [...el.querySelectorAll('p')].map((p) => inline(p)).join(' ');
      out.push('[NOTE PERSONNELLE — ' + (tg ? inline(tg) : '') + ']\n' + ps + '\n[/NOTE PERSONNELLE]');
      return;
    }
    if (cls.contains('keybox')) {
      const li = [...el.querySelectorAll('li')].map((l) => '- ' + inline(l)).join('\n');
      out.push('[À RETENIR]\n' + li + '\n[/À RETENIR]');
      return;
    }
    if (tag === 'FIGURE') {
      const cap = el.querySelector('figcaption');
      const img = el.querySelector('img');
      out.push('[IMAGE : ' + (cap ? inline(cap) : (img && img.alt) || 'sans légende') + ']');
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      out.push([...el.children].map((l) => '- ' + inline(l)).join('\n'));
      return;
    }
    const t = inline(el);
    if (t) out.push(t);
  });
  const n = doc.querySelectorAll('mark.hl').length;
  const legende =
    'FICHE DE RÉVISION — texte structuré\n' +
    'Conventions : [PRIORITAIRE]…[/PRIORITAIRE] = passage surligné par l’étudiant ' +
    '(notion jugée prioritaire' + (n ? '' : ' — aucun dans cette fiche') + '). ' +
    '[NOTE PERSONNELLE] = remarque ou question de l’étudiant. ' +
    '[À RETENIR] = points essentiels. [TABLEAU] = données structurées. ' +
    '[IMAGE : …] = figure du cours et sa légende.\n' + '='.repeat(60) + '\n';
  return legende + out.join('\n\n');
}
