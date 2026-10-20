/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : mots-clés (« keyterm » Deepgram).

   Règles Deepgram (nova-3) : un paramètre `keyterm` PAR terme dans l'URL
   (?keyterm=ostéon&keyterm=canal+de+Havers), jamais une liste à virgules ;
   500 jetons au total (~100 mots) ; 20 à 50 termes bien choisis recommandés.
   En cours de session, {"type":"Configure","keyterms":[…]} remplace la liste.
   ============================================================ */

export const MAX_MOTS = 100;
export const SEUIL_CONSEIL = 50;

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Saisie libre → liste de termes : un par ligne OU séparés par des virgules /
 *  points-virgules. Doublons (sans casse) retirés, ordre conservé. */
export function decouperTermes(texte) {
  const vus = new Set();
  const out = [];
  String(texte || '').split(/[\n,;]+/).map(norm).filter(Boolean).forEach((t) => {
    const k = t.toLocaleLowerCase('fr');
    if (!vus.has(k) && t.length <= 60) { vus.add(k); out.push(t); }
  });
  return out;
}

export function fusionnerTermes(...listes) {
  return decouperTermes(listes.flat().join('\n'));
}

export const compterMots = (termes) => (termes || []).reduce((n, t) => n + norm(t).split(' ').filter(Boolean).length, 0);

/** Tronque à MAX_MOTS (Deepgram refuserait au-delà de 500 jetons). */
export function termesEnvoyables(termes) {
  const out = [];
  let n = 0;
  for (const t of termes || []) {
    const m = norm(t).split(' ').filter(Boolean).length;
    if (!m || n + m > MAX_MOTS) continue;
    out.push(norm(t)); n += m;
  }
  return out;
}

/** Paramètres d'URL : un `keyterm=` par terme. */
export function parametresKeyterms(termes) {
  return termesEnvoyables(termes).map((t) => 'keyterm=' + encodeURIComponent(t)).join('&');
}

/* ---------- surlignage dans le transcript ---------- */
const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex insensible à la casse ET aux accents (on la passe sur le texte
 *  désaccentué, de même longueur grâce à NFC → NFD retiré lettre par lettre). */
export function regexTermes(termes) {
  const liste = (termes || []).map((t) => sansAccents(norm(t))).filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length).map(echapper);
  if (!liste.length) return null;
  // pluriel toléré : « ostéoclaste » surligne aussi « ostéoclastes »
  return new RegExp('(?<![\\p{L}\\p{N}])(?:' + liste.join('|') + ')[sx]?(?![\\p{L}\\p{N}])', 'giu');
}

/** Découpe `texte` en morceaux { t, cle } pour le rendu. */
export function decouperSurlignage(texte, rx) {
  if (!rx || !texte) return [{ t: texte, cle: false }];
  // désaccentuer caractère par caractère : longueur identique au texte d'origine
  const plat = [...texte].map((c) => sansAccents(c) || c).join('');
  if (plat.length !== texte.length) return [{ t: texte, cle: false }];
  const out = [];
  let i = 0;
  rx.lastIndex = 0;
  let m;
  while ((m = rx.exec(plat))) {
    if (m.index > i) out.push({ t: texte.slice(i, m.index), cle: false });
    out.push({ t: texte.slice(m.index, m.index + m[0].length), cle: true });
    i = m.index + m[0].length;
    if (m[0].length === 0) rx.lastIndex++;
  }
  if (i < texte.length) out.push({ t: texte.slice(i), cle: false });
  return out;
}

/* ---------- propositions depuis le texte du cours (refait le 20/10 soir, docs/compte-rendu-pdfreader-v4.md) ----------
   Sans IA. Le texte de TOUT le cours : couche texte native de chaque page ET mots reconnus par l'OCR (pages
   image, schémas des pages mixtes), plus le texte d'un document. Chaque terme candidat reçoit un score :

       score = rareté × fréquence × (1 + bonus)

   - RARETÉ dans le français courant (transcription/motsFrequents.js, liste embarquée) : très fréquent → exclu ;
     courant → 0,25 ; hors liste → 1 (1,15 si ≥ 10 lettres).
   - FRÉQUENCE dans le cours, amortie : 1 + log2(nombre d'occurrences).
   - BONUS (cumulables) : majuscule interne (ATPase) +0,8 ; sigle (ADN, LCA) +0,6 ; suffixe médical (‑ite, ‑ome,
     ‑ose, ‑algie, ‑ase, ‑cyte, ‑ectomie…) +1 ; suffixe savant (‑ique, ‑aire, ‑al) +0,4 ; préfixe médical (hypo‑,
     ostéo‑, néphro‑…) +0,5 ; mot composé (trait d'union) +0,8, terme de deux mots répété (« tubule proximal »)
     +1, éponyme « … de Nom » (« canal de Havers ») +1 ; terme latin (‑us, ‑um, ‑ae) +0,8 ; nom propre +0,6.
   EXCLUS : mots vides, nombres, termes de mise en page (« diapo », « chapitre », « figure »…), noms de
   l'école et des profs — mots en majuscule des lignes répétées (en-têtes, pieds de page) absents du reste du
   texte, et noms qui suivent « Dr », « Pr », « Prof. », « Mme », « M. » — sauf s'ils sont ajoutés à la main.
   Au plus 50 termes, triés par score ; chacun porte son explication (« Pourquoi ? » au survol). */
import { rarete, singulier, TRES_FREQUENTS } from './motsFrequents.js';

const MISE_EN_PAGE = new Set(('diapo diapos diapositive diapositives slide slides chapitre chapitres partie parties sommaire plan objectif objectifs introduction conclusion rappel rappels cours page pages figure figures fig tableau tableaux source sources référence références bibliographie copyright université faculté haute école helha institut campus bloc année années semestre professeur professeure docteur enseignant enseignante étudiant étudiants étudiante étudiantes examen examens exercice exercices question questions réponse réponses schéma schémas image images photo photos vidéo vidéos www http https pdf version annoté annotée export notes note légende légendes exemple exemples définition définitions résumé synthèse suite').split(' '));
const TITRES = /^(dr|docteur|pr|prof|professeur|professeure|mme|madame|mlle|m|mr|monsieur)$/i;
// lignes de CRÉDITS d'une figure (droits, éditeur, auteurs et année) : jamais des termes du cours
const CREDITS = /(©|copyright|all rights|permission|licen[cs]e|creative commons|wiley|elsevier|springer|thieme|netter|gray's|doi|isbn|https?:|www\.|et al\.?|d['’]après|adapt(é|ed)|source\s*:|reproduced|\b(19|20)\d\d\b)/i;
// mots anglais courants (légendes et crédits en anglais) : ni sigles ni termes
const ANGLAIS = new Set(('the of and or by for with from this that these those be is are was were may might can could will would shall should not no all any use used using owned owner author authors please permission rights reserved without written joint view figure plate copyright inc ltd press edition '
  + 'internal external lateral medial anterior posterior superior inferior anterolateral posterolateral anteromedial posteromedial proximal distal hydrophobic hydrophilic chain chains bond bonds acid acids protein proteins bone bones knee head body').split(' '));
const SUFF_MED = /(ite|ites|ome|omes|ose|oses|algie|algies|ase|ases|ectomie|tomie|stomie|plastie|scopie|graphie|gramme|pathie|émie|cyte|cytes|blaste|blastes|claste|clastes|plégie|trophie|rrhée|gène|gènes|lyse|ide|ides|osome|osomes|ocyte|ocytes|ique|iques)$/i;
const SUFF_MED_FORT = /(ite|ites|ome|omes|ose|oses|algie|algies|ase|ases|ectomie|tomie|stomie|plastie|scopie|graphie|pathie|émie|cyte|cytes|blaste|blastes|claste|clastes|plégie|trophie|rrhée|lyse|osome|osomes)$/i;
const SUFF_SAVANT = /(ique|iques|aire|aires|al|ale|aux|ienne|iens|oïde|oïdes|ide|ides|ine|ines|gène|gènes)$/i;
const PREF_MED = /^(hypo|hyper|endo|péri|épi|intra|inter|extra|myo|ostéo|chondro|neuro|cardio|hémo|lipo|gluco|glyco|arthr|leuco|érythro|thrombo|fibro|kinési|proprio|vaso|broncho|gastro|hépat|néphro|phospho|nucléo|ribo|désoxy|poly|mono|di|tri|cyto|mito|photo|chloro|bio|macro|micro)(?=\p{L}{3,})/iu;
const LATIN = /(us|um|ae|ii|is)$/i;
const fmt = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');

/** texte de chaque page du cours (natif, OCR des pages image, étiquettes OCR des pages mixtes), et ses mots
    POSITIONNÉS (mot + case de 12 unités où il se trouve) : un mot qui revient à la même place sur beaucoup de
    pages est un élément fixe de la maquette (logo de l'école, en-tête, pied de page), pas du cours */
const plat = (w) => w.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const motsPlaces = (liste) => {
  const out = new Set();
  for (const [txt, x, y] of liste) for (const w of (String(txt).match(/[\p{L}][\p{L}'’-]*[\p{L}]/gu) || [])) out.add(plat(w) + '@' + Math.round(x / 12) + ',' + Math.round(y / 12));
  return out;
};
async function textesDesPages(pdfDoc, { maxPages, ocrPages, texteEnPlus }) {
  const n = pdfDoc ? Math.min(pdfDoc.numPages || 0, maxPages) : 0;
  const pages = [], pieds = [];
  for (let p = 1; p <= n; p++) {
    let texte = '', pied = [];
    const ocr = ocrPages && ocrPages[p - 1];
    if (ocr && !ocr.natif && ocr.words && ocr.words.length) {
      const parLigne = new Map();
      ocr.words.forEach((m) => { if (!parLigne.has(m.line)) parLigne.set(m.line, []); parLigne.get(m.line).push(m); });
      texte = [...parLigne.values()].map((l) => l.sort((a, b) => a.x - b.x).map((m) => m.t).join(' ')).join('\n');
      pied = ocr.words.map((m) => [m.t, m.x, m.y]);
    } else {
      try {
        const page = await pdfDoc.getPage(p);
        const tc = await page.getTextContent();
        texte = tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('');
        pied = tc.items.filter((it) => it.transform).map((it) => [it.str, it.transform[4], it.transform[5]]);
      } catch (e) { continue; }
      if (ocr && ocr.mixte && ocr.words && ocr.words.length) {
        texte += '\n' + ocr.words.map((m) => m.t).join(' ');
        pied = [...pied, ...ocr.words.map((m) => [m.t, m.x, ocr.height ? ocr.height - m.y : m.y])];
      }
    }
    pages.push(texte); pieds.push(motsPlaces(pied || []));
  }
  if (texteEnPlus) { pages.push(String(texteEnPlus)); pieds.push(new Set()); }
  return { pages, pieds };
}

/** Les termes proposés, détaillés : [{ terme, score, pourquoi, details }], triés, au plus `max`. */
export async function proposerTermesDetail(pdfDoc, { maxPages = 200, max = 50, ocrPages = null, texteEnPlus = '' } = {}) {
  if (!pdfDoc && !texteEnPlus) return [];
  const { pages, pieds } = await textesDesPages(pdfDoc, { maxPages, ocrPages, texteEnPlus });
  // MAQUETTE (logo de l'école, en-tête, pied de page, nom du prof) : mot revenu À LA MÊME PLACE sur au moins 35 %
  // des pages (3 au moins). Les mots du cours, eux, changent de place d'une diapositive à l'autre.
  const parPlace = new Map();
  pieds.forEach((set) => set.forEach((k) => parPlace.set(k, (parPlace.get(k) || 0) + 1)));
  const seuilPied = Math.max(3, Math.ceil(pages.length * 0.35));
  const motsPied = new Set([...parPlace].filter(([, n]) => n >= seuilPied).map(([k]) => k.split('@')[0]));
  // variantes d'OCR d'un même mot de la maquette (« HELH », « Louvai ») : même début, longueur voisine
  const piedListe = [...motsPied].filter((w) => w.length >= 4);
  const dansPied = (w) => { const x = plat(w); return motsPied.has(x) || (x.length >= 4 && piedListe.some((p) => (p.startsWith(x) || x.startsWith(p)) && Math.abs(p.length - x.length) <= 2)); };
  // en-têtes et pieds de page : lignes répétées sur au moins 40 % des pages (3 au moins)
  const vuesLigne = new Map();
  const cleLigne = (l) => l.toLocaleLowerCase('fr').replace(/[\d\s.,:;/|–—-]+/g, ' ').trim();
  pages.forEach((t) => { new Set(t.split('\n').map(cleLigne).filter((l) => l.length >= 3)).forEach((l) => vuesLigne.set(l, (vuesLigne.get(l) || 0) + 1)); });
  const seuilRep = Math.max(3, Math.ceil(pages.length * 0.4));
  const repetees = new Set([...vuesLigne].filter(([, n]) => n >= seuilRep).map(([l]) => l));
  const compte = new Map(); // clé (singulier) → { forme, n, maj, horsRep, sigle }
  const bigrammes = new Map(), eponymes = new Map(), noms = new Set();
  let nbMots = 0;
  for (const texte of pages) {
    for (const ligne of texte.split('\n')) {
      const rep = repetees.has(cleLigne(ligne));
      if (CREDITS.test(ligne)) continue;
      for (const ph of ligne.split(/[.!?:•·–—;,/+=()[\]«»"]+/)) {
        // un MOT écrit en capitales (titre de diapo : « CONDYLES FÉMORAUX ») est lu comme un mot ordinaire ;
        // seuls 2 à 4 capitales (ou avec un chiffre) font un SIGLE (ADN, LCA, ATP)
        const mots = (ph.match(/[\p{L}][\p{L}\p{N}'’-]*[\p{L}\p{N}]|[\p{Lu}]{2,}/gu) || []).map((w) => (/^[\p{Lu}'’-]{5,}$/u.test(w) ? w.toLocaleLowerCase('fr') : w));
        mots.forEach((brut, i) => {
          nbMots++;
          const m = brut.replace(/^[ldjmnstcqu]+['’]/i, '').replace(/['’]s$/, '');
          if (/\p{N}/u.test(m) && !/\p{L}{2,}/u.test(m)) return;
          if (i > 0 && TITRES.test(mots[i - 1].replace(/\./g, ''))) { noms.add(m.toLocaleLowerCase('fr')); return; } // « Dr Dupont »
          if (ANGLAIS.has(m.toLocaleLowerCase('fr')) || dansPied(m) || m.split('-').some((x) => x.length >= 3 && dansPied(x))) return;
          const sigle = /^\p{Lu}[\p{Lu}\p{N}]{1,3}$/u.test(m) && !/^[IVXLC]+$/.test(m);
          if (!sigle && m.length < 4) return;
          // clé sans accents : « fémoral » et « femoral » (OCR) sont le même terme
          const k = sigle ? m : plat(singulier(m));
          const kl = k.toLocaleLowerCase('fr');
          if (MISE_EN_PAGE.has(kl) || MISE_EN_PAGE.has(m.toLocaleLowerCase('fr')) || (!sigle && rarete(m) === 0) || (sigle && TRES_FREQUENTS.has(kl))) return;
          const e = compte.get(k) || { forme: m, n: 0, maj: 0, horsRep: 0, sigle };
          e.n++; if (!rep) e.horsRep++;
          if (i > 0 && /^\p{Lu}\p{Ll}/u.test(m)) e.maj++;
          // forme affichée : minuscule, accentuée, au singulier de préférence
          const accents = (w) => (w.match(/[à-ÿ]/gi) || []).length;
          if (/^\p{Ll}/u.test(m) && (/^\p{Lu}/u.test(e.forme) || accents(m) > accents(e.forme) || (accents(m) === accents(e.forme) && m.length < e.forme.length))) e.forme = m;
          compte.set(k, e);
          // « tubule proximal », « ligament croisé » : deux mots pleins qui se suivent
          const suiv = mots[i + 1];
          if (suiv && !rep) {
            const s2 = suiv.replace(/^[ldjmnstcqu]+['’]/i, '');
            if (s2 === suiv && s2.length >= 4 && !dansPied(s2) && rarete(m) > 0 && rarete(s2) > 0 && (rarete(m) === 1 || rarete(s2) === 1) && !MISE_EN_PAGE.has(s2.toLocaleLowerCase('fr'))) {
              const bk = plat(singulier(m) + ' ' + singulier(s2));
              const bg = bigrammes.get(bk) || { forme: `${m} ${s2}`, n: 0 }; bg.n++; bigrammes.set(bk, bg);
            }
            // « canal de Havers », « loi de Wolff »
            const s3 = mots[i + 2];
            if (/^(de|du|des|d)$/i.test(suiv) && s3 && /^\p{Lu}\p{Ll}/u.test(s3)) {
              const ek = (m + ' ' + suiv + ' ' + s3).toLocaleLowerCase('fr');
              const ep = eponymes.get(ek) || { forme: `${m} ${suiv} ${s3}`, n: 0 }; ep.n++; eponymes.set(ek, ep);
            }
          }
        });
      }
    }
  }
  if (nbMots < 30) return []; // pas de texte exploitable (PDF en images sans OCR)
  const candidats = [];
  const cles = [...compte.keys()].map((k) => k.toLocaleLowerCase('fr'));
  for (const [k, e] of compte) {
    const kl = k.toLocaleLowerCase('fr');
    if (noms.has(kl)) continue;
    // fragment d'OCR (« tend » pour tendon, « adip », « post ») : court, peu vu, début d'un mot plus long du cours
    if (!e.sigle && rarete(e.forme) === 1 && ((kl.length <= 4 && cles.some((o) => o.length >= kl.length + 2 && o.startsWith(kl))) || (kl.length <= 6 && e.n <= 2 && cles.some((o) => o.length >= kl.length + 3 && o.startsWith(kl))))) continue;
    if (!e.sigle && cles.some((o) => o !== kl && o.endsWith(kl) && o.length - kl.length <= 2 && (compte.get(o) || { n: 0 }).n >= e.n)) continue; // « emoral » pour « femoral »
    if (/-$/.test(kl) || /-\p{L}{1,3}$/u.test(kl)) continue; // « sous-rot » : mot coupé en fin de ligne
    const propre = e.maj && e.maj >= e.n / 2;
    if (propre && e.horsRep === 0) continue; // nom (école, prof, titre) qui n'apparaît QUE dans les en-têtes / pieds de page
    let r = e.sigle ? 1 : rarete(e.forme);
    if (r === 1 && k.length >= 10) r = 1.15;
    const bonus = [];
    if (!e.sigle && /^.+\p{Lu}/u.test(e.forme) && /\p{Ll}/u.test(e.forme)) bonus.push(['majuscule interne', 0.8]);
    if (e.sigle) bonus.push(['sigle', 0.6]);
    if (SUFF_MED_FORT.test(kl)) bonus.push(['suffixe médical', 1]);
    else if (SUFF_MED.test(kl) || SUFF_SAVANT.test(kl)) bonus.push(['suffixe savant', 0.4]);
    if (PREF_MED.test(kl)) bonus.push(['préfixe médical', 0.5]);
    if (/-/.test(kl)) bonus.push(['mot composé', 0.8]);
    if (LATIN.test(kl) && kl.length >= 5 && r >= 1 && !/(ous|eus|ais|ois)$/.test(kl)) bonus.push(['terme latin', 0.8]);
    if (propre && !e.sigle) bonus.push(['nom propre', 0.6]);
    const somme = bonus.reduce((a, b) => a + b[1], 0);
    if (r < 1 && somme < 1) continue; // mot courant : seulement avec un fort indice technique
    if (e.n === 1 && somme === 0) continue; // rare mais cité une fois sans indice : souvent une coquille d'OCR
    const freq = 1 + Math.log2(e.n);
    const score = r * freq * (1 + somme);
    const terme = propre && !e.sigle ? e.forme.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : e.forme;
    candidats.push({ terme, score, details: { rarete: r, n: e.n, bonus } });
  }
  for (const [, bg] of bigrammes) {
    if (bg.n < 3) continue;
    const [a, c] = bg.forme.split(' ');
    // vraie association : le terme de deux mots couvre au moins 30 % des emplois du moins fréquent des deux
    const na = (compte.get(plat(singulier(a))) || { n: bg.n }).n, nc = (compte.get(plat(singulier(c))) || { n: bg.n }).n;
    if (bg.n < 0.3 * Math.min(na, nc)) continue;
    const r = Math.min(1, (rarete(a) + rarete(c)) / 2);
    const freq = 1 + Math.log2(bg.n);
    candidats.push({ terme: bg.forme.toLocaleLowerCase('fr') === bg.forme ? bg.forme : bg.forme, score: r * freq * 2, details: { rarete: r, n: bg.n, bonus: [['terme de deux mots', 1]] } });
  }
  for (const [, ep] of eponymes) candidats.push({ terme: ep.forme, score: (1 + Math.log2(ep.n)) * 2.6, details: { rarete: 1, n: ep.n, bonus: [['éponyme « de Nom »', 1], ['nom propre', 0.6]] } });
  candidats.sort((a, b) => b.score - a.score);
  const vus = new Set(), out = [];
  for (const c of candidats) {
    const k = c.terme.toLocaleLowerCase('fr');
    if (vus.has(k)) continue;
    vus.add(k);
    const d = c.details;
    c.score = +c.score.toFixed(2);
    c.pourquoi = `score ${fmt(c.score)} = rareté ${fmt(d.rarete)} × fréquence ${d.n} fois (×${fmt(1 + Math.log2(d.n))})`
      + (d.bonus.length ? ` × (1 + ${d.bonus.map(([l, v]) => `${l} ${fmt(v)}`).join(' + ')})` : '');
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** Les termes proposés (texte seul), triés par score — voir proposerTermesDetail. */
export async function proposerTermes(pdfDoc, options = {}) {
  return (await proposerTermesDetail(pdfDoc, options)).map((c) => c.terme);
}

/* ---------- sélection dans la limite (v1.1) ----------
   État mémorisé avec le cours : { manuels, decoches, connus } (voir sessions.js).
   - manuels  : termes saisis à la main — toujours en tête, cochés tant qu'ils tiennent ;
   - decoches : termes proposés que l'étudiant a décochés (ou laissés hors limite) ;
   - connus   : termes proposés déjà présentés une fois.
   Un terme proposé NOUVEAU est coché s'il tient dans les 100 mots, sinon il entre
   dans `decoches` (hors limite) : on ne dépasse jamais la limite, et décocher un
   terme ne recoche pas un autre terme dans le dos de l'étudiant. */
const cle = (t) => norm(t).toLocaleLowerCase('fr');
const nbMots = (t) => norm(t).split(' ').filter(Boolean).length;

/** Intègre les candidats du PDF à l'état mémorisé (nouveaux : cochés si la place le permet). */
export function integrerCandidats(memo, candidats) {
  const manuels = memo.manuels || [];
  const decoches = new Set((memo.decoches || []).map(cle));
  const connus = new Set((memo.connus || []).map(cle));
  const kManuels = new Set(manuels.map(cle));
  let mots = compterMots(manuels);
  // place déjà prise par les proposés connus et cochés
  for (const c of candidats) { const k = cle(c); if (!kManuels.has(k) && connus.has(k) && !decoches.has(k)) mots += nbMots(c); }
  for (const c of candidats) {
    const k = cle(c);
    if (kManuels.has(k) || connus.has(k)) continue;
    connus.add(k);
    if (mots + nbMots(c) <= MAX_MOTS) mots += nbMots(c); else decoches.add(k);
  }
  return { manuels, decoches: [...decoches], connus: [...connus] };
}

/**
 * Liste affichée et liste envoyée.
 * @returns {{ lignes: {terme, manuel, coche, horsLimite}[], envoyes: string[], mots: number, plein: boolean }}
 */
export function selectionner(memo, candidats) {
  const decoches = new Set((memo.decoches || []).map(cle));
  const vus = new Set();
  const lignes = [];
  let mots = 0;
  const ajouter = (t, manuel) => {
    const k = cle(t);
    if (!k || vus.has(k)) return;
    vus.add(k);
    const voulu = manuel || !decoches.has(k);
    const tient = mots + nbMots(t) <= MAX_MOTS;
    const coche = voulu && tient;
    if (coche) mots += nbMots(t);
    lignes.push({ terme: norm(t), manuel, coche, horsLimite: voulu && !tient });
  };
  (memo.manuels || []).forEach((t) => ajouter(t, true));
  (candidats || []).forEach((t) => ajouter(t, false));
  const envoyes = lignes.filter((l) => l.coche).map((l) => l.terme);
  const restants = lignes.filter((l) => !l.coche && !l.manuel);
  const plein = restants.some((l) => mots + nbMots(l.terme) > MAX_MOTS);
  return { lignes, envoyes, mots, plein };
}

/** Coche/décoche un terme proposé. Refuse (renvoie null) si le cocher dépasserait la limite. */
export function basculerTerme(memo, candidats, terme) {
  const k = cle(terme);
  const decoches = new Set((memo.decoches || []).map(cle));
  if (decoches.has(k)) {
    const { mots } = selectionner(memo, candidats);
    if (mots + nbMots(terme) > MAX_MOTS) return null;
    decoches.delete(k);
  } else decoches.add(k);
  return { ...memo, decoches: [...decoches] };
}

export function toutDecocher(memo, candidats) {
  const kManuels = new Set((memo.manuels || []).map(cle));
  return { ...memo, decoches: candidats.map(cle).filter((k) => !kManuels.has(k)) };
}

/** Tout cocher… dans la limite : les plus pertinents d'abord, le reste hors limite. */
export function toutCocher(memo, candidats) {
  const kManuels = new Set((memo.manuels || []).map(cle));
  let mots = compterMots(memo.manuels || []);
  const decoches = [];
  for (const c of candidats) {
    const k = cle(c);
    if (kManuels.has(k)) continue;
    if (mots + nbMots(c) <= MAX_MOTS) mots += nbMots(c); else decoches.push(k);
  }
  return { ...memo, decoches };
}

/** Ajoute des termes saisis à la main (en tête). Refuse ceux qui dépasseraient la limite. */
export function ajouterManuels(memo, candidats, nouveaux) {
  const kExist = new Set((memo.manuels || []).map(cle));
  const manuels = [...(memo.manuels || [])];
  const refuses = [];
  for (const t of nouveaux) {
    const k = cle(t);
    if (kExist.has(k)) continue;
    const essai = { ...memo, manuels: [...manuels, norm(t)] };
    // un manuel passe AVANT les proposés : il peut repousser le dernier proposé hors limite
    const { lignes } = selectionner(essai, candidats);
    const l = lignes.find((x) => cle(x.terme) === k);
    if (l && l.coche) { manuels.push(norm(t)); kExist.add(k); } else refuses.push(norm(t));
  }
  return { memo: { ...memo, manuels }, refuses };
}

export function retirerManuel(memo, terme) {
  const k = cle(terme);
  return { ...memo, manuels: (memo.manuels || []).filter((t) => cle(t) !== k) };
}
