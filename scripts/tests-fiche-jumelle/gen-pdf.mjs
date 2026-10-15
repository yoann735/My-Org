// Génère le jeu de test de la fiche jumelle (15/10, docs/compte-rendu-fiche-jumelle.md) :
//   cours.pdf  — 26 diapositives « Physiologie rénale » (format paysage)
//   fiche.pdf  — 30 pages : les 26 diapositives résumées, les 12 et 13 FUSIONNÉES en une page,
//                et 5 pages AJOUTÉES (synthèse, schéma, mnémotechniques, QCM, points clés)
//   fiche-v2.pdf — nouvelle version de la fiche (remplacement) : une page ajoutée retirée,
//                une autre insérée plus tôt, titres réécrits, une annexe en fin (30 pages, pages décalées)
//   verite.json — la correspondance attendue (fiche → original), pour mesurer le taux de réussite
// node scripts/tests-fiche-jumelle/gen-pdf.mjs <dossier-de-sortie>
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const sortie = process.argv[2] || '.';
fs.mkdirSync(sortie, { recursive: true });

const DIAPOS = [
  ['Anatomie du rein', ['Le rein droit est plus bas que le gauche', 'Capsule fibreuse, cortex et médullaire', 'Pyramides de Malpighi et colonnes de Bertin', 'Hile rénal : artère, veine, bassinet']],
  ['Le néphron, unité fonctionnelle', ['Environ un million de néphrons par rein', 'Corpuscule de Malpighi : glomérule et capsule de Bowman', 'Tubule contourné proximal, anse de Henlé, tubule distal', 'Néphrons corticaux et juxtamédullaires']],
  ['Vascularisation rénale', ['Artère rénale puis artères interlobaires et arquées', 'Artériole afférente et artériole efférente', 'Vasa recta autour des anses longues', 'Le rein reçoit 20 % du débit cardiaque']],
  ['Compartiments liquidiens', ['Eau totale : 60 % du poids corporel', 'Secteur intracellulaire deux tiers', 'Secteur extracellulaire : plasma et interstitium', 'Osmolalité plasmatique proche de 290 mOsm/kg']],
  ['Filtration glomérulaire', ['Barrière : endothélium fenêtré, membrane basale, podocytes', 'Ultrafiltrat dépourvu de protéines', 'Pression nette de filtration environ 10 mmHg', 'Forces de Starling au niveau du capillaire glomérulaire']],
  ['Débit de filtration glomérulaire', ['DFG normal : 120 mL/min', 'Clairance de l\'inuline comme référence', 'Estimation par la créatininémie (CKD-EPI)', 'Fraction de filtration voisine de 20 %']],
  ['Autorégulation du débit rénal', ['Réflexe myogénique de l\'artériole afférente', 'Rétrocontrôle tubuloglomérulaire par la macula densa', 'Efficace entre 80 et 180 mmHg', 'Protège le DFG des variations tensionnelles']],
  ['Notion de clairance', ['Clairance = U × V / P', 'Volume de plasma épuré par unité de temps', 'Clairance de l\'acide para-aminohippurique : débit plasmatique rénal', 'Comparaison au DFG : réabsorption ou sécrétion nette']],
  ['Réabsorption au tubule proximal', ['Deux tiers du sodium et de l\'eau réabsorbés', 'Glucose réabsorbé par les cotransporteurs SGLT2', 'Réabsorption iso-osmotique', 'Bicarbonate récupéré grâce à l\'anhydrase carbonique']],
  ['Transport maximal et glycosurie', ['Seuil rénal du glucose vers 1,8 g/L', 'Saturation des transporteurs : Tm glucose', 'Glycosurie du diabète sucré', 'Les gliflozines bloquent SGLT2']],
  ['Anse de Henlé', ['Branche descendante perméable à l\'eau', 'Branche ascendante large imperméable à l\'eau', 'Cotransporteur NKCC2 sensible au furosémide', 'Segment de dilution de l\'urine']],
  ['Multiplication à contre-courant', ['Gradient corticopapillaire jusqu\'à 1200 mOsm/kg', 'Rôle de l\'urée dans la médullaire interne', 'Échangeur à contre-courant des vasa recta', 'Condition de la concentration des urines']],
  ['Tubule distal et canal collecteur', ['Cotransporteur NaCl sensible aux thiazidiques', 'Cellules principales : canaux ENaC et ROMK', 'Cellules intercalaires et équilibre acide-base', 'Réglage fin de la natriurèse']],
  ['Aldostérone', ['Minéralocorticoïde de la zone glomérulée', 'Augmente la réabsorption du sodium', 'Augmente la sécrétion du potassium', 'Spironolactone : antagoniste de l\'aldostérone']],
  ['Hormone antidiurétique', ['Vasopressine sécrétée par la posthypophyse', 'Récepteurs V2 et insertion des aquaporines 2', 'Stimulée par l\'hyperosmolalité', 'Diabète insipide central ou néphrogénique']],
  ['Système rénine-angiotensine', ['Rénine sécrétée par l\'appareil juxtaglomérulaire', 'Angiotensinogène hépatique, enzyme de conversion pulmonaire', 'Angiotensine II vasoconstrictrice', 'Inhibiteurs de l\'enzyme de conversion et sartans']],
  ['Peptides natriurétiques', ['ANP sécrété par les oreillettes distendues', 'Effet natriurétique et vasodilatateur', 'Inhibe la rénine et l\'aldostérone', 'BNP marqueur de l\'insuffisance cardiaque']],
  ['Régulation du potassium', ['Kaliémie normale 3,5 à 5 mmol/L', 'Sécrétion par les cellules principales', 'Hyperkaliémie : risque d\'arythmie', 'Influence de l\'insuline et de l\'équilibre acide-base']],
  ['Équilibre acide-base', ['pH sanguin 7,40', 'Tampon bicarbonate et dioxyde de carbone', 'Excrétion des ions H+ sous forme d\'ammonium', 'Acidité titrable : phosphates urinaires']],
  ['Acidose et alcalose', ['Acidose métabolique et trou anionique', 'Compensation respiratoire de Kussmaul', 'Alcalose métabolique des vomissements', 'Diagnostic par la gazométrie artérielle']],
  ['Calcium et phosphate', ['Parathormone augmente la réabsorption du calcium', 'Calcitriol activé par la 1-alpha-hydroxylase', 'FGF23 phosphaturiant', 'Ostéodystrophie rénale']],
  ['Fonctions endocrines du rein', ['Érythropoïétine produite par les fibroblastes interstitiels', 'Anémie de l\'insuffisance rénale chronique', 'Rénine et calcitriol', 'Prostaglandines rénales vasodilatatrices']],
  ['Diurétiques', ['Diurétiques de l\'anse : furosémide', 'Thiazidiques : hydrochlorothiazide', 'Épargneurs de potassium : amiloride', 'Diurétiques osmotiques : mannitol']],
  ['Miction', ['Vessie : muscle détrusor', 'Sphincter lisse et sphincter strié', 'Réflexe mictionnel sacré S2-S4', 'Contrôle pontique de la miction']],
  ['Insuffisance rénale aiguë', ['Origine prérénale, rénale ou postrénale', 'Nécrose tubulaire aiguë', 'Oligoanurie et hyperkaliémie', 'Indications de l\'épuration extrarénale']],
  ['Insuffisance rénale chronique', ['Stades selon le DFG', 'Protéinurie et néphroprotection', 'Hémodialyse et dialyse péritonéale', 'Transplantation rénale']],
];

const RESUME = (titre, puces) => [
  `Fiche · ${titre}`,
  ...puces.slice(0, 3).map((p) => '• ' + p.split(' ').slice(0, 7).join(' ')),
  'À retenir pour l\'examen.',
];
// fiche : séquence de pages, [num original | 'A', contenu]
const AJOUTS = {
  synthese: ['Synthèse : premier bilan', ['• Le rein filtre puis ajuste', '• Notions de base à connaître', '• Relire le cours avant la suite', 'Page ajoutée dans la fiche.']],
  schema: ['Schéma récapitulatif', ['• Schéma à refaire de mémoire', '• Légender chaque segment', '• Associer chaque segment à sa fonction', 'Page ajoutée dans la fiche.']],
  mnemo: ['Moyens mnémotechniques', ['• Trucs pour mémoriser les hormones', '• Associer une image à chaque mécanisme', '• Réciter à voix haute', 'Page ajoutée dans la fiche.']],
  qcm: ['QCM d\'entraînement', ['1. Quel transporteur bloque le furosémide ?', '2. Où agit l\'aldostérone ?', '3. Quelle est la valeur normale du DFG ?', '4. Que mesure la clairance de l\'inuline ?']],
  cles: ['Points clés à retenir', ['• Néphron, DFG, clairance', '• Aldostérone, vasopressine, rénine', '• Potassium, pH, calcium', '• Diurétiques et insuffisance rénale']],
};
const sequenceFiche = [1, 2, 3, 4, 5, 'synthese', 6, 7, 8, 9, 10, 11, [12, 13], 'schema', 14, 15, 16, 17, 18, 19, 'mnemo', 20, 21, 22, 23, 24, 25, 26, 'qcm', 'cles'];
// v2 : « synthese » retirée, « mnemo » avancée après la 15, textes réécrits (« Résumé · »)
const sequenceV2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, [12, 13], 'schema', 14, 15, 'mnemo', 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 'qcm', 'cles', 'annexe'];
AJOUTS.annexe = ['Annexe : valeurs normales', ['• Natrémie 135 à 145 mmol/L', '• Créatininémie selon l\'âge et le sexe', '• Urée sanguine', 'Page ajoutée dans la fiche.']];

async function pdf(pages, { paysage = false, prefixe = null } = {}) {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const lignes of pages) {
    const [W, H] = paysage ? [842, 595] : [595, 842];
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: paysage ? rgb(0.16, 0.3, 0.55) : rgb(0.94, 0.92, 0.99) });
    const titre = prefixe ? lignes[0].replace(/^Fiche · /, prefixe) : lignes[0];
    p.drawText(titre, { x: 40, y: H - 46, size: paysage ? 26 : 20, font: gras, color: paysage ? rgb(1, 1, 1) : rgb(0.25, 0.2, 0.5) });
    lignes.slice(1).forEach((l, i) => p.drawText(l, { x: 50, y: H - 130 - i * (paysage ? 48 : 36), size: paysage ? 18 : 14, font: fonte, color: rgb(0.1, 0.1, 0.15) }));
  }
  return Buffer.from(await doc.save());
}

const cours = DIAPOS.map(([t, puces], i) => [t, ...puces.map((p) => '• ' + p), `Diapositive ${i + 1} / 26`]);
fs.writeFileSync(path.join(sortie, 'cours.pdf'), await pdf(cours, { paysage: true }));

const pagesFiche = (seq) => seq.map((e) => {
  if (typeof e === 'string') return [AJOUTS[e][0], ...AJOUTS[e][1]];
  if (Array.isArray(e)) { const [a, b] = e.map((n) => DIAPOS[n - 1]); return [`Fiche · ${a[0]} et ${b[0].toLowerCase()}`, ...a[1].slice(0, 2).map((p) => '• ' + p), ...b[1].slice(0, 2).map((p) => '• ' + p)]; }
  const [t, puces] = DIAPOS[e - 1];
  return RESUME(t, puces);
});
fs.writeFileSync(path.join(sortie, 'fiche.pdf'), await pdf(pagesFiche(sequenceFiche)));
fs.writeFileSync(path.join(sortie, 'fiche-v2.pdf'), await pdf(pagesFiche(sequenceV2), { prefixe: 'Résumé · ' }));
// VARIANTE DIFFICILE : fiche très résumée (2 derniers mots du titre, 3 mots d'une puce, du texte
// générique) et pages ajoutées qui citent beaucoup de notions du cours (pièges pour l'appariement)
const DUR = (t, puces) => [`Résumé · ${t.split(' ').slice(-2).join(' ')}`, '• ' + puces[1].split(' ').slice(-3).join(' '), '• Idée générale à reformuler', '• Points à revoir avant le partiel'];
AJOUTS.cles2 = ['Points clés à retenir', ['• Néphron, glomérule, clairance, inuline, créatininémie', '• Aldostérone, vasopressine, rénine, angiotensine', '• Potassium, bicarbonate, calcium, phosphate', '• Furosémide, thiazidiques, mannitol, dialyse']];
const pagesDures = (seq) => seq.map((e) => {
  if (typeof e === 'string') return [AJOUTS[e][0], ...AJOUTS[e][1]];
  if (Array.isArray(e)) { const [a, b2] = e.map((n) => DIAPOS[n - 1]); return [`Résumé · ${a[0].split(' ').slice(-1)} et ${b2[0].split(' ').slice(-1)}`, '• ' + a[1][0].split(' ').slice(-3).join(' '), '• ' + b2[1][1].split(' ').slice(-3).join(' ')]; }
  return DUR(...DIAPOS[e - 1]);
});
const sequenceDure = sequenceFiche.map((e) => (e === 'cles' ? 'cles2' : e));
fs.writeFileSync(path.join(sortie, 'fiche-dure.pdf'), await pdf(pagesDures(sequenceDure)));
// vérité : pour chaque page de fiche, la (les) page(s) originale(s) — [] = page ajoutée
const verite = (seq) => seq.map((e) => (typeof e === 'string' ? [] : Array.isArray(e) ? e : [e]));
fs.writeFileSync(path.join(sortie, 'verite.json'), JSON.stringify({ fiche: verite(sequenceFiche), v2: verite(sequenceV2), dure: verite(sequenceDure) }, null, 1));
console.log('cours 26 p., fiche', sequenceFiche.length, 'p., fiche-v2', sequenceV2.length, 'p. →', sortie);
