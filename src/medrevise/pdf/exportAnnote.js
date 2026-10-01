/* ============================================================
   MedRevise — EXPORT DU PDF ANNOTÉ COMPLET (01/10).

   Produit un NOUVEAU fichier : les octets d'origine sont chargés en mémoire par
   pdf-lib (une copie), jamais réécrits dans IndexedDB ni au cloud. Le blob du
   cours reste identique octet pour octet (vérifié par SHA-256, voir
   docs/rapport-nuit.md).

   Tout ce que montre le lecteur sort sur le papier, dans l'ORDRE DES CALQUES du
   lecteur (docs/archi-edition-pdf.md) :
     pages ajoutées (insérées à leur place)
     → images collées (du fond vers le devant)
     → surlignages → blocs remplacés → surligneur à main levée → traits de crayon
     → textes libres → « ? » → boîtes (OUVERTES, texte visible) + épingles + flèches

   Limites assumées : pages pivotées non gérées (comme l'export d'avant) ; texte
   en Helvetica standard (gras/italique/taille non reproduits) ; caractères hors
   de l'encodage standard des PDF (WinAnsi : flèches unicode, lettres grecques,
   emoji…) remplacés par un équivalent lisible ou « ? ».
   ============================================================ */
import { PDFDocument, BlendMode, StandardFonts, rgb } from 'pdf-lib';
import { getBlob } from '../lib/storage.js';
import { separerParType } from '../lib/annotationTypes.js';
import { COLOR_HEX, COLOR_RGB, couleurHex, EPAISSEUR_SURLIGNEUR, OPACITE_SURLIGNEUR, modeDuTrait } from './pdfShared.js';

/* Le texte des boîtes s'affiche en px FIXES dans le lecteur (13 px boîte, 15 px
   texte libre), lus au zoom par défaut de 160 % : on reprend cette taille relative
   à la page, pour que l'export ressemble à ce qu'on voit en lisant. */
const ZOOM_REFERENCE = 1.6;
const TAILLE_BOITE = 13 / ZOOM_REFERENCE;
const TAILLE_TEXTE = 15 / ZOOM_REFERENCE;
// teinte FONCÉE des flèches (même table que pdf/PdfPage.jsx#COULEUR_FLECHE)
const COULEUR_FLECHE = { jaune: '#B8920A', vert: '#2F8F3A', bleu: '#2A72B8', rose: '#C2457F' };

const hexVersRgb = (hex) => {
  const h = String(hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/* ---- texte : contenu TipTap → paragraphes de texte brut ---- */
export function paragraphesDe(content) {
  const out = [];
  const texteInline = (n) => {
    if (!n) return '';
    if (n.type === 'text') return n.text || '';
    if (n.type === 'hardBreak') return '\n';
    return (n.content || []).map(texteInline).join('');
  };
  const bloc = (n, prefixe = '') => {
    if (!n) return;
    if (n.type === 'paragraph' || n.type === 'heading') {
      texteInline(n).split('\n').forEach((l, i) => out.push((i === 0 ? prefixe : ' '.repeat(prefixe.length)) + l));
    } else if (n.type === 'bulletList' || n.type === 'orderedList') {
      const debut = (n.attrs && n.attrs.start) || 1;
      (n.content || []).forEach((li, i) => (li.content || []).forEach((c, j) => {
        const puce = n.type === 'bulletList' ? '• ' : `${debut + i}. `;
        bloc(c, j === 0 ? puce : '   ');
      }));
    } else (n.content || []).forEach((c) => bloc(c, prefixe));
  };
  if (content && content.type === 'doc') (content.content || []).forEach((c) => bloc(c));
  // retire les lignes vides de fin
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

/* ---- encodage : un caractère que la police standard ne sait pas écrire ferait
   échouer tout l'export ; on le remplace un par un (cache par caractère). ---- */
const EQUIVALENTS = { '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇔': '<=>', '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~',
  '√': 'racine ', '∞': 'infini', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'Δ': 'Delta', 'μ': 'µ', 'π': 'pi',
  ' ': ' ', ' ': ' ', '\t': '  ', '✓': 'v', '✔': 'v', '✗': 'x', '−': '-' };
function nettoyeur(font) {
  const cache = new Map();
  return (s) => Array.from(String(s || '')).map((ch) => {
    if (cache.has(ch)) return cache.get(ch);
    let r = ch;
    try { font.encodeText(ch); } catch (e) {
      r = EQUIVALENTS[ch] || '?';
      try { font.encodeText(r); } catch (e2) { r = '?'; }
    }
    cache.set(ch, r);
    return r;
  }).join('');
}

/** découpe en lignes tenant dans `largeur` (points). Les mots trop longs sont coupés. */
function couperLignes(paragraphes, font, taille, largeur) {
  const lignes = [];
  for (const p of paragraphes) {
    if (!p.trim()) { lignes.push(''); continue; }
    let courante = '';
    for (const mot of p.split(/(\s+)/)) {
      const essai = courante + mot;
      if (font.widthOfTextAtSize(essai, taille) <= largeur || !courante.trim()) {
        if (font.widthOfTextAtSize(essai, taille) > largeur && !courante.trim()) {
          // mot seul plus large que la boîte : coupé caractère par caractère
          let morceau = '';
          for (const ch of essai) {
            if (font.widthOfTextAtSize(morceau + ch, taille) > largeur && morceau) { lignes.push(morceau); morceau = ''; }
            morceau += ch;
          }
          courante = morceau;
        } else courante = essai;
      } else { lignes.push(courante.trimEnd()); courante = mot.trimStart(); }
    }
    lignes.push(courante.trimEnd());
  }
  return lignes;
}

/** points [[x,y]…] normalisés → chemin SVG en points de page (y vers le bas). */
const cheminPoints = (points, W, H) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * W).toFixed(2)} ${(y * H).toFixed(2)}`).join(' ');

/** une image (blob) prête pour pdf-lib : PNG/JPEG tels quels, le reste converti en PNG. */
async function embarquerImage(outDoc, blob) {
  const type = (blob.type || '').toLowerCase();
  const octets = new Uint8Array(await blob.arrayBuffer());
  if (type === 'image/png') return outDoc.embedPng(octets);
  if (type === 'image/jpeg' || type === 'image/jpg') return outDoc.embedJpg(octets);
  const bm = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bm.width; c.height = bm.height;
  c.getContext('2d').drawImage(bm, 0, 0);
  if (bm.close) bm.close();
  const png = await new Promise((r) => c.toBlob(r, 'image/png'));
  return outDoc.embedPng(new Uint8Array(await png.arrayBuffer()));
}

/**
 * @param {ArrayBuffer} octetsPdf  copie des octets du PDF d'origine (jamais réécrite)
 * @param {object[]} highlights    surlignages du document
 * @param {object[]} annotations   enregistrements du store `annotations` du document
 * @returns {Promise<{ octets: Uint8Array, bilan: object }>}
 */
export async function exporterPdfAnnote(octetsPdf, highlights = [], annotations = []) {
  const outDoc = await PDFDocument.load(octetsPdf);
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const propre = nettoyeur(font);
  const par = separerParType([], annotations);
  const bilan = { pagesAjoutees: 0, images: 0, surlignages: 0, traits: 0, textes: 0, questions: 0, boites: 0, fleches: 0, blocs: 0, ignores: 0 };

  /* 1. PAGES : même ordre que le lecteur (après la page n, les pages ajoutées
        apres = n triées par rang), insérées de la première à la dernière — chaque
        insertion se fait donc à sa position définitive. */
  const pagesPdf = outDoc.getPages();
  const N = pagesPdf.length;
  const tri = (a, b) => (a.rang - b.rang) || String(a.createdAt).localeCompare(String(b.createdAt));
  const parApres = {};
  for (const a of par.page) {
    const k = Math.max(0, Math.min(N, Math.floor(Number(a.apres) || 0)));
    (parApres[k] || (parApres[k] = [])).push(a);
  }
  const ordre = [];
  const ajouts = (k) => (parApres[k] || []).sort(tri).forEach((a) => ordre.push({ ajout: a, k }));
  ajouts(0);
  for (let n = 1; n <= N; n++) { ordre.push({ pdf: n }); ajouts(n); }
  const parCle = new Map();
  pagesPdf.forEach((p, i) => parCle.set(i + 1, p));
  ordre.forEach((e, i) => {
    if (!e.ajout) return;
    const voisine = pagesPdf[Math.max(0, e.k - 1)] || pagesPdf[0];
    const taille = e.ajout.width && e.ajout.height ? [e.ajout.width, e.ajout.height] : (voisine ? [voisine.getWidth(), voisine.getHeight()] : [595, 842]);
    parCle.set(e.ajout.id, outDoc.insertPage(i, taille));
    bilan.pagesAjoutees += 1;
  });
  const pageDe = (cle) => parCle.get(cle) || null;
  const dims = (page) => { const { width, height } = page.getSize(); return { W: width, H: height }; };

  /* 2. IMAGES (calques entre elles : z croissant = du fond vers le devant) */
  const images = [...par.image].sort((a, b) => (a.z - b.z) || String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const im of images) {
    const page = pageDe(im.page);
    const blob = page && im.blobId ? await getBlob(im.blobId) : null;
    if (!page || !blob) { bilan.ignores += 1; continue; }
    try {
      const emb = await embarquerImage(outDoc, blob);
      const { W, H } = dims(page);
      page.drawImage(emb, { x: im.x * W, y: H - (im.y + im.height) * H, width: im.width * W, height: im.height * H });
      bilan.images += 1;
    } catch (e) { bilan.ignores += 1; }
  }

  /* 3. SURLIGNAGES (rendu d'avant, inchangé) */
  for (const h of highlights) {
    const page = pageDe(h.page);
    if (!page) { bilan.ignores += 1; continue; }
    const { W, H } = dims(page);
    for (const r of h.rects || []) {
      page.drawRectangle({ x: r.x * W, y: H - (r.y + r.height) * H, width: r.width * W, height: r.height * H,
        color: COLOR_RGB[h.couleur] || hexVersRgb(couleurHex(h.couleur)), opacity: 0.4, blendMode: BlendMode.Multiply });
    }
    bilan.surlignages += 1;
  }

  /* 4. BLOCS REMPLACÉS : fond blanc sur le texte d'origine, texte édité par-dessus */
  for (const b of par.bloc) {
    const page = pageDe(b.page);
    if (!page) { bilan.ignores += 1; continue; }
    const { W, H } = dims(page);
    const x = b.x * W, w = b.width * W, top = H - b.y * H;
    const taille = Math.max(5, b.fontSize ? b.fontSize * H : 9);
    const lignes = couperLignes(paragraphesDe(b.content).map(propre), font, taille, Math.max(10, w));
    const h = Math.max(b.height * H, lignes.length * taille * 1.05);
    page.drawRectangle({ x, y: top - h, width: w, height: h, color: rgb(1, 1, 1) });
    lignes.forEach((l, i) => { if (l) page.drawText(l, { x, y: top - taille * 0.85 - i * taille * 1.05, size: taille, font, color: rgb(0.09, 0.09, 0.16) }); });
    bilan.blocs += 1;
  }

  /* 5. TRAITS : surligneur à main levée (multiply) SOUS les traits de crayon */
  const traits = [...par.surligneur, ...par.trait].sort((a, b) => (modeDuTrait(a) === 'surligneur' ? 0 : 1) - (modeDuTrait(b) === 'surligneur' ? 0 : 1));
  for (const t of traits) {
    const page = pageDe(t.page);
    if (!page || !t.points || t.points.length < 2) { bilan.ignores += 1; continue; }
    const { W, H } = dims(page);
    const surl = modeDuTrait(t) === 'surligneur';
    const ep = (surl ? (t.epaisseur || EPAISSEUR_SURLIGNEUR) : (t.epaisseur || 0.0042)) * H;
    page.drawSvgPath(cheminPoints(t.points, W, H), {
      x: 0, y: H, borderColor: hexVersRgb(couleurHex(t.couleur)), borderWidth: Math.max(surl ? 2.5 : 0.6, ep),
      borderOpacity: Number.isFinite(t.opacite) ? t.opacite : (surl ? OPACITE_SURLIGNEUR : 1), borderLineCap: 1 /* rond */, ...(surl ? { blendMode: BlendMode.Multiply } : {}),
    });
    bilan.traits += 1;
  }

  /* 6. TEXTES LIBRES : sans cadre, dans leur couleur */
  for (const t of par.texte) {
    const page = pageDe(t.page);
    const paras = paragraphesDe(t.content);
    if (!page || !paras.join('').trim()) { if (!page) bilan.ignores += 1; continue; }
    const { W, H } = dims(page);
    const lignes = couperLignes(paras.map(propre), font, TAILLE_TEXTE, Math.max(20, t.width * W - 4));
    const lh = TAILLE_TEXTE * 1.3;
    lignes.forEach((l, i) => { if (l) page.drawText(l, { x: t.x * W + 2, y: H - t.y * H - 2 - TAILLE_TEXTE * 0.9 - i * lh, size: TAILLE_TEXTE, font, color: hexVersRgb(couleurHex(t.couleur, '#1F1F24')) }); });
    bilan.textes += 1;
  }

  /* 7. « ? » */
  for (const q of par.question) {
    const page = pageDe(q.page);
    if (!page) { bilan.ignores += 1; continue; }
    const { W, H } = dims(page);
    const cx = q.x * W, cy = H - q.y * H, r = 8;
    page.drawCircle({ x: cx, y: cy, size: r, color: hexVersRgb('#F28C28'), borderColor: rgb(1, 1, 1), borderWidth: 1.2 });
    const tw = font.widthOfTextAtSize('?', 11);
    page.drawText('?', { x: cx - tw / 2, y: cy - 3.9, size: 11, font, color: rgb(1, 1, 1) });
    bilan.questions += 1;
  }

  /* 8. BOÎTES — EXPORTÉES OUVERTES (même celles réduites en pastille dans le
        lecteur), à leur place, assez hautes pour tout leur texte ; puis épingle et
        flèche par-dessus. Toujours le calque le plus haut. */
  for (const b of par.boite) {
    const page = pageDe(b.page);
    if (!page) { bilan.ignores += 1; continue; }
    const { W, H } = dims(page);
    const pad = 4;
    const x = b.x * W;
    let w = Math.max(24, b.width * W);
    const lignes = couperLignes(paragraphesDe(b.content).map(propre), font, TAILLE_BOITE, w - 2 * pad);
    // comme à l'écran : la boîte épouse sa ligne la plus longue (+ marge), sauf largeur fixée à la main
    if (!b.largeurFixe && lignes.some((l) => l.trim())) {
      const plusLongue = Math.max(...lignes.map((l) => font.widthOfTextAtSize(l, TAILLE_BOITE)));
      w = Math.max(24, Math.min(w, plusLongue + 2 * pad + 6));
    }
    const lh = TAILLE_BOITE * 1.35;
    const h = Math.max(b.height * H, 2 * pad + Math.max(1, lignes.length) * lh);
    let top = H - b.y * H;
    if (top - h < 0) top = Math.min(H, h); // une boîte qui déborderait en bas remonte dans la page
    const fond = hexVersRgb(COLOR_HEX[b.couleur] || COLOR_HEX.jaune);
    const ancre = b.ancre && Number.isFinite(b.ancre.x) && Number.isFinite(b.ancre.y) ? { x: b.ancre.x * W, y: H - b.ancre.y * H } : null;
    const coulFleche = hexVersRgb(COULEUR_FLECHE[b.couleur] || COULEUR_FLECHE.jaune);

    // flèche d'abord (sous la boîte et l'épingle) : du BORD de la boîte au point visé
    if (ancre && b.fleche) {
      const cx = x + w / 2, cy = top - h / 2, dx = ancre.x - cx, dy = ancre.y - cy;
      const dedans = ancre.x >= x && ancre.x <= x + w && ancre.y <= top && ancre.y >= top - h;
      if (!dedans) {
        const t = Math.min(dx ? (w / 2) / Math.abs(dx) : Infinity, dy ? (h / 2) / Math.abs(dy) : Infinity);
        const sx = cx + dx * t, sy = cy + dy * t;
        const L = Math.hypot(ancre.x - sx, ancre.y - sy);
        if (L > 8) {
          const ux = (ancre.x - sx) / L, uy = (ancre.y - sy) / L;
          const ex = ancre.x - ux * 5, ey = ancre.y - uy * 5; // la pointe s'arrête au bord de l'épingle
          const tete = 7;
          const bx = ex - ux * tete, by = ey - uy * tete;
          page.drawLine({ start: { x: sx, y: sy }, end: { x: bx, y: by }, thickness: 1.5, color: coulFleche });
          // pointe : triangle plein (coordonnées SVG, y vers le bas depuis le haut de la page)
          const P = (px, py) => `${px.toFixed(2)} ${(H - py).toFixed(2)}`;
          page.drawSvgPath(`M${P(ex, ey)} L${P(bx - uy * tete * 0.5, by + ux * tete * 0.5)} L${P(bx + uy * tete * 0.5, by - ux * tete * 0.5)} Z`, { x: 0, y: H, color: coulFleche });
          bilan.fleches += 1;
        }
      }
    }
    page.drawRectangle({ x, y: top - h, width: w, height: h, color: fond, opacity: 0.92, borderColor: rgb(0, 0, 0), borderOpacity: 0.28, borderWidth: 0.8 });
    lignes.forEach((l, i) => { if (l) page.drawText(l, { x: x + pad, y: top - pad - TAILLE_BOITE * 0.95 - i * lh, size: TAILLE_BOITE, font, color: rgb(0.09, 0.09, 0.16) }); });
    if (ancre) page.drawCircle({ x: ancre.x, y: ancre.y, size: 3.5, color: rgb(1, 1, 1), borderColor: coulFleche, borderWidth: 1.8 });
    bilan.boites += 1;
  }

  const octets = await outDoc.save();
  return { octets, bilan };
}

/** Raccourci pour le lecteur : lit le blob du PDF (lecture seule) et exporte. */
export async function exporterDepuisBlob(pdfId, highlights, annotations) {
  const blob = await getBlob(pdfId);
  if (!blob) throw new Error('PDF introuvable sur cet appareil.');
  // arrayBuffer() rend une COPIE : pdf-lib travaille dessus, le blob ne bouge pas
  return exporterPdfAnnote(await blob.arrayBuffer(), highlights, annotations);
}
