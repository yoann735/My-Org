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

/* ---------- propositions depuis la couche texte du PDF ----------
   Heuristique volontairement simple (pas d'IA) : on compte les mots du cours,
   et on garde ceux qui ont l'air de vocabulaire technique :
   - suffixes/préfixes médicaux courants (‑ite, ‑ose, ‑algie, ‑ectomie, ‑cyte…) ;
   - mots longs (≥ 10 lettres) ou rares dans la langue courante ;
   - termes à majuscule hors début de phrase (noms propres : Havers, Volkmann) ;
   - quelques bigrammes « nom + de + Nom » (canal de Havers, loi de Wolff).
   Un mot très fréquent du français (liste courte ci-dessous) n'est jamais proposé. */
const MOTS_VIDES = new Set(('alors aussi autre autres avec avoir beaucoup cette ceux chaque comme comment dans depuis donc elle elles encore entre être fait faire font leur leurs mais même moins notre nous parce pendant peut peuvent plus pour pourquoi quand quel quelle quelles quels sans selon sera sont sous tout toute toutes tous très vous ainsi après avant celui celle cela ceci chez contre dont lors lorsque puis quelque quelques souvent toujours voici voilà également exemple exemples partie parties niveau importante important importantes importants permet permettent différents différentes général générale ensemble premier première deuxième troisième chapitre cours introduction conclusion schéma figure tableau page pages définition définitions principe principes rôle rôles fonction fonctions')
  .split(' '));
const SUFFIXES = /(ite|ites|ose|oses|algie|algies|ectomie|tomie|plastie|scopie|graphie|gramme|logie|pathie|émie|cyte|cytes|blaste|blastes|claste|clastes|ome|omes|aire|aires|ique|iques|ale|aux|ienne|iens|oïde|oïdes|ase|ases|ine|ines|rrhée|plégie|trophie|sclérose|osis)$/i;
const PREFIXES = /^(hypo|hyper|endo|péri|épi|intra|inter|extra|sous|sus|myo|ostéo|chondro|neuro|cardio|hémo|lipo|gluco|glyco|tendin|ligament|arthr|leuco|érythro|thrombo|fibro|kinési|proprio|vaso|broncho|gastro|hépat|néphro)/i;

export async function proposerTermes(pdfDoc, { maxPages = 80, max = 150, ocrPages = null, texteEnPlus = '' } = {}) {
  // (08/10) `texteEnPlus` : le texte d'un DOCUMENT et celui reconnu dans ses images (Texte en
  // direct) — un document n'a pas de PDF, il n'avait donc jamais de mots-clés proposés
  if (!pdfDoc && !texteEnPlus) return [];
  const n = pdfDoc ? Math.min(pdfDoc.numPages || 0, maxPages) : 0;
  const compte = new Map(); // forme normalisée → { forme, n, maj }
  const bigrammes = new Map();
  let nbMots = 0;
  for (let p = 1; p <= n + (texteEnPlus ? 1 : 0); p++) {
    let texte = '';
    if (p > n) texte = String(texteEnPlus);
    else {
    const ocr = ocrPages && ocrPages[p - 1];
    if (ocr && !ocr.natif && ocr.words && ocr.words.length) {
      // page IMAGE : les mots reconnus par l'OCR (docs/compte-rendu-ocr.md), ligne par ligne
      const parLigne = new Map();
      ocr.words.forEach((m) => { if (!parLigne.has(m.line)) parLigne.set(m.line, []); parLigne.get(m.line).push(m); });
      texte = [...parLigne.values()].map((l) => l.sort((a, b) => a.x - b.x).map((m) => m.t).join(' ')).join('\n');
    } else {
      try {
        const page = await pdfDoc.getPage(p);
        const tc = await page.getTextContent();
        texte = tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('');
      } catch (e) { continue; }
      // page mixte (08/10) : + les étiquettes reconnues dans ses schémas
      if (ocr && ocr.mixte && ocr.words && ocr.words.length) texte += '\n' + ocr.words.map((m) => m.t).join(' ');
    }
    }
    const phrases = texte.split(/[.!?:\n•·–—]+/);
    for (const ph of phrases) {
      const mots = ph.match(/[\p{L}][\p{L}'’-]*[\p{L}]/gu) || [];
      mots.forEach((m, i) => {
        nbMots++;
        const propre = m.replace(/^[ldjmnstcqu]+['’]/i, '');
        if (propre.length < 4) return;
        const k = propre.toLocaleLowerCase('fr');
        if (MOTS_VIDES.has(k)) return;
        const e = compte.get(k) || { forme: propre, n: 0, maj: 0 };
        e.n++;
        if (i > 0 && /^\p{Lu}\p{Ll}/u.test(propre)) e.maj++;
        if (/^\p{Ll}/u.test(propre)) e.forme = propre; // préfère la forme minuscule
        compte.set(k, e);
        // « canal de Havers », « loi de Wolff », « os spongieux »
        const suiv = mots[i + 1], suiv2 = mots[i + 2];
        if (suiv && /^(de|du|des|d)$/i.test(suiv) && suiv2 && /^\p{Lu}/u.test(suiv2)) {
          const b = `${propre} ${suiv} ${suiv2}`;
          bigrammes.set(b.toLocaleLowerCase('fr'), { forme: b, n: (bigrammes.get(b.toLocaleLowerCase('fr')) || { n: 0 }).n + 1 });
        }
      });
    }
  }
  if (nbMots < 30) return []; // PDF en images : pas de couche texte exploitable
  const scores = [];
  for (const [k, e] of compte) {
    let s = 0;
    if (SUFFIXES.test(k)) s += 2;
    if (PREFIXES.test(k)) s += 2;
    if (k.length >= 10) s += 1.5;
    if (k.length >= 13) s += 1;
    if (e.maj && e.maj >= e.n / 2) s += 2; // nom propre (Havers)
    if (/[-]/.test(k)) s += 0.5;
    if (s < 2) continue;
    if (e.n === 1 && s < 3) continue;
    // PERTINENCE = rareté (indices de vocabulaire technique ci-dessus) × fréquence dans
    // le PDF (amortie : un terme cité 8 fois ne pèse pas 8 fois plus qu'un terme cité 1 fois)
    s *= 1 + Math.log2(e.n);
    scores.push({ terme: e.maj >= e.n / 2 ? e.forme.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : e.forme, s });
  }
  for (const [, b] of bigrammes) if (b.n >= 1) scores.push({ terme: b.forme, s: 6 * (1 + Math.log2(b.n)) });
  scores.sort((a, b) => b.s - a.s);
  return decouperTermes(scores.map((x) => x.terme).join('\n')).slice(0, max);
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
