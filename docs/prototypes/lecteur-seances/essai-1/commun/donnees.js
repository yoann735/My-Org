/* Données d'exemple partagées par les 3 prototypes (aucun lien avec l'app : tout est fictif et en mémoire).
   Un cours de 300 pages, 5 séances (la 5ᵉ est « en direct » aujourd'hui), transcripts horodatés et reliés aux pages,
   7 fiches de résumé dont 2 pour la séance 2 et 2 pour la séance 3, et une fiche de synthèse qui couvre deux séances. */
(function () {
  const COURS = {
    id: 'c-nephro',
    titre: 'Physiologie rénale',
    ue: 'UE 2.4 · Néphrologie',
    pages: 300,
    fichier: 'Physio-renale-diapo-complet.pdf',
    importe: '2026-10-01',
    flashcards: 86,
    notions: 41,
  };

  const SEANCES = [
    { id: 's1', n: 1, date: '2026-10-01', jour: 'mer. 1 oct.', heure: '08:30', duree: '1 h 52', titre: 'Anatomie du rein et du néphron', debut: 1, fin: 58, couleur: '#7C6FE0', etat: 'faite' },
    { id: 's2', n: 2, date: '2026-10-08', jour: 'mer. 8 oct.', heure: '08:30', duree: '2 h 05', titre: 'Filtration glomérulaire et clairances', debut: 59, fin: 121, couleur: '#3FA7D6', etat: 'faite' },
    { id: 's3', n: 3, date: '2026-10-15', jour: 'mer. 15 oct.', heure: '08:30', duree: '1 h 58', titre: 'Transports tubulaires', debut: 122, fin: 180, couleur: '#2FB58A', etat: 'faite' },
    { id: 's4', n: 4, date: '2026-10-22', jour: 'mer. 22 oct.', heure: '08:30', duree: '2 h 01', titre: 'Eau, sodium et ADH', debut: 181, fin: 243, couleur: '#E9A23B', etat: 'faite' },
    { id: 's5', n: 5, date: '2026-10-29', jour: 'mer. 29 oct.', heure: '08:30', duree: '—', titre: 'Équilibre acide-base', debut: 244, fin: 300, couleur: '#E5677D', etat: 'aujourdhui' },
  ];

  /* titres des diapos : un titre par page, par séance (cyclés) */
  const THEMES = {
    s1: ['Plan du cours', 'Situation des reins', 'Rapports anatomiques', 'Loge rénale et fascia', 'Coupe frontale du rein', 'Cortex et médullaire', 'Pyramides de Malpighi', 'Colonnes de Bertin', 'Vascularisation artérielle', 'Artères interlobaires', 'Artères arquées', 'Le néphron : vue d’ensemble', 'Corpuscule de Malpighi', 'Capsule de Bowman', 'Tube contourné proximal', 'Anse de Henle', 'Tube contourné distal', 'Tube collecteur', 'Néphrons corticaux vs juxtamédullaires', 'Appareil juxtaglomérulaire', 'Macula densa', 'Innervation sympathique', 'Lymphatiques', 'Récapitulatif'],
    s2: ['Rappels séance 1', 'Barrière de filtration', 'Endothélium fenêtré', 'Membrane basale', 'Podocytes et fentes', 'Sélectivité de taille et de charge', 'Forces de Starling', 'Pression capillaire glomérulaire', 'Pression oncotique', 'DFG : définition', 'Valeurs normales du DFG', 'Autorégulation myogénique', 'Rétrocontrôle tubulo-glomérulaire', 'Système rénine-angiotensine', 'Artériole afférente / efférente', 'Notion de clairance', 'Clairance de l’inuline', 'Clairance de la créatinine', 'Formule de Cockcroft', 'CKD-EPI', 'Clairance du PAH', 'Fraction de filtration', 'Exercices de calcul', 'Récapitulatif'],
    s3: ['Plan', 'Transport transcellulaire / paracellulaire', 'Na⁺/K⁺-ATPase', 'TCP : réabsorption du Na⁺', 'Cotransport Na⁺-glucose (SGLT2)', 'Glycosurie et seuil rénal', 'Tm du glucose', 'Réabsorption des acides aminés', 'Bicarbonates au TCP', 'Anse de Henle : multiplicateur', 'NKCC2', 'Branche ascendante imperméable', 'TCD : NCC', 'Canal collecteur : ENaC', 'Cellules principales / intercalaires', 'Aldostérone', 'Sécrétion du K⁺', 'Diurétiques : sites d’action', 'Récapitulatif'],
    s4: ['Plan', 'Compartiments liquidiens', 'Osmolalité plasmatique', 'Bilan de l’eau', 'Gradient cortico-papillaire', 'Contre-courant', 'Rôle de l’urée', 'ADH : synthèse et libération', 'Récepteurs V2 et aquaporine 2', 'Soif', 'Clairance de l’eau libre', 'Hyponatrémie', 'SIADH', 'Diabète insipide', 'Volémie et sodium', 'Peptides natriurétiques', 'Récapitulatif'],
    s5: ['Plan', 'pH et ions H⁺', 'Tampons du plasma', 'Bicarbonate / CO₂', 'Henderson-Hasselbalch', 'Réabsorption du HCO₃⁻', 'Excrétion acide', 'Ammoniogenèse', 'Acidité titrable', 'Acidose métabolique', 'Trou anionique', 'Alcalose métabolique', 'Compensation respiratoire', 'Gaz du sang : lecture', 'Cas cliniques', 'Récapitulatif'],
  };
  const seanceDePage = (p) => SEANCES.find((s) => p >= s.debut && p <= s.fin) || null;
  const titreDiapo = (p) => { const s = seanceDePage(p); if (!s) return 'Page ' + p; const t = THEMES[s.id]; return t[(p - s.debut) % t.length]; };

  /* transcripts : phrases horodatées, chacune ancrée sur une page de la séance */
  const PHRASES = {
    s1: ['Bon, on commence. Aujourd’hui on attaque le rein, d’abord l’anatomie, ensuite le néphron.', 'Le rein droit est un peu plus bas que le gauche, à cause du foie, retenez ça.', 'Sur la coupe frontale vous voyez le cortex en périphérie et la médullaire au centre.', 'Les pyramides de Malpighi, c’est la médullaire ; entre elles, les colonnes de Bertin, qui sont du cortex.', 'L’artère rénale se divise en artères segmentaires, puis interlobaires, puis arquées.', 'Attention : les artères segmentaires sont terminales, pas d’anastomoses. Question classique.', 'Le néphron, c’est l’unité fonctionnelle : à peu près un million par rein.', 'Le corpuscule, c’est le glomérule plus la capsule de Bowman.', 'Le tube contourné proximal réabsorbe à peu près les deux tiers du filtrat.', 'L’anse de Henle descend dans la médullaire, surtout pour les néphrons juxtamédullaires.', 'L’appareil juxtaglomérulaire, c’est là que se fabrique la rénine. On y revient en séance 2.', 'La macula densa détecte le chlorure de sodium dans le tube distal.', 'Je vous ai mis un récapitulatif, c’est typiquement ce qui tombe en QCM.'],
    s2: ['On reprend où on s’était arrêtés : le corpuscule. Aujourd’hui, la filtration.', 'La barrière a trois couches : endothélium fenêtré, membrane basale, podocytes.', 'Elle est sélective sur la taille, mais aussi sur la charge : l’albumine est négative, elle passe mal.', 'Les forces de Starling : pression capillaire contre pression dans Bowman et pression oncotique.', 'Le DFG normal, c’est environ 120 mL par minute, 180 litres par jour.', 'Autorégulation : le DFG reste stable entre 80 et 180 mmHg de pression artérielle.', 'Deux mécanismes : la réponse myogénique et le rétrocontrôle tubulo-glomérulaire.', 'Si on contracte l’artériole efférente, la pression glomérulaire monte, donc le DFG aussi.', 'La clairance, c’est le volume de plasma totalement épuré d’une substance par unité de temps.', 'C égale U fois V sur P. Écrivez-le partout, c’est la formule de l’année.', 'L’inuline est filtrée, ni réabsorbée ni sécrétée : sa clairance égale le DFG.', 'La créatinine est un peu sécrétée, donc elle surestime légèrement le DFG.', 'Le PAH est filtré et sécrété presque totalement : il mesure le débit plasmatique rénal.', 'Fraction de filtration : DFG sur débit plasmatique, autour de 20 %.', 'On fait des exercices de calcul, sortez une feuille.'],
    s3: ['Aujourd’hui le tubule : qu’est-ce qui est réabsorbé, où, et comment.', 'Tout repose sur la pompe sodium-potassium au pôle basolatéral.', 'Au TCP, le sodium entre avec le glucose par SGLT2.', 'Au-delà d’environ 180 mg/dL de glycémie, les transporteurs saturent : glycosurie.', 'L’anse de Henle crée le gradient : la branche ascendante est imperméable à l’eau.', 'NKCC2 dans la branche ascendante large : c’est la cible du furosémide.', 'Au TCD, le cotransporteur sodium-chlore, NCC, cible des thiazidiques.', 'Dans le canal collecteur, ENaC sous contrôle de l’aldostérone.', 'L’aldostérone fait réabsorber le sodium et sécréter le potassium.', 'Pour les diurétiques, retenez le site d’action et l’effet sur le potassium.'],
    s4: ['On parle de l’eau. Premier point : les compartiments liquidiens.', 'L’osmolalité plasmatique normale, autour de 285 mOsm par kilo.', 'Le gradient cortico-papillaire va jusqu’à 1200 dans la papille.', 'Le contre-courant, c’est l’anse qui multiplie et les vasa recta qui échangent.', 'L’urée participe pour moitié au gradient de la médullaire interne.', 'L’ADH est synthétisée dans l’hypothalamus et libérée par la post-hypophyse.', 'Elle agit sur les récepteurs V2, qui font monter l’aquaporine 2 à la membrane.', 'Une hyponatrémie, c’est d’abord un problème d’eau, pas de sodium.', 'Le SIADH : trop d’ADH, urines trop concentrées pour une osmolalité basse.', 'Diabète insipide : central ou néphrogénique, test de restriction hydrique.'],
    s5: ['Bonjour à tous. Dernière séance du module : l’équilibre acide-base.', 'Le pH normal est entre 7,38 et 7,42. On parle d’acidémie en dessous.', 'Le principal tampon extracellulaire, c’est le couple bicarbonate / CO₂.', 'Henderson-Hasselbalch : pH égale 6,1 plus log de bicarbonate sur 0,03 fois PCO₂.', 'Le rein réabsorbe presque tout le bicarbonate filtré, surtout au TCP.', 'Il excrète aussi les acides : acidité titrable et ammonium.', 'L’ammoniogenèse augmente en cas d’acidose chronique, c’est l’adaptation majeure.', 'Devant une acidose métabolique, toujours calculer le trou anionique.', 'Trou anionique augmenté : pensez acidocétose, lactates, insuffisance rénale, toxiques.', 'Compensation respiratoire : la PCO₂ attendue, c’est 1,5 fois le bicarbonate plus 8.', 'On fait deux cas cliniques de gaz du sang pour finir.'],
  };
  const mmss = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const TRANSCRIPTS = {};
  for (const s of SEANCES) {
    const ph = PHRASES[s.id]; const total = s.etat === 'faite' ? 6600 : 0; const lignes = [];
    const n = s.etat === 'faite' ? ph.length * 3 : ph.length;
    for (let i = 0; i < n; i++) {
      const page = s.debut + Math.round((i / Math.max(1, n - 1)) * (s.fin - s.debut));
      const t = s.etat === 'faite' ? Math.round((i / n) * total) + 40 : i * 95 + 12;
      lignes.push({ t, horo: mmss(t), page, texte: ph[i % ph.length], qui: i % 7 === 3 ? 'Étudiant' : 'Prof' });
    }
    TRANSCRIPTS[s.id] = { seance: s.id, lignes, mots: lignes.length * 23 };
  }

  /* fiches de résumé : chaque page de fiche cite ses pages de diapo et sa plage de transcript */
  const F = (id, titre, seances, nPages, plan, importe) => ({ id, titre, seances, pages: nPages, plan, importe, fichier: id + '.pdf' });
  const FICHES = [
    F('f1', 'Anatomie du rein et du néphron', ['s1'], 12, ['Situation et rapports', 'Configuration interne', 'Vascularisation', 'Le néphron', 'Corpuscule de Malpighi', 'Segments tubulaires', 'Appareil juxtaglomérulaire', 'À retenir'], '1 oct. · 21:40'),
    F('f2a', 'DFG et ses déterminants', ['s2'], 9, ['Barrière de filtration', 'Forces de Starling', 'Valeurs du DFG', 'Autorégulation', 'Artérioles afférente et efférente', 'À retenir'], '8 oct. · 20:15'),
    F('f2b', 'Clairances — méthode et calculs', ['s2'], 7, ['Définition et formule', 'Inuline et créatinine', 'Estimer le DFG', 'PAH et débit plasmatique', 'Exercices corrigés'], '8 oct. · 22:02'),
    F('f3a', 'Transports tubulaires', ['s3'], 11, ['Principes de transport', 'Tube contourné proximal', 'Glucose et seuil rénal', 'Anse de Henle', 'TCD et canal collecteur', 'Aldostérone', 'À retenir'], '15 oct. · 21:10'),
    F('f3b', 'Diurétiques — tableau de synthèse', ['s3'], 4, ['Sites d’action', 'Effets sur la kaliémie', 'Indications'], '16 oct. · 18:30'),
    F('f4', 'Eau, sodium et ADH', ['s4'], 10, ['Compartiments et osmolalité', 'Gradient cortico-papillaire', 'ADH', 'Hyponatrémie', 'SIADH et diabète insipide', 'À retenir'], '22 oct. · 21:55'),
    F('fx', 'Synthèse filtration + anatomie (révision partiel)', ['s1', 's2'], 6, ['Du néphron au DFG', 'Clairances en un tableau', 'Pièges de QCM'], '26 oct. · 15:20'),
  ];
  /* fiche que l'on importera dans la démo (séance 5, après le cours) */
  const FICHE_A_IMPORTER = F('f5', 'Équilibre acide-base', ['s5'], 8, ['Tampons et pH', 'Rôle du rein', 'Ammoniogenèse', 'Acidose métabolique', 'Trou anionique', 'Compensation', 'À retenir'], 'à l’instant');

  /* contenu détaillé (puces) de quelques pages ; le reste est dérivé du plan */
  const PUCES = {
    'Barrière de filtration': ['3 couches : endothélium fenêtré, membrane basale, podocytes', 'Sélectivité de taille (< 70 kDa) et de charge (anions repoussés)', 'Albumine : 69 kDa, négative → quasi absente de l’urine'],
    'Forces de Starling': ['PUF = (Pcg − Pb) − (πcg − πb)', 'Pcg ≈ 55 mmHg, Pb ≈ 15, πcg ≈ 30', 'Pression nette ≈ 10 mmHg en début de capillaire'],
    'Valeurs du DFG': ['DFG ≈ 120 mL/min ≈ 180 L/j', 'Diminue avec l’âge (≈ −1 mL/min/an après 40 ans)', 'Normalisé à 1,73 m² de surface corporelle'],
    'Autorégulation': ['DFG stable pour PAM 80 → 180 mmHg', 'Réponse myogénique de l’artériole afférente', 'Rétrocontrôle tubulo-glomérulaire (macula densa)'],
    'Artérioles afférente et efférente': ['Vasoconstriction afférente → ↓ Pcg → ↓ DFG', 'Vasoconstriction efférente → ↑ Pcg → ↑ DFG (modérée)', 'Angiotensine II : efférente ++ → maintien du DFG'],
    'À retenir': ['La formule à savoir écrire sans réfléchir', 'Les 3 valeurs normales', 'Le piège classique du QCM'],
    'Définition et formule': ['Volume de plasma épuré par unité de temps', 'C = U × V / P', 'Unité : mL/min'],
    'Inuline et créatinine': ['Inuline : filtrée, ni réabsorbée ni sécrétée → C = DFG', 'Créatinine : légère sécrétion → surestime le DFG', 'Dosage simple, utilisée en pratique'],
    'Tampons et pH': ['pH normal 7,38–7,42', 'Couple HCO₃⁻ / CO₂ : tampon principal', 'pH = 6,1 + log [HCO₃⁻] / (0,03 × PCO₂)'],
  };
  const pucesDe = (titre) => PUCES[titre] || ['Idée principale de la partie « ' + titre + ' »', 'Mécanisme expliqué en une phrase', 'Valeur ou exemple à connaître'];

  /* pages d'une fiche : titre, puces, sources (pages du diapo et plage de transcript) */
  function pagesFiche(f) {
    const ss = f.seances.map((id) => SEANCES.find((s) => s.id === id));
    const out = [];
    for (let i = 0; i < f.pages; i++) {
      const titre = f.plan[i % f.plan.length] + (i >= f.plan.length ? ' (suite)' : '');
      const s = ss[Math.min(ss.length - 1, Math.floor((i / f.pages) * ss.length))];
      const span = s.fin - s.debut;
      const a = s.debut + Math.floor((i / f.pages) * span * (ss.length)) % (span + 1);
      const de = Math.min(s.fin, Math.max(s.debut, a)), a2 = Math.min(s.fin, de + 3);
      const tr = TRANSCRIPTS[s.id].lignes.filter((l) => l.page >= de && l.page <= a2);
      out.push({ n: i + 1, titre, puces: pucesDe(f.plan[i % f.plan.length]), seance: s.id, sources: { de, a: a2 }, extrait: tr.slice(0, 2) });
    }
    return out;
  }

  /* annotations d'exemple sur les fiches (surlignages et notes) */
  const ANNOTATIONS = {
    f2a: [{ page: 2, puce: 0, type: 'surligne', couleur: 'jaune' }, { page: 4, puce: 1, type: 'note', texte: 'Le prof a insisté : savoir le refaire avec un schéma.' }],
    f2b: [{ page: 1, puce: 1, type: 'surligne', couleur: 'vert' }],
  };

  window.MR = { COURS, SEANCES, THEMES, TRANSCRIPTS, FICHES, FICHE_A_IMPORTER, ANNOTATIONS, seanceDePage, titreDiapo, pagesFiche, mmss };
})();
