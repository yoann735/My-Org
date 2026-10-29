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
import { largeurImage } from './imageBoiteModele.js';
import { PDFDocument, BlendMode, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib';
import { getBlob } from '../lib/storage.js';
import { cheminForme, typeForme, estFermee, estTrait } from './formes.js';
import { styleFleche, cheminFleche, geoPointe, sommetsConnecteur, sommetsForme, pointesForme, harmonisee } from './flechesGeo.js';
import { cheminCatmull } from './crayon.js';
import { connecteursDe } from './connecteurs.js';
import { separerParType } from '../lib/annotationTypes.js';
import { estGrille, cellulesAffichees, formatDe } from './grille.js';
import { ocrImage } from '../ocr/ocrImage.js';
import { COLOR_RGB, couleurHex, couleurFoncee, opaciteFondBoite, EPAISSEUR_SURLIGNEUR, OPACITE_SURLIGNEUR, modeDuTrait, epaisseurPx } from './pdfShared.js';

/* Le texte des boîtes est collé à la page dans le lecteur (13 px boîte, 15 px texte
   libre À 160 %, mis à l'échelle de la page avec elle — 04/10) : même taille relative
   à la page ici, l'export est identique à l'écran à tout zoom. */
const ZOOM_REFERENCE = 1.6;
const TAILLE_BOITE = 13 / ZOOM_REFERENCE;
const TAILLE_TEXTE = 15 / ZOOM_REFERENCE;
/** taille du texte d'une annotation (pt) : (v1.1) `taille1000` px d'une page de 1000 px, (22/10) `tailleTexte` % de la
    largeur de la page, sinon celle d'avant */
const tailleDe = (a, W, avant) => (Number.isFinite(a && a.taille1000) ? (a.taille1000 / 1000) * W : Number.isFinite(a && a.tailleTexte) ? (a.tailleTexte / 100) * W : avant);

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
  /* (29/10, docs/compte-rendu-synchro-rapide-surlignage-listes.md) listes comme à l'écran (styles/listes.css) : 2 niveaux
     (• puis –, 1. puis a.) ; une sous-liste commence sous le TEXTE de son élément (retrait = largeur de la puce du
     parent) ; les lignes suivantes d'un élément s'alignent sous son texte (couperLignes reprend ce retrait) */
  const bloc = (n, prefixe = '', niveau = 0, retrait = '') => {
    if (!n) return;
    if (n.type === 'paragraph' || n.type === 'heading') {
      texteInline(n).split('\n').forEach((l, i) => out.push((i === 0 ? prefixe : ' '.repeat(prefixe.length)) + l));
    } else if (n.type === 'bulletList' || n.type === 'orderedList') {
      const debut = (n.attrs && n.attrs.start) || 1;
      (n.content || []).forEach((li, i) => {
        const puce = n.type === 'bulletList' ? (niveau % 2 ? '– ' : '• ') : niveau % 2 ? `${String.fromCharCode(96 + Math.min(26, debut + i))}. ` : `${debut + i}. `;
        (li.content || []).forEach((c, j) => {
          if (c.type === 'bulletList' || c.type === 'orderedList') bloc(c, '', niveau + 1, retrait + ' '.repeat(puce.length));
          else bloc(c, retrait + (j === 0 ? puce : ' '.repeat(puce.length)), niveau, retrait);
        });
      });
    } else (n.content || []).forEach((c) => bloc(c, prefixe, niveau, retrait));
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
export function nettoyeur(font) {
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
export function couperLignes(paragraphes, font, taille, largeur) {
  const lignes = [];
  const espace = font.widthOfTextAtSize(' ', taille) || 1;
  for (const p of paragraphes) {
    if (!p.trim()) { lignes.push(''); continue; }
    // (29/10) élément de liste (« • », « – », « 1. », « a. », ou ligne suivante en retrait) : les retours à la ligne
    // reprennent sous le TEXTE, pas sous la puce — retrait fait d'espaces de même largeur que « retrait + puce »
    const tete = /^(\s*)([•–]|\d+\.|[a-z]\.)\s/.exec(p) || /^(\s+)/.exec(p);
    const suite = tete ? ' '.repeat(Math.round(font.widthOfTextAtSize(tete[0], taille) / espace)) : '';
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
      } else { lignes.push(courante.trimEnd()); courante = suite + mot.trimStart(); }
    }
    lignes.push(courante.trimEnd());
  }
  return lignes;
}

/** points [[x,y]…] normalisés → chemin SVG en points de page (y vers le bas). */
const cheminPoints = (points, W, H) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * W).toFixed(2)} ${(y * H).toFixed(2)}`).join(' ');

/** (21/10) un pixel d'écran au zoom de référence (160 %) en points PDF : les flèches harmonisées gardent leurs proportions */
const K_PDF = 1 / 1.6;
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

/** (25/10, docs/compte-rendu-boites-tableaux.md §4) un PDF fait des seules pages `indices` (0…n-1, dans l'ordre) d'un autre */
export async function extrairePages(octets, indices) {
  const src = await PDFDocument.load(octets);
  const n = src.getPageCount();
  const liste = [...new Set(indices)].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
  if (liste.length === n) return octets;
  const out = await PDFDocument.create();
  (await out.copyPages(src, liste)).forEach((pg) => out.addPage(pg));
  return out.save();
}

/**
 * @param {ArrayBuffer} octetsPdf  copie des octets du PDF d'origine (jamais réécrite)
 * @param {object[]} highlights    surlignages du document
 * @param {object[]} annotations   enregistrements du store `annotations` du document
 * @returns {Promise<{ octets: Uint8Array, bilan: object }>}
 */
export async function exporterPdfAnnote(octetsPdf, highlights = [], annotations = [], { reperes = null } = {}) {
  const outDoc = await PDFDocument.load(octetsPdf);
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  /* (25/10) boîtes-tableaux : gras / italique des cellules (docs/compte-rendu-boites-tableaux.md §5) */
  const polices = { '': font, b: await outDoc.embedFont(StandardFonts.HelveticaBold), i: await outDoc.embedFont(StandardFonts.HelveticaOblique), bi: await outDoc.embedFont(StandardFonts.HelveticaBoldOblique) };
  /* EXPORT SPÉCIAL IA (10/10 soir) : `reperes` (Map id → « #k3f ») ajoute, et SEULEMENT
     dans ce cas, une étiquette par boîte (voir poserRepere). Sans `reperes`, l'export
     est exactement celui d'avant. */
  const mono = reperes ? await outDoc.embedFont(StandardFonts.CourierBold) : null;
  const etiquettes = [];
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
      if (im.rotation) {
        // ROTATION (02/10 nuit) : à l'écran, horaire autour du centre ; pdf-lib tourne
        // autour du coin bas-gauche, dans le sens trigonométrique (y vers le haut)
        const w = im.width * W, h = im.height * H, cx = (im.x + im.width / 2) * W, cy = H - (im.y + im.height / 2) * H;
        const phi = (-im.rotation * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi);
        const bx = cx + (-w / 2) * c - (-h / 2) * s, by = cy + (-w / 2) * s + (-h / 2) * c;
        page.drawImage(emb, { x: bx, y: by, width: w, height: h, rotate: degrees(-im.rotation) });
      } else if (im.rognage && im.rognage.w > 0 && im.rognage.h > 0) {
        // ROGNÉE (21/10) : l'image entière, découpée au cadre visible — comme à l'écran
        const rg = im.rognage, fw = (im.width * W) / rg.w, fh = (im.height * H) / rg.h;
        page.pushOperators(pushGraphicsState(), rectangle(im.x * W, H - (im.y + im.height) * H, im.width * W, im.height * H), clip(), endPath());
        page.drawImage(emb, { x: im.x * W - rg.x * fw, y: H - (im.y * H - rg.y * fh) - fh, width: fw, height: fh });
        page.pushOperators(popGraphicsState());
      } else {
        page.drawImage(emb, { x: im.x * W, y: H - (im.y + im.height) * H, width: im.width * W, height: im.height * H });
      }
      bilan.images += 1;
    } catch (e) { bilan.ignores += 1; }
  }

  /* 3. SURLIGNAGES (rendu d'avant, inchangé) */
  for (const h of highlights) {
    const page = pageDe(h.page);
    if (!page) { bilan.ignores += 1; continue; }
    const { W, H } = dims(page);
    if (h.imageId) {
      /* MOTS D'UNE IMAGE COLLÉE (09/10) : la géométrie vient de l'image (position, taille,
         rotation ACTUELLES) et des boîtes OCR de ses mots, comme à l'écran */
      const im = par.image.find((x) => x.id === h.imageId);
      const ocr = im && im.blobId ? await ocrImage({ blobId: im.blobId }).catch(() => null) : null;
      if (!im || !ocr || !ocr.mots) { bilan.ignores += 1; continue; }
      const w = im.width * W, hh = im.height * H, cx = (im.x + im.width / 2) * W, cy = H - (im.y + im.height / 2) * H;
      const phi = (-(im.rotation || 0) * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi);
      for (const i of h.mots || []) {
        const m = ocr.mots[i];
        if (!m) continue;
        // coin bas-gauche du mot, repère de l'image centré (y vers le haut), puis rotation
        const xr = m.x * w - w / 2, yr = hh / 2 - (m.y + m.h) * hh;
        page.drawRectangle({ x: cx + xr * c - yr * s, y: cy + xr * s + yr * c, width: m.w * w, height: m.h * hh, ...(im.rotation ? { rotate: degrees(-im.rotation) } : {}),
          color: COLOR_RGB[h.couleur] || hexVersRgb(couleurHex(h.couleur)), opacity: 0.4, blendMode: BlendMode.Multiply });
      }
      bilan.surlignages += 1;
      continue;
    }
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
    const ep = epaisseurPx(t, W, H, surl ? EPAISSEUR_SURLIGNEUR : 0.0042); // (22/10) % de la largeur, ou de la hauteur avant
    // (20/10 soir) trait v4 : courbes Catmull-Rom (`rendu: 'cr'`) comme à l'écran ; forme redressée : segments droits
    const d = t.rendu === 'cr' ? cheminCatmull(t.points.map(([x, y]) => [(x * W) / 100, (y * H) / 100]), 100) : cheminPoints(t.points, W, H);
    page.drawSvgPath(d, {
      x: 0, y: H, borderColor: hexVersRgb(couleurHex(t.couleur)), borderWidth: Math.max(surl ? 2.5 : 0.6, ep),
      borderOpacity: Number.isFinite(t.opacite) ? t.opacite : (surl ? OPACITE_SURLIGNEUR : 1), borderLineCap: 1 /* rond */, ...(surl ? { blendMode: BlendMode.Multiply } : {}),
    });
    bilan.traits += 1;
  }

  /* (21/10) cadres des boîtes exportées (px de page, y vers le bas, et fractions) : les flèches rattachées à une boîte
     finissent à son bord */
  const geoBoite = (b, W, H) => {
    // (22/10) gabarit « carte » : marges 10 × 8 px de référence ; taille du texte en % de la largeur
    const carte = b.gabarit === 'carte', pad = Array.isArray(b.pad1000) ? (b.pad1000[0] / 1000) * W : carte ? 10 / ZOOM_REFERENCE : 4, tb = tailleDe(b, W, TAILLE_BOITE);
    const x = b.x * W;
    // (21/10) gabarit « un mot » : la largeur suit le texte jusqu'à 45 % de la page, comme à l'écran
    let w = Math.max(24, (b.gabarit === 'mot' || carte) && !b.largeurFixe ? 0.45 * W : b.width * W);
    const lignes = couperLignes(paragraphesDe(b.content).map(propre), font, tb, w - 2 * pad);
    // comme à l'écran : la boîte épouse sa ligne la plus longue (+ marge), sauf largeur fixée à la main
    if (!b.largeurFixe && lignes.some((l) => l.trim())) {
      const plusLongue = Math.max(...lignes.map((l) => font.widthOfTextAtSize(l, tb)));
      w = Math.max(24, Math.min(w, plusLongue + 2 * pad + 6));
    }
    const lh = tb * 1.35;
    // (25/10) boîte-tableau : la boîte a la hauteur de son tableau, comme à l'écran
    const tab = estGrille(b.grille) ? mesurerGrille(b, b.grille, b.x * W + pad, Math.max(24, b.width * W) - 2 * pad, tb, W) : null;
    if (tab) w = Math.max(24, b.width * W);
    // (25/10) image de la boîte : la largeur intérieure, hauteur proportionnelle, au-dessus ou en dessous du texte
    // (25/10) largeur choisie (fraction de la largeur intérieure, centrée) et recadrage : comme à l'écran (ImageBoite.jsx)
    const img = b.image && b.image.blobId ? (() => {
      const fr = largeurImage(b.image), rg = b.image.rognage && b.image.rognage.w > 0 && b.image.rognage.h > 0 ? b.image.rognage : null;
      const vw = (w - 2 * pad) * fr;
      return { w: vw, decal: ((w - 2 * pad) - vw) / 2, h: vw * (Number(b.image.ratio) > 0 ? Number(b.image.ratio) : 0.66) * (rg ? rg.h / rg.w : 1), rg, ecart: 0.45 * tb, dessous: b.image.position === 'dessous' };
    })() : null;
    const hImg = img ? img.h + img.ecart : 0;
    const hTexte = tab ? tab.hauteur : (img && !paragraphesDe(b.content).join('').trim() ? -img.ecart : Math.max(1, lignes.length) * lh);
    const h = tab || img ? 2 * pad + hTexte + hImg : Math.max(b.height * H, 2 * pad + Math.max(1, lignes.length) * lh);
    let top = H - b.y * H;
    if (top - h < 0) top = Math.min(H, h); // une boîte qui déborderait en bas remonte dans la page
    return { pad, x, w, h, top, lignes, lh, tb, tab, img };
  };
  /* (25/10) MISE EN PAGE D'UN TABLEAU (pdf/grille.js) — les règles de l'écran (pdfreader-v2.css, .btab) : colonnes en
     fractions de la largeur intérieure, marges de cellule .3 em × .45 em, interligne 1,35, hauteur de ligne = la plus
     haute de ses cellules (au moins `hauts`, px d'une page de 1000 px), fusions (une cellule = son étendue) */
  const mesurerGrille = (b, g, x0, wi, tb, W) => {
    const u = W / 1000, nl = g.lignes.length, nc = g.cols.length;
    const colX = [0]; g.cols.forEach((c, j) => colX.push(colX[j] + c * wi));
    const hauts = g.lignes.map((_, i) => (Array.isArray(g.hauts) && Number.isFinite(g.hauts[i]) ? g.hauts[i] * u : 0));
    const cellules = cellulesAffichees(g).map((c) => {
      const f = formatDe(g, c.i, c.j) || {};
      const ts = Number.isFinite(f.taille) ? f.taille * u : tb;
      const gras = !!(f.gras || b.gras || (g.entete && c.i === 0)), ital = !!(f.italique || b.italique);
      const pol = polices[(gras ? 'b' : '') + (ital ? 'i' : '')];
      const larg = colX[c.j + c.cs] - colX[c.j];
      const lignes = couperLignes(String(g.lignes[c.i][c.j] || '').split('\n').map(nettoyeur(pol)), pol, ts, Math.max(4, larg - 0.9 * ts));
      const hc = Math.max(1, lignes.length) * ts * 1.35 + 0.6 * ts;
      return { ...c, f, ts, pol, lignes, x: x0 + colX[c.j], w: larg, hc };
    });
    for (const c of cellules) if (c.rs === 1) hauts[c.i] = Math.max(hauts[c.i], c.hc);
    for (const c of cellules) if (c.rs > 1) { // une fusion verticale : la dernière ligne grandit s'il manque de la place
      const somme = hauts.slice(c.i, c.i + c.rs).reduce((a, v) => a + v, 0);
      if (somme < c.hc) hauts[c.i + c.rs - 1] += c.hc - somme;
    }
    const ligY = [0]; hauts.forEach((h, i) => ligY.push(ligY[i] + h));
    for (const c of cellules) { c.y = ligY[c.i]; c.h = ligY[c.i + c.rs] - ligY[c.i]; }
    return { cellules, hauteur: ligY[nl], ligY, colX, x0, wi, nl, nc, u };
  };
  /** dessine le tableau mesuré, haut du tableau à `haut` (points, repère pdf-lib) */
  const dessinerGrille = (page, b, g, t, haut, encre) => {
    const encreHex = b.couleurTexte ? hexVersRgb(couleurHex(b.couleurTexte, '#1F1F24')) : encre;
    // fonds : lignes alternées (la couleur du texte à 7 %), puis fond propre de chaque cellule
    if (g.alterne) for (const c of t.cellules) {
      if (g.entete && c.i === 0) continue;
      if ((c.i - (g.entete ? 1 : 0)) % 2 === 1) page.drawRectangle({ x: c.x, y: haut - c.y - c.h, width: c.w, height: c.h, color: encreHex, opacity: 0.07 });
    }
    for (const c of t.cellules) if (c.f.fond) page.drawRectangle({ x: c.x, y: haut - c.y - c.h, width: c.w, height: c.h, color: hexVersRgb(couleurHex(c.f.fond, '#ffffff')) });
    // texte : alignements horizontal et vertical
    for (const c of t.cellules) {
      const coul = c.f.couleur ? hexVersRgb(couleurHex(c.f.couleur, '#1F1F24')) : encreHex;
      const lh = c.ts * 1.35, hTexte = Math.max(1, c.lignes.length) * lh;
      const dv = c.f.alignV === 'milieu' ? (c.h - 0.6 * c.ts - hTexte) / 2 : c.f.alignV === 'bas' ? c.h - 0.6 * c.ts - hTexte : 0;
      const alignH = c.f.alignH || b.align || 'left';
      c.lignes.forEach((l, k) => {
        if (!l) return;
        const lw = c.pol.widthOfTextAtSize(l, c.ts), marge = 0.45 * c.ts;
        const x = alignH === 'center' ? c.x + (c.w - lw) / 2 : alignH === 'right' ? c.x + c.w - marge - lw : c.x + marge;
        page.drawText(l, { x, y: haut - c.y - 0.3 * c.ts - dv - k * lh - c.ts * 0.95, size: c.ts, font: c.pol, color: coul });
      });
    }
    // filets : intérieurs fins de la couleur du texte à 24 % (rendu d'avant), ou les bordures choisies
    const bd = g.bordures || { mode: 'interieures', couleur: null, ep: null };
    const ext = bd.mode === 'toutes' || bd.mode === 'exterieures', int = bd.mode === 'toutes' || bd.mode === 'interieures';
    const ep = Number.isFinite(bd.ep) ? bd.ep * t.u : K_PDF;
    const trait = { thickness: ep, color: bd.couleur ? hexVersRgb(couleurHex(bd.couleur, '#1F1F24')) : encreHex, opacity: bd.couleur ? 1 : 0.24 };
    const ligne = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: haut - y1 }, end: { x: x2, y: haut - y2 }, ...trait });
    if (int) for (const c of t.cellules) {
      if (c.i > 0) ligne(c.x, c.y, c.x + c.w, c.y);
      if (c.j > 0) ligne(c.x, c.y, c.x, c.y + c.h);
    }
    if (ext) { const x1 = t.x0, x2 = t.x0 + t.wi, y2 = t.hauteur; ligne(x1, 0, x2, 0); ligne(x1, y2, x2, y2); ligne(x1, 0, x1, y2); ligne(x2, 0, x2, y2); }
  };
  // (25/10) images des boîtes, intégrées une fois chacune
  const imagesBoites = new Map();
  for (const b of par.boite) {
    const id = b.image && b.image.blobId;
    if (!id || imagesBoites.has(id)) continue;
    try { const blob = await getBlob(id); if (blob) imagesBoites.set(id, await embarquerImage(outDoc, blob)); } catch (e) { /* image absente : la place reste */ }
  }
  const cadresBoites = new Map();
  for (const b of par.boite) {
    const page = pageDe(b.page);
    if (!page) continue;
    const { W, H } = dims(page);
    const g = geoBoite(b, W, H);
    cadresBoites.set(b.id, { page, px: { x: g.x, y: H - g.top, w: g.w, h: g.h }, fr: { x: g.x / W, y: (H - g.top) / H, w: g.w / W, h: g.h / H } });
  }

  /* 5 bis. FORMES (03/10 ; douze formes depuis le 02/10 soir) : LE MÊME tracé qu'à
        l'écran (pdf/formes.js#cheminForme), fond translucide si remplie, pointes
        pleines, étiquette de texte au centre. */
  bilan.formes = 0;
  for (const f of par.forme) {
    const page = pageDe(f.page);
    if (!page) { bilan.ignores += 1; continue; }
    const { W, H } = dims(page);
    const type = typeForme(f);
    const ep = Math.max(0.8, epaisseurPx(f, W, H, 0.0025));
    const coul = hexVersRgb(couleurHex(f.couleur, '#e5383b'));
    const origine = { x: f.x * W, y: H - f.y * H };
    if (estTrait(type)) {
      // (21/10) ligne / flèche / double flèche : le MÊME tracé qu'à l'écran (pdf/flechesGeo.js), points de contrôle compris
      // harmonisée : le trait et la pointe d'une flèche de boîte ; bouts rattachés (`attaches`) au bord de leur boîte
      const st = styleFleche(f.fleche, { pointes: pointesForme(type) }), harmo = harmonisee(f.fleche);
      const larg = f.fleche && Number.isFinite(f.fleche.ep1000) ? (f.fleche.ep1000 / 1000) * W : harmo ? 1.5 * K_PDF * st.epaisseur : ep * st.epaisseur, cf = st.couleur ? hexVersRgb(couleurHex(st.couleur, '#e5383b')) : coul;
      const cadres = {};
      for (const id of [f.attaches && f.attaches.debut, f.attaches && f.attaches.fin]) { const cb = id && cadresBoites.get(id); if (cb && cb.page === page) cadres[id] = cb.fr; }
      dessinerFlechePdf(page, sommetsForme(f, W, H, null, cadres), st, larg, geoPointe(f.fleche, larg, { contexte: 'forme', k: K_PDF }), cf, origine);
    } else {
      const { d, pointes } = cheminForme(type, f.width * W, f.height * H, { fx: !!f.fx, fy: !!f.fy, epaisseur: ep });
      page.drawSvgPath(d, { ...origine, borderColor: coul, borderWidth: ep, borderLineCap: 1,
        ...(f.remplie && estFermee(type) ? { color: coul, opacity: 0.18 } : {}) });
      pointes.forEach((pd) => page.drawSvgPath(pd, { ...origine, color: coul }));
    }
    if (f.texte && String(f.texte).trim()) {
      const taille = tailleDe(f, W, TAILLE_BOITE);
      const lignes = String(f.texte).split('\n').map(propre);
      const lh = taille * 1.25;
      const cx = (f.x + f.width / 2) * W;
      const cy = H - (f.y + f.height / 2) * H + (estTrait(type) ? lh : 0);
      lignes.forEach((l, i) => {
        const tw = font.widthOfTextAtSize(l, taille);
        page.drawText(l, { x: cx - tw / 2, y: cy + ((lignes.length - 1) / 2 - i) * lh - taille * 0.35, size: taille, font, color: hexVersRgb(couleurFoncee(f.couleur)) });
      });
    }
    bilan.formes += 1;
  }

  /* 6. TEXTES LIBRES : sans cadre, dans leur couleur */
  for (const t of par.texte) {
    const page = pageDe(t.page);
    const paras = paragraphesDe(t.content);
    if (!page || !paras.join('').trim()) { if (!page) bilan.ignores += 1; continue; }
    const { W, H } = dims(page);
    const largeurT = t.gabarit === 'mot' && !t.largeurFixe ? 0.45 * W : t.width * W; // (21/10) gabarit « un mot » : suit le texte
    const tt = tailleDe(t, W, TAILLE_TEXTE);
    const lignes = couperLignes(paras.map(propre), font, tt, Math.max(20, largeurT - 4));
    const lh = tt * 1.3;
    lignes.forEach((l, i) => { if (l) page.drawText(l, { x: t.x * W + 2, y: H - t.y * H - 2 - tt * 0.9 - i * lh, size: tt, font, color: hexVersRgb(couleurHex(t.couleur, '#1F1F24')) }); });
    if (reperes && reperes.has(t.id)) {
      // cadre du texte libre (sans bordure visible) : l'étendue RÉELLE de son texte — le repère reste
      // collé au texte, jamais sur la page autour
      const larg = Math.max(...lignes.map((l) => font.widthOfTextAtSize(l, tt)), 0);
      const top = H - t.y * H, w = Math.max(20, Math.min(largeurT, larg + 4)), h = 4 + Math.max(1, lignes.length) * lh;
      poserRepere(page, t.id, { x: t.x * W, top, w, h, lignes: lignes.map((l, i) => ({ x: t.x * W + 2, top: top - 2 - i * lh, w: font.widthOfTextAtSize(l, tt), h: lh, vide: !l.trim() })) });
    }
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
    const { pad, x, w, h, top, lignes, lh, tb } = geoBoite(b, W, H);
    const fond = hexVersRgb(couleurHex(b.couleur));
    const ancre = b.ancre && Number.isFinite(b.ancre.x) && Number.isFinite(b.ancre.y) ? { x: b.ancre.x * W, y: H - b.ancre.y * H } : null;
    const coulFleche = hexVersRgb(couleurFoncee(b.couleur)); // teinte foncée, même règle qu'à l'écran

    /* flèches d'abord (sous la boîte et les épingles) : LE calcul de l'écran (pdf/flechesGeo.js) — du BORD de la
       boîte, par ses points de contrôle, jusqu'au rond de la cible ; repère « écran » (y vers le bas) posé par
       drawSvgPath ; échelle 0,75 : trait de 1,5 pt comme avant */
    const cadre = { x, y: H - top, w, h };
    for (const c of connecteursDe(b)) {
      // (21/10) flèche harmonisée : la proportion de l'écran (1,5 px à 160 % = 1,5 / 1,6 pt), la couleur de la boîte,
      // un bout rattaché à une boîte (`boiteCible`) finit au bord de celle-ci ; flèches d'avant : leur rendu d'alors
      const harmo = harmonisee(c), kc = harmo ? K_PDF : 0.75;
      const cc = c.boiteCible && cadresBoites.get(c.boiteCible);
      const pts = sommetsConnecteur(cadre, c, W, H, kc, null, cc && cc.page === page ? cc.px : null);
      if (!pts) continue;
      const st = styleFleche(c), larg = Number.isFinite(c.ep1000) ? (c.ep1000 / 1000) * W : (harmo ? 1.5 * K_PDF : 1.5) * st.epaisseur;
      const defaut = harmo ? hexVersRgb(couleurHex(b.couleur)) : coulFleche;
      dessinerFlechePdf(page, pts, st, larg, geoPointe(c, larg, { k: kc }), st.couleur ? hexVersRgb(couleurHex(st.couleur, '#444444')) : defaut, { x: 0, y: H });
      bilan.fleches += 1;
    }
    // bouts des flèches supplémentaires : leur petit rond (plus bas), comme avant
    const autres = (b.fleches || []).filter((fl) => fl && Number.isFinite(fl.x) && Number.isFinite(fl.y)).map((fl) => ({ x: fl.x * W, y: H - fl.y * H }));
    // 09/10 : fond choisi par boîte (transparent / teinté / plein) ; sans `fond` : rendu d'avant
    const encreBoite = b.fond === 'plein' && (0.299 * fond.red + 0.587 * fond.green + 0.114 * fond.blue) < 0.5 ? rgb(1, 1, 1) : rgb(0.09, 0.09, 0.16);
    if (!b.fond) page.drawRectangle({ x, y: top - h, width: w, height: h, color: fond, opacity: opaciteFondBoite(b.couleur), borderColor: rgb(0, 0, 0), borderOpacity: 0.28, borderWidth: 0.8 });
    else page.drawRectangle({ x, y: top - h, width: w, height: h, ...(b.fond === 'transparent' ? {} : { color: fond, opacity: b.fond === 'teinte' ? 0.15 : 0.92 }), borderColor: fond, borderWidth: Number.isFinite(b.bord1000) && b.fond !== 'plein' ? (b.bord1000 / 1000) * W : 1 });
    const { tab, img } = geoBoite(b, W, H);
    // (25/10) image de la boîte : dessinée à sa place, le texte (ou le tableau) décalé d'autant
    let hautTexte = top - pad;
    if (img) {
      const yImg = img.dessous ? top - h + pad + img.h : top - pad;
      const emb = imagesBoites.get(b.image.blobId);
      const xi = x + pad + img.decal;
      if (emb && img.rg) {
        const fw = img.w / img.rg.w, fh = img.h / img.rg.h;
        page.pushOperators(pushGraphicsState(), rectangle(xi, yImg - img.h, img.w, img.h), clip(), endPath());
        page.drawImage(emb, { x: xi - img.rg.x * fw, y: yImg + img.rg.y * fh - fh, width: fw, height: fh });
        page.pushOperators(popGraphicsState());
      } else if (emb) page.drawImage(emb, { x: xi, y: yImg - img.h, width: img.w, height: img.h });
      if (!img.dessous) hautTexte = top - pad - img.h - img.ecart;
    }
    if (tab) dessinerGrille(page, b, b.grille, tab, hautTexte, encreBoite); // (25/10) boîte-tableau : le tableau tel qu'à l'écran
    else lignes.forEach((l, i) => { if (l) page.drawText(l, { x: x + pad, y: hautTexte - tb * 0.95 - i * lh, size: tb, font, color: encreBoite }); });
    if (reperes && reperes.has(b.id)) poserRepere(page, b.id, { x, top, w, h, lignes: lignes.map((l, i) => ({ x: x + pad, top: top - pad - i * lh, w: font.widthOfTextAtSize(l, tb), h: lh, vide: !l.trim() })) });
    if (ancre) page.drawCircle({ x: ancre.x, y: ancre.y, size: 3.5, color: rgb(1, 1, 1), borderColor: coulFleche, borderWidth: 1.8 });
    autres.forEach((a) => page.drawCircle({ x: a.x, y: a.y, size: 3, color: rgb(1, 1, 1), borderColor: coulFleche, borderWidth: 1.5 }));
    bilan.boites += 1;
  }

  if (reperes) {
    const toutes = outDoc.getPages();
    bilan.reperes = etiquettes.map((e) => ({ ...e, page: toutes.indexOf(e.pageObj), pageObj: undefined }));
  }
  const octets = await outDoc.save();
  return { octets, bilan };

  /** une flèche (sommets en px « écran » depuis `origine`) : trait, pointes — le même chemin qu'à l'écran */
  function dessinerFlechePdf(page, pts, st, larg, geo, couleur, origine) {
    const ch = cheminFleche(pts, st, larg, geo);
    if (!ch.d) return;
    page.drawSvgPath(ch.d, { ...origine, borderColor: couleur, borderWidth: larg, borderLineCap: 1, ...(ch.dash ? { borderDashArray: ch.dash.split(' ').map(Number) } : {}) });
    ch.tetes.forEach((t) => page.drawSvgPath(t.d, t.pleine ? { ...origine, color: couleur, ...(ch.contour > 0 ? { borderColor: couleur, borderWidth: ch.contour } : {}) } : { ...origine, borderColor: couleur, borderWidth: larg, borderLineCap: 1 }));
  }

  /* ÉTIQUETTE DE REPÈRE (export spécial IA) — règles :
     - TOUJOURS à l'intérieur du cadre de la boîte (jamais sur l'image du cours, jamais dehors) ;
     - coin haut droit par défaut, sinon le premier coin libre (bas droit, bas gauche, haut gauche),
       « libre » = ne recouvre aucune ligne de texte : la boîte n'est ni agrandie ni décalée ;
     - corps 10,5 → 8 (pas de 0,5) tant qu'aucun coin n'est libre ;
     - à défaut, en 8 au coin haut droit, en superposition sur le texte de la boîte (et seulement lui).
     Fond opaque sombre, texte blanc en Courier gras, liseré blanc fin : lisible sur toute couleur. */
  function poserRepere(page, id, cadre) {
    const ref = reperes.get(id);
    const m = 1; // retrait depuis le bord intérieur du cadre
    const rectsTexte = cadre.lignes.filter((l) => !l.vide).map((l) => ({ x0: l.x, x1: l.x + l.w, y1: l.top, y0: l.top - l.h }));
    const touche = (r) => rectsTexte.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
    const geom = (taille, coin) => {
      const lw = mono.widthOfTextAtSize(ref, taille) + 3, lh = taille * 0.78 + 3;
      const droite = coin === 'hd' || coin === 'bd', haut = coin === 'hd' || coin === 'hg';
      const x0 = droite ? cadre.x + cadre.w - m - lw : cadre.x + m;
      const y1 = haut ? cadre.top - m : cadre.top - cadre.h + m + lh;
      return { x0, x1: x0 + lw, y0: y1 - lh, y1, lw, lh, taille };
    };
    const dedans = (r) => r.x0 >= cadre.x + 0.5 && r.x1 <= cadre.x + cadre.w - 0.5 && r.y0 >= cadre.top - cadre.h + 0.5 && r.y1 <= cadre.top - 0.5;
    let choix = null;
    for (let taille = 10.5; taille >= 8 && !choix; taille -= 0.5) {
      for (const coin of ['hd', 'bd', 'bg', 'hg']) {
        const r = geom(taille, coin);
        if (dedans(r) && !touche(r)) { choix = { ...r, coin, mode: 'marge' }; break; }
      }
    }
    if (!choix) {
      // superposition sur le texte de la boîte : au plus petit corps qui tient dans le cadre (8, ou moins
      // si la boîte est plus étroite que l'étiquette — elle reste à l'intérieur)
      // coin qui masque le MOINS de texte (haut droit à égalité)
      const masque = (r) => rectsTexte.reduce((n, t) => n + Math.max(0, Math.min(r.x1, t.x1) - Math.max(r.x0, t.x0)) * Math.max(0, Math.min(r.y1, t.y1) - Math.max(r.y0, t.y0)), 0);
      let taille = 8, r = geom(taille, 'hd');
      while (!dedans(r) && taille > 5) { taille -= 0.5; r = geom(taille, 'hd'); }
      let coin = 'hd', meilleur = masque(r);
      for (const c of ['bd', 'bg', 'hg']) { const r2 = geom(taille, c); const m2 = masque(r2); if (dedans(r2) && m2 < meilleur - 0.01) { r = r2; coin = c; meilleur = m2; } }
      choix = { ...r, coin, mode: 'superpose' };
    }
    page.drawRectangle({ x: choix.x0, y: choix.y0, width: choix.lw, height: choix.lh, color: rgb(0.11, 0.11, 0.14), borderColor: rgb(1, 1, 1), borderWidth: 0.5 });
    page.drawText(ref, { x: choix.x0 + 1.5, y: choix.y0 + 1.5 + choix.taille * 0.02, size: choix.taille, font: mono, color: rgb(1, 1, 1) });
    etiquettes.push({ id, ref, pageObj: page, taille: choix.taille, coin: choix.coin, mode: choix.mode,
      x: choix.x0, y: choix.y0, w: choix.lw, h: choix.lh, cadre: { x: cadre.x, y: cadre.top - cadre.h, w: cadre.w, h: cadre.h } });
  }
}

/** Raccourci pour le lecteur : lit le blob du PDF (lecture seule) et exporte. */
export async function exporterDepuisBlob(pdfId, highlights, annotations, options = {}) {
  const blob = await getBlob(pdfId);
  if (!blob) throw new Error('PDF introuvable sur cet appareil.');
  // arrayBuffer() rend une COPIE : pdf-lib travaille dessus, le blob ne bouge pas
  return exporterPdfAnnote(await blob.arrayBuffer(), highlights, annotations, options);
}
