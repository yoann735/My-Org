/* ============================================================
   MedRevise — FORMES PRÊTES À POSER (02/10 soir).

   « Ma solution pour dessiner vite sans tablette » : on choisit une forme, on la
   pose d'un clic ou on l'étire d'un glisser, nette et instantanée. Puis on peut la
   déplacer, la redimensionner, la gommer, lui ajouter un texte ou une légende.

   STOCKAGE — inchangé dans son principe : un enregistrement `kind: 'forme'` du
   store `annotations` (même canal, même synchro), boîte englobante en fractions de
   page { x, y, width, height }. Champs ajoutés, tous FACULTATIFS (une forme d'avant
   le 02/10 soir n'a que `forme: 'rectangle'` et reste un rectangle) :
     - forme   : l'un des TYPES_FORMES ci-dessous ;
     - fx, fy  : retournements. Pour un trait (ligne, flèche), ils disent dans quel
                 coin de la boîte il COMMENCE (fx : à droite, fy : en bas) — la
                 pointe est à l'autre bout. Pour l'accolade, le crochet et le
                 triangle : le côté vers lequel ils s'ouvrent / pointent ;
     - remplie : fond translucide de la couleur du trait ;
     - texte   : une courte étiquette écrite au centre de la forme.
   Un ancien client qui lirait une nouvelle forme l'afficherait en rectangle (son
   seul dessin) : rien n'est perdu, les champs voyagent tels quels.

   GÉOMÉTRIE — tous les tracés sont calculés en PIXELS de la boîte (w × h) : le
   trait garde la même épaisseur quel que soit le rapport largeur/hauteur, et la
   pointe d'une flèche n'est jamais déformée. Uniquement des M/L/Q/C/Z : le même
   chemin sert à l'écran (SVG) et à l'export PDF (pdf-lib drawSvgPath).
   ============================================================ */

export const TYPES_FORMES = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'arrondi', label: 'Rectangle arrondi' },
  { id: 'ellipse', label: 'Cercle / ellipse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'losange', label: 'Losange' },
  { id: 'etoile', label: 'Étoile' },
  { id: 'ligne', label: 'Ligne' },
  { id: 'fleche', label: 'Flèche' },
  { id: 'double', label: 'Double flèche' },
  { id: 'accolade', label: 'Accolade' },
  { id: 'crochet', label: 'Crochet' },
  { id: 'croix', label: 'Croix' },
];
const IDS = new Set(TYPES_FORMES.map((t) => t.id));
const TRAITS = new Set(['ligne', 'fleche', 'double']);
const FERMEES = new Set(['rectangle', 'arrondi', 'ellipse', 'triangle', 'losange', 'etoile']);

/** type d'une forme enregistrée (une forme d'avant = rectangle). */
export const typeForme = (f) => (f && IDS.has(f.forme) ? f.forme : 'rectangle');
/** ligne, flèche, double flèche : définies par deux extrémités, pas par un cadre. */
export const estTrait = (t) => TRAITS.has(t);
/** forme fermée : on peut la remplir. */
export const estFermee = (t) => FERMEES.has(t);

const n = (v) => (Math.round(v * 100) / 100).toString();

/** les deux extrémités d'un trait, en pixels de la boîte : [départ, arrivée]. */
export function extremites(w, h, fx, fy) {
  return [{ x: fx ? w : 0, y: fy ? h : 0 }, { x: fx ? 0 : w, y: fy ? 0 : h }];
}

/** pointe pleine au point `b`, venant de `a`. */
function pointe(a, b, taille) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  const bx = b.x - ux * taille, by = b.y - uy * taille, l = taille * 0.55;
  return `M${n(b.x)} ${n(b.y)} L${n(bx - uy * l)} ${n(by + ux * l)} L${n(bx + uy * l)} ${n(by - ux * l)} Z`;
}

/**
 * Le dessin d'une forme dans une boîte de w × h pixels.
 * @returns {{ d: string, pointes: string[], fermee: boolean }}
 *   d : le trait ; pointes : triangles pleins (flèches), à remplir de la couleur.
 */
export function cheminForme(type, w, h, { fx = false, fy = false, epaisseur = 2, tete: teteImposee = null } = {}) {
  const W = Math.max(0, w), H = Math.max(0, h);
  const mx = (x) => (fx ? W - x : x); // miroir horizontal
  const my = (y) => (fy ? H - y : y); // miroir vertical
  const P = (x, y) => `${n(x)} ${n(y)}`;
  const tete = teteImposee || Math.max(9, epaisseur * 4.2);
  switch (type) {
    case 'ligne':
    case 'fleche':
    case 'double': {
      const [a, b] = extremites(W, H, fx, fy);
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
      const recul = tete * 0.8; // le trait s'arrête sous la pointe : bout net
      const fin = type === 'ligne' ? b : { x: b.x - ux * recul, y: b.y - uy * recul };
      const debut = type === 'double' ? { x: a.x + ux * recul, y: a.y + uy * recul } : a;
      const pointes = type === 'ligne' ? [] : type === 'fleche' ? [pointe(a, b, tete)] : [pointe(a, b, tete), pointe(b, a, tete)];
      return { d: `M${P(debut.x, debut.y)} L${P(fin.x, fin.y)}`, pointes, fermee: false };
    }
    case 'ellipse': {
      const k = 0.5523, rx = W / 2, ry = H / 2, cx = rx, cy = ry;
      return {
        d: `M${P(cx + rx, cy)} C${P(cx + rx, cy + ry * k)} ${P(cx + rx * k, cy + ry)} ${P(cx, cy + ry)} `
          + `C${P(cx - rx * k, cy + ry)} ${P(cx - rx, cy + ry * k)} ${P(cx - rx, cy)} `
          + `C${P(cx - rx, cy - ry * k)} ${P(cx - rx * k, cy - ry)} ${P(cx, cy - ry)} `
          + `C${P(cx + rx * k, cy - ry)} ${P(cx + rx, cy - ry * k)} ${P(cx + rx, cy)} Z`,
        pointes: [], fermee: true,
      };
    }
    case 'arrondi': {
      const r = Math.min(W, H) * 0.2;
      return {
        d: `M${P(r, 0)} L${P(W - r, 0)} Q${P(W, 0)} ${P(W, r)} L${P(W, H - r)} Q${P(W, H)} ${P(W - r, H)} `
          + `L${P(r, H)} Q${P(0, H)} ${P(0, H - r)} L${P(0, r)} Q${P(0, 0)} ${P(r, 0)} Z`,
        pointes: [], fermee: true,
      };
    }
    case 'triangle': // pointe en haut ; fy : pointe en bas
      return { d: `M${P(W / 2, my(0))} L${P(W, my(H))} L${P(0, my(H))} Z`, pointes: [], fermee: true };
    case 'losange':
      return { d: `M${P(W / 2, 0)} L${P(W, H / 2)} L${P(W / 2, H)} L${P(0, H / 2)} Z`, pointes: [], fermee: true };
    case 'etoile': {
      const cx = W / 2, cy = H / 2, pts = [];
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.42 : 1;
        pts.push(P(cx + Math.cos(ang) * r * W / 2, cy + Math.sin(ang) * r * H / 2 * 1.05 + H * 0.03));
      }
      return { d: `M${pts.join(' L')} Z`, pointes: [], fermee: true };
    }
    case 'accolade': {
      // verticale si la boîte est plus haute que large : « { » ouverte vers la droite
      // (fx : vers la gauche) ; sinon horizontale « ︷ » ouverte vers le bas (fy : le haut)
      if (H >= W) {
        const q = Math.min(W / 2, H / 6), xm = W / 2;
        const X = (x) => mx(W - x); // pointe à gauche par défaut
        return {
          d: `M${P(X(0), 0)} Q${P(X(xm), 0)} ${P(X(xm), q)} L${P(X(xm), H / 2 - q)} Q${P(X(xm), H / 2)} ${P(X(W), H / 2)} `
            + `Q${P(X(xm), H / 2)} ${P(X(xm), H / 2 + q)} L${P(X(xm), H - q)} Q${P(X(xm), H)} ${P(X(0), H)}`,
          pointes: [], fermee: false,
        };
      }
      const q = Math.min(H / 2, W / 6), ym = H / 2;
      const Y = (y) => my(H - y); // pointe en haut par défaut
      return {
        d: `M${P(0, Y(0))} Q${P(0, Y(ym))} ${P(q, Y(ym))} L${P(W / 2 - q, Y(ym))} Q${P(W / 2, Y(ym))} ${P(W / 2, Y(H))} `
          + `Q${P(W / 2, Y(ym))} ${P(W / 2 + q, Y(ym))} L${P(W - q, Y(ym))} Q${P(W, Y(ym))} ${P(W, Y(0))}`,
        pointes: [], fermee: false,
      };
    }
    case 'crochet': {
      if (H >= W) { const X = (x) => mx(W - x); return { d: `M${P(X(0), 0)} L${P(X(W), 0)} L${P(X(W), H)} L${P(X(0), H)}`, pointes: [], fermee: false }; }
      const Y = (y) => my(H - y);
      return { d: `M${P(0, Y(0))} L${P(0, Y(H))} L${P(W, Y(H))} L${P(W, Y(0))}`, pointes: [], fermee: false };
    }
    case 'croix':
      return { d: `M${P(0, 0)} L${P(W, H)} M${P(W, 0)} L${P(0, H)}`, pointes: [], fermee: false };
    case 'rectangle':
    default:
      return { d: `M${P(0, 0)} L${P(W, 0)} L${P(W, H)} L${P(0, H)} Z`, pointes: [], fermee: true };
  }
}

/** point d'accroche d'une légende (fractions de page) : le milieu d'un trait, sinon
    le milieu du côté de la forme qui fait face à la boîte. */
export function ancreSurForme(f, boite) {
  const t = typeForme(f);
  if (estTrait(t)) return { x: f.x + f.width / 2, y: f.y + f.height / 2, texte: null };
  const aDroite = boite ? boite.x > f.x + f.width / 2 : true;
  return { x: aDroite ? f.x + f.width : f.x, y: f.y + f.height / 2, texte: null };
}

/** taille d'une forme posée d'un simple clic (fractions de page), selon le
    rapport largeur/hauteur de la page : un cercle posé est un vrai cercle. */
export function tailleParDefaut(type, ratioPage /* largeur / hauteur en px */) {
  if (estTrait(type)) return { width: 0.2, height: 0 };
  const w = type === 'accolade' || type === 'crochet' ? 0.05 : 0.16;
  const h = type === 'accolade' || type === 'crochet' ? 0.12 * ratioPage : type === 'rectangle' || type === 'arrondi' ? 0.1 * ratioPage : 0.16 * ratioPage;
  return { width: w, height: h };
}
