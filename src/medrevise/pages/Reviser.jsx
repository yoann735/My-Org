/* ============================================================
   MedRevise — Réviser (hub). Gauche : arbre Cours → Matière → Fiche
   (cases à cocher, sélection simple/multiple, rappels J).
   Droite : méthode des J (frise) + cards QCM/Flash/Feynman + erreurs.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, TodaySeriesCard, JBadge, matiereMeta, BellButton, ContextMenu, ConfirmModal, DateActionModal, FicheDndProvider, DraggableFiche, DropSlot, DossierRow, DossierAddButton, DOSSIER_INDENT, DOSSIER_ADD_TOP, dossierDeleteTexts, EtiquetteDot, OverdueBox, detectDocKind } from '../components/ui.jsx';
import {
  index, ficheJ, dueToday, dueSchemasToday, exerciceStatus, isFicheScheduled, todayPlan, overdueByFiche,
  qcmConseilleFor, pickQcmSubset, unstartedQuestionsFor, unstartedSchemasFor, carnetV1Questions, carnetV2Questions,
} from '../lib/planning.js';
import { shuffle } from '../lib/sm2.js';
import { genTheoryItems, theoryCount } from '../lib/anatQuizGen.js';
import { allCoches } from '../lib/anatSchema.js';
import { putBlob, getBlob } from '../lib/storage.js';
import { buildCourseExport, buildChapitreExport, docElFromHtml } from '../lib/courseExport.js';
import { AddItemModal } from '../components/AddItemForm.jsx';
import { CoursePromptsButton } from '../components/CoursePromptsMenu.jsx';

/** formate un temps par carte (ms) en texte court — secondes sous la minute,
    "Xm Ys" au-delà (rare pour une flashcard). */
const formatCardTime = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m}m ${rest}s` : `${m}m`;
};

export function Reviser({ ctx }) {
  const { db } = ctx;
  const ix = useMemo(() => index(db), [db]);
  const [selIds, setSelIds] = useState(() => (ctx.focusFiche ? [ctx.focusFiche] : (db.fiches[0] ? [db.fiches[0].id] : [])));
  const [openSrc, setOpenSrc] = useState(() => Object.fromEntries(db.sources.map((s) => [s.id, true])));
  const [renaming, setRenaming] = useState(null); // { type: 'source'|'matiere'|'dossier'|'fiche', id }
  const [draft, setDraft] = useState('');
  const [ctxMenu, setCtxMenu] = useState(null); // { type: 'source'|'matiere'|'fiche', id, x, y }
  const [confirmDel, setConfirmDel] = useState(null); // { type, id, nom, fichesCount }
  const [showAddItem, setShowAddItem] = useState(false);
  // sous-dossiers d'une matière (même store/`fiche.dossierId` que Bibliotheque.jsx —
  // pur rangement d'affichage, voir MedReviseApp.jsx/storage.js), rendu via le MÊME
  // composant DossierRow (ui.jsx) que la Bibliothèque — visuellement identique par
  // construction. openDossier = déplié/replié (mémoire seulement, comme openSrc) ;
  // dossierMenu = menu « … » (Renommer/Supprimer) d'un dossier, MÊME mécanique que
  // Bibliotheque.jsx (pas le menu contextuel générique matière/source/fiche
  // ci-dessus, qui reste au clic droit) ; moveMenu = sous-menu « Déplacer vers »
  // ouvert depuis le menu contextuel d'une fiche.
  const [openDossier, setOpenDossier] = useState({});
  const [dossierMenu, setDossierMenu] = useState(null); // { x, y, dossierId }
  const [moveMenu, setMoveMenu] = useState(null); // { x, y, ficheId }
  // EXERCICES DE CHAPITRE (chantier 2) : un chapitre peut porter ses propres
  // exercices (chapitreId, ficheId null — voir storage.js#newChapitreExo), qui
  // couvrent l'ensemble de ses fiches. `selChapitre` = chapitre affiché dans le
  // panneau de droite, MUTUELLEMENT EXCLUSIF avec la sélection de fiches
  // (selIds) : sélectionner un chapitre vide selIds et inversement, le panneau
  // n'a donc jamais deux sujets à la fois.
  const [selChapitre, setSelChapitre] = useState(null); // id de dossier (parentId ≠ null)
  const [showAddChapExo, setShowAddChapExo] = useState(false);
  const [shiftStart, setShiftStart] = useState(null); // { type: 'source'|'fiche', id, nom }

  // remonte la fiche restaurée (ci-dessus) dans le viewport au montage — sans ça
  // la sélection est correcte mais reste hors-écran si elle était scrollée bas.
  const treeScrollRef = useRef(null);
  useEffect(() => {
    if (selIds.length !== 1) return;
    const el = treeScrollRef.current?.querySelector(`[data-fiche-row="${selIds[0]}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dueIdsToday = useMemo(() => new Set(dueToday(db, ix).map((q) => q.id)), [db, ix]);
  const dueSchemaIds = useMemo(() => new Set(dueSchemasToday(db, ix).map((f) => f.id)), [db, ix]);
  const overdue = useMemo(() => overdueByFiche(db, ix), [db, ix]);
  const overdueFicheIds = useMemo(() => new Set(overdue.map((g) => g.fiche.id)), [overdue]);
  const startOverdueFiche = (g) => (g.isSchema ? ctx.startAnatQuiz(g.fiche, { mode: 'total' }) : ctx.startSession(g.items, g.fiche.titre + ' — Rattrapage'));
  // redite du Dashboard : repliée PAR DÉFAUT ici (état persisté, undefined = replié).
  const rattraperCollapsed = (ctx.stats && ctx.stats.rattraperCollapsedReviser) !== false;
  const fichesOf = (matId) => db.fiches.filter((f) => f.matiereId === matId && !f.archive).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  const matieresOf = (srcId) => db.matieres.filter((m) => m.sourceId === srcId && !m.archive);
  // sous-dossiers d'une matière sur DEUX niveaux — même store et MÊMES helpers que
  // Bibliotheque.jsx (aucune donnée propre à Reviser, juste une autre vue du même
  // rangement) : unité = dossier sans parentId, chapitre = dossier dont parentId
  // pointe l'unité (voir MedReviseApp.jsx#addDossier).
  const byOrdre = (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0);
  const unitesOf = (matId) => db.dossiers.filter((d) => d.matiereId === matId && !d.parentId).sort(byOrdre);
  const chapitresOf = (uniteId) => db.dossiers.filter((d) => d.parentId === uniteId).sort(byOrdre);
  // fiches d'une unité, chapitres INCLUS : compteur de la ligne repliée (sinon il
  // mentirait), jamais utilisé pour le rendu du contenu.
  const fichesCountRecursif = (allFiches, uniteId) => {
    const ids = [uniteId, ...chapitresOf(uniteId).map((c) => c.id)];
    return allFiches.filter((f) => ids.includes(f.dossierId)).length;
  };
  // exercices rattachés à UN chapitre (pas à ses fiches : celles-ci gardent leurs
  // propres exos, inchangés — voir storage.js#newChapitreExo).
  const exosOfChapitre = (chapitreId) => db.questions.filter((q) => q.chapitreId === chapitreId && q.type === 'exercice');
  // repérage « d'un coup d'œil » des schémas d'anatomie dans l'arbre (point E).
  const matHasSchema = (matId) => fichesOf(matId).some((f) => f.type === 'anat_schema');
  const srcHasSchema = (srcId) => matieresOf(srcId).some((m) => matHasSchema(m.id));
  const qOfFiche = (fId) => db.questions.filter((q) => q.ficheId === fId);
  // schéma d'anatomie = 1 item planifiable (la fiche elle-même) ; sinon on compte
  // les cartes dues (qcm/flash). Les exercices sont HORS méthode des J → jamais comptés.
  const dueCountFiche = (fId) => {
    const f = ix.fById[fId];
    if (f && f.type === 'anat_schema') return dueSchemaIds.has(fId) ? 1 : 0;
    return qOfFiche(fId).filter((q) => dueIdsToday.has(q.id)).length;
  };

  // le cours/fiche actif est répercuté dans ctx.focusFiche (état de nav déjà
  // utilisé par Bibliothèque/ImportFlow pour pointer Réviser sur une fiche) :
  // ça sert ici de mémoire de position, puisque Reviser est démonté/remonté à
  // chaque aller-retour vers une session (key={screen} dans MedReviseApp) et
  // perdrait sinon selIds à chaque Quitter/Précédent depuis une révision.
  // sélectionner une fiche ferme la vue chapitre (et réciproquement, voir
  // openChapitreExos) : le panneau de droite n'a jamais deux sujets à la fois.
  const selectOnly = (id) => { setSelChapitre(null); setSelIds([id]); ctx.setFocusFiche(id); };
  const toggle = (id) => {
    setSelChapitre(null);
    setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    ctx.setFocusFiche(id);
  };
  const openChapitreExos = (chapitreId) => { setSelIds([]); setSelChapitre(chapitreId); };

  const selFiches = db.fiches.filter((f) => selIds.includes(f.id));
  const empty = selFiches.length === 0;
  const multi = selFiches.length > 1;
  const primary = selFiches[0];
  const primMat = primary && ix.mById[primary.matiereId];
  const meta = matiereMeta(primMat);
  const isSchemaSel = !multi && primary && primary.type === 'anat_schema';

  // vue chapitre (exercices de chapitre) — dérivée de selChapitre. `chapitreSel` est
  // null dès que la sélection porte sur des fiches : le panneau de droite bascule
  // entièrement de l'un à l'autre. La matière vient du CHAPITRE (dossier.matiereId),
  // jamais recopiée sur les exos.
  const chapitreSel = selChapitre ? db.dossiers.find((d) => d.id === selChapitre && d.parentId) || null : null;
  const chapExos = chapitreSel ? exosOfChapitre(chapitreSel.id) : [];
  const chapMeta = matiereMeta(chapitreSel ? ix.mById[chapitreSel.matiereId] : null);
  const chapUnite = chapitreSel ? db.dossiers.find((d) => d.id === chapitreSel.parentId) : null;

  const selItems = db.questions.filter((q) => selIds.includes(q.ficheId));
  const qcmItems = selItems.filter((q) => q.type === 'qcm');
  const flashItems = selItems.filter((q) => q.type === 'flashcard');
  const feynItems = selItems.filter((q) => q.type === 'feynman');
  const exoItems = selItems.filter((q) => q.type === 'exercice');
  const dueSel = selItems.filter((q) => dueIdsToday.has(q.id)); // cartes dues (théorie) uniquement

  // temps moyen PAR CARTE (flashcards) — moyenne de toutes les entrées
  // historique[].tempsMs chronométrées (Session.jsx/MobileSession.jsx), pas
  // de notion de "série complète" : chaque entrée est déjà une observation
  // individuelle valide. null tant qu'aucune carte n'a encore été chronométrée.
  const avgFlashTimeMs = useMemo(() => {
    const times = [];
    flashItems.forEach((q) => (q.historique || []).forEach((h) => { if (Number.isFinite(h.tempsMs)) times.push(h.tempsMs); }));
    return times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  }, [flashItems]);

  const jp = primary ? ficheJ(db, primary.id, ix) : null;
  const scheduled = primary ? isFicheScheduled(db, primary, ix) : false;
  const title = multi ? `${selFiches.length} fiches sélectionnées` : (primary ? primary.titre : '');
  const mins = (n) => Math.max(1, Math.round(n * 0.8));

  // QCM — nombre conseillé (meta.qcm_conseille) + modulation libre (Étape 3),
  // rotation du stock (Étape 4, pickQcmSubset) : le curseur se réinitialise au
  // conseillé (ou au total si absent) à chaque nouvelle sélection de fiche.
  const qcmConseille = !multi && primary ? qcmConseilleFor(primary) : null;
  const [qcmCount, setQcmCount] = useState(null);
  useEffect(() => {
    const def = qcmConseille != null ? Math.min(qcmConseille, qcmItems.length) : qcmItems.length;
    setQcmCount(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary && primary.id, qcmItems.length]);

  const viewCoursPdf = () => { if (primary && primary.pdfId) ctx.openPdfReader(primary.id, 'read', 'revise', 'pdf'); };
  const viewCoursHtml = () => { if (primary && primary.htmlId) ctx.openPdfReader(primary.id, 'read', 'revise', 'html'); };
  // input UNIQUE (PDF ou HTML, même chemin que Bibliothèque/import) pour rattacher
  // un document directement depuis Réviser, sans passer par un écran d'import —
  // "Voir le cours" apparaît ensuite de lui-même (primary.pdfId/htmlId à jour).
  const attachCoursDoc = async (file) => {
    if (!primary || !file) return;
    const kind = detectDocKind(file);
    if (!kind) return;
    const blobId = await putBlob(file);
    if (kind === 'html') await ctx.setFicheHtml(primary.id, blobId, file.name);
    else await ctx.setFichePdf(primary.id, blobId, file.name);
  };
  const launch = (mode) => {
    if (mode === 'qcm') {
      const n = Math.min(qcmCount || qcmItems.length, qcmItems.length);
      // pioche dans le stock existant (rotation : ratés + jamais-vus/anciens en
      // priorité), puis ordre de présentation aléatoire à chaque session.
      const items = shuffle(pickQcmSubset(qcmItems, n));
      if (items.length) ctx.startSession(items, title);
      return;
    }
    const items = mode === 'flash' ? flashItems : [...qcmItems, ...flashItems];
    if (items.length) ctx.startSession(items, title);
  };
  const launchToday = () => dueSel.length && ctx.startSession(dueSel, title + " — Aujourd'hui");
  // pratique : un clic ouvre UN exercice précis (choix libre, pas de série imposée).
  // BUG : envoyer un tableau à UN item désactivait Précédent/Suivant en permanence
  // dans l'écran Exercice (isFirst/isLast toujours vrais) — on passe la série
  // complète de la sélection courante, positionnée sur l'exercice cliqué.
  const openExo = (item) => ctx.startExercice(exoItems, title, { startId: item.id });
  // MÊME lecteur d'exercices que pour une fiche (ctx.startExercice prend déjà un
  // tableau d'items quelconque) — seul le lot passé change.
  const openChapExo = (item) => ctx.startExercice(chapExos, chapitreSel ? chapitreSel.nom : 'Exercices', { startId: item.id });

  // « Tout exporter » AU NIVEAU DU CHAPITRE : applique l'export fiche EXISTANT
  // (buildCourseExport — texte structuré via ficheToText, surlignages mark.hl
  // prioritaire/cloze, cartes manuelles projetées) à CHAQUE fiche du chapitre, puis
  // regroupe. Le #doc de chaque fiche vient de son HTML stocké (docElFromHtml), pas
  // d'une iframe : aucune fiche n'a besoin d'être ouverte. Lecture pure — rien n'est
  // écrit, ni en base ni dans les blobs. Les images restent des [IMAGE : légende]
  // (ficheToText), donc aucun base64 dans la sortie.
  // Une fiche sans HTML (schéma d'anatomie, transcript, cours jamais rattaché) n'a
  // pas de contenu exportable : elle est SIGNALÉE, jamais silencieusement omise.
  const [chapExport, setChapExport] = useState(null); // { count, skipped: string[] }
  const [chapExportBusy, setChapExportBusy] = useState(false);
  const exportChapitre = async () => {
    if (!chapitreSel) return;
    setChapExportBusy(true);
    try {
      const matiereNom = (ix.mById[chapitreSel.matiereId] || {}).nom || '';
      const fichesDuChap = db.fiches
        .filter((f) => f.dossierId === chapitreSel.id && !f.archive)
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
      const entries = [];
      const skipped = [];
      for (const f of fichesDuChap) {
        const docEl = f.htmlId ? docElFromHtml(await (await getBlob(f.htmlId))?.text()) : null;
        if (!docEl) { skipped.push(f.titre); continue; }
        const cartes = db.questions.filter((q) => q.ficheId === f.id && (q.type === 'qcm' || q.type === 'flashcard'));
        entries.push(buildCourseExport({ fiche: f, matiereNom, docEl, cartes }));
      }
      const payload = buildChapitreExport({
        chapitre: chapitreSel, uniteNom: chapUnite ? chapUnite.nom : '', matiereNom, fiches: entries,
      });
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setChapExport({ count: entries.length, skipped });
      setTimeout(() => setChapExport(null), 6000);
    } catch (e) {
      setChapExport({ count: 0, skipped: [], error: true });
      setTimeout(() => setChapExport(null), 4000);
    } finally {
      setChapExportBusy(false);
    }
  };
  const isRen = (type, id) => renaming && renaming.type === type && renaming.id === id;
  const startRename = (type, id, current) => { setDraft(current); setRenaming({ type, id }); };
  const commitRename = () => {
    if (!renaming) return;
    if (renaming.type === 'fiche') ctx.renameFiche(renaming.id, draft);
    else if (renaming.type === 'matiere') ctx.renameMatiere(renaming.id, draft);
    else if (renaming.type === 'source') ctx.renameSource(renaming.id, draft);
    else if (renaming.type === 'dossier') ctx.renameDossier(renaming.id, draft);
    setRenaming(null);
  };

  // clic droit desktop sur un cours ou une matière (empêche le menu natif du navigateur)
  const openCtxMenu = (e, type, id) => {
    e.preventDefault();
    setCtxMenu({ type, id, x: Math.min(e.clientX, window.innerWidth - 190), y: Math.min(e.clientY, window.innerHeight - 110) });
  };
  // appui long tactile explicite (le "contextmenu" natif sur long-press n'est pas fiable
  // sur tous les navigateurs mobiles, notamment iOS Safari) : timer démarré au toucher,
  // annulé si le doigt bouge (scroll) ou est relâché avant le délai.
  const pressTimer = useRef(null);
  const startPress = (e, type, id) => {
    const t = e.touches && e.touches[0]; if (!t) return;
    const x = t.clientX, y = t.clientY;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setCtxMenu({ type, id, x: Math.min(x, window.innerWidth - 190), y: Math.min(y, window.innerHeight - 110) });
    }, 500);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const askDeleteSource = (id) => { const s = db.sources.find((x) => x.id === id); if (s) setConfirmDel({ type: 'source', id, nom: s.nom }); };
  const askDeleteMatiere = (id) => { const m = db.matieres.find((x) => x.id === id); if (m) setConfirmDel({ type: 'matiere', id, nom: matiereMeta(m).label, fichesCount: fichesOf(id).length }); };
  const askDeleteFiche = (id) => { const f = db.fiches.find((x) => x.id === id); if (f) setConfirmDel({ type: 'fiche', id, nom: f.titre }); };
  // suppression d'un dossier (même sémantique que Bibliotheque.jsx) : les fiches
  // contenues ne sont PAS supprimées, elles remontent d'un niveau — dans l'unité
  // parente pour un chapitre, à la racine de la matière pour une unité (qui emporte
  // alors ses chapitres). ctx.deleteDossier fait un putBackup avant la réassignation
  // de masse ; les compteurs ci-dessous décrivent le même sous-arbre que lui.
  const askDeleteDossier = (id) => {
    const d = db.dossiers.find((x) => x.id === id); if (!d) return;
    const chapitres = d.parentId ? [] : chapitresOf(d.id);
    const ids = [d.id, ...chapitres.map((c) => c.id)];
    setConfirmDel({
      type: 'dossier', id, nom: d.nom, dossier: d,
      chapitresCount: chapitres.length,
      fichesCount: db.fiches.filter((f) => ids.includes(f.dossierId) && !f.archive).length,
      // exos DE CHAPITRE emportés par la suppression (ils n'ont aucun niveau où
      // remonter, voir MedReviseApp.jsx#deleteDossier) — annoncés dans la modale.
      exosCount: db.questions.filter((q) => q.chapitreId && ids.includes(q.chapitreId)).length,
    });
  };
  // suppression d'exercice(s) : PAS un archivage (contrairement à source/matière/fiche
  // ci-dessus) — canal durable ctx.deleteQuestion/deleteAllExercices (remove() → vrai
  // tombstone propagé par l'outbox), donc bien irréversible tout de suite.
  const askDeleteExercice = (item) => setConfirmDel({ type: 'exercice', id: item.id, nom: item.theme || item.concept || 'Exercice' });
  const askDeleteAllExercices = () => { if (!primary) return; setConfirmDel({ type: 'exercices-all', id: primary.id, nom: primary.titre, exoCount: exoItems.length }); };
  // pendant pour un CHAPITRE (exos rattachés par chapitreId) — même canal durable.
  const askDeleteAllExosChapitre = () => { if (!chapitreSel) return; setConfirmDel({ type: 'exos-chapitre-all', id: chapitreSel.id, nom: chapitreSel.nom, exoCount: chapExos.length }); };
  // textes de suppression d'un dossier (unité OU chapitre) — partagés avec
  // Bibliotheque.jsx (ui.jsx#dossierDeleteTexts) pour que les deux écrans annoncent
  // EXACTEMENT les mêmes conséquences.
  const dossierDelTexts = confirmDel && confirmDel.type === 'dossier'
    ? dossierDeleteTexts(confirmDel.dossier, confirmDel.chapitresCount, confirmDel.fichesCount, confirmDel.exosCount)
    : null;
  const confirmDelete = async () => {
    if (!confirmDel) return;
    if (confirmDel.type === 'source') await ctx.setSourceArchived(confirmDel.id, true);
    else if (confirmDel.type === 'matiere') await ctx.deleteMatiere(confirmDel.id);
    else if (confirmDel.type === 'dossier') await ctx.deleteDossier(confirmDel.id);
    else if (confirmDel.type === 'fiche') await ctx.setFicheArchived(confirmDel.id, true);
    else if (confirmDel.type === 'exercice') await ctx.deleteQuestion(confirmDel.id);
    else if (confirmDel.type === 'exercices-all') await ctx.deleteAllExercices(confirmDel.id);
    else if (confirmDel.type === 'exos-chapitre-all') await ctx.deleteAllExosChapitre(confirmDel.id);
    setConfirmDel(null);
  };

  // décalage/pose du départ (J0) — étape 1/3 : cours (source) ou fiche, cartes
  // sans planning actif OU jamais révisées (voir planning.js isUnstarted) —
  // couvre aussi bien une fiche jamais commencée qu'une fiche resetée
  // (Réglages → "Réinitialiser les dates"). Compte questions ET fiches
  // anat_schema (unstartedSchemasFor), sinon un cours composé uniquement de
  // schémas afficherait toujours "rien à décaler".
  const askShiftSource = (id) => { const s = db.sources.find((x) => x.id === id); if (s) setShiftStart({ type: 'source', id, nom: s.nom }); };
  const askShiftFiche = (id) => { const f = db.fiches.find((x) => x.id === id); if (f) setShiftStart({ type: 'fiche', id, nom: f.titre }); };
  const shiftStartCount = useMemo(() => {
    if (!shiftStart) return 0;
    const target = shiftStart.type === 'source' ? { sourceId: shiftStart.id } : { ficheId: shiftStart.id };
    return unstartedQuestionsFor(db, target, ix).length + unstartedSchemasFor(db, target, ix).length;
  }, [shiftStart, db, ix]);
  const confirmShiftStart = async (date) => {
    if (!shiftStart) return;
    if (shiftStart.type === 'source') await ctx.shiftSourceStart(shiftStart.id, date);
    else await ctx.shiftFicheStart(shiftStart.id, date);
    setShiftStart(null);
  };

  // BUG4 : drag & drop des fiches vers une autre matière/cours, ici aussi via @dnd-kit.
  // dossierId (depuis l'id de DropSlot survolé, voir ui.jsx) : null = racine de
  // la matière cible — même mécanique que Bibliotheque.jsx (même ctx.moveFicheTo).
  const onDropAt = ({ ficheId, matiereId, dossierId, beforeFicheId }) => {
    if (beforeFicheId === ficheId) return;
    ctx.moveFicheTo(ficheId, matiereId, beforeFicheId, dossierId || null);
  };
  const renderFicheOverlay = (ficheId) => {
    const f = db.fiches.find((x) => x.id === ficheId);
    if (!f) return null;
    return <div className="dnd-overlay-card tree-course on" style={{ padding: '9px 14px' }}><span className="tc-name">{f.titre}</span></div>;
  };
  // création d'une unité / d'un chapitre : créé immédiatement (nom par défaut) puis
  // bascule tout de suite en renommage — même geste que Bibliotheque.jsx, aux deux
  // niveaux.
  const createUnite = async (matiereId) => {
    const id = await ctx.addDossier(matiereId, 'Nouvelle unité');
    if (!id) return;
    setOpenDossier((o) => ({ ...o, [id]: true }));
    startRename('dossier', id, 'Nouvelle unité');
  };
  const createChapitre = async (matiereId, uniteId) => {
    const id = await ctx.addDossier(matiereId, 'Nouveau chapitre', uniteId);
    if (!id) return;
    setOpenDossier((o) => ({ ...o, [uniteId]: true, [id]: true }));
    startRename('dossier', id, 'Nouveau chapitre');
  };
  // menu « … » d'un dossier (Renommer/Supprimer), MÊME mécanique que
  // Bibliotheque.jsx — ouvert par DossierRow, pas par le clic droit générique.
  const openDossierMenu = (e, dossierId) => {
    e.stopPropagation();
    setDossierMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 120), dossierId });
  };
  const dossierMenuItems = (d) => [
    { label: 'Renommer', icon: 'edit', onClick: () => startRename('dossier', d.id, d.nom) },
    // second point d'entrée vers la vue "Exercices du chapitre" (le premier étant le
    // bouton cible de la ligne, voir DossierRow#onOpenExos) — chapitres seulement.
    ...(d.parentId ? [{ label: 'Exercices du chapitre', icon: 'target', onClick: () => openChapitreExos(d.id) }] : []),
    { label: d.parentId ? 'Supprimer le chapitre' : "Supprimer l'unité", icon: 'trash', danger: true, onClick: () => askDeleteDossier(d.id) },
  ];
  // input de renommage d'un dossier — MÊME rendu que le RenameInput de
  // Bibliotheque.jsx (`.srcmgr-input`, contrôlé) ; les autres entités (source/
  // matière/fiche) gardent leur input `.tree-rename` propre à Réviser, seul le
  // dossier doit être visuellement identique aux deux écrans.
  const DossierRenameInput = () => (
    <input className="srcmgr-input" autoFocus value={draft} onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
      onBlur={commitRename} />
  );
  // items du sous-menu « Déplacer vers » (ouvert depuis le menu contextuel d'une
  // fiche) : racine de la matière + chaque unité + chaque chapitre (indenté sous son
  // unité) de CETTE matière — même liste que Bibliotheque.jsx, même ctx.moveFicheTo.
  const moveMenuItems = (f) => {
    const mat = db.matieres.find((x) => x.id === f.matiereId);
    const items = [{
      label: <span style={{ fontWeight: !f.dossierId ? 700 : 500 }}>Racine de {mat ? matiereMeta(mat).label : 'la matière'}{!f.dossierId ? ' ✓' : ''}</span>,
      onClick: () => ctx.moveFicheTo(f.id, f.matiereId, null, null),
    }];
    unitesOf(f.matiereId).forEach((u) => {
      items.push({
        label: <span style={{ fontWeight: f.dossierId === u.id ? 700 : 500 }}><Icon name="folder" size={12} /> {u.nom}{f.dossierId === u.id ? ' ✓' : ''}</span>,
        onClick: () => ctx.moveFicheTo(f.id, f.matiereId, null, u.id),
      });
      chapitresOf(u.id).forEach((c) => items.push({
        label: <span style={{ fontWeight: f.dossierId === c.id ? 700 : 500, paddingLeft: 14 }}>└ <Icon name="folder" size={12} /> {c.nom}{f.dossierId === c.id ? ' ✓' : ''}</span>,
        onClick: () => ctx.moveFicheTo(f.id, f.matiereId, null, c.id),
      }));
    });
    return items;
  };
  // ligne d'une fiche dans l'arbre (DropSlot + DraggableFiche) — extrait en
  // fonction pour être identique à la racine de la matière ET dans un dossier
  // (même patron que Bibliotheque.jsx#renderFiche) : le bucket se déduit de
  // f.dossierId, jamais passé à part.
  const renderTreeFiche = (mat, f) => {
    const sel = selIds.includes(f.id);
    const cdt = dueCountFiche(f.id);
    const ren = isRen('fiche', f.id);
    return (
      <div key={f.id} data-fiche-row={f.id}>
        <DropSlot matiereId={mat.id} dossierId={f.dossierId || null} beforeId={f.id} />
        <DraggableFiche id={f.id} disabled={ren}>
          {ren ? (
            <div className="tree-course on">
              <span className="tree-check" style={{ visibility: 'hidden' }} />
              <input className="tree-rename" autoFocus defaultValue={f.titre} onFocus={(e) => e.target.select()}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                onBlur={commitRename} />
            </div>
          ) : (
            <div className={'tree-course' + (sel ? ' on' : '')}
              onContextMenu={(e) => openCtxMenu(e, 'fiche', f.id)}
              onTouchStart={(e) => startPress(e, 'fiche', f.id)} onTouchEnd={cancelPress} onTouchMove={cancelPress} onTouchCancel={cancelPress}>
              <button className={'tree-check' + (sel ? ' on' : '')} onClick={() => toggle(f.id)} title="Cocher / décocher">{sel ? <Icon name="check" size={11} stroke={3} /> : null}</button>
              <button className="tree-course-main" onClick={() => selectOnly(f.id)} onDoubleClick={(e) => { e.stopPropagation(); startRename('fiche', f.id, f.titre); }} title="Clic = sélectionner · double-clic = renommer">
                <span className="tc-name">{f.titre}</span>
                {f.type === 'anat_schema' && <span title="Schéma d'anatomie" style={{ color: 'var(--text-3)', display: 'inline-flex', marginLeft: 4 }}><Icon name="image" size={12} /></span>}
                <EtiquetteDot value={f.etiquette} style={{ marginLeft: 4 }} />
                {overdueFicheIds.has(f.id) && <span title="En retard — à rattraper" style={{ color: 'var(--crit)', display: 'inline-flex', marginLeft: 4 }}><Icon name="alert" size={12} /></span>}
                {cdt > 0 && <span className="due-badge sm" title={`${cdt} carte(s) à réviser aujourd'hui`}>{cdt}</span>}
              </button>
            </div>
          )}
        </DraggableFiche>
      </div>
    );
  };

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Réviser</h1>
          <div className="sub">Choisis une fiche, ajuste ses priorités, lance tes QCM, flashcards ou Feynman.</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      <TodaySeriesCard plan={todayPlan(db, ix)} onStart={ctx.startSession} compact
        collapsed={!!(ctx.stats && ctx.stats.serieCollapsed)}
        onToggleCollapse={() => ctx.saveStats({ ...ctx.stats, serieCollapsed: !(ctx.stats && ctx.stats.serieCollapsed) })} />

      {overdue.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <OverdueBox groups={overdue} onStartFiche={startOverdueFiche} onStartAll={(items) => ctx.startSession(items, 'Rattrapage')} onDismissFiche={ctx.dismissOverdue}
            collapsible collapsed={rattraperCollapsed} onToggleCollapse={() => ctx.saveStats({ ...ctx.stats, rattraperCollapsedReviser: !rattraperCollapsed })} />
        </div>
      )}

      <div className="revise-grid" style={{ display: 'grid', gridTemplateColumns: 'var(--tree-col, 380px) minmax(0,1fr)', gap: 20, alignItems: 'start', marginTop: 20 }}>
        {/* tree */}
        <div className="tree-card">
          <div className="tree-head">
            <span className="tree-head-title"><Icon name="folder" size={15} /> Cours &amp; matières</span>
            <button className="tree-clear" onClick={() => setSelIds([])} disabled={empty}>Tout décocher</button>
          </div>
          <div className="tree-scroll scroll" ref={treeScrollRef}>
            <FicheDndProvider onDropAt={onDropAt} renderOverlay={renderFicheOverlay}>
            {db.sources.filter((s) => !s.archive).map((src) => {
              const mats = matieresOf(src.id).filter((m) => fichesOf(m.id).length);
              if (!mats.length) return null;
              const openS = openSrc[src.id] !== false;
              const on = src.rappelsJ !== false;
              return (
                <div className={'tree-src' + (on ? '' : ' off')} key={src.id}>
                  <div className="tree-src-row" onContextMenu={(e) => openCtxMenu(e, 'source', src.id)}
                    onTouchStart={(e) => startPress(e, 'source', src.id)} onTouchEnd={cancelPress} onTouchMove={cancelPress} onTouchCancel={cancelPress}
                    title="Clic droit (ou appui long) : renommer / supprimer">
                    {isRen('source', src.id) ? (
                      <div className="tree-src-main" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Icon name={openS ? 'chevD' : 'chevR'} size={14} style={{ color: 'var(--text-3)' }} />
                        <input className="tree-rename" autoFocus defaultValue={src.nom} onFocus={(e) => e.target.select()}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                          onBlur={commitRename} />
                      </div>
                    ) : (
                      <button className="tree-src-main" onClick={() => setOpenSrc((o) => ({ ...o, [src.id]: !openS }))}>
                        <Icon name={openS ? 'chevD' : 'chevR'} size={14} style={{ color: 'var(--text-3)' }} />
                        <span className="tsrc-ic" style={{ background: `color-mix(in srgb, ${src.tint || '#7C6FE0'} 16%, transparent)`, color: src.tint || '#7C6FE0' }}><Icon name={src.icon || 'folder'} size={13} /></span>
                        <span className="tsrc-name">{src.nom}</span>
                        {srcHasSchema(src.id) && <span title="Contient un schéma d'anatomie" style={{ color: 'var(--text-3)', display: 'inline-flex', marginLeft: 4 }}><Icon name="image" size={12} /></span>}
                      </button>
                    )}
                    <BellButton on={on} onToggle={() => ctx.setSourceRappels(src.id, !on)} />
                  </div>
                  {openS && mats.map((mat) => {
                    const allFiches = fichesOf(mat.id);
                    const rootFiches = allFiches.filter((f) => !f.dossierId);
                    const unites = unitesOf(mat.id);
                    const mm = matiereMeta(mat);
                    return (
                      <div className="tree-group" key={mat.id}>
                        <div className="tree-cat-row" onContextMenu={(e) => openCtxMenu(e, 'matiere', mat.id)}
                          onTouchStart={(e) => startPress(e, 'matiere', mat.id)} onTouchEnd={cancelPress} onTouchMove={cancelPress} onTouchCancel={cancelPress}
                          title="Clic droit (ou appui long) : renommer / supprimer">
                          <span className="tcat-dot" style={{ background: mm.tint, marginLeft: 4 }} />
                          {isRen('matiere', mat.id) ? (
                            <input className="tree-rename" style={{ flex: 1 }} autoFocus defaultValue={mm.label} onFocus={(e) => e.target.select()}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                              onBlur={commitRename} />
                          ) : (
                            <span className="tcat-label" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>{mm.label}{matHasSchema(mat.id) && <span title="Contient un schéma d'anatomie" style={{ color: 'var(--text-3)', display: 'inline-flex' }}><Icon name="image" size={11} /></span>}</span>
                          )}
                        </div>

                        {/* création EN HAUT (juste sous l'en-tête de la matière), pas noyée sous
                           la liste des fiches — voir DOSSIER_ADD_TOP. */}
                        <DossierAddButton onClick={() => createUnite(mat.id)} label="Nouvelle unité" style={DOSSIER_ADD_TOP} />

                        {rootFiches.map((f) => renderTreeFiche(mat, f))}
                        <DropSlot matiereId={mat.id} dossierId={null} beforeId={null} variant={rootFiches.length ? 'line' : 'zone'} label={unites.length ? 'Déposer ici (racine)' : 'Déposer ici'} />

                        {/* dossiers sur DEUX niveaux (Unité → Chapitre, même store/fiche.dossierId
                           et mêmes helpers que Bibliotheque.jsx), rendus via le MÊME composant
                           DossierRow et la MÊME indentation (DOSSIER_INDENT, ui.jsx) — identiques à
                           la Bibliothèque par construction, sans impact sur le planning/J/révision. */}
                        {unites.map((u) => {
                          const chapitres = chapitresOf(u.id);
                          const uniteFiches = allFiches.filter((f) => f.dossierId === u.id);
                          const uOpen = !!openDossier[u.id];
                          return (
                            <div key={u.id}>
                              <DossierRow dossier={u} isOpen={uOpen}
                                fichesCount={fichesCountRecursif(allFiches, u.id)} sousDossiersCount={chapitres.length}
                                isRenaming={isRen('dossier', u.id)} renameInput={<DossierRenameInput />}
                                onToggle={() => setOpenDossier((o) => ({ ...o, [u.id]: !uOpen }))}
                                onRename={() => startRename('dossier', u.id, u.nom)}
                                onMenu={(e) => openDossierMenu(e, u.id)} />
                              {uOpen && (
                                <div style={DOSSIER_INDENT}>
                                  {/* création EN HAUT, juste sous l'en-tête de l'unité. Le chapitre est
                                     le DERNIER niveau : aucun bouton de création à l'intérieur d'un
                                     chapitre (limite 2 niveaux côté UI, doublée par la garde de
                                     MedReviseApp.jsx#addDossier). */}
                                  <DossierAddButton onClick={() => createChapitre(mat.id, u.id)} label="Nouveau chapitre" style={DOSSIER_ADD_TOP} />

                                  {uniteFiches.map((f) => renderTreeFiche(mat, f))}
                                  <DropSlot matiereId={mat.id} dossierId={u.id} beforeId={null} variant={uniteFiches.length ? 'line' : 'zone'} label={chapitres.length ? "Déposer ici (unité)" : 'Déposer ici'} />
                                  {uniteFiches.length === 0 && chapitres.length === 0 && <div className="hint">Unité vide.</div>}

                                  {chapitres.map((c) => {
                                    const chapFiches = allFiches.filter((f) => f.dossierId === c.id);
                                    const cOpen = !!openDossier[c.id];
                                    return (
                                      <div key={c.id}>
                                        <DossierRow dossier={c} isOpen={cOpen} fichesCount={chapFiches.length}
                                          exosCount={exosOfChapitre(c.id).length} onOpenExos={() => openChapitreExos(c.id)}
                                          isRenaming={isRen('dossier', c.id)} renameInput={<DossierRenameInput />}
                                          onToggle={() => setOpenDossier((o) => ({ ...o, [c.id]: !cOpen }))}
                                          onRename={() => startRename('dossier', c.id, c.nom)}
                                          onMenu={(e) => openDossierMenu(e, c.id)} />
                                        {cOpen && (
                                          <div style={DOSSIER_INDENT}>
                                            {chapFiches.map((f) => renderTreeFiche(mat, f))}
                                            <DropSlot matiereId={mat.id} dossierId={c.id} beforeId={null} variant={chapFiches.length ? 'line' : 'zone'} />
                                            {chapFiches.length === 0 && <div className="hint">Chapitre vide.</div>}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            </FicheDndProvider>
          </div>
          <div className="tree-foot">
            <span className="tf-item"><span className="tf-badge tnum">N</span> à réviser aujourd'hui</span>
          </div>
        </div>

        {/* right */}
        <div>
          {chapitreSel ? (
            /* vue EXERCICES DU CHAPITRE : même liste de cards que pour une fiche
               (ExerciceCards, réutilisé tel quel), sans card "Méthode des J" ni
               QCM/flashcards/Feynman — un chapitre ne porte que des exercices, et
               ceux-ci sont LIBRES (jamais dus, jamais au calendrier). */
            <>
              <div className="jcard">
                <div className="jc-ic" style={{ background: `color-mix(in srgb, ${chapMeta.tint} 15%, transparent)`, color: chapMeta.tint }}><Icon name="target" size={20} /></div>
                <div className="jc-main">
                  <div className="jc-label">{chapMeta.label}{chapUnite ? ` · ${chapUnite.nom}` : ''}</div>
                  <div className="jc-title">{chapitreSel.nom}</div>
                  <div className="hint" style={{ marginTop: 2 }}>
                    {chapExos.length} exercice{chapExos.length > 1 ? 's' : ''} de chapitre — hors méthode des J, à faire librement.
                  </div>
                </div>
                {/* « Tout exporter » du chapitre — même sortie que celui d'une fiche
                   (atelier « Voir le cours »), appliqué à TOUTES les fiches du chapitre
                   et copié dans le presse-papier, pour le prompt « exos de chapitre ». */}
                <button className="btn ghost" style={{ flex: '0 0 auto', alignSelf: 'center' }}
                  onClick={exportChapitre} disabled={chapExportBusy}
                  title="Copier le cours + surlignages + cartes de TOUTES les fiches de ce chapitre">
                  <Icon name={chapExport && !chapExport.error ? 'check' : 'copy'} size={14} />
                  {chapExportBusy ? 'Export…' : chapExport && !chapExport.error ? `Copié ✓ (${chapExport.count})` : 'Tout exporter'}
                </button>
                <button className="btn ghost" style={{ flex: '0 0 auto', alignSelf: 'center' }} onClick={() => setShowAddChapExo(true)}>
                  <Icon name="plus" size={14} /> Importer des items
                </button>
                <button className="btn ghost" style={{ flex: '0 0 auto', alignSelf: 'center' }} onClick={() => setSelChapitre(null)} title="Fermer la vue chapitre">
                  <Icon name="x" size={14} /> Fermer
                </button>
              </div>

              {/* compte rendu de l'export : combien de fiches sont parties, et
                 SURTOUT lesquelles ont été omises faute de cours HTML — sinon un
                 export incomplet passerait pour complet. */}
              {chapExport && (
                <div className={'err-mini' + (chapExport.error ? '' : ' ok')} style={{ marginTop: 12 }}>
                  <div className="em-ic"><Icon name={chapExport.error ? 'alert' : 'check'} size={16} stroke={2.5} /></div>
                  <div className="em-body">
                    {chapExport.error ? (
                      <div className="em-title">Export impossible — presse-papier refusé par le navigateur.</div>
                    ) : (
                      <>
                        <div className="em-title">{chapExport.count} fiche{chapExport.count > 1 ? 's' : ''} copiée{chapExport.count > 1 ? 's' : ''} dans le presse-papier ✓</div>
                        {chapExport.skipped.length > 0 && (
                          <div className="hint" style={{ marginTop: 4, color: 'var(--accent-2)' }}>
                            <Icon name="alert" size={12} /> Non exportée{chapExport.skipped.length > 1 ? 's' : ''} (aucun cours HTML rattaché) : {chapExport.skipped.join(', ')}.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {chapExos.length > 0 ? (
                <ExerciceCards items={chapExos} meta={chapMeta} onOpen={openChapExo} onDelete={askDeleteExercice}
                  onDeleteAll={askDeleteAllExosChapitre} ctx={ctx} />
              ) : (
                <div className="rev-empty" style={{ marginTop: 18 }}>
                  <Icon name="target" size={30} />
                  <div className="re-title">Aucun exercice dans ce chapitre</div>
                  <div className="hint">« Importer des items » colle un JSON d'exercices et les rattache à ce chapitre (pas à une fiche).</div>
                </div>
              )}
            </>
          ) : empty ? (
            <div className="rev-empty">
              <Icon name="cards" size={30} />
              <div className="re-title">Sélectionne une fiche</div>
              <div className="hint">Coche une ou plusieurs fiches à gauche pour voir QCM, flashcards et erreurs.</div>
            </div>
          ) : isSchemaSel ? (
            <AnatSchemaLauncher fiche={primary} ctx={ctx} ix={ix} meta={meta} due={dueSchemaIds.has(primary.id)} scheduled={scheduled} jp={jp} />
          ) : (
            <>
              <div className="jcard">
                <div className="jc-ic" style={{ background: `color-mix(in srgb, ${meta.tint} 15%, transparent)`, color: meta.tint }}><Icon name="calendar" size={20} /></div>
                <div className="jc-main">
                  <div className="jc-label">Méthode des J · {title}</div>
                  {!scheduled
                    ? <div className="jc-title"><span className="jc-paused">Cours en pause</span> — hors planning J (révisable manuellement)</div>
                    : dueSel.length > 0
                      ? <div className="jc-title"><span className="jc-today-badge">Aujourd'hui</span> {dueSel.length} carte{dueSel.length > 1 ? 's' : ''} à réviser</div>
                      : <div className="jc-title">Rien dû aujourd'hui pour cette sélection.</div>}
                  {!multi && jp && jp.jIndex >= 0 && <JBadge jLabel={jp.jLabel} />}
                </div>
                {!multi && primary && primary.pdfId && (
                  <button className="btn ghost" style={{ flex: '0 0 auto', alignSelf: 'center' }} onClick={viewCoursPdf} title="Ouvrir le PDF source en lecture seule">
                    <Icon name="filePdf" size={14} /> Voir le cours{primary.htmlId ? ' (PDF)' : ''}
                  </button>
                )}
                {!multi && primary && primary.htmlId && (
                  <button className="btn ghost" style={{ flex: '0 0 auto', alignSelf: 'center' }} onClick={viewCoursHtml} title="Ouvrir la fiche HTML du cours">
                    <Icon name="fileHtml" size={14} /> Voir le cours{primary.pdfId ? ' (HTML)' : ''}
                  </button>
                )}
                {/* aucun document rattaché : à la même place, propose de le rattacher
                   directement (input unique PDF/HTML — mêmes stockage/lecteur que
                   partout ailleurs) ; redevient "Voir le cours" dès que c'est fait. */}
                {!multi && primary && !primary.pdfId && !primary.htmlId && (
                  <label className="btn ghost" style={{ flex: '0 0 auto', alignSelf: 'center', cursor: 'pointer' }} title="Rattacher le PDF ou la fiche HTML du cours">
                    <Icon name="upload" size={14} /> Importer une fiche
                    <input type="file" accept="application/pdf,text/html,.pdf,.html" style={{ display: 'none' }}
                      onChange={(e) => { attachCoursDoc(e.target.files[0]); e.target.value = ''; }} />
                  </label>
                )}
                {dueSel.length > 0 && <button className="btn primary" style={{ flex: '0 0 auto', alignSelf: 'center' }} onClick={launchToday}><Icon name="play" size={14} fill /> Lancer aujourd'hui</button>}
              </div>

              <div className="row spread" style={{ alignItems: 'center', gap: 8, margin: '16px 2px 8px' }}>
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <Icon name="lightbulb" size={14} style={{ color: 'var(--text-3)' }} />
                  <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--text-3)' }}>Cours</span>
                </div>
                {!multi && primary && (
                  <button className="btn ghost sm" onClick={() => setShowAddItem(true)}><Icon name="plus" size={13} /> Ajouter un item</button>
                )}
              </div>
              <div className="rev-modes">
                <button className="rev-mode" onClick={() => launch('qcm')} disabled={!qcmItems.length}>
                  <div className="rm-ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="list" size={20} /></div>
                  <div className="rm-n tnum">{qcmItems.length ? Math.min(qcmCount || qcmItems.length, qcmItems.length) : 0}</div><div className="rm-l">QCM</div>
                  <div className="rm-go">Lancer <Icon name="arrowR" size={14} /></div>
                </button>
                <button className="rev-mode" onClick={() => launch('flash')} disabled={!flashItems.length}>
                  <div className="rm-ic" style={{ background: 'var(--accent-2-soft)', color: 'var(--accent-2)' }}><Icon name="cards" size={20} /></div>
                  <div className="rm-n tnum">{flashItems.length}</div><div className="rm-l">Flashcards</div>
                  {avgFlashTimeMs != null && <div className="rm-time">≈{formatCardTime(avgFlashTimeMs)}/carte</div>}
                  <div className="rm-go">Lancer <Icon name="arrowR" size={14} /></div>
                </button>
                <button className="rev-mode" onClick={() => feynItems.length && ctx.startFeynman({ items: feynItems, title })} disabled={!feynItems.length}>
                  <div className="rm-ic" style={{ background: 'color-mix(in srgb, #4FA6D9 15%, transparent)', color: '#4FA6D9' }}><Icon name="lightbulb" size={20} /></div>
                  <div className="rm-n tnum">{feynItems.length}</div><div className="rm-l">Feynman</div>
                  <div className="rm-go">Expliquer <Icon name="arrowR" size={14} /></div>
                </button>
              </div>

              {/* Étape 3 — révision libre : module le nombre de QCM proposés (1..total),
                  conseillé = meta.qcm_conseille (sinon tout le stock). La sélection PARMI
                  ce nombre tourne d'un J à l'autre (pickQcmSubset, Étape 4) — jamais
                  d'invention, on pioche dans le stock existant de la fiche. */}
              {!multi && qcmItems.length > 1 && (
                <div className="qcm-mod">
                  <div className="qcm-mod-head">
                    <span className="qcm-mod-label"><Icon name="list" size={13} /> QCM à réviser : <strong className="tnum">{qcmCount ?? qcmItems.length}</strong> / {qcmItems.length}</span>
                    {qcmConseille != null && <span className="pill" style={{ height: 22 }}>conseillé : {qcmConseille}</span>}
                  </div>
                  <input type="range" min={1} max={qcmItems.length} value={qcmCount ?? qcmItems.length}
                    onChange={(e) => setQcmCount(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }} />
                </div>
              )}

              <button className="btn lg" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }} onClick={() => launch('all')} disabled={!qcmItems.length && !flashItems.length}>
                <Icon name="layers" size={17} /> {multi ? 'Réviser toutes les fiches' : 'Réviser toute cette fiche'} ({qcmItems.length + flashItems.length} cartes · ~{mins(qcmItems.length + flashItems.length)} min)
              </button>

              {/* section "Exercices" (libellé affiché — anciennement "Pratique") : HORS
                  méthode des J. Liste de cards, une par exercice, librement choisie
                  (filtres thème / difficulté / statut). */}
              {exoItems.length > 0 && (
                <ExerciceCards items={exoItems} meta={meta} onOpen={openExo} onDelete={askDeleteExercice}
                  onDeleteAll={!multi ? askDeleteAllExercices : null} ctx={ctx} />
              )}
            </>
          )}

          {/* carnet d'erreurs v2 (étape 2) : REMPLACE l'ancien embed CarnetBody
             (Carnet.jsx, retiré) — juste un lien d'entrée ici, le contenu (V1 +
             raisons, extraction JSON, V2 à revoir/résolu) vit sur son propre
             écran (SCREENS.carnet, MedReviseApp.jsx) : trop riche pour une
             section repliable. L'ancien mécanisme (missed/weakPoints,
             ErrorSummary/RattrapageCard) a été entièrement retiré — le carnet
             v2 est désormais le SEUL carnet d'erreurs de l'app. */}
          <div style={{ marginTop: 22 }}>
            <CarnetEntryCard ctx={ctx} />
          </div>
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} items={[
          {
            label: 'Renommer', icon: 'edit', onClick: () => {
              if (ctxMenu.type === 'source') { const s = db.sources.find((x) => x.id === ctxMenu.id); if (s) startRename('source', ctxMenu.id, s.nom); }
              else if (ctxMenu.type === 'matiere') { const m = db.matieres.find((x) => x.id === ctxMenu.id); if (m) startRename('matiere', ctxMenu.id, m.nom); }
              else { const f = db.fiches.find((x) => x.id === ctxMenu.id); if (f) startRename('fiche', ctxMenu.id, f.titre); }
            },
          },
          // « Déplacer vers » (racine ou un dossier de la matière) — même sous-menu
          // que Bibliotheque.jsx, ouvert au même endroit que ce menu contextuel.
          ...(ctxMenu.type === 'fiche' ? [{
            label: 'Déplacer vers…', icon: 'folder',
            onClick: () => setMoveMenu({ x: ctxMenu.x, y: ctxMenu.y, ficheId: ctxMenu.id }),
          }] : []),
          // retire/remet un COURS (source) de la méthode des J — réutilise le flag
          // rappelsJ existant (BellButton) : n'affecte que la planification SM-2
          // (série du jour, calendrier, à rattraper), le contenu reste intact.
          ...(ctxMenu.type === 'source' ? (() => {
            const s = db.sources.find((x) => x.id === ctxMenu.id);
            const on = !s || s.rappelsJ !== false;
            return [{
              label: on ? 'Retirer de la méthode des J' : 'Remettre dans la méthode des J',
              icon: on ? 'bellOff' : 'bell',
              onClick: () => s && ctx.setSourceRappels(s.id, !on),
            }];
          })() : []),
          // même mécanisme, au niveau FICHE : n'affecte que cette fiche (pas le
          // cours parent, pas les fiches sœurs). Réversible.
          ...(ctxMenu.type === 'fiche' ? (() => {
            const f = db.fiches.find((x) => x.id === ctxMenu.id);
            const on = !f || f.rappelsJ !== false;
            return [{
              label: on ? 'Retirer de la méthode des J' : 'Remettre dans la méthode des J',
              icon: on ? 'bellOff' : 'bell',
              onClick: () => f && ctx.setFicheRappelsJ(f.id, !on),
            }];
          })() : []),
          // décalage du départ (J0) — cours ou fiche entière, cartes jamais
          // révisées uniquement (étape 1/3, voir planning.js unstartedQuestionsFor).
          ...(ctxMenu.type === 'source' || ctxMenu.type === 'fiche' ? [{
            label: 'Décaler le départ…', icon: 'calendar',
            onClick: () => (ctxMenu.type === 'source' ? askShiftSource(ctxMenu.id) : askShiftFiche(ctxMenu.id)),
          }] : []),
          {
            label: 'Supprimer', icon: 'trash', danger: true, onClick: () => {
              if (ctxMenu.type === 'source') askDeleteSource(ctxMenu.id);
              else if (ctxMenu.type === 'matiere') askDeleteMatiere(ctxMenu.id);
              else askDeleteFiche(ctxMenu.id);
            },
          },
        ]} />
      )}

      {moveMenu && (() => {
        const f = db.fiches.find((x) => x.id === moveMenu.ficheId);
        return f ? <ContextMenu x={moveMenu.x} y={moveMenu.y} onClose={() => setMoveMenu(null)} items={moveMenuItems(f)} /> : null;
      })()}

      {dossierMenu && (() => {
        const d = db.dossiers.find((x) => x.id === dossierMenu.dossierId);
        return d ? <ContextMenu x={dossierMenu.x} y={dossierMenu.y} onClose={() => setDossierMenu(null)} items={dossierMenuItems(d)} /> : null;
      })()}

      {showAddItem && primary && (
        <AddItemModal ctx={ctx} ficheId={primary.id} ficheTitre={primary.titre} onClose={() => setShowAddItem(false)} />
      )}

      {/* import ciblé CHAPITRE : MÊME modale, même validateur tolérant — seule la
         cible change (chapitreId au lieu de ficheId), et le type est restreint à
         « Exercice » côté formulaire (un chapitre ne porte que des exercices). */}
      {showAddChapExo && chapitreSel && (
        <AddItemModal ctx={ctx} chapitreId={chapitreSel.id} chapitreNom={chapitreSel.nom} onClose={() => setShowAddChapExo(false)} />
      )}

      {shiftStart && (
        <DateActionModal
          title={`Décaler le départ — « ${shiftStart.nom} »`}
          label="Nouvelle date de départ (J0)"
          confirmLabel="Décaler"
          count={shiftStartCount}
          allowPast
          body={shiftStartCount > 0
            ? `${shiftStartCount} carte${shiftStartCount > 1 ? 's' : ''} sans planning actif ${shiftStartCount > 1 ? 'seront décalées' : 'sera décalée'} à cette date — une date PASSÉE est acceptée (cours déjà commencé) : les jalons déjà écoulés seront traités comme déjà faits, pas comme du retard. Les cartes déjà entamées ne sont pas touchées.`
            : "Aucune carte sans planning actif ici — rien à décaler."}
          onConfirm={confirmShiftStart}
          onCancel={() => setShiftStart(null)}
        />
      )}

      {confirmDel && (
        <ConfirmModal
          title={confirmDel.type === 'source' ? 'Supprimer ce cours ?'
            : confirmDel.type === 'matiere' ? 'Supprimer cette matière ?'
            : confirmDel.type === 'dossier' ? dossierDelTexts.title
            : confirmDel.type === 'fiche' ? 'Supprimer cette fiche ?'
            : confirmDel.type === 'exercice' ? 'Supprimer cet exercice ?'
            : confirmDel.type === 'exos-chapitre-all' ? 'Supprimer tous les exercices du chapitre ?'
            : 'Supprimer tous les exercices ?'}
          body={confirmDel.type === 'source'
            ? `« ${confirmDel.nom} » sera déplacé dans la corbeille — restaurable depuis Réglages.`
            : confirmDel.type === 'matiere'
              ? (confirmDel.fichesCount > 0
                ? `Cette matière contient ${confirmDel.fichesCount} fiche${confirmDel.fichesCount > 1 ? 's' : ''}. Elles seront déplacées dans « À classer ». « ${confirmDel.nom} » sera ensuite envoyée dans la corbeille — restaurable depuis Réglages.`
                : `« ${confirmDel.nom} » sera déplacée dans la corbeille — restaurable depuis Réglages.`)
              : confirmDel.type === 'dossier'
                ? dossierDelTexts.body
                : confirmDel.type === 'fiche'
                  ? `« ${confirmDel.nom} » sera déplacée dans la corbeille — restaurable depuis Réglages.`
                  : confirmDel.type === 'exercice'
                    ? `« ${confirmDel.nom} » sera supprimé définitivement (sur tous tes appareils, dès la prochaine synchro). Cette action est irréversible — pas de corbeille pour les exercices.`
                    : confirmDel.type === 'exos-chapitre-all'
                      ? `Les ${confirmDel.exoCount} exercice${confirmDel.exoCount > 1 ? 's' : ''} du chapitre « ${confirmDel.nom} » seront supprimés définitivement (sur tous tes appareils, dès la prochaine synchro). Cette action est irréversible. Les fiches du chapitre et LEURS propres exercices ne sont pas concernés.`
                      : `Les ${confirmDel.exoCount} exercice${confirmDel.exoCount > 1 ? 's' : ''} de « ${confirmDel.nom} » seront supprimés définitivement (sur tous tes appareils, dès la prochaine synchro). Cette action est irréversible. Les QCM, flashcards et Feynman de cette fiche ne sont pas concernés.`}
          confirmLabel={dossierDelTexts ? dossierDelTexts.confirmLabel : 'Supprimer'}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

/* ---- section "Exercices" (libellé affiché — anciennement "Pratique") : liste de
   cards, UNE par exercice (choix libre, hors méthode des J). Chaque card : thème,
   difficulté (1|2|3), badge numérique/ouvert, badge Calculatrice, statut (jamais
   fait / réussi / à revoir). Filtres thème / difficulté / statut. ---- */
const EXO_DIFF = { 1: 'Facile', 2: 'Intermédiaire', 3: 'Difficile' };
const EXO_STATUS = {
  todo: { label: 'Jamais fait', icon: 'clock', color: 'var(--text-3)' },
  ok: { label: 'Réussi', icon: 'check', color: '#4FB87A' },
  review: { label: 'À revoir', icon: 'refresh', color: 'var(--accent-2)' },
};

function ExerciceCards({ items, meta, onOpen, onDelete, onDeleteAll, ctx }) {
  const [fTheme, setFTheme] = useState('all');
  const [fDiff, setFDiff] = useState('all');
  const [fStatut, setFStatut] = useState('all');

  const themes = useMemo(() => [...new Set(items.map((i) => i.theme).filter(Boolean))], [items]);
  const withStatus = useMemo(() => items.map((it) => ({ it, statut: exerciceStatus(it) })), [items]);
  const filtered = withStatus.filter(({ it, statut }) =>
    (fTheme === 'all' || it.theme === fTheme)
    && (fDiff === 'all' || String(it.difficulte || 2) === fDiff)
    && (fStatut === 'all' || statut === fStatut));

  return (
    <div style={{ marginTop: 22 }}>
      <div className="row" style={{ alignItems: 'center', gap: 8, margin: '0 2px 10px' }}>
        <Icon name="target" size={14} style={{ color: 'var(--text-3)' }} />
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--text-3)' }}>Exercices</span>
        <span className="hint" style={{ marginLeft: 'auto' }}>{filtered.length}/{items.length} exercice{items.length > 1 ? 's' : ''}</span>
        {ctx && <CoursePromptsButton ctx={ctx} kind="pratique" />}
        {onDeleteAll && (
          <button type="button" className="btn ghost sm" style={{ color: 'var(--crit)' }} onClick={onDeleteAll} title="Supprimer tous les exercices de cette fiche (QCM/flashcards/Feynman non concernés)">
            <Icon name="trash" size={13} /> Supprimer tous les exercices
          </button>
        )}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {themes.length > 1 && (
          <select className="et-select" value={fTheme} onChange={(e) => setFTheme(e.target.value)} title="Filtrer par thème">
            <option value="all">Tous les thèmes</option>
            {themes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select className="et-select" value={fDiff} onChange={(e) => setFDiff(e.target.value)} title="Filtrer par difficulté">
          <option value="all">Toutes difficultés</option>
          <option value="1">Facile (1)</option>
          <option value="2">Intermédiaire (2)</option>
          <option value="3">Difficile (3)</option>
        </select>
        <select className="et-select" value={fStatut} onChange={(e) => setFStatut(e.target.value)} title="Filtrer par statut">
          <option value="all">Tous statuts</option>
          <option value="todo">Jamais fait</option>
          <option value="ok">Réussi</option>
          <option value="review">À revoir</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="hint" style={{ padding: '10px 2px' }}>Aucun exercice ne correspond à ces filtres.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map(({ it, statut }) => {
            const st = EXO_STATUS[statut];
            const numeric = it.sous_type === 'numerique';
            return (
              <div key={it.id} className="exo-card" role="button" tabIndex={0}
                onClick={() => onOpen(it)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(it); } }}>
                <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8, width: '100%' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.tint, flex: '0 0 auto' }} />
                  <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{it.theme || 'Exercice'}</span>
                  <span className="exo-status" style={{ color: st.color, flex: '0 0 auto' }} title={st.label}><Icon name={st.icon} size={12} /> {st.label}</span>
                  {onDelete && (
                    <button type="button" className="cd-ic" style={{ width: 26, height: 26, flex: '0 0 auto' }} title="Supprimer cet exercice"
                      onClick={(e) => { e.stopPropagation(); onDelete(it); }}>
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span className="pill" style={{ height: 22 }}>{EXO_DIFF[it.difficulte] || 'Intermédiaire'} · {it.difficulte || 2}</span>
                  <span className="pill" style={{ height: 22 }}>{numeric ? 'numérique' : 'ouvert'}</span>
                  {it.necessite_calculatrice && <span className="pill accent" style={{ height: 22 }}><Icon name="grad" size={11} /> Calculatrice</span>}
                </div>
                <div className="exo-open">Ouvrir <Icon name="arrowR" size={13} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* carnet d'erreurs v2 (étape 2) : carte d'entrée vers l'écran dédié
   (SCREENS.carnet) — compteurs seulement, tout le détail vit là-bas. */
function CarnetEntryCard({ ctx }) {
  const v1 = carnetV1Questions(ctx.db);
  const aRevoir = carnetV2Questions(ctx.db, 'a_revoir');
  return (
    <div className="card">
      <button type="button" className="card-head" onClick={() => ctx.go('carnet')}
        style={{ width: '100%', cursor: 'pointer', background: 'none', border: 'none', font: 'inherit', color: 'inherit' }}>
        <Icon name="target" size={17} className="ic" />
        <h3>Carnet d'erreurs</h3>
        <div className="right"><Icon name="chevR" size={15} /></div>
      </button>
      <div className="card-body">
        <div className="hint" style={{ fontSize: 13 }}>
          {v1.length} flashcard{v1.length > 1 ? 's' : ''} en carnet · {aRevoir.length} flashcard{aRevoir.length > 1 ? 's' : ''} d'erreur à revoir
        </div>
        <button className="btn ghost sm" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => ctx.go('carnet')}>
          Ouvrir le carnet
        </button>
      </div>
    </div>
  );
}

/* ---- lanceur de quiz pour une fiche anat_schema (choix du mode → quiz) ---- */
function AnatSchemaLauncher({ fiche, ctx, meta, due, scheduled, jp }) {
  const [mode, setMode] = useState('total'); // total | random (masquage visuel)
  const [prop, setProp] = useState(0.5);
  const coches = allCoches(fiche); // toutes les vues à plat
  const nb = coches.length;
  const nbTheory = theoryCount(coches);
  // E — items de théorie générés LOCALEMENT : flashcards (toujours) + QCM (si distracteurs réels).
  const theoryItems = genTheoryItems(fiche, coches);
  const nbFlash = theoryItems.filter((i) => i.type === 'flashcard').length;
  const nbQcm = theoryItems.filter((i) => i.type === 'qcm').length;
  const [theoryFormat, setTheoryFormat] = useState('both'); // both | flashcards | qcm
  // mode principal : « Visuel + Théorie » mis en avant dès qu'il y a de la théorie.
  const [revMode, setRevMode] = useState(() => (nbTheory > 0 ? 'both' : 'visuel')); // visuel | theorie | both

  const launch = () => {
    if (revMode === 'theorie') {
      // regénère pour un tirage frais, puis filtre selon le format choisi (flashcards / QCM / les deux).
      let items = genTheoryItems(fiche, coches);
      if (theoryFormat === 'flashcards') items = items.filter((i) => i.type === 'flashcard');
      else if (theoryFormat === 'qcm') items = items.filter((i) => i.type === 'qcm');
      const fmtLabel = theoryFormat === 'flashcards' ? 'Flashcards' : theoryFormat === 'qcm' ? 'QCM' : 'Théorie';
      if (items.length) ctx.startSession(items, `${fiche.titre} — ${fmtLabel}`, { ephemeral: true });
      return;
    }
    ctx.startAnatQuiz(fiche, { mode, proportion: prop, theory: revMode === 'both' && nbTheory > 0 });
  };
  const launchDisabled = revMode === 'theorie'
    ? (theoryFormat === 'qcm' ? nbQcm === 0 : theoryFormat === 'flashcards' ? nbFlash === 0 : theoryItems.length === 0)
    : nb === 0;

  return (
    <>
      <div className="jcard">
        <div className="jc-ic" style={{ background: `color-mix(in srgb, ${meta.tint} 15%, transparent)`, color: meta.tint }}><Icon name="image" size={20} /></div>
        <div className="jc-main">
          <div className="jc-label">Méthode des J · {fiche.titre}</div>
          {!scheduled
            ? <div className="jc-title"><span className="jc-paused">Cours en pause</span> — hors planning J (révisable manuellement)</div>
            : due
              ? <div className="jc-title"><span className="jc-today-badge">Aujourd'hui</span> schéma à réviser ({nb} coche{nb > 1 ? 's' : ''})</div>
              : <div className="jc-title">Schéma de {nb} coche{nb > 1 ? 's' : ''} — rien dû aujourd'hui.</div>}
          {jp && jp.jIndex >= 0 && <JBadge jLabel={jp.jLabel} />}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-body">
          <div className="imp-field">
            <label>Mode de révision</label>
            <div className="seg">
              <button type="button" className={'seg-btn' + (revMode === 'visuel' ? ' active' : '')} onClick={() => setRevMode('visuel')}><Icon name="image" size={13} /> Schéma seul</button>
              <button type="button" className={'seg-btn' + (revMode === 'theorie' ? ' active' : '')} onClick={() => setRevMode('theorie')} disabled={nbTheory === 0} title={nbTheory === 0 ? 'Aucune coche ne porte de théorie' : ''}><Icon name="list" size={13} /> Théorie seule</button>
              <button type="button" className={'seg-btn' + (revMode === 'both' ? ' active' : '')} onClick={() => setRevMode('both')} disabled={nbTheory === 0} title={nbTheory === 0 ? 'Aucune coche ne porte de théorie' : ''}><Icon name="layers" size={13} /> Schéma + Théorie</button>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              {nbTheory === 0
                ? 'Ajoute de la théorie aux coches (Éditer le schéma) pour débloquer les modes Théorie.'
                : revMode === 'visuel' ? 'Tu nommes seulement les coches sur l\'image.'
                  : revMode === 'theorie' ? `Sans l'image : tu révises les champs (${nbTheory} structure${nbTheory > 1 ? 's' : ''}) — flashcards + QCM générés localement.`
                    : `Tu nommes la coche PUIS tu réponds sur ses champs (${nbTheory} coche${nbTheory > 1 ? 's' : ''} avec théorie).`}
            </div>
          </div>

          {/* E — format des cartes de théorie : flashcards / QCM / les deux, clairement proposés */}
          {revMode === 'theorie' && (
            <div className="imp-field">
              <label>Format des cartes</label>
              <div className="seg">
                <button type="button" className={'seg-btn' + (theoryFormat === 'both' ? ' active' : '')} onClick={() => setTheoryFormat('both')}><Icon name="layers" size={13} /> Les deux ({theoryItems.length})</button>
                <button type="button" className={'seg-btn' + (theoryFormat === 'flashcards' ? ' active' : '')} onClick={() => setTheoryFormat('flashcards')} disabled={nbFlash === 0}><Icon name="cards" size={13} /> Flashcards ({nbFlash})</button>
                <button type="button" className={'seg-btn' + (theoryFormat === 'qcm' ? ' active' : '')} onClick={() => setTheoryFormat('qcm')} disabled={nbQcm === 0} title={nbQcm === 0 ? 'Pas assez de structures du même type pour des distracteurs réels' : ''}><Icon name="list" size={13} /> QCM ({nbQcm})</button>
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                {nbQcm === 0
                  ? 'QCM indisponibles : il faut au moins 2 autres structures du même type portant le même champ (distracteurs = valeurs réelles, jamais inventées).'
                  : 'Flashcards (recto/verso) + QCM (distracteurs = valeurs réelles du même champ chez d\'autres structures du même type), générés localement sans IA.'}
              </div>
            </div>
          )}

          {/* options de masquage — uniquement quand l'image est en jeu */}
          {revMode !== 'theorie' && (
            <>
              <div className="imp-field">
                <label>Coches masquées</label>
                <div className="seg">
                  <button type="button" className={'seg-btn' + (mode === 'total' ? ' active' : '')} onClick={() => setMode('total')}><Icon name="layers" size={13} /> Toutes</button>
                  <button type="button" className={'seg-btn' + (mode === 'random' ? ' active' : '')} onClick={() => setMode('random')}><Icon name="target" size={13} /> Aléatoire</button>
                </div>
              </div>
              {mode === 'random' && (
                <div className="imp-field">
                  <label>Proportion masquée</label>
                  <div className="imp-chips">
                    {[0.3, 0.5, 0.7].map((p) => (
                      <button key={p} className={'imp-chip' + (prop === p ? ' on' : '')} onClick={() => setProp(p)}>{Math.round(p * 100)} %</button>
                    ))}
                  </div>
                  <div className="hint" style={{ marginTop: 6 }}>≈ {Math.max(1, Math.round(prop * nb))} coche{Math.max(1, Math.round(prop * nb)) > 1 ? 's' : ''} masquée{Math.max(1, Math.round(prop * nb)) > 1 ? 's' : ''} sur {nb}.</div>
                </div>
              )}
            </>
          )}

          <div className="row" style={{ gap: 10, marginTop: 6 }}>
            <button className="btn lg" style={{ flex: '0 0 auto', justifyContent: 'center' }}
              onClick={() => ctx.openSchemaEditor(fiche.id, 'revise')} title="Ouvrir en mode Lecture / Édition (coches + théorie)">
              <Icon name="edit" size={16} /> Éditer le schéma
            </button>
            <button className="btn primary lg" style={{ flex: 1, justifyContent: 'center' }} disabled={launchDisabled}
              onClick={launch}>
              <Icon name="play" size={16} fill /> Lancer{revMode === 'theorie' ? ' la théorie' : revMode === 'both' ? ' (schéma + théorie)' : ' le schéma'}
            </button>
          </div>
          {nb === 0 && <div className="hint" style={{ marginTop: 8 }}>Ce schéma n'a aucune coche — passe en Édition pour en ajouter.</div>}
        </div>
      </div>
    </>
  );
}
