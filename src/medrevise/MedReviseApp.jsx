/* ============================================================
   MedRevise — app shell: loads the IndexedDB snapshot, routes the
   screens, and exposes everything to pages via `ctx`. Theme is the
   shared "univers" theme (passed from the top-level App).
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../shared/Icon.jsx';
import { StudySidebar } from './components/ui.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Reviser } from './pages/Reviser.jsx';
import { Bibliotheque } from './pages/Bibliotheque.jsx';
import { Reglages } from './pages/Reglages.jsx';
import { CarnetDashboard } from './pages/CarnetDashboard.jsx';
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
} from './lib/storage.js';
import { runMigrations } from './lib/migrate.js';
import { todayISO, startAdaptive, dueDateForJalon } from './lib/sm2.js';
import { addDays, unstartedQuestionsFor, unstartedSchemasFor, unstartedExosFor, dueOnFor } from './lib/planning.js';
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
    const [sources, matieres, fiches, questions, anatstruct, sessionsLog, st, pr, epr] = await Promise.all([
      getAll('sources'), getAll('matieres'), getAll('fiches'), getAll('questions'), getAll('anatstruct'), getAll('sessionsLog'), getStats(), getCoursePrompts(), getExoPrompts(),
    ]);
    setDb({ sources, matieres, fiches, questions, anatstruct, sessionsLog });
    setStats(st);
    setPromptOverrides(pr);
    setExoPromptOverrides(epr);
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

  const ctx = {
    theme, toggleTheme, goHub,
    go: setScreen,
    db, stats, reload, promptOverrides, exoPromptOverrides,
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
    setFicheCoef: async (ficheId, v) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      await put('fiches', { ...f, coef: v }); await reload();
    },
    setMatiereCoef: async (matiereId, v) => {
      const m = db.matieres.find((x) => x.id === matiereId); if (!m) return;
      await put('matieres', { ...m, coef: v }); await reload();
    },
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
      await put('sources', { id, nom: (nom || 'Nouveau cours').trim(), rappelsJ: true, archive: false, coef: 3, icon: 'folder', tint: '#7C6FE0' });
      await reload(); return id;
    },
    addMatiere: async (sourceId, nom) => {
      const id = genId('m');
      // pas de `couleur` fixe ici : matiereMeta (ui.jsx) retombe sur une teinte
      // par défaut DISTINCTE par matière (hash de l'id) tant que l'utilisateur
      // n'a rien choisi dans Réglages → Couleurs par matière.
      await put('matieres', { id, sourceId, nom: (nom || 'Nouvelle matière').trim(), coef: 3, icon: 'book' });
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
          await put('matieres', { id: uncatId, sourceId: m.sourceId, nom: 'À classer', couleur: '#9AA0AE', icon: 'box', coef: 3, uncategorized: true, archive: false });
        }
        await putMany('fiches', fiches.map((f) => ({ ...f, matiereId: uncatId })));
      }
      await put('matieres', { ...m, archive: true });
      await reload();
    },
    // A8 : réordonne / déplace une fiche (drag & drop dans la Bibliothèque).
    // beforeFicheId=null → ajoutée en fin de la matière cible.
    moveFicheTo: async (ficheId, matiereId, beforeFicheId) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      const siblings = db.fiches
        .filter((x) => x.matiereId === matiereId && x.id !== ficheId && !x.archive)
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
      let at = siblings.length;
      if (beforeFicheId) { const i = siblings.findIndex((x) => x.id === beforeFicheId); if (i >= 0) at = i; }
      const ordered = [...siblings.slice(0, at), f, ...siblings.slice(at)];
      await putMany('fiches', ordered.map((x, i) => ({ ...x, matiereId, ordre: i })));
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
    // UI) : efface le planning (intervalDays/dueDate/capped/termine) de TOUTES
    // les questions qcm/flashcard et fiches anat_schema — calendrier vide,
    // plus aucune échéance due nulle part. Le CONTENU (fiches, cartes,
    // historique, carnet d'erreurs) reste intact, seules les dates/J
    // disparaissent : une carte sans `intervalDays` est déjà proprement
    // exclue de tout calcul de planning (dueOn/overdue, voir planning.js) et
    // s'affiche "Nouvelle" (labelForCursor, sm2.js) — aucun nouvel état à
    // gérer. Exercices/Feynman : rien à faire, ils n'ont jamais eu ce champ
    // (storage.js newItem ne leur en donne pas). putBackup avant l'écriture
    // en masse ; idempotent (rien à effacer une 2e fois si déjà fait).
    resetAllJ: async () => {
      const targets = db.questions.filter((q) => (q.type === 'qcm' || q.type === 'flashcard') && q.intervalDays != null);
      const schemaTargets = db.fiches.filter((f) => f.type === 'anat_schema' && f.intervalDays != null);
      if (!targets.length && !schemaTargets.length) return;
      await putBackup('pre-reset-j-' + Date.now(), { questions: targets, schemas: schemaTargets });
      const strip = (rec) => { const { intervalDays, dueDate, capped, termine, ...rest } = rec; return rest; };
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
    // chronologie fixe). putBackup avant l'écriture en masse (précaution type
    // migration) ; sans risque puisqu'il n'y a pas (ou plus) d'historique de
    // planning à préserver ici. Couvre AUSSI les fiches anat_schema (l'item
    // planifiable vit sur la fiche, pas des questions).
    shiftSourceStart: async (sourceId, date) => {
      const targets = unstartedQuestionsFor(db, { sourceId });
      const schemaTargets = unstartedSchemasFor(db, { sourceId });
      if (!targets.length && !schemaTargets.length) return;
      await putBackup('pre-decalage-source-' + sourceId + '-' + Date.now(), { questions: targets, schemas: schemaTargets });
      if (targets.length) await putMany('questions', targets.map((q) => ({ ...q, ...startAdaptive(date) })));
      if (schemaTargets.length) await putMany('fiches', schemaTargets.map((f) => ({ ...f, ...startAdaptive(date) })));
      await reload();
    },
    shiftFicheStart: async (ficheId, date) => {
      const targets = unstartedQuestionsFor(db, { ficheId });
      const schemaTargets = unstartedSchemasFor(db, { ficheId });
      if (!targets.length && !schemaTargets.length) return;
      await putBackup('pre-decalage-fiche-' + ficheId + '-' + Date.now(), { questions: targets, schemas: schemaTargets });
      if (targets.length) await putMany('questions', targets.map((q) => ({ ...q, ...startAdaptive(date) })));
      if (schemaTargets.length) await putMany('fiches', schemaTargets.map((f) => ({ ...f, ...startAdaptive(date) })));
      await reload();
    },
    // décalage/pose du départ (J0) des EXERCICES — même geste que ci-dessus,
    // adapté au calendrier FIXE des exos (sm2.js dueDateForJalon/EXO_DELAYS,
    // canal HORS méthode des J théorie, jamais mélangé). Contrairement à
    // startAdaptive (une seule dueDate posée telle quelle), chaque exercice
    // recalcule sa propre échéance depuis SON `jalon` fixe (J0/J+2/J+7/J+15/
    // J+30/J+45) + la nouvelle date de départ — déterministe, pas d'adaptatif
    // ici. `date` PEUT être dans le passé : un jalon qui tombe alors avant
    // aujourd'hui n'est ni dû ni en retard (dueExosOn ne matche que
    // EXACTEMENT aujourd'hui/un jour futur, aucun canal de rattrapage exos —
    // comportement déjà en place, rien à ajouter ici). Cible uniquement les
    // exercices jamais tentés (unstartedExosFor) — un exercice déjà répondu
    // ne revient jamais à une échéance suivante, le décaler n'aurait aucun
    // effet observable. putBackup avant l'écriture en masse.
    shiftExosSourceStart: async (sourceId, date) => {
      const targets = unstartedExosFor(db, { sourceId });
      if (!targets.length) return;
      await putBackup('pre-decalage-exos-source-' + sourceId + '-' + Date.now(), targets);
      await putMany('questions', targets.map((q) => ({ ...q, dueDate: dueDateForJalon(q.jalon, date) })));
      await reload();
    },
    shiftExosFicheStart: async (ficheId, date) => {
      const targets = unstartedExosFor(db, { ficheId });
      if (!targets.length) return;
      await putBackup('pre-decalage-exos-fiche-' + ficheId + '-' + Date.now(), targets);
      await putMany('questions', targets.map((q) => ({ ...q, dueDate: dueDateForJalon(q.jalon, date) })));
      await reload();
    },
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
    // « Sauter » un jour donné pour un cours/une fiche : VRAI no-op — la carte
    // reste due le même jour (aucune écriture), elle réapparaît simplement la
    // prochaine fois qu'on ouvre ce jour. Ancien comportement (avançait le
    // cursor + loguait une fausse note Facile) retiré : contraire à
    // l'intention ("aucun effet", confirmé) — ne cible même plus de cartes,
    // ne fait plus rien du tout.
    skipDaySource: async () => {},
    skipDayFiche: async () => {},
    deleteQuestion: async (id) => { await remove('questions', id); await reload(); },
    // suppression en masse : tous les exercices (type 'exercice') d'UNE fiche, sans
    // toucher aux QCM/flashcards/Feynman de la même fiche. Même canal durable que
    // deleteQuestion (remove() → tombstone + outbox), juste appliqué à tout le lot.
    deleteAllExercices: async (ficheId) => {
      const exos = db.questions.filter((q) => q.ficheId === ficheId && q.type === 'exercice');
      await Promise.all(exos.map((q) => remove('questions', q.id)));
      await reload();
    },
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
    return <div className="soon"><div className="soon-logo"><Icon name="grad" size={30} /></div><p>Chargement de MedRevise…</p></div>;
  }

  // petit écran : shell mobile dédié (révision uniquement) — même ctx, mêmes
  // données, aucune logique dupliquée. Le shell desktop ci-dessous n'est ni
  // monté ni modifié pendant qu'on est en mode mobile.
  if (isMobile) return <MobileApp ctx={ctx} />;

  const Current = SCREENS[screen] || Dashboard;
  return (
    <div className="app">
      <StudySidebar current={screen} onNav={setScreen} expanded={expanded} onToggle={() => setExpanded((v) => !v)} onHub={goHub} ctx={ctx} />
      <div className="main">
        <Current ctx={ctx} key={screen} />
      </div>
      <MedBottomNav current={screen} onNav={setScreen} />
    </div>
  );
}
