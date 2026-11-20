// « Enregistrer en PNG » d'un dessin : 3 fonds, fichier correct (transparence, tout le dessin, ×3, texte compris),
// feuille de partage (iPhone, iPad mini) ou téléchargement (ordinateur), aucune donnée modifiée, l'envoi vers un
// cours marche toujours, outils de dessin intacts.   node t-png.mjs tel|ipad|ordi-etroit
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appareil, semer, dormir, DOSSIER_IMG } from './commun.mjs';

const profil = process.argv[2] || 'tel';
const b = await appareil(profil);
const DL = fileURLToPath(new URL('./resultats/telechargements-' + profil + '/', import.meta.url));
fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
await b.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

const ORANGE = '#f5a524', TEAL = '#2dd4bf', ROUGE = '#e5484d';
const DESSIN = { cam: { x: 20, y: 120, z: 0.8 }, elements: [
  { id: 'png-t1', type: 'trait', rendu: 'cr', ep: 7, couleur: TEAL, opacite: 1, points: Array.from({ length: 30 }, (_, i) => [i * 14, 40 + Math.sin(i / 3) * 30]) },
  { id: 'png-t2', type: 'trait', rendu: 'cr', ep: 7, couleur: '#F2F2F5', opacite: 1, points: Array.from({ length: 20 }, (_, i) => [20 + i * 18, 300 + i * 4]) },
  { id: 'png-f1', type: 'forme', forme: 'rectangle', x: 30, y: 140, w: 170, h: 100, couleur: ROUGE, ep: 4 },
  { id: 'png-z1', type: 'texte', x: 230, y: 150, taille: 28, largeur: 190, texte: 'Néphron distal', couleur: ORANGE, gras: true },
] };

await b.vider(); await b.ouvrir();
await semer(b, [{ id: 'png-c1', matiereId: 'pr-mat', titre: 'Néphrologie : le rein', type: 'standard', ordre: 0, htmlId: null, pdfId: null, docNotes: true },
  { id: 'png-c2', matiereId: 'pr-mat', titre: 'Cardiologie', type: 'standard', ordre: 1, docNotes: true }]);
// une fiche « cible » doit avoir un pdfId ou un htmlId (EcranDessin) : un PDF minuscule
await b.S(`const f = await S.getOne('fiches', 'png-c1'); f.pdfId = await S.putBlob(new Blob(['%PDF-1.4'], { type: 'application/pdf' })); await S.put('fiches', f); return 1;`);
await b.ev(`(localStorage.setItem('medrevise.dessinMobile', ${JSON.stringify(JSON.stringify(DESSIN))}), 1)`);
await b.ouvrir();
b.ok(await b.ev(`!!document.querySelector('.mrm-cta-dessin')`), 'shell du téléphone : carte « Dessin » présente');
await b.clic(`document.querySelector('.mrm-cta-dessin')`, 1200);
b.ok(await b.attendre(`!!document.querySelector('.md-surface')`, 5000), 'écran Dessin ouvert');
await dormir(600);
b.ok(await b.ev(`document.querySelectorAll('.md-surface g[data-id]').length === 3 && document.querySelectorAll('.md-zone[data-id]').length === 1`), 'dessin de test chargé (2 traits, 1 forme, 1 zone de texte)');

// ---- outils de dessin : un trait au doigt / à la souris (non-régression) ----
const surf = await b.ev(`(() => { const r = document.querySelector('.md-surface').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const nAvant = await b.ev(`JSON.parse(localStorage.getItem('medrevise.dessinMobile')).elements.length`);
await b.glisser(Array.from({ length: 14 }, (_, i) => [surf.x + surf.w * 0.25 + i * 12, surf.y + surf.h * 0.72 + Math.sin(i / 2) * 18]));
await dormir(700);
const nApres = await b.ev(`JSON.parse(localStorage.getItem('medrevise.dessinMobile')).elements.length`);
b.ok(nApres === nAvant + 1, 'outil crayon : un nouveau trait tracé et gardé', `${nAvant} → ${nApres}`);
await b.capture('dessin');

// ---- capture des fichiers remis : partage (stub de navigator.share, la vraie feuille du système n'existe pas en
//      Chrome headless) ou téléchargement réel (dossier du banc) ----
await b.ev(`(() => { window.__partages = []; window.__refusPartage = 0;
  const share = async (d) => { if (window.__refusPartage > 0) { window.__refusPartage--; const e = new Error('geste'); e.name = 'NotAllowedError'; throw e; } window.__partages.push(d); };
  Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: share });
  Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: (d) => !!(d && d.files && d.files.length) });
  const c = URL.createObjectURL; window.__blobs = []; URL.createObjectURL = (o) => { if (o && o.type === 'image/png') window.__blobs.push(o); return c.call(URL, o); };
  return 1; })()`);
const partage = profil !== 'ordi-etroit';
const analyser = (expr) => b.ev(`(async () => { const blob = ${expr}; if (!blob) return null; const bm = await createImageBitmap(blob);
  const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; const g = cv.getContext('2d'); g.drawImage(bm, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data; const W = cv.width, H = cv.height;
  const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  const coin = px(1, 1); const pres = (c, hex, t = 40) => { const n = parseInt(hex.slice(1), 16); return c[3] > 200 && Math.abs(c[0] - (n >> 16)) < t && Math.abs(c[1] - ((n >> 8) & 255)) < t && Math.abs(c[2] - (n & 255)) < t; };
  let x0 = W, y0 = H, x1 = -1, y1 = -1, orange = 0, teal = 0, rouge = 0, fonce = 0, clair = 0, transp = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = px(x, y);
    const fond = Math.abs(c[0] - coin[0]) < 8 && Math.abs(c[1] - coin[1]) < 8 && Math.abs(c[2] - coin[2]) < 8 && Math.abs(c[3] - coin[3]) < 8;
    if (c[3] === 0) transp++;
    if (!fond) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (pres(c, '${ORANGE}')) orange++; if (pres(c, '${TEAL}')) teal++; if (pres(c, '${ROUGE}')) rouge++; if (pres(c, '#1f1f24', 12)) fonce++; if (pres(c, '#f2f2f5', 12)) clair++; }
  return { W, H, coin, x0, y0, x1, y1, orange, teal, rouge, fonce, clair, transp, octets: blob.size, type: blob.type }; })()`);

await b.clicFixe(`document.querySelector('.md-haut [aria-label="Exporter"]')`, 700);
b.ok(await b.ev(`!!document.querySelector('.mde-feuille [data-act="png"]')`), 'menu Exporter : option « Enregistrer en PNG »');
b.ok(await b.ev(`/Enregistrer en PNG/.test(document.querySelector('[data-act="png"]').innerText) && !!document.querySelector('[data-act="png"]').title`), 'bouton libellé et infobulle', await b.ev(`document.querySelector('[data-act="png"]').title`));
await b.capture('feuille-export');
// sans fiche choisie : « sans-cours » ; avec la fiche choisie (celle de l'ordi par défaut) : son nom
b.ok(await b.ev(`(async () => { const M = await __imp('/src/medrevise/mobile/exportPng.js'); return M.nomFichierPng('') ; })()`) === `dessin-sans-cours-${new Date().toISOString().slice(0, 10)}.png`, 'aucune fiche choisie : dessin-sans-cours-<date>.png');
await b.clicFixe(`[...document.querySelectorAll('.mde-cible')].find((x) => /Néphrologie/.test(x.innerText))`, 300);
const empreinteAvant = await b.empreinte();

const resultats = {};
for (const fond of ['transparent', 'blanc', 'noir']) {
  await b.clicFixe(`[...document.querySelectorAll('.mde-fond-choix button')].find((x) => x.innerText.trim().toLowerCase() === '${fond}')`, 300);
  const nP = await b.ev(`window.__partages.length`), nB = await b.ev(`window.__blobs.length`);
  await b.clicFixe(`document.querySelector('[data-act="png"]')`, 300);
  await b.attendre(`!!document.querySelector('[data-png-statut]')`, 8000);
  const info = await b.ev(`window.__dernierExportPng`);
  const statut = await b.ev(`document.querySelector('[data-png-statut]').dataset.pngStatut`);
  let a;
  if (partage) {
    const f = await b.ev(`(() => { const d = window.__partages[${nP}]; return d ? { n: d.files.length, nom: d.files[0].name, type: d.files[0].type } : null; })()`);
    b.ok(statut === 'partage' && f && f.n === 1 && f.type === 'image/png', `fond ${fond} : feuille de partage ouverte avec un fichier PNG`, JSON.stringify(f));
    b.ok(f && /^dessin-nephrologie-le-rein-\d{4}-\d\d-\d\d\.png$/.test(f.nom), `fond ${fond} : nom « dessin-<cours>-<date>.png »`, f && f.nom);
    a = await analyser(`window.__partages[${nP}].files[0]`);
  } else {
    b.ok(statut === 'telechargement' && (await b.ev(`window.__blobs.length`)) === nB + 1, `fond ${fond} : téléchargement (pas de feuille de partage sur ordinateur)`, statut);
    a = await analyser(`window.__blobs[${nB}]`);
  }
  resultats[fond] = { info, a };
  b.ok(info.echelle >= 2 && Math.abs(a.W - Math.round(info.w * info.echelle)) <= 1, `fond ${fond} : haute résolution ×${info.echelle.toFixed(2)} (${a.W}×${a.H} px pour un dessin de ${info.w}×${info.h})`);
  const k = info.echelle, mg = [a.x0, a.y0, a.W - 1 - a.x1, a.H - 1 - a.y1].map((v) => v / k);
  b.ok(mg.every((v) => v >= 10 && v <= 30), `fond ${fond} : cadré sur le contenu, petite marge sur les 4 côtés, rien de coupé`, mg.map((v) => v.toFixed(1)).join(' / ') + ' px');
  b.ok(a.teal > 200 && a.rouge > 200, `fond ${fond} : traits et forme présents`, `teal ${a.teal}, rouge ${a.rouge}`);
  b.ok(a.orange > 150 && info.mots >= 2, `fond ${fond} : zone de texte peinte dans l’image (« Néphron distal »)`, `${a.orange} px orange, ${info.mots} mots`);
  if (fond === 'transparent') b.ok(a.coin[3] === 0 && a.transp > a.W * a.H * 0.6, 'transparent : fond réellement transparent (alpha 0)', `${Math.round(100 * a.transp / (a.W * a.H))} % de pixels transparents`);
  if (fond === 'blanc') b.ok(a.coin.join() === '255,255,255,255' && a.transp === 0, 'blanc : fond blanc opaque', a.coin.join());
  if (fond === 'noir') b.ok(a.coin.join() === '17,17,20,255' && a.transp === 0, 'noir : fond noir opaque (#111114)', a.coin.join());
  b.ok(fond === 'noir' ? a.clair > 100 && a.fonce < 20 : a.fonce > 100, `fond ${fond} : le trait « blanc » suit la règle de l’export vers un cours (${fond === 'noir' ? 'clair sur noir' : 'foncé'})`, `foncé ${a.fonce}, clair ${a.clair}`);
}
// fichier téléchargé réellement (ordinateur) : nom et contenu
if (!partage) {
  await dormir(1500);
  const fichiers = fs.readdirSync(DL).filter((f) => f.endsWith('.png'));
  b.ok(fichiers.length >= 1 && fichiers.every((f) => /^dessin-nephrologie-le-rein-\d{4}-\d\d-\d\d( \(\d\))?\.png$/.test(f)), 'fichier téléchargé : dessin-nephrologie-le-rein-<date>.png', fichiers.join(', '));
  const buf = fs.readFileSync(path.join(DL, fichiers.sort()[0]));
  b.ok(buf.slice(1, 4).toString() === 'PNG' && buf.readUInt32BE(16) === resultats.transparent.a.W, 'fichier sur disque : PNG valide, mêmes dimensions', `${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}`);
  fs.copyFileSync(path.join(DL, fichiers.sort()[0]), DOSSIER_IMG + 'png-transparent-telecharge.png');
}
// iPhone : activation perdue (Safari après un calcul trop long) → bouton « Partager l'image », un toucher de plus
if (profil === 'tel') {
  await b.ev(`(window.__refusPartage = 1, 1)`);
  const nP = await b.ev(`window.__partages.length`);
  await b.clicFixe(`document.querySelector('[data-act="png"]')`, 600);
  b.ok(await b.attendre(`!!document.querySelector('[data-act="png-partager"]')`, 5000), 'partage refusé faute de geste : bouton « Partager l’image » proposé');
  await b.capture('png-geste');
  await b.clicFixe(`document.querySelector('[data-act="png-partager"]')`, 600);
  b.ok((await b.ev(`window.__partages.length`)) === nP + 1 && (await b.ev(`document.querySelector('[data-png-statut]')?.dataset.pngStatut`)) === 'partage', 'un toucher sur « Partager l’image » : feuille de partage ouverte');
}
// les trois images, pour le compte rendu
for (const fond of ['transparent', 'blanc', 'noir']) {
  const b64 = await b.ev(`(async () => { const l = window.__partages.length ? window.__partages.map((d) => d.files[0]) : window.__blobs; const f = l[${['transparent', 'blanc', 'noir'].indexOf(fond)}];
    const r = new FileReader(); return await new Promise((ok) => { r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(f); }); })()`);
  fs.writeFileSync(DOSSIER_IMG + `png-${fond}-${profil}.png`, Buffer.from(b64, 'base64'));
}
await b.capture('feuille-png-fait');
const empreinteApres = await b.empreinte();
const changes = Object.keys(empreinteAvant).filter((k) => empreinteAvant[k] !== empreinteApres[k]);
b.ok(changes.length === 0, 'aucune donnée modifiée par l’enregistrement PNG (dessin, fiches, annotations, sessions, positions, localStorage)', changes.join(', '));

// ---- l'envoi vers un cours marche toujours (même feuille, même rendu ×2) ----
await b.clicFixe(`[...document.querySelectorAll('.mde-fond-choix button')].find((x) => x.innerText.trim() === 'Transparent')`, 300);
await b.clicFixe(`[...document.querySelectorAll('.mde-cible')].find((x) => /Néphrologie/.test(x.innerText))`, 300);
await b.clicFixe(`[...document.querySelectorAll('.mde-actions .md-exporter')].find((x) => /Envoyer/.test(x.innerText))`, 1500);
b.ok(await b.attendre(`/Enregistré sur ce téléphone|Envoyé|en attente/.test(document.querySelector('.mde-statut')?.innerText || '')`, 8000), 'envoi vers un cours : toujours fonctionnel', await b.ev(`document.querySelector('.mde-statut')?.innerText`));
const envoi = await b.S(`const l = await S.getAll('dessins'); return l.map((d) => ({ ficheId: d.ficheId, largeur: d.largeur, hauteur: d.hauteur, textes: (d.textes || []).length }));`);
const w = resultats.transparent.info.w;
b.ok(envoi.length === 1 && envoi[0].ficheId === 'png-c1' && envoi[0].largeur === Math.round(w * Math.min(2, 2400 / Math.max(w, resultats.transparent.info.h))) && envoi[0].textes === 1,
  'envoi vers un cours : même rendu qu’avant (×2), zone de texte transmise à part (éditable sur l’ordi)', JSON.stringify(envoi));
await b.capture('envoi-cours');
await b.clicFixe(`[...document.querySelectorAll('.md-exporter')].find((x) => /Continuer/.test(x.innerText))`, 400);
fs.writeFileSync(fileURLToPath(new URL('./resultats/png-' + profil + '.json', import.meta.url)), JSON.stringify(resultats, null, 1));
const n = b.fin(); b.fermerWs(); process.exit(n ? 1 : 0);
