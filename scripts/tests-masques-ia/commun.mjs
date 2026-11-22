// Banc « masques d'une flashcard image produits par une IA » (22/11/2026, docs/compte-rendu-masques-ia.md).
// DONNÉES DE TEST UNIQUEMENT, jamais le vrai cloud.
//   Vite :5302 (config « medrevise-banc » de .claude/launch.json, SANS cloud : VITE_SUPABASE_URL vide) ;
//   Chrome headless aux profils NEUFS : 9345 ordinateur 1440×900 (souris), 9346 téléphone 390×844 (tactile),
//   9347 tablette iPad 820×1180 (tactile). Outils CDP du banc du mode file d'attente (../tests-file-attente/commun.mjs).
// IMAGE DE TEST : la fiche tibia/fibula (page 2 de ~/Downloads/TP_osteo_membre_inferieur_bassin.pdf) vient d'un manuel —
// elle est rendue et gardée HORS du dépôt (dossier $TRAVAIL, par défaut le scratchpad de la session), jamais commitée.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appareil as appareilFA, dormir } from '../tests-file-attente/commun.mjs';

export { dormir };
export const BASE = process.env.BASE || 'http://localhost:5302';
export const PDF_TEST = process.env.PDF_TEST || path.join(os.homedir(), 'Downloads/TP_osteo_membre_inferieur_bassin.pdf');
export const PAGE_TEST = 2;
export const TRAVAIL = process.env.TRAVAIL || path.join(os.tmpdir(), 'banc-masques-ia');
fs.mkdirSync(TRAVAIL, { recursive: true });
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/masques-ia/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });

const UA = {
  iphone: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', platform: 'iPhone' },
  ipad: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', platform: 'MacIntel' },
};

/** `profil` : 'ordi' (1440×900 souris), 'tablette' (iPad 820×1180 tactile), 'tel' (iPhone 390×844 tactile) */
export async function appareil(profil) {
  const b = await appareilFA(profil, BASE);
  if (profil === 'tel') await b.send('Emulation.setUserAgentOverride', UA.iphone);
  if (profil === 'tablette') await b.send('Emulation.setUserAgentOverride', UA.ipad);
  b.profil = profil;
  // captures publiables : jamais l'image du manuel en clair → seulement si CAPTURES=1 (dossier de travail, hors dépôt)
  b.capture = async (nom, dossier = TRAVAIL) => { await b.send('Page.bringToFront'); const s = await b.send('Page.captureScreenshot', { format: 'png' }); const f = path.join(dossier, nom + '-' + profil + '.png'); fs.writeFileSync(f, Buffer.from(s.result.data, 'base64')); return f; };
  b.S = (corps) => b.ev(`(async () => { const S = await import('/src/medrevise/lib/storage.js'); ${corps} })()`);
  b.empreinte = () => b.S(`const stores = ['fiches', 'questions', 'annotations', 'blobs'];
    const out = {}; for (const s of stores) { try { out[s] = JSON.stringify(await S.getAll(s)); } catch (e) { out[s] = 'absent'; } } return out;`);
  return b;
}

/** rend la page de test en PNG (échelle `k`) dans la page du navigateur → { png (Buffer), W, H } */
export async function rendrePage(b, k = 2) {
  const b64 = fs.readFileSync(PDF_TEST).toString('base64');
  const r = await b.ev(`(async () => {
    const { openPdf } = await import('/src/medrevise/pdf/pdfjsSetup.js');
    const bin = atob(${JSON.stringify(b64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const doc = await openPdf(a); const p = await doc.getPage(${PAGE_TEST}); const vp = p.getViewport({ scale: ${k} });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await p.render({ canvasContext: g, viewport: vp }).promise;
    const t = await p.getTextContent();
    const items = t.items.filter((i) => i.str.trim()).map((i) => { const [x, y] = vp.convertToViewportPoint(i.transform[4], i.transform[5]); const h = Math.hypot(i.transform[2], i.transform[3]) * ${k}; return { t: i.str, x: x / c.width, y: (y - h * 0.82) / c.height, w: i.width * ${k} / c.width, h: h / c.height }; });
    return { png: c.toDataURL('image/png').split(',')[1], W: c.width, H: c.height, items };
  })()`);
  return { png: Buffer.from(r.png, 'base64'), W: r.W, H: r.H, items: r.items };
}

/* FICHE DE DÉMONSTRATION (dessinée dans la page, publiable) : deux « vues » d'un os stylisé, titres, repères d'orientation,
   étiquettes sur une ou plusieurs lignes, même étiquette dans les deux vues. → { png64, W, H, etiquettes: [{ label, x, y, w, h }],
   titres: [...] } en fractions de l'image (boîtes mesurées au pixel près sur le texte dessiné). */
export async function ficheDemo(b) {
  return b.ev(`(async () => {
    const W = 1100, H = 1300; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const os = (cx) => { g.fillStyle = '#e8dcc0'; g.strokeStyle = '#a89470'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 70, 260); g.quadraticCurveTo(cx, 220, cx + 70, 260); g.lineTo(cx + 34, 330); g.lineTo(cx + 26, 900); g.lineTo(cx + 70, 980); g.quadraticCurveTo(cx, 1010, cx - 70, 980); g.lineTo(cx - 26, 900); g.lineTo(cx - 34, 330); g.closePath(); g.fill(); g.stroke(); };
    os(300); os(800);
    const et = [], ti = [];
    const ecrire = (lignes, x, y, taille, liste, gras, couleur) => {
      g.font = (gras ? 'bold ' : '') + taille + 'px Arial'; g.fillStyle = couleur || '#1b1b1b'; g.textBaseline = 'alphabetic';
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      lignes.forEach((l, i) => { const yy = y + i * taille * 1.3; g.fillText(l, x, yy); const m = g.measureText(l);
        x0 = Math.min(x0, x - m.actualBoundingBoxLeft); x1 = Math.max(x1, x + m.actualBoundingBoxRight); y0 = Math.min(y0, yy - m.actualBoundingBoxAscent); y1 = Math.max(y1, yy + m.actualBoundingBoxDescent); });
      liste.push({ label: lignes.join(' '), x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H });
      return { x0, y0, x1, y1 };
    };
    const rappel = (b, versX, versY) => { g.strokeStyle = '#444'; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath(); const gx = versX > b.x1 ? b.x1 + 8 : b.x0 - 8; g.moveTo(gx, (b.y0 + b.y1) / 2); g.lineTo(versX, versY); g.stroke(); g.setLineDash([]); };
    ecrire(['Schéma de démonstration'], 330, 90, 40, ti, false, '#1d3557');
    ecrire(['Vue antérieure'], 230, 190, 22, ti, true); ecrire(['Vue postérieure'], 720, 190, 22, ti, true);
    // vue antérieure (os centré en x = 300)
    rappel(ecrire(['Tubercule de Gerdy'], 20, 290, 22, et), 250, 285);
    rappel(ecrire(['Face latérale'], 60, 520, 22, et), 275, 515);
    rappel(ecrire(['Diaphyse'], 90, 640, 22, et), 278, 635);
    rappel(ecrire(['Surface articulaire', 'de la malléole'], 30, 930, 22, et), 255, 950);
    rappel(ecrire(['Crête tibiale'], 400, 560, 22, et), 322, 555);
    rappel(ecrire(['Malléole interne'], 390, 1000, 22, et), 345, 980);
    // vue postérieure (os centré en x = 800)
    rappel(ecrire(['Gaines tibiales', 'pour les', 'ligaments croisés'], 560, 250, 22, et), 760, 300);
    rappel(ecrire(['Face latérale'], 900, 520, 22, et), 826, 515);
    rappel(ecrire(['Diaphyse'], 630, 640, 22, et), 776, 635);
    rappel(ecrire(['Gouttière des', 'tendons fléchisseurs', 'communs et tibial'], 520, 820, 22, et), 774, 850);
    rappel(ecrire(['Malléole interne'], 560, 1035, 22, et), 760, 990);
    rappel(ecrire(['Col de la fibula'], 900, 320, 22, et), 834, 315);
    // repères d'orientation
    ecrire(['Crânial'], 250, 1150, 20, ti); ecrire(['Médial'], 150, 1210, 20, ti); ecrire(['Crânial'], 750, 1150, 20, ti); ecrire(['Médial'], 650, 1210, 20, ti);
    g.strokeStyle = '#333'; g.lineWidth = 2; for (const ox of [280, 780]) { g.beginPath(); g.moveTo(ox, 1200); g.lineTo(ox, 1165); g.lineTo(ox - 8, 1175); g.moveTo(ox, 1165); g.lineTo(ox + 8, 1175); g.moveTo(ox, 1200); g.lineTo(ox - 60, 1200); g.stroke(); }
    return { png64: c.toDataURL('image/png').split(',')[1], W, H, etiquettes: et, titres: ti };
  })()`);
}

/** réponse d'IA simulée pour la fiche de démo : les vraies boîtes, DÉCALÉES (une IA imprécise), une étiquette inventée */
export function reponseDemo(demo, { decalage = 0.012, inventee = true } = {}) {
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const masques = demo.etiquettes.map((e) => ({ label: e.label, x: r3(e.x - 0.006 + rnd() * decalage), y: r3(e.y - 0.004 + rnd() * decalage), w: r3(e.w + 0.012), h: r3(e.h + 0.008) }));
  if (inventee) masques.push({ label: 'Tubérosité inventée', x: 0.40, y: 0.30, w: 0.2, h: 0.08 }); // n'existe pas : « à vérifier »
  return { format: 'medrevise-masques', version: 1, masques };
}
