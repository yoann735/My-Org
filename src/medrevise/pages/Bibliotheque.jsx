/* ============================================================
   MedRevise — Bibliothèque (fusion Bibliothèque + Documents, C) : arbre
   Cours → Matière → Fiche à gauche (recherche transversale, renommage,
   drag & drop, révision), lecteur/éditeur du document sélectionné à droite
   (PDF / schéma d'anatomie / transcript). Sélectionner une fiche-document
   l'ouvre directement dans le panneau de droite, sans changer d'écran —
   PdfReader/SchemaEditorScreen/TranscriptEditor y sont rendus EMBARQUÉS
   (props embedded/onClose, voir ces fichiers). Layout master-detail
   responsive (`.lib-split`, voir etudes.css).
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, matiereMeta, FicheDndProvider, DraggableFiche, DropSlot, DropCible, dossierDeleteTexts, DestPicker, etiquetteMeta, etiquetteMenuItems, ContextMenu, ConfirmModal, detectDocKind, BellButton, Modal, SplitHandle } from '../components/ui.jsx';
import { useTreeOpenState, trierSections, deplacerSection } from '../components/useTreeOpenState.js';
import { useImportParDepot } from '../components/TreeFileDrop.jsx';
import { putBlob } from '../lib/storage.js';
import { ficheImages, totalCoches } from '../lib/anatSchema.js';
import { docKind, DOC_META, createTranscript, deleteTranscript } from '../documents/lib/documents.js';
import { cleanTranscript, textToDoc } from '../documents/lib/transcript.js';
import { PdfReader } from '../pdf/PdfReader.jsx';
import { TranscriptEditor } from '../documents/TranscriptEditor.jsx';
import { SchemaEditorScreen } from '../documents/SchemaEditorScreen.jsx';

const schemaViews = (f) => ficheImages(f).length;
const schemaCoches = (f) => totalCoches(f);

export function Bibliotheque({ ctx }) {
  const { db } = ctx;
  const [openFiche, setOpenFiche] = useState({});
  const [renaming, setRenaming] = useState(null); // { type, id }
  const [draft, setDraft] = useState('');
  // C — panneau de droite : quelle fiche-document est ouverte (jamais de
  // navigation d'écran — on reste sur 'library' tout du long).
  const [selected, setSelected] = useState(null); // { ficheId, kind: 'fiche'|'schema'|'transcript', mode? }
  const [creatingTranscript, setCreatingTranscript] = useState(false);
  const [etqMenu, setEtqMenu] = useState(null); // { x, y, ficheId } — menu compact de l'étiquette
  const [replacingHtmlId, setReplacingHtmlId] = useState(null); // ficheId — modale « Remplacer le fichier HTML »
  // refonte UX (repli HORIZONTAL, pas un démontage) : la liste reste TOUJOURS
  // montée, dans une colonne qui rétrécit en rail (voir .lib-master.collapsed,
  // etudes.css) — jamais empilée verticalement, jamais totalement invisible.
  // Repliée automatiquement à l'ouverture d'un cours (donne de la place au
  // lecteur) et sur petite fenêtre au montage ; un seul contrôle pour la
  // rouvrir (le chevron du rail) — plus de bouton « Liste des cours » séparé
  // (redondant avec « Retour », voir le point 3 de la demande).
  const [listCollapsed, setListCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches);
  const [ficheMenu, setFicheMenu] = useState(null); // { x, y, ficheId } — menu « … » (actions secondaires)
  const [confirmArchive, setConfirmArchive] = useState(null); // fiche à archiver (confirmation)
  const attachInputRef = useRef(null);
  const [attachTarget, setAttachTarget] = useState(null); // ficheId ciblé par l'input fichier partagé du menu « … »
  // sous-dossiers d'une matière (pur rangement d'affichage, voir fiche.dossierId),
  // sur DEUX niveaux : Unité → Chapitre (voir MedReviseApp.jsx#addDossier/parentId).
  // dossierMenu = menu « … » d'une ligne unité OU chapitre (renommer/supprimer),
  // moveMenu = sous-menu « Déplacer vers » d'une fiche (racine, une unité, ou un
  // chapitre de sa matière), openDossier = replié/déplié — keyé par id, donc commun
  // aux deux niveaux, et désormais MÉMORISÉ (stats) et PARTAGÉ avec Réviser : un
  // chapitre ouvert ici reste ouvert là-bas, et survit au rechargement. Voir
  // useTreeOpenState.js. `sources: true` depuis la Bibliothèque « QG » : les sections
  // se replient ici aussi, avec le MÊME état mémorisé que Réviser.
  // confirmDeleteDossier = confirmation avant suppression (les fiches contenues
  // remontent d'un niveau).
  const { openDossier, setOpenDossier, openSrc, setOpenSrc, matFermee, setMatFermee } = useTreeOpenState(ctx, { sources: true, matieres: true });
  const [dossierMenu, setDossierMenu] = useState(null); // { x, y, dossierId }
  const [moveMenu, setMoveMenu] = useState(null); // { x, y, ficheId }
  const [confirmDeleteDossier, setConfirmDeleteDossier] = useState(null); // dossier à supprimer
  // MATIÈRES depuis la Bibliothèque (« QG ») : créer, et supprimer par le MÊME chemin
  // que Réviser (ctx.deleteMatiere : fiches → « À classer », matière → corbeille,
  // précédé d'un putBackup) — avec une confirmation qui dit tout ce qui bouge.
  const [matMenu, setMatMenu] = useState(null); // { x, y, matiereId }
  const [confirmDeleteMatiere, setConfirmDeleteMatiere] = useState(null); // { matiere, fiches, dossiers, cartes }

  /* IMPORT PAR DÉPÔT D'UN FICHIER (Finder) SUR L'ARBRE — exactement le mécanisme de
     Réviser, par le MÊME code (TreeFileDrop.jsx#useImportParDepot) : lâché sur un
     dossier → la fiche est créée DANS ce dossier ; sur une matière → à sa racine ;
     survol prolongé d'une section/d'un dossier fermé → il s'ouvre. Canal HTML5
     natif, disjoint du glisser-déposer interne des fiches (dnd-kit). */
  const [annonce, setAnnonce] = useState(null); // { texte, ok }
  const annonceTimer = useRef(null);
  const annoncer = (texte, ok = false) => {
    setAnnonce({ texte, ok });
    if (annonceTimer.current) clearTimeout(annonceTimer.current);
    annonceTimer.current = setTimeout(() => setAnnonce(null), 5000);
  };
  useEffect(() => () => { if (annonceTimer.current) clearTimeout(annonceTimer.current); }, []);
  const { fd, modale: modaleDepot } = useImportParDepot(ctx, {
    onSpring: (sp) => {
      if (sp.type === 'source') setOpenSrc((o) => (o[sp.id] !== false ? o : { ...o, [sp.id]: true }));
      else setOpenDossier((o) => (o[sp.id] ? o : { ...o, [sp.id]: true }));
    },
    annoncer,
    // la fiche importée reste visible là où on l'a lâchée : son dossier (et son parent) ouverts
    onImporte: (fiche) => {
      const d = fiche.dossierId && db.dossiers.find((x) => x.id === fiche.dossierId);
      if (d) setOpenDossier((o) => ({ ...o, [d.id]: true, ...(d.parentId ? { [d.parentId]: true } : {}) }));
    },
  });
  const createMatiere = async (sourceId) => {
    const id = await ctx.addMatiere(sourceId, 'Nouvelle matière');
    if (id) startRename('matiere', id, 'Nouvelle matière');
  };
  const askDeleteMatiere = (matiereId) => {
    const m = db.matieres.find((x) => x.id === matiereId); if (!m) return;
    const fiches = db.fiches.filter((f) => f.matiereId === matiereId && !f.archive);
    const ids = new Set(fiches.map((f) => f.id));
    setConfirmDeleteMatiere({
      matiere: m, fiches: fiches.length,
      dossiers: (db.dossiers || []).filter((d) => d.matiereId === matiereId).length,
      cartes: db.questions.filter((q) => ids.has(q.ficheId)).length,
    });
  };

  // NOM PROVISOIRE SÉLECTIONNÉ à l'ouverture du renommage (comme le Finder) : on
  // tape directement le vrai nom. Le champ est remonté à chaque rendu (composant
  // recréé), donc on re-sélectionne au focus TANT QUE le texte est encore le nom de
  // départ — dès la première frappe il diffère, et plus rien n'est re-sélectionné.
  const renommageFrais = useRef(null); // nom de départ du renommage en cours
  const startRename = (type, id, current) => { renommageFrais.current = current; setDraft(current); setRenaming({ type, id }); };
  const isRen = (type, id) => renaming && renaming.type === type && renaming.id === id;
  const commitRename = () => {
    if (renaming && draft.trim()) {
      if (renaming.type === 'source') ctx.renameSource(renaming.id, draft);
      else if (renaming.type === 'matiere') ctx.renameMatiere(renaming.id, draft);
      else if (renaming.type === 'dossier') ctx.renameDossier(renaming.id, draft);
      else ctx.renameFiche(renaming.id, draft);
    }
    setRenaming(null);
  };
  const RenameInput = () => (
    <input className="srcmgr-input" autoFocus value={draft} onClick={(e) => e.stopPropagation()}
      onFocus={(e) => { if (e.target.value === renommageFrais.current) e.target.select(); }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
      onBlur={commitRename} />
  );

  const qById = (fId) => db.questions.filter((x) => x.ficheId === fId);
  const count = (fId, t) => qById(fId).filter((x) => x.type === t).length;

  // arbre des dossiers sur 2 niveaux — le niveau se déduit de parentId (voir
  // MedReviseApp.jsx#addDossier), aucune donnée propre à cet écran : Reviser.jsx
  // lit exactement le même store avec les mêmes helpers.
  const byOrdre = (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0);
  const unitesOf = (matId) => db.dossiers.filter((d) => d.matiereId === matId && !d.parentId).sort(byOrdre);
  const chapitresOf = (uniteId) => db.dossiers.filter((d) => d.parentId === uniteId).sort(byOrdre);
  // fiches d'une unité, chapitres INCLUS : compteur affiché sur la ligne repliée
  // (sinon il mentirait), jamais utilisé pour le rendu du contenu.
  const fichesCountRecursif = (allFiches, uniteId) => {
    const ids = [uniteId, ...chapitresOf(uniteId).map((c) => c.id)];
    return allFiches.filter((f) => ids.includes(f.dossierId)).length;
  };

  // ouvre le document d'une fiche dans le panneau de droite (jamais de navigation
  // d'écran) ; kind dérivé de docKind() — pdfId → 'fiche', anat_schema → 'schema',
  // transcript → 'transcript'. Replie la liste dans la foulée (le lecteur prend
  // toute la largeur) — le chevron du rail la rouvre en un clic.
  // `mode` ('read'|'edit') a disparu avec le faux mode du lecteur (étapes 5 et 7).
  const openDoc = (f, srcTab) => {
    const kind = docKind(f);
    if (kind === 'fiche') setSelected({ ficheId: f.id, kind: 'fiche', srcTab });
    else if (kind === 'schema') setSelected({ ficheId: f.id, kind: 'schema' });
    else if (kind === 'transcript') setSelected({ ficheId: f.id, kind: 'transcript' });
    if (kind) setListCollapsed(true);
  };
  const closeDoc = () => { setSelected(null); setListCollapsed(false); };
  // input UNIQUE (PDF ou HTML) pour rattacher un document — le type est détecté
  // à la volée, le stockage bascule sur fiche.pdfId ou fiche.htmlId en conséquence.
  const attachDoc = async (ficheId, file) => {
    const kind = detectDocKind(file);
    if (!kind) return;
    const blobId = await putBlob(file);
    if (kind === 'html') await ctx.setFicheHtml(ficheId, blobId, file.name);
    else await ctx.setFichePdf(ficheId, blobId, file.name);
    setSelected({ ficheId, kind: 'fiche', srcTab: kind });
    setListCollapsed(true);
  };
  // déclenché depuis le menu « … » (« Attacher un document ») : un seul input
  // fichier partagé pour toute la liste, ciblé via `attachTarget` — évite un
  // <input> par ligne (celui-ci reste caché en permanence, voir plus bas).
  const requestAttach = (ficheId) => { setAttachTarget(ficheId); attachInputRef.current?.click(); };
  const onAttachInputChange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file && attachTarget) attachDoc(attachTarget, file);
    setAttachTarget(null);
  };
  const openEtqMenu = (e, ficheId) => {
    e.stopPropagation();
    setEtqMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 170), ficheId });
  };
  const openFicheMenu = (e, ficheId) => {
    e.stopPropagation();
    setFicheMenu({ x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 320), ficheId });
  };
  const removeTranscript = async (ficheId) => {
    await deleteTranscript(ficheId);
    if (selected && selected.ficheId === ficheId) setSelected(null);
    await ctx.reload();
  };
  const confirmArchiveFiche = async () => {
    if (!confirmArchive) return;
    await ctx.setFicheArchived(confirmArchive.id, true);
    if (selected && selected.ficheId === confirmArchive.id) closeDoc();
    setConfirmArchive(null);
  };

  // contenu du menu « … » d'une ligne de cours : TOUT ce qui n'est pas visible en
  // permanence (voir la refonte UX) — rien n'est supprimé, juste regroupé. `x,y`
  // = position du clic qui a ouvert ce menu (réutilisée si « Étiquette » l'ouvre
  // à son tour, au même endroit).
  const ficheMenuItems = (f, x, y) => {
    const isSchema = f.type === 'anat_schema';
    const isTranscript = f.type === 'transcript';
    const items = [{ label: 'Renommer', icon: 'edit', onClick: () => startRename('fiche', f.id, f.titre) }];
    // « Déplacer vers » : racine de la matière ou un de ses sous-dossiers — pur
    // rangement d'affichage (voir fiche.dossierId), disponible pour tout type de
    // fiche (y compris schéma/transcript), à la différence des items ci-dessous.
    items.push({ label: 'Déplacer vers…', icon: 'folder', onClick: () => setMoveMenu({ x, y, ficheId: f.id }) });
    if (!isSchema && !isTranscript) {
      items.push({ label: f.etiquette ? 'Changer l’étiquette' : 'Poser une étiquette', icon: 'tag', onClick: () => setEtqMenu({ x, y, ficheId: f.id }) });
      if (f.pdfId && f.htmlId) {
        items.push({ label: 'Ouvrir en PDF', icon: 'filePdf', onClick: () => openDoc(f, 'pdf') });
        items.push({ label: 'Ouvrir en HTML', icon: 'fileHtml', onClick: () => openDoc(f, 'html') });
      }
      if (f.htmlId) items.push({ label: 'Remplacer le fichier HTML', icon: 'refresh', onClick: () => setReplacingHtmlId(f.id) });
      if (!f.pdfId || !f.htmlId) items.push({ label: 'Attacher un document', icon: 'upload', onClick: () => requestAttach(f.id) });
      items.push({
        label: f.rappelsJ === false ? 'Reprendre les rappels J' : 'Mettre les rappels J en pause', icon: 'bell',
        onClick: () => ctx.setFicheRappelsJ(f.id, f.rappelsJ === false),
      });
    }
    items.push(isTranscript
      ? { label: 'Supprimer ce transcript', icon: 'trash', danger: true, onClick: () => removeTranscript(f.id) }
      : { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => setConfirmArchive(f) });
    return items;
  };

  // items du sous-menu « Déplacer vers » (ouvert depuis ficheMenuItems) : racine
  // de la matière + chaque unité + chaque chapitre (indenté sous son unité) de
  // CETTE matière — une fiche est dans exactement UN bucket (racine, unité OU
  // chapitre), jamais deux, voir moveFicheTo. Liste identique à Reviser.jsx.
  const moveMenuItems = (f) => {
    const mat = db.matieres.find((x) => x.id === f.matiereId);
    const items = [{
      label: <span style={{ fontWeight: !f.dossierId ? 700 : 500 }}>Racine de {mat ? mat.nom : 'la matière'}{!f.dossierId ? ' ✓' : ''}</span>,
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

  // BUG5 : drag & drop des fiches via @dnd-kit (voir FicheDndProvider/ui.jsx).
  // dossierId (depuis l'id de DropSlot survolé) : null = racine de la matière.
  const onDropAt = ({ ficheId, matiereId, dossierId, beforeFicheId }) => {
    if (beforeFicheId === ficheId) return;
    ctx.moveFicheTo(ficheId, matiereId, beforeFicheId, dossierId || null);
  };
  // ligne d'une fiche (draggable + DropSlot précédent) — extrait en fonction pour
  // être réutilisé identique à la racine de la matière ET dans un dossier : le
  // bucket (racine ou dossier) se déduit simplement de f.dossierId, jamais passé
  // à part (une fiche est soit à la racine, soit dans UN dossier, jamais les deux).
  const renderFiche = (f) => {
    const fo = !!openFiche[f.id];
    const isAnat = f.type === 'anatomie';
    const isSchema = f.type === 'anat_schema';
    const isTranscript = f.type === 'transcript';
    const kind = docKind(f);
    const isSel = !!(selected && selected.ficheId === f.id);
    const paused = !isTranscript && f.rappelsJ === false;
    const etq = etiquetteMeta(f.etiquette);
    const nCartes = isTranscript || isSchema ? 0 : count(f.id, 'qcm') + count(f.id, 'flashcard');
    // le détail (compteurs) passe dans l'infobulle : la ligne garde toute sa largeur au titre
    const metaLine = isTranscript ? 'Transcript'
      : isSchema ? `Schéma · ${schemaViews(f) > 1 ? schemaViews(f) + ' vues · ' : ''}${schemaCoches(f)} coche${schemaCoches(f) > 1 ? 's' : ''}`
        : `${f.priseDeNotes ? 'Prise de notes · ' : ''}${count(f.id, 'qcm')} QCM · ${count(f.id, 'flashcard')} flash${isAnat ? ' · images' : ''}`;
    return (
      <div key={f.id} className={fd.dropClass('fiche:' + f.id).trim()}
        {...fd.dropProps({ key: 'fiche:' + f.id, matiereId: f.matiereId, dossierId: f.dossierId || null })}>
        <DropSlot matiereId={f.matiereId} dossierId={f.dossierId || null} beforeId={f.id} />
        <DraggableFiche id={f.id} disabled={isRen('fiche', f.id)} className={'lt-ligne lt-fiche' + (isSel ? ' selected' : '')}>
          {isRen('fiche', f.id) ? (
            <div className="lt-rangee"><span className="lt-pli" /><RenameInput /></div>
          ) : (
            <div role="button" className="lt-rangee"
              onClick={() => { if (kind) openDoc(f); else setOpenFiche((o) => ({ ...o, [f.id]: !fo })); }}
              onDoubleClick={(e) => { e.stopPropagation(); startRename('fiche', f.id, f.titre); }}
              title={`${f.titre}\n${metaLine}\n${kind ? 'Clic = ouvrir le document' : 'Clic = voir les cartes'} · double-clic = renommer · glisser = déplacer`}>
              {kind
                ? <><span className="lt-pli" /><Icon name={f.priseDeNotes ? 'edit' : DOC_META[kind].icon} size={14} className="lt-ic" /></>
                : <><Icon name={fo ? 'chevD' : 'chevR'} size={13} className="lt-pli" /><Icon name="cards" size={14} className="lt-ic" /></>}
              <span className="lt-nom">{f.titre}</span>
              {etq && <span className="lib-fiche-etq" style={{ background: etq.color }} title={`Étiquette : ${etq.label}`} onClick={(e) => openEtqMenu(e, f.id)} />}
              {paused && <Icon name="bellOff" size={12} className="lt-ic" title="Rappels J en pause" />}
              {nCartes > 0 && <span className="lt-compte" title={`${nCartes} carte${nCartes > 1 ? 's' : ''}`}>{nCartes}</span>}
              <span className="lt-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                {!isTranscript && (
                  <button type="button" className="cd-ic" title="Réviser cette fiche" onClick={() => { if (isSchema) { ctx.startAnatQuiz(f, { mode: 'total' }); } else { ctx.setFocusFiche(f.id); ctx.startSession(db.questions.filter((x) => x.ficheId === f.id && x.type !== 'feynman'), f.titre); } }}>
                    <Icon name="play" size={12} />
                  </button>
                )}
                <button type="button" className="cd-ic" title="Autres actions" onClick={(e) => openFicheMenu(e, f.id)}><Icon name="more" size={14} stroke={2.6} /></button>
              </span>
            </div>
          )}
          {fo && !kind && (
            <div className="lt-cartes">
              {qById(f.id).map((x) => (
                <div className="lt-carte" key={x.id}>
                  <Icon name={x.type === 'flashcard' ? 'cards' : x.type === 'feynman' ? 'lightbulb' : 'list'} size={11} />
                  <span>{x.concept}</span>
                  <button className="cd-ic" title="Supprimer cette carte" onClick={() => ctx.deleteQuestion(x.id)}><Icon name="trash" size={12} /></button>
                </div>
              ))}
              {!qById(f.id).length && <div className="lt-vide">Aucune carte.</div>}
            </div>
          )}
        </DraggableFiche>
      </div>
    );
  };
  // création d'une unité / d'un chapitre : créé immédiatement (nom par défaut) puis
  // bascule tout de suite en renommage — même geste "créer → taper le nom" que pour
  // une matière, aux deux niveaux.
  const createUnite = async (matiereId) => {
    const id = await ctx.addDossier(matiereId, 'Nouveau dossier');
    if (!id) return;
    setOpenDossier((o) => ({ ...o, [id]: true }));
    startRename('dossier', id, 'Nouveau dossier');
  };
  const createChapitre = async (matiereId, uniteId) => {
    const id = await ctx.addDossier(matiereId, 'Nouveau dossier', uniteId);
    if (!id) return;
    setOpenDossier((o) => ({ ...o, [uniteId]: true, [id]: true }));
    startRename('dossier', id, 'Nouveau dossier');
  };
  const openDossierMenu = (e, dossierId) => {
    e.stopPropagation();
    setDossierMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 120), dossierId });
  };
  const dossierMenuItems = (d) => [
    { label: 'Renommer', icon: 'edit', onClick: () => startRename('dossier', d.id, d.nom) },
    // sous-dossier : au 1er niveau seulement (2 niveaux maximum, garde de addDossier)
    ...(d.parentId ? [] : [{ label: 'Nouveau dossier dedans', icon: 'folder', onClick: () => createChapitre(d.matiereId, d.id) }]),
    { label: 'Supprimer le dossier', icon: 'trash', danger: true, onClick: () => setConfirmDeleteDossier(d) },
  ];
  const confirmDeleteDossierNow = async () => {
    if (!confirmDeleteDossier) return;
    await ctx.deleteDossier(confirmDeleteDossier.id);
    setConfirmDeleteDossier(null);
  };
  // LIGNE D'UN DOSSIER (Bibliothèque) : flèche · dossier · nom · nombre de fiches ·
  // au survol « + » (sous-dossier, niveau 1 seulement — 2 niveaux maximum) et ⋯.
  // Rendu propre à la Bibliothèque : ui.jsx#DossierRow reste celui de Réviser.
  const ligneDossier = (d, nFiches, onAjout) => {
    const ouvert = !!openDossier[d.id];
    if (isRen('dossier', d.id)) return <div className="lt-rangee lt-dos"><Icon name={ouvert ? 'chevD' : 'chevR'} size={13} className="lt-pli" /><Icon name="folder" size={14} className="lt-ic" /><RenameInput /></div>;
    return (
      <div className="lt-rangee lt-dos" role="button" title={(ouvert ? 'Replier' : 'Déplier') + ' le dossier · double-clic = renommer'}
        onClick={() => setOpenDossier((o) => ({ ...o, [d.id]: !ouvert }))}
        onDoubleClick={(e) => { e.stopPropagation(); startRename('dossier', d.id, d.nom); }}>
        <Icon name={ouvert ? 'chevD' : 'chevR'} size={13} className="lt-pli" />
        <Icon name="folder" size={14} className="lt-ic" />
        <span className="lt-nom">{d.nom}</span>
        {nFiches > 0 && <span className="lt-compte" title={`${nFiches} fiche${nFiches > 1 ? 's' : ''}`}>{nFiches}</span>}
        <span className="lt-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {onAjout && <button type="button" className="cd-ic" title={`Nouveau dossier dans « ${d.nom} »`} onClick={onAjout}><Icon name="plus" size={14} /></button>}
          <button type="button" className="cd-ic" title="Actions sur le dossier" onClick={(e) => openDossierMenu(e, d.id)}><Icon name="more" size={14} stroke={2.6} /></button>
        </span>
      </div>
    );
  };
  const renderFicheOverlay = (ficheId) => {
    const f = db.fiches.find((x) => x.id === ficheId);
    if (!f) return null;
    return (
      <div className="dnd-overlay-card" style={{ border: '1px solid var(--border-2)', background: 'var(--card)', padding: '11px 13px', width: 280 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{f.titre}</span>
      </div>
    );
  };

  return (
    <div className="screen scroll fadein lib-screen">
      <div className="topbar">
        <div>
          <h1 className="serif">Bibliothèque</h1>
          <div className="sub">Tous tes cours, fiches et documents.</div>
        </div>
        {/* « Rechercher une notion » retiré (30/09) : pas utile ici — chercher une
           notion DANS un cours se fait dans le lecteur (Ctrl/Cmd+F). Le seul bouton
           qui restait dans la barre d'outils rejoint l'en-tête. */}
        <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn ghost sm" onClick={() => setCreatingTranscript((v) => !v)}>
            <Icon name={creatingTranscript ? 'x' : 'plus'} size={13} /> {creatingTranscript ? 'Fermer' : 'Nouveau transcript'}
          </button>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      {/* input fichier PARTAGÉ (menu « … » → Attacher un document) — un seul pour
         toute la liste, jamais affiché ; voir requestAttach/onAttachInputChange. */}
      <input ref={attachInputRef} type="file" accept="application/pdf,text/html,.pdf,.html" style={{ display: 'none' }} onChange={onAttachInputChange} />

      <div className="lib-split">
        <div className={'lib-master' + (listCollapsed ? ' collapsed' : '')}>
        {!listCollapsed && (
        <div className="lib-master-body">
          {creatingTranscript && (
            <NewTranscript ctx={ctx} onDone={() => setCreatingTranscript(false)}
              onCreated={(fiche) => { setSelected({ ficheId: fiche.id, kind: 'transcript' }); setListCollapsed(true); }} />
          )}

            <FicheDndProvider onDropAt={onDropAt} renderOverlay={renderFicheOverlay}>
            <div className="lib-tree" {...fd.dropProps({ key: 'tree' })}>
              {annonce && (
                <div className={'tree-drop-hint' + (annonce.ok ? ' ok' : '')} role="status">
                  <Icon name={annonce.ok ? 'check' : 'alert'} size={13} stroke={2.5} />
                  <span>{annonce.texte}</span>
                </div>
              )}
              {/* ARBRE « type Finder » (refonte, voir docs/audit-sidebar-biblio.md) :
                 Section › Matière › Dossier › Fiche, une ligne par élément, même
                 grammaire à chaque niveau — flèche de repli · icône · nom · compteur ·
                 actions au survol (+ / ▷ / ⋯). Tout le reste (glisser-déposer des
                 fiches, dépôt de fichiers, renommage, menus, états mémorisés) est
                 inchangé. */}
              {(() => { const sections = trierSections(db.sources.filter((s) => !s.archive), ctx.stats); return sections.map((src, iSec) => {
                const mats = db.matieres.filter((m) => m.sourceId === src.id && !m.archive);
                const srcOuverte = openSrc[src.id] !== false;
                const rappels = src.rappelsJ !== false;
                return (
                  <div className={'lt-section' + fd.dropClass('src:' + src.id)} key={src.id}
                    {...fd.dropProps({ key: 'src:' + src.id, spring: { type: 'source', id: src.id } })}>
                    <div className="lt-rangee lt-sec" role="button" title={(srcOuverte ? 'Replier' : 'Déplier') + ' la section · double-clic = renommer'}
                      onClick={() => setOpenSrc((o) => ({ ...o, [src.id]: !srcOuverte }))}
                      onDoubleClick={(e) => { e.stopPropagation(); startRename('source', src.id, src.nom); }}>
                      <Icon name={srcOuverte ? 'chevD' : 'chevR'} size={13} className="lt-pli" />
                      {isRen('source', src.id) ? <RenameInput /> : <span className="lt-nom">{src.nom}</span>}
                      {!rappels && <span className="lt-etat" title="Rappels J en pause pour cette section"><Icon name="bellOff" size={12} /></span>}
                      <span className="lt-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                        <button type="button" className="cd-ic" disabled={iSec === 0} title="Monter la section" onClick={() => deplacerSection(ctx, sections, src.id, -1)}><Icon name="chevU" size={14} /></button>
                        <button type="button" className="cd-ic" disabled={iSec === sections.length - 1} title="Descendre la section" onClick={() => deplacerSection(ctx, sections, src.id, 1)}><Icon name="chevD" size={14} /></button>
                        <BellButton on={rappels} onToggle={() => ctx.setSourceRappels(src.id, !rappels)} />
                      </span>
                    </div>
                    {srcOuverte && (
                      <div className="lt-enfants lt-enfants-sec">
                        {mats.map((mat) => {
                          const mm = matiereMeta(mat);
                          const allFiches = db.fiches.filter((f) => f.matiereId === mat.id && !f.archive).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
                          const rootFiches = allFiches.filter((f) => !f.dossierId);
                          const unites = unitesOf(mat.id);
                          const matOuverte = !matFermee[mat.id];
                          return (
                            <div key={mat.id} className={fd.dropClass('mat:' + mat.id).trim()}
                              {...fd.dropProps({ key: 'mat:' + mat.id, matiereId: mat.id })}>
                              {/* toute la ligne de la matière reçoit une fiche lâchée dessus (racine) */}
                              <DropCible matiereId={mat.id} dossierId={null} onSurvolProlonge={() => setMatFermee((o) => (o[mat.id] ? { ...o, [mat.id]: false } : o))}>
                                <div className="lt-rangee lt-mat" role="button" title={(matOuverte ? 'Replier' : 'Déplier') + ' la matière · double-clic = renommer'}
                                  onClick={() => setMatFermee((o) => ({ ...o, [mat.id]: matOuverte }))}
                                  onDoubleClick={(e) => { e.stopPropagation(); startRename('matiere', mat.id, mm.label); }}>
                                  <Icon name={matOuverte ? 'chevD' : 'chevR'} size={13} className="lt-pli" />
                                  <span className="lt-point" style={{ background: mm.tint }} />
                                  {isRen('matiere', mat.id) ? <RenameInput /> : <span className="lt-nom">{mm.label}</span>}
                                  {allFiches.length > 0 && <span className="lt-compte" title={`${allFiches.length} fiche${allFiches.length > 1 ? 's' : ''}`}>{allFiches.length}</span>}
                                  <span className="lt-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                                    <button type="button" className="cd-ic" title={`Nouveau dossier dans « ${mm.label} »`} onClick={() => { setMatFermee((o) => ({ ...o, [mat.id]: false })); createUnite(mat.id); }}><Icon name="plus" size={14} /></button>
                                    <button type="button" className="cd-ic" title="Actions sur la matière" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMatMenu({ x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 4, matiereId: mat.id }); }}>
                                      <Icon name="more" size={14} stroke={2.6} />
                                    </button>
                                  </span>
                                </div>
                              </DropCible>

                              {matOuverte && (
                                <div className="lt-enfants">
                                  {rootFiches.map(renderFiche)}
                                  <DropSlot matiereId={mat.id} dossierId={null} beforeId={null} variant={rootFiches.length ? 'line' : 'zone'} label={unites.length ? 'Déposer ici (racine)' : 'Déposer ici'} />

                                  {/* dossiers sur DEUX niveaux (parentId) : rangement d'affichage pur. */}
                                  {unites.map((u) => {
                                    const chapitres = chapitresOf(u.id);
                                    const uniteFiches = allFiches.filter((f) => f.dossierId === u.id);
                                    return (
                                      <div key={u.id} className={fd.dropClass('dos:' + u.id).trim()}
                                        {...fd.dropProps({ key: 'dos:' + u.id, matiereId: mat.id, dossierId: u.id, spring: { type: 'dossier', id: u.id } })}>
                                        <DropCible matiereId={mat.id} dossierId={u.id} onSurvolProlonge={() => setOpenDossier((o) => (o[u.id] ? o : { ...o, [u.id]: true }))}>
                                          {ligneDossier(u, fichesCountRecursif(allFiches, u.id), () => createChapitre(mat.id, u.id))}
                                        </DropCible>
                                        {openDossier[u.id] && (
                                          <div className="lt-enfants">
                                            {uniteFiches.map(renderFiche)}
                                            <DropSlot matiereId={mat.id} dossierId={u.id} beforeId={null} variant={uniteFiches.length ? 'line' : 'zone'} label={chapitres.length ? 'Déposer ici (dossier)' : 'Déposer ici'} />
                                            {chapitres.map((c) => {
                                              const chapFiches = allFiches.filter((f) => f.dossierId === c.id);
                                              return (
                                                <div key={c.id} className={fd.dropClass('dos:' + c.id).trim()}
                                                  {...fd.dropProps({ key: 'dos:' + c.id, matiereId: mat.id, dossierId: c.id, spring: { type: 'dossier', id: c.id } })}>
                                                  <DropCible matiereId={mat.id} dossierId={c.id} onSurvolProlonge={() => setOpenDossier((o) => (o[c.id] ? o : { ...o, [c.id]: true }))}>
                                                    {ligneDossier(c, chapFiches.length, null)}
                                                  </DropCible>
                                                  {openDossier[c.id] && (
                                                    <div className="lt-enfants">
                                                      {chapFiches.map(renderFiche)}
                                                      <DropSlot matiereId={mat.id} dossierId={c.id} beforeId={null} variant={chapFiches.length ? 'line' : 'zone'} />
                                                      {chapFiches.length === 0 && <div className="lt-vide">Vide — glisse une fiche ou un fichier ici</div>}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                            {uniteFiches.length === 0 && chapitres.length === 0 && <div className="lt-vide">Vide — glisse une fiche ou un fichier ici</div>}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {rootFiches.length === 0 && unites.length === 0 && <div className="lt-vide">Vide — glisse une fiche ou un fichier ici</div>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button type="button" className="lt-rangee lt-ajout" onClick={() => createMatiere(src.id)} title={`Créer une matière dans « ${src.nom} »`}>
                          <Icon name="plus" size={13} className="lt-pli" /> <span className="lt-nom">Nouvelle matière</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              }); })()}
            </div>
            </FicheDndProvider>
        </div>
        )}
          <SplitHandle side="left" collapsed={listCollapsed} onClick={() => setListCollapsed((v) => !v)} />
        </div>

        <div className="lib-detail">
          {!selected ? (
            <div className="lib-detail-empty">
              <Icon name="book" size={28} />
              <div style={{ fontWeight: 600, marginTop: 10 }}>Aucun document sélectionné</div>
              <div className="hint" style={{ marginTop: 6 }}>Clique une fiche avec PDF, schéma ou transcript pour l'ouvrir ici.</div>
            </div>
          ) : selected.kind === 'fiche' ? (
            <PdfReader key={selected.ficheId + ':' + (selected.srcTab || '')} ctx={ctx} source={{ id: selected.ficheId, ficheId: selected.ficheId }} initialSrcTab={selected.srcTab} embedded onClose={closeDoc} />
          ) : selected.kind === 'schema' ? (
            <SchemaEditorScreen key={selected.ficheId} ctx={ctx} ficheId={selected.ficheId} embedded onClose={closeDoc} />
          ) : selected.kind === 'transcript' ? (
            <TranscriptEditor key={selected.ficheId} ctx={ctx} ficheId={selected.ficheId} onClose={closeDoc} />
          ) : null}
        </div>
      </div>

      {modaleDepot}

      {etqMenu && (
        <ContextMenu x={etqMenu.x} y={etqMenu.y} onClose={() => setEtqMenu(null)}
          items={etiquetteMenuItems((db.fiches.find((x) => x.id === etqMenu.ficheId) || {}).etiquette, (v) => ctx.setFicheEtiquette(etqMenu.ficheId, v))} />
      )}

      {ficheMenu && (() => {
        const f = db.fiches.find((x) => x.id === ficheMenu.ficheId);
        return f ? <ContextMenu x={ficheMenu.x} y={ficheMenu.y} onClose={() => setFicheMenu(null)} items={ficheMenuItems(f, ficheMenu.x, ficheMenu.y)} /> : null;
      })()}

      {moveMenu && (() => {
        const f = db.fiches.find((x) => x.id === moveMenu.ficheId);
        return f ? <ContextMenu x={moveMenu.x} y={moveMenu.y} onClose={() => setMoveMenu(null)} items={moveMenuItems(f)} /> : null;
      })()}

      {dossierMenu && (() => {
        const d = db.dossiers.find((x) => x.id === dossierMenu.dossierId);
        return d ? <ContextMenu x={dossierMenu.x} y={dossierMenu.y} onClose={() => setDossierMenu(null)} items={dossierMenuItems(d)} /> : null;
      })()}

      {/* confirmation de suppression : les compteurs décrivent le sous-arbre
         réellement touché par ctx.deleteDossier (une unité emporte ses chapitres, et
         ses fiches comme celles de ses chapitres remontent à la racine) — textes
         partagés avec Reviser.jsx via dossierDeleteTexts. */}
      {matMenu && (() => {
        const m = db.matieres.find((x) => x.id === matMenu.matiereId);
        if (!m) return null;
        return (
          <ContextMenu x={matMenu.x} y={matMenu.y} onClose={() => setMatMenu(null)} items={[
            { label: 'Renommer', icon: 'edit', onClick: () => startRename('matiere', m.id, matiereMeta(m).label) },
            { label: 'Nouveau dossier', icon: 'folder', onClick: () => createUnite(m.id) },
            { label: 'Supprimer la matière…', icon: 'trash', danger: true, onClick: () => askDeleteMatiere(m.id) },
          ]} />
        );
      })()}
      {confirmDeleteMatiere && (() => {
        const c = confirmDeleteMatiere;
        const nom = matiereMeta(c.matiere).label;
        const pl = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
        return (
          <ConfirmModal title={`Supprimer la matière « ${nom} » ?`}
            body={c.fiches
              ? `${c.fiches > 1 ? `Ses ${c.fiches} fiches` : 'Sa fiche'} (${pl(c.cartes, 'carte')}) ${c.fiches > 1 ? 'ne sont PAS supprimées : elles sont déplacées' : "n'est PAS supprimée : elle est déplacée"} dans « À classer », dans la même section, et ${c.fiches > 1 ? 'leur' : 'sa'} méthode des J continue.${c.dossiers ? ` Ses ${pl(c.dossiers, 'dossier')} disparaissent de l'arbre (les fiches qu'ils rangeaient passent à plat dans « À classer »).` : ''} « ${nom} » va ensuite dans la corbeille — restaurable depuis Réglages. Une sauvegarde de sécurité est faite avant.`
              : `« ${nom} » ne contient aucune fiche${c.dossiers ? ` (${pl(c.dossiers, 'dossier')} vide${c.dossiers > 1 ? 's' : ''})` : ''}. Elle va dans la corbeille — restaurable depuis Réglages. Une sauvegarde de sécurité est faite avant.`}
            confirmLabel="Supprimer la matière" danger
            onConfirm={async () => { setConfirmDeleteMatiere(null); await ctx.deleteMatiere(c.matiere.id); }}
            onCancel={() => setConfirmDeleteMatiere(null)} />
        );
      })()}
      {confirmDeleteDossier && (() => {
        const d = confirmDeleteDossier;
        const chapitres = d.parentId ? [] : chapitresOf(d.id);
        const ids = [d.id, ...chapitres.map((c) => c.id)];
        const nFiches = db.fiches.filter((f) => ids.includes(f.dossierId) && !f.archive).length;
        // exos DE CHAPITRE emportés (voir MedReviseApp.jsx#deleteDossier) : la
        // Bibliothèque n'affiche pas ces exos, mais elle ne doit pas les supprimer
        // en silence — même texte qu'à Réviser.
        const nExos = db.questions.filter((q) => q.chapitreId && ids.includes(q.chapitreId)).length;
        const t = dossierDeleteTexts(d, chapitres.length, nFiches, nExos);
        return (
          <ConfirmModal
            title={t.title} body={t.body} confirmLabel={t.confirmLabel} danger
            onConfirm={confirmDeleteDossierNow} onCancel={() => setConfirmDeleteDossier(null)}
          />
        );
      })()}

      {confirmArchive && (
        <ConfirmModal
          title="Supprimer ce cours ?"
          body={<>« {confirmArchive.titre} » sera déplacé dans la corbeille (Réglages), restaurable tant qu'elle n'est pas vidée. Les cartes et le planning associés partent avec.</>}
          confirmLabel="Supprimer" danger
          onConfirm={confirmArchiveFiche} onCancel={() => setConfirmArchive(null)}
        />
      )}

      {replacingHtmlId && (
        <ReplaceHtmlModal ctx={ctx} fiche={db.fiches.find((x) => x.id === replacingHtmlId)} onClose={() => setReplacingHtmlId(null)} />
      )}
    </div>
  );
}

/* remplace le fichier HTML d'une fiche EXISTANTE (fichier ou HTML collé) — ne
   touche que fiche.htmlId/htmlName (même champ que « Voir le cours »/setFicheHtml) ;
   cartes (QCM/flashcard/Feynman/exercice), plan J et carnet d'erreurs vivent dans
   d'autres stores (questions/highlights/annotations), jamais effleurés ici.
   L'avertissement + le bouton « Remplacer » explicite tiennent lieu de
   confirmation (pas de second dialogue, inutile pour un geste aussi direct). */
function ReplaceHtmlModal({ ctx, fiche, onClose }) {
  const [mode, setMode] = useState('file'); // file | paste
  const [file, setFile] = useState(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  if (!fiche) return null;
  const ready = mode === 'file' ? !!file : !!pasted.trim();

  const confirm = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const blob = mode === 'file' ? file : new Blob([pasted], { type: 'text/html' });
      const name = mode === 'file' ? file.name : (fiche.htmlName || 'fiche.html');
      const blobId = await putBlob(blob);
      await ctx.replaceFicheHtml(fiche.id, blobId, name);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Remplacer le fichier HTML" onClose={onClose}>
      <div className="hint" style={{ marginBottom: 12 }}>
        Remplace le document HTML actuel ({fiche.htmlName || 'fiche HTML'}) de « {fiche.titre} » par une
        nouvelle version. Les cartes (QCM, flashcards, Feynman, exercices), le planning des J et le carnet
        d'erreurs de cette fiche restent intacts — seul le cours affiché dans « Voir le cours » change.
      </div>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button type="button" className={'seg-btn' + (mode === 'file' ? ' active' : '')} onClick={() => setMode('file')}><Icon name="upload" size={13} /> Fichier</button>
        <button type="button" className={'seg-btn' + (mode === 'paste' ? ' active' : '')} onClick={() => setMode('paste')}><Icon name="edit" size={13} /> Coller le HTML</button>
      </div>
      {mode === 'file' ? (
        <div className="imp-field">
          <label>Nouveau fichier HTML</label>
          <input type="file" accept="text/html,.html" onChange={(e) => setFile(e.target.files[0] || null)} />
          {file && <div className="hint" style={{ marginTop: 6 }}>{file.name}</div>}
        </div>
      ) : (
        <div className="imp-field">
          <label>Code HTML collé</label>
          <textarea className="imp-title" style={{ minHeight: 160, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12.5 }}
            placeholder="Colle ici tout le contenu HTML de la fiche mise à jour." value={pasted} onChange={(e) => setPasted(e.target.value)} />
        </div>
      )}
      <div className="imp-actions" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={onClose}>Annuler</button>
        <button className="btn danger" disabled={!ready || busy} onClick={confirm}><Icon name="refresh" size={14} /> Remplacer (écrase l'ancien fichier)</button>
      </div>
    </Modal>
  );
}

/* création d'un transcript : destination + titre + collage + APERÇU nettoyage
   réversible (repris de l'ex-onglet Documents, absorbé ici). `onCreated` ouvre
   le transcript fraîchement créé dans le panneau de droite. */
function NewTranscript({ ctx, onDone, onCreated }) {
  const { db } = ctx;
  const sources = db.sources.filter((s) => !s.archive);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [titre, setTitre] = useState('');
  const [raw, setRaw] = useState('');
  const [version, setVersion] = useState('clean'); // clean | raw
  const [step, setStep] = useState('edit'); // edit | preview
  const [busy, setBusy] = useState(false);

  const cleaned = useMemo(() => cleanTranscript(raw).cleaned, [raw]);
  const ready = !!matId && !!titre.trim() && !!raw.trim();

  const create = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const chosen = version === 'clean' && cleaned ? cleaned : raw;
    const fiche = await createTranscript({ matiereId: matId, titre, originalText: raw, doc: textToDoc(chosen) });
    await ctx.reload();
    setBusy(false);
    onDone && onDone();
    onCreated && onCreated(fiche);
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <div className="imp-dest-head"><Icon name="edit" size={15} /> Nouveau transcript</div>

        {step === 'edit' && (
          <div className="fadein">
            <DestPicker ctx={ctx} srcId={srcId} setSrcId={setSrcId} matId={matId} setMatId={setMatId} />
            <div className="imp-field">
              <label>Titre</label>
              <input className="imp-title" placeholder="ex : Cardio — cours 3 (transcript vidéo)" value={titre} onChange={(e) => setTitre(e.target.value)} />
            </div>
            <div className="imp-field">
              <label>Transcript brut (collé)</label>
              <textarea className="imp-title" style={{ minHeight: 150, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                placeholder="Colle ici le transcript du cours vidéo (avec horodatages, hésitations… ils seront nettoyés)." value={raw} onChange={(e) => setRaw(e.target.value)} />
            </div>
            <div className="imp-actions">
              <button className="btn ghost" onClick={onDone}>Annuler</button>
              <button className="btn primary" disabled={!ready} onClick={() => setStep('preview')}><Icon name="sparkle" size={15} /> Nettoyer & prévisualiser</button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="fadein">
            <div className="hint" style={{ marginBottom: 10 }}>Le nettoyage est réversible : le transcript brut est conservé (bouton « Rétablir le texte d'origine » dans l'éditeur).</div>
            <div className="seg" style={{ marginBottom: 12 }}>
              <button type="button" className={'seg-btn' + (version === 'clean' ? ' active' : '')} onClick={() => setVersion('clean')}><Icon name="sparkle" size={13} /> Version nettoyée</button>
              <button type="button" className={'seg-btn' + (version === 'raw' ? ' active' : '')} onClick={() => setVersion('raw')}><Icon name="edit" size={13} /> Texte brut</button>
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>Avant</div>
                <pre className="rt-diff">{raw.slice(0, 4000) || '(vide)'}</pre>
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>Après (nettoyé)</div>
                <pre className="rt-diff">{cleaned.slice(0, 4000) || '(le nettoyage n\'a rien laissé — garde le texte brut)'}</pre>
              </div>
            </div>
            <div className="imp-actions" style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={() => setStep('edit')}>Retour</button>
              <button className="btn primary" disabled={busy} onClick={create}><Icon name="check" size={15} /> Créer le transcript ({version === 'clean' ? 'nettoyé' : 'brut'})</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
