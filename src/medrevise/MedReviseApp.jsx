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
} from './lib/storage.js';
import { runMigrations } from './lib/migrate.js';
import { todayISO, buildPlanFrom } from './lib/sm2.js';
import { addDays, unstartedQuestionsFor, unstartedSchemasFor, dueOnFor, dueFromOn, diffDays, planIndexOn } from './lib/planning.js';
import { useIsMobile } from '../shared/hooks/useMediaQuery.js';
import { MobileApp } from './mobile/MobileApp.jsx';

// C — 'documents'/'pdflist'/'transcript' ont disparu : Bibliothèque absorbe la liste
// de documents ET rend PdfReader/SchemaEditorScreen/TranscriptEditor EMBARQUÉS dans
// son panneau de droite. 'pdf'/'schemaedit' restent des routes plein-écran, mais ne
// sont plus atteignables QUE depuis Réviser (« Voir le cours » / « Éditer le schéma »).
const SCREENS = { dashboard: Dashboard, revise: Reviser, library: Bibliotheque, settings: Reglages, session: Session, feynman: Feynman, exercice: Exercice, anatquiz: AnatQuiz, pdf: PdfReader, schemaedit: SchemaEditorScreen, carnet: CarnetDashboard };

// Réorganiser (ctx.moveSourceDay/moveFicheDay ci-dessous) : décale le `plan`
// fixe (lib/sm2.js buildPlan) d'une carte DÉJÀ EN CYCLE. La cible n'est PAS
// forcément l'entrée COURANTE (plan[cursor]) : depuis le fix planIndexOn
// (dueOn/dueOnFor/dueFromOn lisent tout le plan restant, pas seulement
// nextDate), le jour cliqué peut correspondre à une échéance FUTURE pas
// encore atteinte (ex. le J+3 d'une carte encore à J0) — on recalcule donc
// l'index exact (planIndexOn) plutôt que de supposer `cursor`. Sans cascade,
// seule CETTE entrée reçoit `toDate`. Avec cascade, TOUTE entrée `k >= at`
// glisse de `shift` jours. Les entrées avant `at` (déjà faites, ou pas
// encore ciblées) ne sont JAMAIS touchées, dans les deux cas.
function shiftPlan(rec, fromDate, cascade, shift, toDate) {
  const at = planIndexOn(rec, fromDate);
  if (at < 0) return rec; // défensif : ne devrait pas arriver (déjà filtré par dueOnFor/dueFromOn)
  const plan = rec.plan.map((entry, i) => {
    if (i < at) return entry;
    if (!cascade) return i === at ? { ...entry, date: toDate } : entry;
    return { ...entry, date: addDays(entry.date, shift) };
  });
  return { ...rec, plan };
}

function MedBottomNav({ current, onNav }) {
  const items = [
    { id: 'dashboard', label: 'Accueil', icon: 'home' },
    { id: 'revise', label: 'Réviser', icon: 'cards' },
    { id: 'library', label: 'Biblio', icon: 'book' },
  ];
  const active = (id) => current === id
    || (id === 'revise' && ['session', 'feynman', 'exercice', 'anatquiz', 'pdf', 'schemaedit', 'carnet'].includes(current));
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
    const [sources, matieres, fiches, questions, anatstruct, sessionsLog, st] = await Promise.all([
      getAll('sources'), getAll('matieres'), getAll('fiches'), getAll('questions'), getAll('anatstruct'), getAll('sessionsLog'), getStats(),
    ]);
    setDb({ sources, matieres, fiches, questions, anatstruct, sessionsLog });
    setStats(st);
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
    db, stats, reload,
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
    // étiquette de cours (100 % manuelle, purement informative — voir CLAUDE.md/prompt) :
    // aucun effet sur SM-2/méthode des J, juste un marqueur visuel sur la fiche.
    setFicheEtiquette: async (ficheId, etiquette) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      await put('fiches', { ...f, etiquette: etiquette || null }); await reload();
    },
    // « Réinitialiser les dates » (Réglages, bouton destructif confirmé côté
    // UI) : efface le planning (plan/cursor) de TOUTES les questions qcm/
    // flashcard et fiches anat_schema — calendrier vide, plus aucune
    // échéance due nulle part. Le CONTENU (fiches, cartes, historique,
    // carnet d'erreurs) reste intact, seules les dates/J disparaissent :
    // une carte sans `plan` est déjà proprement exclue de tout calcul de
    // planning (dueOn/overdue/projection, voir planning.js) et s'affiche
    // "Nouvelle" (labelForCursor, sm2.js) — aucun nouvel état à gérer.
    // Exercices/Feynman : rien à faire, ils n'ont jamais eu de plan/cursor
    // (storage.js newItem ne leur en donne pas). putBackup avant l'écriture
    // en masse ; idempotent (rien à effacer une 2e fois si déjà fait).
    resetAllJ: async () => {
      const targets = db.questions.filter((q) => (q.type === 'qcm' || q.type === 'flashcard') && q.plan);
      const schemaTargets = db.fiches.filter((f) => f.type === 'anat_schema' && f.plan);
      if (!targets.length && !schemaTargets.length) return;
      await putBackup('pre-reset-j-' + Date.now(), { questions: targets, schemas: schemaTargets });
      const strip = (rec) => { const { plan, cursor, ...rest } = rec; return rest; };
      if (targets.length) await putMany('questions', targets.map(strip));
      if (schemaTargets.length) await putMany('fiches', schemaTargets.map(strip));
      await reload();
    },
    // « Retirer du retard » (boîte À rattraper, Dashboard/Réviser) : NE révise
    // PAS — repousse juste l'échéance COURANTE (plan[cursor]) à demain, SANS
    // toucher aux échéances suivantes ni au cursor (le niveau de la fiche ne
    // change pas). Cas particulier de "Réorganiser décoché" (une seule
    // occurrence bouge), ciblé automatiquement sur demain plutôt que choisi
    // par l'utilisateur — un simple report d'un jour sur les items
    // effectivement en retard de `group`.
    dismissOverdue: async (group) => {
      const tomorrow = addDays(todayISO(), 1);
      const bump = (rec) => {
        const cursor = rec.cursor || 0;
        const plan = rec.plan.map((entry, i) => (i === cursor ? { ...entry, date: tomorrow } : entry));
        return { ...rec, plan };
      };
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
    // buildPlanFrom (pas buildPlan) place alors le cursor sur la première
    // échéance restante au lieu de 0 — les jalons déjà passés ne sont jamais
    // "dus"/"en retard". putBackup avant l'écriture en masse (précaution type
    // migration) ; sans risque puisqu'il n'y a pas (ou plus) d'historique de
    // planning à préserver ici. Couvre AUSSI les fiches anat_schema (l'item
    // planifiable vit sur la fiche, pas des questions), absentes avant ce fix.
    shiftSourceStart: async (sourceId, date) => {
      const targets = unstartedQuestionsFor(db, { sourceId });
      const schemaTargets = unstartedSchemasFor(db, { sourceId });
      if (!targets.length && !schemaTargets.length) return;
      await putBackup('pre-decalage-source-' + sourceId + '-' + Date.now(), { questions: targets, schemas: schemaTargets });
      if (targets.length) await putMany('questions', targets.map((q) => ({ ...q, ...buildPlanFrom(date) })));
      if (schemaTargets.length) await putMany('fiches', schemaTargets.map((f) => ({ ...f, ...buildPlanFrom(date) })));
      await reload();
    },
    shiftFicheStart: async (ficheId, date) => {
      const targets = unstartedQuestionsFor(db, { ficheId });
      const schemaTargets = unstartedSchemasFor(db, { ficheId });
      if (!targets.length && !schemaTargets.length) return;
      await putBackup('pre-decalage-fiche-' + ficheId + '-' + Date.now(), { questions: targets, schemas: schemaTargets });
      if (targets.length) await putMany('questions', targets.map((q) => ({ ...q, ...buildPlanFrom(date) })));
      if (schemaTargets.length) await putMany('fiches', schemaTargets.map((f) => ({ ...f, ...buildPlanFrom(date) })));
      await reload();
    },
    // rééquilibrage calendrier — Réviser, étape 2/3. Déplace les cartes RÉELLEMENT
    // dues le jour `fromDate` (dueOnFor, retard inclus si fromDate = aujourd'hui)
    // vers `toDate`. Contrairement à shiftSourceStart/shiftFicheStart (étape 1) :
    // AUCUN filtre de cursor — une carte déjà en cycle (J+14, ou revenue à J0
    // après un Raté) se déplace comme les autres. putBackup avant l'écriture
    // en masse, même précaution qu'à l'étape 1.
    // `cascade` (étape 3/3) : variante de la même fonction, pas une réécriture.
    // Sans cascade : cible = dueOnFor (jour A précis), seule l'entrée qui
    // correspond à CE jour (planIndexOn, pas forcément plan[cursor] — voir
    // shiftPlan) reçoit `toDate` — les échéances suivantes ne bougent pas.
    // Avec cascade : cible = dueFromOn (jour A ET toutes ses échéances futures
    // déjà programmées), et TOUTE entrée à partir de celle-là glisse de +N
    // jours (N = diffDays(A,B)) — glissement uniforme, écarts entre paliers ET
    // entre cartes préservés. Dans les deux cas, les entrées avant cette
    // échéance (déjà faites, ou pas encore ciblées) et `cursor`/`historique`/
    // `missed` restent intacts.
    moveSourceDay: async (sourceId, fromDate, toDate, { cascade = false } = {}) => {
      const targets = cascade ? dueFromOn(db, fromDate, { sourceId }) : dueOnFor(db, fromDate, { sourceId });
      if (!targets.length) return;
      await putBackup('pre-reequilibrage-source-' + sourceId + '-' + Date.now(), targets);
      const shift = cascade ? diffDays(fromDate, toDate) : null;
      await putMany('questions', targets.map((q) => shiftPlan(q, fromDate, cascade, shift, toDate)));
      await reload();
    },
    moveFicheDay: async (ficheId, fromDate, toDate, { cascade = false } = {}) => {
      const targets = cascade ? dueFromOn(db, fromDate, { ficheId }) : dueOnFor(db, fromDate, { ficheId });
      if (!targets.length) return;
      await putBackup('pre-reequilibrage-fiche-' + ficheId + '-' + Date.now(), targets);
      const shift = cascade ? diffDays(fromDate, toDate) : null;
      await putMany('questions', targets.map((q) => shiftPlan(q, fromDate, cascade, shift, toDate)));
      await reload();
    },
    // « Sauter » un jour donné pour un cours/une fiche : cible = cartes dues
    // CE jour précis (dueOnFor(db, dateISO, …), dateISO peut être un jour futur
    // du calendrier, pas seulement aujourd'hui — depuis le fix planIndexOn,
    // ça inclut une échéance future pas encore atteinte, ex. le J+3 d'une
    // carte encore à J0). Chronologie FIXE oblige : la date de la carte ne
    // bouge JAMAIS ici, `cursor` avance jusqu'à JUSTE APRÈS l'échéance
    // ciblée (planIndexOn + 1, pas bêtement cursor+1 — sinon on avancerait
    // la mauvaise échéance si ce n'est pas celle en cours). L'entrée
    // d'historique est ancrée sur dateISO (le jour sauté), pas sur aujourd'hui.
    skipDaySource: async (sourceId, dateISO) => {
      const targets = dueOnFor(db, dateISO, { sourceId });
      if (!targets.length) return;
      await putBackup('pre-saut-source-' + sourceId + '-' + Date.now(), targets);
      await putMany('questions', targets.map((q) => ({
        ...q,
        cursor: Math.min(planIndexOn(q, dateISO) + 1, q.plan.length),
        historique: (q.historique || []).concat([{ date: dateISO, qualite: 5 }]),
        missed: 0,
      })));
      await reload();
    },
    skipDayFiche: async (ficheId, dateISO) => {
      const targets = dueOnFor(db, dateISO, { ficheId });
      if (!targets.length) return;
      await putBackup('pre-saut-fiche-' + ficheId + '-' + Date.now(), targets);
      await putMany('questions', targets.map((q) => ({
        ...q,
        cursor: Math.min(planIndexOn(q, dateISO) + 1, q.plan.length),
        historique: (q.historique || []).concat([{ date: dateISO, qualite: 5 }]),
        missed: 0,
      })));
      await reload();
    },
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
      <StudySidebar current={screen} onNav={setScreen} expanded={expanded} onToggle={() => setExpanded((v) => !v)} onHub={goHub} />
      <div className="main">
        <Current ctx={ctx} key={screen} />
      </div>
      <MedBottomNav current={screen} onNav={setScreen} />
    </div>
  );
}
