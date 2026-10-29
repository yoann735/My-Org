/* ============================================================
   MedRevise — LISTES COLLÉES (29/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md). Module PUR (DOMParser
   injectable pour les tests) branché sur `transformPastedHTML` des éditeurs de boîtes et de documents.
   Ce que le collage apportait :
   - WORD : pas de vraie liste — des paragraphes « MsoListParagraph » (style `mso-list:l0 level2 lfo1`, retrait négatif)
     dont la puce est du TEXTE (« · », « o », « 1. » + espaces insécables dans un span `mso-list:Ignore`). Collés tels
     quels : des paragraphes qui commencent par « ·      », sans liste ni niveau ;
   - GOOGLE DOCS : une sous-liste posée directement dans la liste (`<ul><li>…</li><ul>…</ul></ul>`), hors de son élément ;
   - partout : retraits, marges et interlignes en style en ligne sur les listes, taille / police / couleur sur leur texte.
   Ici : les paragraphes Word deviennent de vraies listes imbriquées (numérotée si la marque est un numéro ou une lettre),
   une sous-liste orpheline est rangée dans l'élément qui la précède, et les styles / classes des listes sont retirés —
   la liste prend alors le rendu de l'app (styles/listes.css). Aucun autre contenu n'est touché.
   ============================================================ */
const MSO = /mso-list:\s*l(\d+)\s+level(\d+)/i;
const MARQUE_NUMERO = /^\(?([0-9]+|[a-z]|[ivxlcdm]+)[.)]/i;

/** HTML collé → HTML nettoyé (inchangé s'il ne contient ni liste ni paragraphe de liste Word) */
export function nettoyerCollage(html, Parser = typeof DOMParser !== 'undefined' ? DOMParser : null) {
  if (!html || !Parser || !/mso-list|<(ul|ol)[\s>]/i.test(html)) return html;
  // un fragment collé est rangé dans <body> (ce que fait déjà un navigateur, pas tous les analyseurs)
  const doc = new Parser().parseFromString(/<body[\s>]/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`, 'text/html');
  const body = doc.body;
  if (!body) return html;
  listesWord(doc);
  // sous-liste orpheline (Google Docs) : dans l'élément qui la précède, sinon dans un nouvel élément
  for (const l of [...body.querySelectorAll('ul, ol')]) {
    const parent = l.parentElement;
    if (!parent || !/^(UL|OL)$/.test(parent.tagName)) continue;
    let li = l.previousElementSibling;
    if (!li || li.tagName !== 'LI') { li = doc.createElement('li'); parent.insertBefore(li, l); }
    li.appendChild(l);
  }
  for (const e of body.querySelectorAll('ul, ol, li, li > p')) { e.removeAttribute('style'); e.removeAttribute('class'); }
  // texte DANS les listes : taille, police, couleur, fond, interligne importés retirés (Google Docs : 11 pt, Arial, noir) ;
  // gras / italique / souligné / exposant gardés (Google Docs les écrit en style, pas en balise)
  for (const e of body.querySelectorAll('ul *, ol *')) {
    const st = e.getAttribute && e.getAttribute('style');
    if (!st) continue;
    const garde = st.split(';').map((x) => x.trim()).filter((x) => /^(font-weight|font-style|text-decoration(-line)?|vertical-align)\s*:/i.test(x));
    if (garde.length) e.setAttribute('style', garde.join(';')); else e.removeAttribute('style');
  }
  return body.innerHTML;
}

/** paragraphes de liste Word (mso-list) → <ul>/<ol> imbriqués, par suites de paragraphes voisins */
function listesWord(doc) {
  const paras = [...doc.body.querySelectorAll('p')].filter((p) => MSO.test(p.getAttribute('style') || ''));
  // suites de paragraphes de liste qui se suivent (avant toute modification du document)
  const suites = [];
  // (une autre liste Word — autre identifiant « l1 » au lieu de « l0 » — commence une nouvelle suite)
  const idListe = (p) => MSO.exec(p.getAttribute('style'))[1];
  paras.forEach((p, i) => { if (i && p.previousElementSibling === paras[i - 1] && idListe(p) === idListe(paras[i - 1])) suites[suites.length - 1].push(p); else suites.push([p]); });
  for (const suite of suites) {
    const pile = []; // [{ niveau, liste }]
    for (const p of suite) {
      const niveau = Number(MSO.exec(p.getAttribute('style'))[2]) || 1;
      [...p.childNodes].forEach((x) => { if (x.nodeType === 8) x.remove(); }); // <!--[if !supportLists]--> …
      // la marque (puce ou numéro écrits en texte) : span « mso-list:Ignore », retiré
      const ignore = [...p.querySelectorAll('span')].find((x) => /mso-list:\s*Ignore/i.test(x.getAttribute('style') || ''));
      const marque = ignore ? ignore.textContent.replace(/\u00a0/g, ' ').trim() : '';
      if (ignore) {
        let vide = ignore.parentElement; ignore.remove();
        while (vide && vide !== p && !vide.textContent.trim() && !vide.querySelector('img')) { const haut = vide.parentElement; vide.remove(); vide = haut; } // ses enveloppes vides
      }
      [...p.querySelectorAll('*')].forEach((x) => { if (x.tagName.toLowerCase() === 'o:p') x.remove(); }); // <o:p></o:p> de Word
      const type = MARQUE_NUMERO.test(marque) ? 'ol' : 'ul';
      while (pile.length && pile[pile.length - 1].niveau > niveau) pile.pop();
      let haut = pile[pile.length - 1];
      if (haut && haut.niveau === niveau && haut.liste.tagName.toLowerCase() !== type) { pile.pop(); haut = pile[pile.length - 1]; } // puces ↔ numéros au même niveau
      if (!haut || haut.niveau < niveau) {
        const liste = doc.createElement(type);
        const dernier = haut && haut.liste.lastElementChild;
        if (dernier) dernier.appendChild(liste); else p.parentNode.insertBefore(liste, p);
        haut = { niveau, liste };
        pile.push(haut);
      }
      const li = doc.createElement('li');
      const contenu = doc.createElement('p');
      while (p.firstChild) contenu.appendChild(p.firstChild);
      const t = contenu.firstChild; // espaces insécables de tête laissés par la marque
      if (t && t.nodeType === 3) t.textContent = t.textContent.replace(/^[\s\u00a0]+/, '');
      li.appendChild(contenu);
      haut.liste.appendChild(li);
      p.remove();
    }
  }
}
