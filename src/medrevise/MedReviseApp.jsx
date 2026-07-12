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
import { PdfReader } from './pdf/PdfReader.jsx';
import { PdfPicker } from './pdf/PdfPicker.jsx';
import {
  seedIfEmpty, getAll, put, putMany, remove, getStats, setStats as saveStats, genId,
} from './lib/storage.js';

const SCREENS = { dashboard: Dashboard, revise: Reviser, library: Bibliotheque, settings: Reglages, session: Session, feynman: Feynman, pdf: PdfReader, pdflist: PdfPicker };

function MedBottomNav({ current, onNav }) {
  const items = [
    { id: 'dashboard', label: 'Accueil', icon: 'home' },
    { id: 'revise', label: 'Réviser', icon: 'cards' },
    { id: 'library', label: 'Biblio', icon: 'book' },
    { id: 'pdflist', label: 'PDF', icon: 'filePdf' },
  ];
  const active = (id) => current === id || (id === 'revise' && ['session', 'feynman'].includes(current)) || (id === 'pdflist' && current === 'pdf');
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
  const [screen, setScreen] = useState('dashboard');
  const [expanded, setExpanded] = useState(false);
  const [db, setDb] = useState(null);
  const [stats, setStats] = useState(null);
  const [session, setSession] = useState(null);
  const [feynman, setFeynman] = useState(null);
  const [focusFiche, setFocusFiche] = useState(null);
  const [pdfView, setPdfView] = useState(null); // { ficheId, mode: 'read'|'edit', returnScreen }

  const reload = useCallback(async () => {
    const [sources, matieres, fiches, questions, st] = await Promise.all([
      getAll('sources'), getAll('matieres'), getAll('fiches'), getAll('questions'), getStats(),
    ]);
    setDb({ sources, matieres, fiches, questions });
    setStats(st);
  }, []);

  useEffect(() => { (async () => { await seedIfEmpty(); await reload(); })(); }, [reload]);

  const ctx = {
    theme, toggleTheme, goHub,
    go: setScreen,
    db, stats, reload,
    focusFiche, setFocusFiche,
    session, feynman, pdfView,

    // ---- session lifecycle ----
    startSession: (items, title, meta = {}) => {
      setSession({ items: items || [], title: title || 'Révision', ...meta });
      setScreen('session');
    },
    startFeynman: (payload) => { setFeynman(payload); setScreen('feynman'); },
    endSession: () => { setSession(null); setScreen('dashboard'); },

    // ---- lecteur PDF (Partie B) : ouvert en overlay plein écran (nouvel
    // écran 'pdf'), revient à l'écran d'où il a été ouvert à la fermeture.
    openPdfReader: (ficheId, mode, returnScreen) => {
      setPdfView({ ficheId, mode: mode || 'read', returnScreen: returnScreen || screen });
      setScreen('pdf');
    },
    closePdfReader: () => { const back = pdfView && pdfView.returnScreen; setScreen(back || 'library'); setPdfView(null); },

    // ---- mutations (persist + reload) ----
    saveQuestion: async (q) => { await put('questions', q); await reload(); },
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
    setFichePdf: async (ficheId, pdfId) => {
      const f = db.fiches.find((x) => x.id === ficheId); if (!f) return;
      await put('fiches', { ...f, pdfId: pdfId || null }); await reload();
    },
    deleteQuestion: async (id) => { await remove('questions', id); await reload(); },
    clearQuestionError: async (id) => {
      const q = db.questions.find((x) => x.id === id); if (!q) return;
      await put('questions', { ...q, missed: 0 }); await reload();
    },
    saveStats: async (s) => { await saveStats(s); setStats(s); },
  };

  if (!db) {
    return <div className="soon"><div className="soon-logo"><Icon name="grad" size={30} /></div><p>Chargement de MedRevise…</p></div>;
  }

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
