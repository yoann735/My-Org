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
import { Session } from './session/Session.jsx';
import { Feynman } from './session/Feynman.jsx';
import { Exercice } from './session/Exercice.jsx';
import { AnatQuiz } from './session/AnatQuiz.jsx';
import { PdfReader } from './pdf/PdfReader.jsx';
import { SchemaEditorScreen } from './documents/SchemaEditorScreen.jsx';
import {
  getAll, put, putMany, remove, getStats, setStats as saveStats, genId, syncNow,
  purgeSource, purgeMatiere, purgeFiche, putBackup,
} from './lib/storage.js';
import { runMigrations } from './lib/migrate.js';
import { todayISO } from './lib/sm2.js';
import { addDays, unstartedQuestionsFor } from './lib/planning.js';
import { useIsMobile } from '../shared/hooks/useMediaQuery.js';
import { MobileApp } from './mobile/MobileApp.jsx';

// C — 'documents'/'pdflist'/'transcript' ont disparu : Bibliothèque absorbe la liste
// de documents ET rend PdfReader/SchemaEditorScreen/TranscriptEditor EMBARQUÉS dans
// son panneau de droite. 'pdf'/'schemaedit' restent des routes plein-écran, mais ne
// sont plus atteignables QUE depuis Réviser (« Voir le cours » / « Éditer le schéma »).
const SCREENS = { dashboard: Dashboard, revise: Reviser, library: Bibliotheque, settings: Reglages, session: Session, feynman: Feynman, exercice: Exercice, anatquiz: AnatQuiz, pdf: PdfReader, schemaedit: SchemaEditorScreen };

function MedBottomNav({ current, onNav }) {
  const items = [
    { id: 'dashboard', label: 'Accueil', icon: 'home' },
    { id: 'revise', label: 'Réviser', icon: 'cards' },
    { id: 'library', label: 'Biblio', icon: 'book' },
  ];
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
    const [sources, matieres, fiches, questions, anatstruct, st] = await Promise.all([
      getAll('sources'), getAll('matieres'), getAll('fiches'), getAll('questions'), getAll('anatstruct'), getStats(),
    ]);
    setDb({ sources, matieres, fiches, questions, anatstruct });
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
    startExercice: (items, title) => { setExercice({ items: items || [], title: title || 'Exercices' }); setScreen('exercice'); },
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
      await put('matieres', { id, sourceId, nom: (nom || 'Nouvelle matière').trim(), couleur: '#4FA6D9', coef: 3, icon: 'book' });
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
    // « Retirer du retard » (boîte À rattraper, Dashboard/Réviser) : NE révise
    // PAS — recale juste la prochaine échéance à partir d'aujourd'hui, SANS
    // toucher interval/repetition/efactor (le niveau de la fiche ne change
    // pas). Pas le moteur SM-2 : un simple report d'échéance choisi par
    // l'utilisateur, sur les items effectivement en retard de `group`.
    dismissOverdue: async (group) => {
      const today = todayISO();
      if (group.isSchema) {
        const f = db.fiches.find((x) => x.id === group.fiche.id); if (!f) return;
        await put('fiches', { ...f, nextReview: addDays(today, f.interval || 1) });
      } else {
        const ids = new Set(group.items.map((i) => i.id));
        const targets = db.questions.filter((q) => ids.has(q.id));
        await putMany('questions', targets.map((q) => ({ ...q, nextReview: addDays(today, q.interval || 1) })));
      }
      await reload();
    },
    // décalage du départ (J0) — Réviser, étape 1/3. Ne touche QUE les cartes
    // jamais révisées (unstartedQuestionsFor : palier 0 ET historique vide —
    // exclut les cartes revenues à J0 après un Raté, qui ONT un historique).
    // putBackup avant l'écriture en masse (précaution type migration), puis
    // seul nextReview change ; palier/interval/historique/missed inchangés.
    shiftSourceStart: async (sourceId, date) => {
      const targets = unstartedQuestionsFor(db, { sourceId });
      if (!targets.length) return;
      await putBackup('pre-decalage-source-' + sourceId + '-' + Date.now(), targets);
      await putMany('questions', targets.map((q) => ({ ...q, nextReview: date })));
      await reload();
    },
    shiftFicheStart: async (ficheId, date) => {
      const targets = unstartedQuestionsFor(db, { ficheId });
      if (!targets.length) return;
      await putBackup('pre-decalage-fiche-' + ficheId + '-' + Date.now(), targets);
      await putMany('questions', targets.map((q) => ({ ...q, nextReview: date })));
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
    clearQuestionError: async (id) => {
      const q = db.questions.find((x) => x.id === id); if (!q) return;
      await put('questions', { ...q, missed: 0 }); await reload();
    },
    saveStats: async (s) => { await saveStats(s); setStats(s); },
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
