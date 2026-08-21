/* ============================================================
   MedRevise — app shell: loads the IndexedDB snapshot, routes the
   screens, and exposes everything to pages via `ctx`. Theme is the
   shared "univers" theme (passed from the top-level App).
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../shared/Icon.jsx';
import { StudySidebar, LoaderL6 } from './components/ui.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Reviser } from './pages/Reviser.jsx';
import { Bibliotheque } from './pages/Bibliotheque.jsx';
import { Reglages } from './pages/Reglages.jsx';
import { CarnetDashboard } from './pages/CarnetDashboard.jsx';
import { initSpotlight } from './lib/spotlight.js';
import { isClassicUI } from '../shared/uiMode.js';
import { Session } from './session/Session.jsx';
import { Feynman } from './session/Feynman.jsx';
import { Exercice } from './session/Exercice.jsx';
import { AnatQuiz } from './session/AnatQuiz.jsx';
import { PdfReader } from './pdf/PdfReader.jsx';
import { SchemaEditorScreen } from './documents/SchemaEditorScreen.jsx';
import {
  getAll, put, putMany, remove, getStats, setStats as saveStats, genId, syncNow,
  purgeSource, purgeMatiere, purgeFiche, putBackup, newErrorCard,
  getCoursePrompts, setCoursePrompts, getExoPrompts, setExoPrompts,
  getChapExoPrompts, setChapExoPrompts,
} from './lib/storage.js';
import { runMigrations } from './lib/migrate.js';
import { todayISO, startAdaptive } from './lib/sm2.js';
import { addDays, unstartedQuestionsFor, unstartedSchemasFor, dueOnFor, linkedV2Questions } from './lib/planning.js';
import { useIsMobile } from '../shared/hooks/useMediaQuery.js';
import { MobileApp } from './mobile/MobileApp.jsx';

// C — 'documents'/'pdflist'/'transcript' ont disparu : Bibliothèque absorbe la liste
// de documents ET rend PdfReader/SchemaEditorScreen/TranscriptEditor EMBARQUÉS dans
// son panneau de droite. 'pdf'/'schemaedit' restent des routes plein-écran, mais ne
// sont plus atteignables QUE depuis Réviser (« Voir le cours » / « Éditer le schéma »).
const SCREENS = { dashboard: Dashboard, revise: Reviser, library: Bibliotheque, settings: Reglages, session: Session, feynman: Feynman, exercice: Exercice, anatquiz: AnatQuiz, pdf: PdfReader, schemaedit: SchemaEditorScreen, carnet: CarnetDashboard };

function MedBottomNav({ current, onNav }) {
  const items = [
    { id: 'dashboard', label: 'Accueil', icon: 'home' },
    { id: 'revise', label: 'Réviser', icon: 'cards' },
    { id: 'library', label: 'Biblio', icon: 'book' },
    { id: 'carnet', label: 'Carnet', icon: 'target' },
  ];
  // 'carnet' est un onglet à part entière désormais — retiré de la liste
  // ci-dessous (même fix que StudySidebar, ui.jsx) pour ne pas allumer
  // "Réviser" ET "Carnet" en même temps sur l'écran carnet.
  const active = (id) => current === id
    || (id === 'revise' && ['session', 'feynman', 'exercice', 'anatquiz', 'pdf', 'schemaedit'].includes(current));
  return (
    <nav className="bottom-nav">
      {items.map((n) => (
        <button key={n.id} className={'bn-item' + (active(n.id) ? ' active' : '')} onClick={() => onNav(n.id)}>
          <span className="bn-ic"><Icon name={n.icon} size={21} /></span>
          {n.label}
        </button>
      ))}
    </nav>
  );
}

export default function MedReviseApp({ themeApi, goHub }) {
  const { theme, toggleTheme } = themeApi;
  const isMobile = useIsMobile(); // petit écran → shell mobile dédié (voir mobile/MobileApp.jsx)
  const [screen, setScreen] = useState('dashboard');
  const [expanded, setExpanded] = useState(false);
  const [db, setDb] = useState(null);
  const [stats, setStats] = useState(null);
  // surcharges des 4 prompts "Voir les prompts" (vue cours) — {} tant qu'aucune
  // matière n'a été éditée ; DEFAULT_PROMPTS (lib/coursePrompts.js) comble le reste.
  const [promptOverrides, setPromptOverrides] = useState({});
  const [exoPromptOverrides, setExoPromptOverrides] = useState({});
  // surcharge du prompt UNIQUE "Exercices de chapitre" (lib/chapExoPrompt.js) :
  // une seule clé (CHAP_EXO_ID) au lieu de quatre matières, même forme de
  // stockage { clé → texte } que les deux au-dessus.
  const [chapExoPromptOverrides, setChapExoPromptOverrides] = useState({});
  const [session, setSession] = useState(null);
  const [feynman, setFeynman] = useState(null);
  const [exercice, setExercice] = useState(null); // { items:[exercice], title }
  const [anatQuiz, setAnatQuiz] = useState(null); // { fiche, mode:'total'|'random', proportion }
  const [focusFiche, setFocusFiche] = useState(null);
  const [pdfView, setPdfView] = useState(null); // { ficheId, mode: 'read'|'edit', returnScreen }
  const [schemaView, setSchemaView] = useState(null); // { ficheId, returnScreen }
  // 'idle' | 'syncing' | 'ok' | 'offline' | 'disabled' — exposé pour le bouton
  // "Forcer la synchro" (Réglages desktop, accueil mobile), voir forceSync ci-dessous.
  const [syncState, setSyncState] = useState({ status: 'idle', at: null });

  const reload = useCallback(async () => {
    const [sources, matieres, dossiers, fiches, questions, anatstruct, sessionsLog, st, pr, epr, cepr] = await Promise.all([
      getAll('sources'), getAll('matieres'), getAll('dossiers'), getAll('fiches'), getAll('questions'), getAll('anatstruct'), getAll('sessionsLog'), getStats(), getCoursePrompts(), getExoPrompts(), getChapExoPrompts(),
    ]);
    setDb({ sources, matieres, dossiers, fiches, questions, anatstruct, sessionsLog });
    setStats(st);
    setPromptOverrides(pr);
    setExoPromptOverrides(epr);
    setChapExoPromptOverrides(cepr);
  }, []);

  // syncNow() (lib/storage.js) fait, dans l'ordre : rejoue l'outbox → réconcilie
  // (pull + merge cloud) → remet TOUT le local syncable en file d'envoi sans
  // condition (rattrape toute écriture jamais poussée, pas seulement les nouvelles)
  // → repousse immédiatement. Un seul point d'entrée, réutilisé par le bouton
  // "Forcer la synchro" (forceSync ci-dessous) : mêmes garanties partout.
  const forceSync = useCallback(async () => {
    setSyncState((s) => ({ ...s, status: 'syncing' }));
    const r = await syncNow();
    if (r.status === 'ok') await reload();
    setSyncState({ status: r.status, at: new Date().toISOString() });
    return r;
  }, [reload]);

  // A — synchro cloud (no-op silencieux si non configurée/hors-ligne, voir sync.js).
  // Plus de seed de démo (retiré — voir docs/diag-reseed-mobile.md) : un appareil
  // vierge démarre simplement vide, réconcilié avec le cloud s'il y en a un.
  useEffect(() => { (async () => {
    await forceSync();
    await runMigrations(); await reload();
  })(); }, [forceSync, reload]);

  // reconcile à la reconnexion réseau et quand l'onglet redevient visible (retour d'un
  // autre appareil) — capte les changements faits ailleurs sans polling permanent.
  useEffect(() => {
    const onSync = () => { forceSync(); };
    const onVisible = () => { if (document.visibilityState === 'visible') onSync(); };
    window.addEventListener('online', onSync);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('online', onSync); document.removeEventListener('visibilitychange', onVisible); };
  }, [forceSync]);

  // ÉTAPE 3 — halo de bordure qui suit le curseur. Branché une seule fois, dès
  // que la base est chargée (donc que la racine [data-app] est dans le DOM) ;
  // `!!db` et non `db` en dépendance, sinon chaque reload() rebrancherait tout.
  const dbPret = !!db;
  useEffect(() => {
    if (!dbPret) return undefined;
    return initSpotlight(document.querySelector('[data-app="medrevise"]'));
  }, [dbPret]);

  /* ============================================================
     SUPPRESSION EN MASSE des cartes d'UN type, dans UNE fiche (ou dans un chapitre
     pour les exos de chapitre). Un seul chemin pour les quatre types — le MÊME que
     la suppression unitaire (deleteQuestion → remove() → tombstone + outbox, donc
     propagé aux autres appareils), juste appliqué au lot.
     - putBackup AVANT toute suppression (convention des mutations de masse, cf.
       deleteDossier/resetJ plus haut) : le lot exact part dans le store `backups`.
     - PÉRIMÈTRE STRICT : ce type, cette fiche. Les autres types de la fiche et les
       autres fiches ne sont jamais touchés (`ficheId` + `type` dans le filtre).
     - SEULE interaction : les V2 du carnet d'erreurs liées aux flashcards supprimées
       (sourceErrorId) partent avec elles — exactement la cascade déjà appliquée par
       removeFromCarnet, une V2 n'ayant pas de sens sans sa V1. Elles sont comptées et
       ANNONCÉES dans la modale de confirmation (Reviser.jsx), jamais en douce. Le
       reste du carnet (V2 d'autres fiches, V1 non supprimées) n'est pas concerné.
     @returns {number} nombre de cartes du type supprimées (hors V2 en cascade)
     ============================================================ */
  const deleteCardsOfType = async ({ ficheId = null, chapitreId = null, type }) => {
    const cibles = db.questions.filter((q) => q.type === type
      && (ficheId ? q.ficheId === ficheId : q.chapitreId === chapitreId));
    if (!cibles.length) return 0;
    const v2 = type === 'flashcard' ? linkedV2Questions(db, cibles.map((q) => q.id)) : [];
    await putBackup(`pre-delete-${type}-${ficheId || chapitreId}-${Date.now()}`, { questions: cibles, carnetV2: v2 });
    await Promise.all([...cibles, ...v2].map((q) => remove('questions', q.id)));
    await reload();
    return cibles.length;
  };

  const ctx = {
    theme, toggleTheme, goHub,
    go: setScreen,
    db, stats, reload, promptOverrides, exoPromptOverrides, chapExoPromptOverrides,
    syncState, forceSync,
    focusFiche, setFocusFiche,
    session, feynman, exercice, anatQuiz, pdfView, schemaView,

    // ---- session lifecycle ----
    startSession: (items, title, meta = {}) => {
      setSession({ items: items || [], title: title || 'Révision', ...meta });
      setScreen('session');
    },
    startFeynman: (payload) => { setFeynman(payload); setScreen('feynman'); },
    // page Exercice (poste de travail) : une liste d'exercices parcourue un par un.
    // startId (optionnel) : positionne la série sur l'exercice cliqué (ExerciceCards,
    // Réviser) au lieu de toujours redémarrer à l'index 0 — Précédent/Suivant
    // parcourent alors la série complète, pas un item isolé.
    // mode (optionnel) : 'weekend' → session bonus (WeekendReviewCard, Dashboard),
    // voir Exercice.jsx Workstation.applyResult, AUCUNE écriture (historique/
    // missed/statut/dueDate de l'exo intacts).
    startExercice: (items, title, opts = {}) => { setExercice({ items: items || [], title: title || 'Exercices', startId: opts.startId || null, mode: opts.mode || null }); setScreen('exercice'); },
    // quiz d'anatomie visuelle (fiche anat_schema) : écran dédié.
    startAnatQuiz: (fiche, opts = {}) => {
      setAnatQuiz({ fiche, mode: opts.mode || 'total', proportion: opts.proportion ?? 0.5, theory: !!opts.theory });
      setScreen('anatquiz');
    },
    endSession: () => { setSession(null); setScreen('dashboard'); },

    // ---- lecteur PDF (Partie B) : ouvert en overlay plein écran (nouvel
    // écran 'pdf'), revient à l'écran d'où il a été ouvert à la fermeture.
    openPdfReader: (ficheId, mode, returnScreen, srcTab) => {
      setPdfView({ ficheId, mode: mode || 'read', returnScreen: returnScreen || screen, srcTab });
      setScreen('pdf');
    },
    closePdfReader: () => { const back = pdfView && pdfView.returnScreen; setScreen(back || 'library'); setPdfView(null); },

    // ---- éditeur de schéma d'anatomie : route plein-écran, déclenchée UNIQUEMENT
    // depuis Réviser désormais (Bibliothèque l'ouvre embarqué, sans passer par ctx) ;
    // bascule Lecture / Édition ; revient à l'écran d'origine ----
    openSchemaEditor: (ficheId, returnScreen) => { setSchemaView({ ficheId, returnScreen: returnScreen || screen }); setScreen('schemaedit'); },
    closeSchemaEditor: () => { const back = schemaView && schemaView.returnScreen; setScreen(back || 'library'); setSchemaView(null); },

    // ---- mutations (persist + reload) ----
    saveQuestion: async (q) => { await put('questions', q); await reload(); },
    saveFiche: async (f) => { await put('fiches', f); await reload(); },
    setMatiereCouleur: async (matiereId, couleur) => {
      const m = db.matieres.find((x) => x.id === matiereId); if (!m) return;
      await put('matieres', { ...m, couleur }); await reload();
    },
    setSourceRappels: async (sourceId, on) => {
      const s = db.sources.find((x) => x.id === sourceId); if (!s) return;
      await put('sources', { ...s, rappelsJ: on }); await reload();
    },
    setSourceArchived: async (sourceId, on) => {
      const s = db.sources.find((x) => x.id === sourceId); if (!s) return;
      await put('sources', { ...s, archive: on }); await reload();
    },
    renameSource: async (sourceId, nom) => {
      const s = db.sources.find((x) => x.id === sourceId); if (!s || !nom.trim()) return;
      await put('sources', { ...s, nom: nom.trim() }); await reload();
    },
    addSource: async (nom) => {
      const id = genId('s');
      await put('sources', { id, nom: (nom || 'Nouveau cours').trim(), rappelsJ: true, archive: false, icon: 'folder', tint: '#7C6FE0' });
      await reload(); return id;
    },
    addMatiere: async (sourceId, nom) => {
      const id = genId('m');
      // pas de `couleur` fixe ici : matiereMeta (ui.jsx) retombe sur une teinte
      // par défaut DISTINCTE par matière (hash de l'id) tant que l'utilisateur
      // n'a rien choisi dans Réglages → Couleurs par matière.
      await put('matieres', { id, sourceId, nom: (nom || 'Nouvelle matière').trim(), icon: 'book' });
      await reload(); return id;
    },
    renameFiche: async (ficheId, titre) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f || !titre.trim()) return;
      await put('fiches', { ...f, titre: titre.trim() }); await reload();
    },
    renameMatiere: async (matiereId, nom) => {
      const m = db.matieres.find((x) => x.id === matiereId); if (!m || !nom.trim()) return;
      await put('matieres', { ...m, nom: nom.trim() }); await reload();
    },
    // sous-dossiers d'une matière (Réviser + Bibliothèque) : pur rangement
    // d'affichage, voir fiche.dossierId — jamais lu par sm2.js/planning.js, aucun
    // effet sur le planning/J/révision. Même patron que addMatiere/renameMatiere/
    // deleteMatiere, un cran plus bas.
    //
    // DEUX NIVEAUX EXACTEMENT (Unité → Chapitre), portés par le seul champ
    // `parentId` : dossier SANS parentId = UNITÉ (enfant direct de la matière),
    // dossier AVEC parentId = CHAPITRE (enfant d'une unité). Le niveau se DÉDUIT
    // de parentId — pas de champ `type` à maintenir en cohérence.
    // `matiereId` est conservé sur les chapitres (dénormalisé, redondant avec
    // celui du parent) VOLONTAIREMENT : purgeMatiere (storage.js) et tous les
    // filtres `d.matiereId === ...` restent valables tels quels, et un chapitre ne
    // peut jamais devenir orphelin à la suppression d'une matière.
    // fiche.dossierId, lui, ne change pas de sémantique : il pointe vers l'unité
    // OU vers le chapitre (une fiche est dans exactement un bucket).
    addDossier: async (matiereId, nom, parentId = null) => {
      // garde « 2 niveaux » côté données (l'UI n'offre déjà aucun 3e niveau) : on
      // ne peut créer un chapitre que SOUS une unité, jamais sous un chapitre.
      if (parentId) {
        const p = db.dossiers.find((x) => x.id === parentId);
        if (!p || p.parentId) return null;
      }
      const id = genId('d');
      // frères = même matière ET même parent (les `ordre` sont scopés au niveau).
      const siblings = db.dossiers.filter((d) => d.matiereId === matiereId && (d.parentId || null) === (parentId || null));
      await put('dossiers', { id, matiereId, parentId: parentId || null, nom: (nom || (parentId ? 'Nouveau chapitre' : 'Nouvelle unité')).trim(), ordre: siblings.length });
      await reload(); return id;
    },
    renameDossier: async (dossierId, nom) => {
      const d = db.dossiers.find((x) => x.id === dossierId); if (!d || !nom.trim()) return;
      await put('dossiers', { ...d, nom: nom.trim() }); await reload();
    },
    // supprime le dossier SANS supprimer les fiches qu'il contient, à un niveau
    // près selon ce qu'on supprime :
    //  - CHAPITRE : ses fiches remontent dans l'UNITÉ parente (dossierId → parentId) ;
    //  - UNITÉ : ses chapitres sont supprimés avec elle (sinon ils resteraient
    //    orphelins, sans parent affichable) et TOUTES les fiches concernées (les
    //    siennes + celles de ses chapitres) remontent à la RACINE de la matière.
    // Dans les deux cas les fiches sont ajoutées en fin du bucket cible, et un
    // putBackup couvre le dossier, ses chapitres et les fiches réassignées AVANT la
    // mutation de masse (voir convention storage.js#putBackup) — irréversible
    // seulement pour le(s) dossier(s), jamais pour leur contenu.
    deleteDossier: async (dossierId) => {
      const d = db.dossiers.find((x) => x.id === dossierId); if (!d) return;
      const chapitres = d.parentId ? [] : db.dossiers.filter((x) => x.parentId === dossierId);
      const ids = [dossierId, ...chapitres.map((c) => c.id)];
      const fiches = db.fiches.filter((f) => ids.includes(f.dossierId) && !f.archive);
      const cible = d.parentId || null; // chapitre → unité parente ; unité → racine
      // exercices rattachés aux chapitres supprimés (chapitreId, voir
      // storage.js#newChapitreExo) : contrairement aux fiches, ils n'ont NULLE PART
      // où remonter (un exo se rattache à une fiche ou à un chapitre, jamais à une
      // unité ni à une matière) — ils sont donc supprimés avec leur chapitre. Le
      // putBackup ci-dessous les embarque, et la modale de confirmation annonce leur
      // nombre explicitement (voir dossierDeleteTexts).
      const exos = db.questions.filter((q) => q.chapitreId && ids.includes(q.chapitreId));
      if (fiches.length || chapitres.length || exos.length) {
        await putBackup(`pre-delete-dossier-${dossierId}-${Date.now()}`, { dossier: d, chapitres, fiches, exos });
      }
      if (fiches.length) {
        const targetSiblings = db.fiches
          .filter((f) => f.matiereId === d.matiereId && (f.dossierId || null) === cible && !f.archive)
          .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
        await putMany('fiches', fiches.map((f, i) => ({ ...f, dossierId: cible, ordre: targetSiblings.length + i })));
      }
      await Promise.all([
        ...exos.map((q) => remove('questions', q.id)),
        ...ids.map((id) => remove('dossiers', id)),
      ]);
      await reload();
    },
    setMatiereArchived: async (matiereId, on) => {
      const m = db.matieres.find((x) => x.id === matiereId); if (!m) return;
      await put('matieres', { ...m, archive: on }); await reload();
    },
    // A2 : corbeille pour une fiche supprimée depuis le clic droit de Réviser.
    setFicheArchived: async (ficheId, on) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      await put('fiches', { ...f, archive: on }); await reload();
    },
    // pendant de setSourceRappels, mais au niveau FICHE : retire/remet cette seule
    // fiche de la méthode des J (isFicheScheduled, planning.js), sans effet sur le
    // cours parent ni sur les autres fiches. Réversible, ne touche pas archive.
    setFicheRappelsJ: async (ficheId, on) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      await put('fiches', { ...f, rappelsJ: on }); await reload();
    },
    // suppression DÉFINITIVE et irréversible (Réglages → corbeille), à distinguer de
    // setSourceArchived/setMatiereArchived/setFicheArchived (archivage, restaurable) :
    // ceci tombstone en cascade (source→matières→fiches→questions/highlights/annotations/
    // docs/exos) et se propage à tous les appareils. purgeTrash vide toute la corbeille
    // d'un coup (idempotent : purger deux fois le même id ne casse rien).
    permanentlyDeleteSource: async (sourceId) => { await purgeSource(sourceId); await reload(); },
    permanentlyDeleteMatiere: async (matiereId) => { await purgeMatiere(matiereId); await reload(); },
    permanentlyDeleteFiche: async (ficheId) => { await purgeFiche(ficheId); await reload(); },
    emptyTrash: async () => {
      const srcs = db.sources.filter((s) => s.archive);
      const mats = db.matieres.filter((m) => m.archive);
      const fics = db.fiches.filter((f) => f.archive);
      await Promise.all([
        ...srcs.map((s) => purgeSource(s.id)),
        ...mats.map((m) => purgeMatiere(m.id)),
        ...fics.map((f) => purgeFiche(f.id)),
      ]);
      await reload();
    },
    // corbeille (A5/A6) : supprime la matière (archive, restaurable depuis Réglages).
    // Si elle contient encore des fiches actives, elles sont déplacées vers
    // "À classer" (créée à la volée dans le même cours) plutôt que supprimées.
    deleteMatiere: async (matiereId) => {
      const m = db.matieres.find((x) => x.id === matiereId); if (!m) return;
      const fiches = db.fiches.filter((f) => f.matiereId === matiereId && !f.archive);
      if (fiches.length) {
        let uncat = db.matieres.find((x) => x.sourceId === m.sourceId && x.uncategorized && !x.archive);
        let uncatId = uncat && uncat.id;
        if (!uncatId) {
          uncatId = genId('m');
          await put('matieres', { id: uncatId, sourceId: m.sourceId, nom: 'À classer', couleur: '#9AA0AE', icon: 'box', uncategorized: true, archive: false });
        }
        // dossierId réinitialisé : un dossier appartient à SA matière d'origine
        // (voir fiche.dossierId) — « À classer » est un bac plat, pas de dossiers.
        await putMany('fiches', fiches.map((f) => ({ ...f, matiereId: uncatId, dossierId: null })));
      }
      await put('matieres', { ...m, archive: true });
      await reload();
    },
    // A8 : réordonne / déplace une fiche (drag & drop, ou menu « Déplacer vers »,
    // dans la Bibliothèque). beforeFicheId=null → ajoutée en fin du bucket cible.
    // dossierId (optionnel) : sous-dossier cible au sein de la matière — null/
    // absent = racine de la matière. Les frères/sœurs pris en compte pour
    // l'ordre sont scopés au MÊME bucket (matiereId + dossierId), le dossier
    // reste un pur rangement d'affichage (voir fiche.dossierId, storage.js).
    moveFicheTo: async (ficheId, matiereId, beforeFicheId, dossierId = null) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      const siblings = db.fiches
        .filter((x) => x.matiereId === matiereId && (x.dossierId || null) === (dossierId || null) && x.id !== ficheId && !x.archive)
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
      let at = siblings.length;
      if (beforeFicheId) { const i = siblings.findIndex((x) => x.id === beforeFicheId); if (i >= 0) at = i; }
      const ordered = [...siblings.slice(0, at), f, ...siblings.slice(at)];
      await putMany('fiches', ordered.map((x, i) => ({ ...x, matiereId, dossierId: dossierId || null, ordre: i })));
      await reload();
    },
    // B1 : rattache (ou détache, pdfId=null) un PDF à une fiche existante.
    // pdfName (optionnel) : nom de fichier d'origine, pour l'afficher (détacher l'efface).
    setFichePdf: async (ficheId, pdfId, pdfName) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      await put('fiches', { ...f, pdfId: pdfId || null, pdfName: pdfId ? (pdfName || f.pdfName || null) : null }); await reload();
    },
    // rattache (ou détache, htmlId=null) une fiche HTML à une fiche existante —
    // même logique que setFichePdf, indépendante (une fiche peut porter les deux).
    setFicheHtml: async (ficheId, htmlId, htmlName) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      await put('fiches', { ...f, htmlId: htmlId || null, htmlName: htmlId ? (htmlName || f.htmlName || null) : null }); await reload();
    },
    // Bibliothèque → « Remplacer le fichier HTML » : écrase UNIQUEMENT htmlId/htmlName
    // de la fiche (même champ que setFicheHtml/« Voir le cours »), jamais les cartes/
    // plan/carnet (autres stores, non touchés ici). putBackup avant l'écrasement —
    // la confirmation elle-même est portée par la modale appelante (Bibliotheque.jsx),
    // pas ici (même convention que permanentlyDelete*/emptyTrash).
    replaceFicheHtml: async (ficheId, htmlId, htmlName) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f || !htmlId) return;
      await putBackup('pre-remplace-html-' + ficheId + '-' + Date.now(), { fiche: f });
      await put('fiches', { ...f, htmlId, htmlName: htmlName || null });
      await reload();
    },
    // étiquette de cours (100 % manuelle, purement informative — voir CLAUDE.md/prompt) :
    // aucun effet sur SM-2/méthode des J, juste un marqueur visuel sur la fiche.
    setFicheEtiquette: async (ficheId, etiquette) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      await put('fiches', { ...f, etiquette: etiquette || null }); await reload();
    },
    // « Réinitialiser les dates » (Réglages, bouton destructif confirmé côté
    // UI) : efface le planning (intervalDays/dueDate/capped/termine/j0Date)
    // de TOUTES les questions qcm/flashcard et fiches anat_schema —
    // calendrier vide, plus aucune échéance due nulle part. Le CONTENU
    // (fiches, cartes, historique, carnet d'erreurs) reste intact, seules
    // les dates/J disparaissent : une carte sans `intervalDays` est déjà
    // proprement exclue de tout calcul de planning (dueOn/overdue, voir
    // planning.js) et s'affiche "Nouvelle" (labelForCursor, sm2.js) — aucun
    // nouvel état à gérer. `j0Date` retiré AVEC les autres : un "vrai J+N
    // depuis le début" qui survivrait à un reset planning serait trompeur
    // (la carte redevient "sans planning", son prochain "Décaler le départ"
    // lui posera un j0Date FRAIS, voir shiftSourceStart/shiftFicheStart).
    // Exercices/Feynman : rien à faire, ils n'ont jamais eu ces champs
    // (storage.js newItem ne leur en donne pas). putBackup avant l'écriture
    // en masse ; idempotent (rien à effacer une 2e fois si déjà fait).
    resetAllJ: async () => {
      const targets = db.questions.filter((q) => (q.type === 'qcm' || q.type === 'flashcard') && q.intervalDays != null);
      const schemaTargets = db.fiches.filter((f) => f.type === 'anat_schema' && f.intervalDays != null);
      if (!targets.length && !schemaTargets.length) return;
      await putBackup('pre-reset-j-' + Date.now(), { questions: targets, schemas: schemaTargets });
      const strip = (rec) => { const { intervalDays, dueDate, capped, termine, j0Date, ...rest } = rec; return rest; };
      if (targets.length) await putMany('questions', targets.map(strip));
      if (schemaTargets.length) await putMany('fiches', schemaTargets.map(strip));
      await reload();
    },
    // « Retirer du retard » (boîte À rattraper, Dashboard/Réviser) : NE révise
    // PAS — repousse juste `dueDate` à demain, SANS toucher à `intervalDays`
    // (même principe que Réorganiser : déplacer une échéance ne change QUE
    // cette date). Cas particulier de "Réorganiser" ciblé automatiquement sur
    // demain plutôt que choisi par l'utilisateur — un simple report d'un jour
    // sur les items effectivement en retard de `group`.
    dismissOverdue: async (group) => {
      const tomorrow = addDays(todayISO(), 1);
      const bump = (rec) => ({ ...rec, dueDate: tomorrow });
      if (group.isSchema) {
        const f = db.fiches.find((x) => x.id === group.fiche.id); if (!f) return;
        await put('fiches', bump(f));
      } else {
        const ids = new Set(group.items.map((i) => i.id));
        const targets = db.questions.filter((q) => ids.has(q.id));
        await putMany('questions', targets.map(bump));
      }
      await reload();
    },
    // décalage/pose du départ (J0) — Réviser, étape 1/3. Cible les cartes SANS
    // planning actif OU jamais révisées (unstartedQuestionsFor/unstartedSchemasFor
    // — voir planning.js isUnstarted). `date` PEUT être dans le passé (cours déjà
    // commencé dans la vraie vie, ou fiche resetée qu'on repositionne) :
    // startAdaptive pose alors `dueDate = date` directement, immédiatement "en
    // retard" si passée — aucune position à calculer (contrairement à l'ancienne
    // chronologie fixe). `j0Date: date` posé EN MÊME TEMPS — c'est littéralement
    // le vrai début de la carte (voir sm2.js trueDaysSinceJ0/storage.js newItem).
    // putBackup avant l'écriture en masse (précaution type migration) ; sans
    // risque puisqu'il n'y a pas (ou plus) d'historique de planning à préserver
    // ici. Couvre AUSSI les fiches anat_schema (l'item planifiable vit sur la
    // fiche, pas des questions).
    shiftSourceStart: async (sourceId, date) => {
      const targets = unstartedQuestionsFor(db, { sourceId });
      const schemaTargets = unstartedSchemasFor(db, { sourceId });
      if (!targets.length && !schemaTargets.length) return;
      await putBackup('pre-decalage-source-' + sourceId + '-' + Date.now(), { questions: targets, schemas: schemaTargets });
      if (targets.length) await putMany('questions', targets.map((q) => ({ ...q, ...startAdaptive(date), j0Date: date })));
      if (schemaTargets.length) await putMany('fiches', schemaTargets.map((f) => ({ ...f, ...startAdaptive(date), j0Date: date })));
      await reload();
    },
    shiftFicheStart: async (ficheId, date) => {
      const targets = unstartedQuestionsFor(db, { ficheId });
      const schemaTargets = unstartedSchemasFor(db, { ficheId });
      if (!targets.length && !schemaTargets.length) return;
      await putBackup('pre-decalage-fiche-' + ficheId + '-' + Date.now(), { questions: targets, schemas: schemaTargets });
      if (targets.length) await putMany('questions', targets.map((q) => ({ ...q, ...startAdaptive(date), j0Date: date })));
      if (schemaTargets.length) await putMany('fiches', schemaTargets.map((f) => ({ ...f, ...startAdaptive(date), j0Date: date })));
      await reload();
    },
    // (chantier 4) shiftExosSourceStart/shiftExosFicheStart ont été RETIRÉS avec
    // la méthode des J des exercices : un exercice n'ayant plus d'échéance, il n'y
    // a plus de départ à décaler. Le décalage de la THÉORIE ci-dessus est
    // inchangé. Les anciens exos gardent leur `jalon`/`dueDate` en base, plus
    // personne ne les lit.
    // rééquilibrage calendrier — Réviser, étape 2/3. Déplace les cartes RÉELLEMENT
    // dues le jour `fromDate` (dueOnFor, retard inclus si fromDate = aujourd'hui)
    // vers `toDate` : ne change QUE `dueDate`, jamais `intervalDays`/`capped`/
    // `historique`/`missed` (confirmé — déplacer une carte ne touche pas son
    // intervalle courant). Pas de toggle "cascade" : le moteur adaptatif n'a
    // plus qu'UNE échéance connue par carte (contrairement à l'ancienne
    // chronologie fixe à 7 crans) — il n'y a plus rien de plus à décaler,
    // cascade ON/OFF étaient devenus identiques (retiré, voir la mécanique
    // validée). putBackup avant l'écriture en masse.
    moveSourceDay: async (sourceId, fromDate, toDate) => {
      const targets = dueOnFor(db, fromDate, { sourceId });
      if (!targets.length) return;
      await putBackup('pre-reequilibrage-source-' + sourceId + '-' + Date.now(), targets);
      await putMany('questions', targets.map((q) => ({ ...q, dueDate: toDate })));
      await reload();
    },
    moveFicheDay: async (ficheId, fromDate, toDate) => {
      const targets = dueOnFor(db, fromDate, { ficheId });
      if (!targets.length) return;
      await putBackup('pre-reequilibrage-fiche-' + ficheId + '-' + Date.now(), targets);
      await putMany('questions', targets.map((q) => ({ ...q, dueDate: toDate })));
      await reload();
    },
    // « Sauter » un jour donné pour un cours/une fiche : oubliée pour CE jour
    // précis, sans toucher au moteur d'intervalle — écrit `skippedOn: date`
    // sur chaque carte réellement due ce jour-là (dueOnFor, même ciblage que
    // moveSourceDay/moveFicheDay). AUCUNE progression : `intervalDays`/
    // `dueDate`/`capped`/`termine`/`historique` intacts, donc la carte revient
    // normalement dès le jour SUIVANT (planning.js#dueOn compare
    // `skippedOn === dateISO` — un jour différent ne matche plus, elle
    // redevient due comme prévu). Pas de putBackup ici (contrairement à
    // moveSourceDay/moveFicheDay) : un simple flag non destructif, sans
    // risque de perte de progression à couvrir.
    // (Historique du bug : l'ancienne version était un VRAI no-op — un
    // "aparté visuel" qui ne persistait rien du tout, ni en IndexedDB ni dans
    // l'outbox cloud, d'où la carte qui "revenait" au refresh — elle n'était
    // jamais partie. Rien n'y était "bloqué" à proprement parler : cliquer de
    // nouveau relançait le même no-op, silencieusement. Cette version-ci
    // persiste réellement le saut, via putMany → queuePush (storage.js),
    // exactement comme toute autre écriture de l'app.)
    skipDaySource: async (sourceId, date) => {
      const targets = dueOnFor(db, date, { sourceId });
      if (!targets.length) return;
      await putMany('questions', targets.map((q) => ({ ...q, skippedOn: date })));
      await reload();
    },
    skipDayFiche: async (ficheId, date) => {
      const targets = dueOnFor(db, date, { ficheId });
      if (!targets.length) return;
      await putMany('questions', targets.map((q) => ({ ...q, skippedOn: date })));
      await reload();
    },
    deleteQuestion: async (id) => { await remove('questions', id); await reload(); },
    // suppression en masse des cartes d'UN type d'UNE fiche ('qcm' | 'flashcard' |
    // 'feynman' | 'exercice') — voir deleteCardsOfType ci-dessus : putBackup, canal
    // durable, périmètre strict (ce type, cette fiche).
    deleteAllOfType: (ficheId, type) => deleteCardsOfType({ ficheId, type }),
    // raccourci historique (section « Exercices » d'une fiche) : même chemin, type figé.
    deleteAllExercices: (ficheId) => deleteCardsOfType({ ficheId, type: 'exercice' }),
    // pendant du précédent pour un CHAPITRE (exos rattachés par chapitreId, voir
    // storage.js#newChapitreExo) — même chemin, juste l'autre rattachement.
    deleteAllExosChapitre: (chapitreId) => deleteCardsOfType({ chapitreId, type: 'exercice' }),
    // carnet d'erreurs v2 (étape 2) : statut d'une V2 ('a_revoir'|'resolu'|
    // 'pause') — ne touche JAMAIS plan/cursor/historique (une V2 n'en a pas,
    // voir storage.js#newErrorCard), juste son état d'affichage dans le
    // tableau de bord. La suppression d'une V2 réutilise deleteQuestion
    // (générique, même store 'questions').
    setV2Statut: async (id, statut) => {
      const q = db.questions.find((x) => x.id === id); if (!q) return;
      await put('questions', { ...q, statut }); await reload();
    },
    // crée une ou plusieurs V2 à partir du JSON collé (lib/parseErrorCardsJson.js,
    // déjà validé — cards = [{recto,verso,sourceErrorId}]) : reliées à leur V1,
    // jamais planifiées, rangées "à revoir" par défaut (newErrorCard).
    createErrorCards: async (cards) => {
      if (!cards || !cards.length) return 0;
      await putMany('questions', cards.map(newErrorCard));
      await reload();
      return cards.length;
    },
    // "sortir du carnet" une V1 : carnetAt/carnetRaison → null — la flashcard
    // elle-même n'est PAS supprimée (plan/cursor/historique/missed intacts,
    // reste dans son cycle J normal), juste retirée du carnet d'erreurs v2.
    // Cascade : ses V2 liées sont supprimées aussi (reco validée — une V2
    // ("flashcard d'erreur ciblée") n'a plus de sens sans sa V1).
    removeFromCarnet: async (v1Id) => {
      const q = db.questions.find((x) => x.id === v1Id); if (!q) return;
      const linkedV2 = db.questions.filter((x) => x.type === 'flashcard_erreur' && x.sourceErrorId === v1Id);
      await Promise.all([
        put('questions', { ...q, carnetAt: null, carnetRaison: null }),
        ...linkedV2.map((v2) => remove('questions', v2.id)),
      ]);
      await reload();
    },
    saveStats: async (s) => { await saveStats(s); setStats(s); },
    // "Voir les prompts" (vue cours) : surcharge le prompt d'UNE matière (persistant,
    // outbox durable — même mécanique que saveStats). `resetPromptOverride` retire la
    // clé plutôt que d'écrire le défaut en dur, pour que DEFAULT_PROMPTS reste la
    // seule source de vérité du contenu par défaut (voir lib/coursePrompts.js).
    savePromptOverride: async (subjectId, text) => {
      const next = { ...promptOverrides, [subjectId]: text };
      await setCoursePrompts(next);
      setPromptOverrides(next);
    },
    // "Modifier les 4" (collage du MD complet, CoursePromptsMenu.jsx) : merge
    // ATOMIQUE des 4 matières en UN seul next/write/setState — appeler
    // savePromptOverride 4 fois de suite dans une boucle serait incorrect
    // (chaque appel referme `promptOverrides` au moment du RENDU courant,
    // qui n'a pas encore vu les écritures précédentes de la même boucle :
    // seule la dernière matière survivrait, les autres écrasées par un
    // `next` construit sur la même base non rafraîchie).
    saveAllPromptOverrides: async (overridesBySubject) => {
      const next = { ...promptOverrides, ...overridesBySubject };
      await setCoursePrompts(next);
      setPromptOverrides(next);
    },
    resetPromptOverride: async (subjectId) => {
      const next = { ...promptOverrides };
      delete next[subjectId];
      await setCoursePrompts(next);
      setPromptOverrides(next);
    },
    // "Voir les prompts (exercices)" — pendant PRATIQUE des 3 méthodes
    // ci-dessus, mêmes garanties (merge atomique, reset = retrait de clé),
    // stockage/état SÉPARÉS (getExoPrompts/setExoPrompts, exoPromptOverrides)
    // pour ne jamais mélanger surcharges théorie et pratique.
    saveExoPromptOverride: async (subjectId, text) => {
      const next = { ...exoPromptOverrides, [subjectId]: text };
      await setExoPrompts(next);
      setExoPromptOverrides(next);
    },
    saveAllExoPromptOverrides: async (overridesBySubject) => {
      const next = { ...exoPromptOverrides, ...overridesBySubject };
      await setExoPrompts(next);
      setExoPromptOverrides(next);
    },
    resetExoPromptOverride: async (subjectId) => {
      const next = { ...exoPromptOverrides };
      delete next[subjectId];
      await setExoPrompts(next);
      setExoPromptOverrides(next);
    },
    // "Exercices de chapitre" — mêmes garanties, stockage/état encore SÉPARÉS
    // (getChapExoPrompts/setChapExoPrompts, chapExoPromptOverrides). Pas de
    // pendant "saveAll…" ici : ce prompt est unique (une seule clé), il n'y a
    // jamais quatre matières à fusionner d'un coup.
    saveChapExoPromptOverride: async (promptId, text) => {
      const next = { ...chapExoPromptOverrides, [promptId]: text };
      await setChapExoPrompts(next);
      setChapExoPromptOverrides(next);
    },
    resetChapExoPromptOverride: async (promptId) => {
      const next = { ...chapExoPromptOverrides };
      delete next[promptId];
      await setChapExoPrompts(next);
      setChapExoPromptOverrides(next);
    },
    // écran de fin de série (QCM/flashcards, desktop + mobile) : un point par
    // série TERMINÉE, jamais reconstruit depuis l'historique par carte (qui ne
    // distingue pas les séries entre elles) — voir lib/storage.js pour le choix
    // du store. `ficheId` est null pour une série multi-fiches : volontairement
    // exclue de tout graphique par fiche plutôt que d'en fausser un.
    logSessionResult: async (rec) => {
      await put('sessionsLog', { id: genId('sl'), createdAt: new Date().toISOString(), ...rec });
      await reload();
    },
  };

  if (!db) {
    // Mode « UI d'avant » : l'écran de démarrage d'origine, une simple ligne de
    // texte — le loader L6 est un composant de l'étape 3 du portage.
    if (isClassicUI()) {
      return <div className="soon"><div className="soon-logo"><Icon name="grad" size={30} /></div><p>Chargement de MedRevise…</p></div>;
    }
    return (
      <div className="soon" data-app="medrevise">
        <div className="soon-logo"><Icon name="grad" size={30} /></div>
        <div style={{ width: 220 }}><LoaderL6 label="Chargement de MedRevise" /></div>
      </div>
    );
  }

  // petit écran : shell mobile dédié (révision uniquement) — même ctx, mêmes
  // données, aucune logique dupliquée. Le shell desktop ci-dessous n'est ni
  // monté ni modifié pendant qu'on est en mode mobile.
  if (isMobile) return <MobileApp ctx={ctx} />;

  const Current = SCREENS[screen] || Dashboard;
  return (
    /* data-app : marqueur de portée posé à l'ÉTAPE 3. Le fichier de thème est
       global depuis l'étape 1 ; les ANIMATIONS, elles, sont scopées sous cet
       attribut — MealWeek ne peut donc pas les recevoir, par construction. */
    <div className="app" data-app="medrevise">
      <StudySidebar current={screen} onNav={setScreen} expanded={expanded} onToggle={() => setExpanded((v) => !v)} onHub={goHub} ctx={ctx} />
      <div className="main">
        <Current ctx={ctx} key={screen} />
      </div>
      <MedBottomNav current={screen} onNav={setScreen} />
    </div>
  );
}
