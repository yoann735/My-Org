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

export async function proposerTermes(pdfDoc, { maxPages = 80, max = 40 } = {}) {
  if (!pdfDoc) return [];
  const n = Math.min(pdfDoc.numPages || 0, maxPages);
  const compte = new Map(); // forme normalisée → { forme, n, maj }
  const bigrammes = new Map();
  let nbMots = 0;
  for (let p = 1; p <= n; p++) {
    let texte = '';
    try {
      const page = await pdfDoc.getPage(p);
      const tc = await page.getTextContent();
      texte = tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('');
    } catch (e) { continue; }
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
    s += Math.min(3, Math.log2(e.n + 1)); // revient dans le cours
    if (e.n === 1 && s < 4) continue;
    scores.push({ terme: e.maj >= e.n / 2 ? e.forme.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : e.forme, s });
  }
  for (const [, b] of bigrammes) if (b.n >= 1) scores.push({ terme: b.forme, s: 5 + b.n });
  scores.sort((a, b) => b.s - a.s);
  return decouperTermes(scores.map((x) => x.terme).join('\n')).slice(0, max);
}
