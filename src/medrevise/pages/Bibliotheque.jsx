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
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { matiereMeta, FicheDndProvider, DraggableFiche, DropSlot, DropCible, LigneDossierArbre, dossierDeleteTexts, etiquetteMeta, etiquetteMenuItems, ContextMenu, ConfirmModal, detectDocKind, BellButton, Modal, SplitHandle } from '../components/ui.jsx';
import { useTreeOpenState, trierSections, deplacerSection } from '../components/useTreeOpenState.js';
import { useImportParDepot } from '../components/TreeFileDrop.jsx';
import { putBlob } from '../lib/storage.js';
import { ficheImages, totalCoches } from '../lib/anatSchema.js';
import { docKind, DOC_META, deleteTranscript, createDocumentNotes } from '../documents/lib/documents.js';
import { FenetreCreation } from '../components/FenetreCreation.jsx';
import { PdfReader } from '../pdf/PdfReader.jsx';
import { TitreRenommable } from '../components/TitreRenommable.jsx';
import { TranscriptEditor } from '../documents/TranscriptEditor.jsx';
import { SchemaEditorScreen } from '../documents/SchemaEditorScreen.jsx';

const MODES_AFFICHAGE = [
  { id: 'arbre', label: 'Arbre', icon: 'layers', aide: 'Arbre : ranger et organiser (affichage principal)' },
  { id: 'grille', label: 'Grille', icon: 'grid', aide: 'Grille : une carte par fiche, par matière' },
  { id: 'liste', label: 'Liste', icon: 'list', aide: 'Liste : toutes les fiches, triables par colonne' },
];
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
  /* « NOUVEAU DOCUMENT » (08/10) : la fenêtre de création, pré-remplie avec la matière
     d'où l'on vient (menu d'une matière, ou cours ouvert). Les sessions de transcript se
     créent dans le mode Transcript d'un cours : plus de « Nouveau transcript » ici. */
  const [nouveauDoc, setNouveauDoc] = useState(null); // null | { matiereId }
  const [creationEnCours, setCreationEnCours] = useState(false);
  const creerDocument = async ({ titre, matiereId }) => {
    setCreationEnCours(true);
    try {
      const fiche = await createDocumentNotes({ matiereId, titre: titre || 'Nouveau document' });
      await ctx.reload();
      setNouveauDoc(null);
      setSelected({ ficheId: fiche.id, kind: 'document' }); setListCollapsed(true);
    } finally { setCreationEnCours(false); }
  };
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
    else if (kind === 'document') setSelected({ ficheId: f.id, kind: 'document' });
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
              {paused && <span className="lt-etat" title="Rappels J en pause pour cette fiche"><Icon name="bellOff" size={12} /></span>}
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
  // Composant partagé avec Réviser : ui.jsx#LigneDossierArbre.
  const ligneDossier = (d, nFiches, onAjout) => (
    <LigneDossierArbre dossier={d} ouvert={!!openDossier[d.id]} nFiches={nFiches}
      renameInput={isRen('dossier', d.id) ? <RenameInput /> : null}
      onToggle={() => setOpenDossier((o) => ({ ...o, [d.id]: !o[d.id] }))}
      onRename={() => startRename('dossier', d.id, d.nom)}
      onAjout={onAjout} onMenu={(e) => openDossierMenu(e, d.id)} />
  );
  const renderFicheOverlay = (ficheId) => {
    const f = db.fiches.find((x) => x.id === ficheId);
    if (!f) return null;
    return (
      <div className="dnd-overlay-card" style={{ border: '1px solid var(--border-2)', background: 'var(--card)', padding: '11px 13px', width: 280 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{f.titre}</span>
      </div>
    );
  };

  /* ---------- MODES D'AFFICHAGE : Arbre (défaut) · Grille · Liste ----------
     Voir docs/biblio-affichages.md. Le mode est une préférence d'affichage
     (stats.biblioAffichage), comme le repli de l'arbre. Grille et Liste ne font
     que MONTRER autrement les mêmes fiches, avec les mêmes actions (ouvrir,
     réviser, menu ⋯) ; ranger reste le rôle de l'arbre. */
  const affichage = ['grille', 'liste'].includes(ctx.stats && ctx.stats.biblioAffichage) ? ctx.stats.biblioAffichage : 'arbre';
  const choisirAffichage = (m) => {
    if (m === affichage) return;
    setSelected(null); setListCollapsed(false);
    ctx.saveStats({ ...(ctx.stats || {}), biblioAffichage: m });
  };
  const [triListe, setTriListe] = useState({ col: 'section', sens: 1 });
  // toutes les fiches visibles, dans l'ordre de l'arbre (sections triées, matières, ordre)
  const lignesBiblio = (() => {
    const out = [];
    trierSections(db.sources.filter((s) => !s.archive), ctx.stats).forEach((src, iSec) => {
      db.matieres.filter((m) => m.sourceId === src.id && !m.archive).forEach((mat, iMat) => {
        db.fiches.filter((f) => f.matiereId === mat.id && !f.archive).sort(byOrdre).forEach((f, iF) => {
          const d = f.dossierId && db.dossiers.find((x) => x.id === f.dossierId);
          const p = d && d.parentId && db.dossiers.find((x) => x.id === d.parentId);
          out.push({
            f, src, mat, mm: matiereMeta(mat), kind: docKind(f),
            dossier: [p && p.nom, d && d.nom].filter(Boolean).join(' › '),
            nCartes: count(f.id, 'qcm') + count(f.id, 'flashcard'),
            rang: iSec * 1e6 + iMat * 1e3 + iF,
          });
        });
      });
    });
    return out;
  })();
  const iconeFiche = (l) => (l.f.priseDeNotes ? 'edit' : l.kind ? DOC_META[l.kind].icon : 'cards');
  const libelleType = (l) => (l.f.priseDeNotes ? 'Prise de notes' : l.kind === 'schema' ? 'Schéma' : l.kind === 'transcript' ? 'Transcript' : l.f.pdfId ? 'PDF' : l.f.htmlId ? 'HTML' : 'Cartes seules');
  const reviserFiche = (f) => {
    if (f.type === 'anat_schema') ctx.startAnatQuiz(f, { mode: 'total' });
    else { ctx.setFocusFiche(f.id); ctx.startSession(db.questions.filter((x) => x.ficheId === f.id && x.type !== 'feynman'), f.titre); }
  };
  const actionsFiche = (l) => (
    <span className="lv-actions" onClick={(e) => e.stopPropagation()}>
      {l.f.type !== 'transcript' && <button type="button" className="cd-ic" title="Réviser cette fiche" onClick={() => reviserFiche(l.f)}><Icon name="play" size={12} /></button>}
      <button type="button" className="cd-ic" title="Autres actions" onClick={(e) => openFicheMenu(e, l.f.id)}><Icon name="more" size={14} stroke={2.6} /></button>
    </span>
  );
  const fmtDate = (iso) => (iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  // GRILLE : section › matière, une carte par fiche
  const renderGrille = () => {
    const parSection = [];
    lignesBiblio.forEach((l) => {
      let s = parSection.find((x) => x.src.id === l.src.id);
      if (!s) { s = { src: l.src, mats: [] }; parSection.push(s); }
      let m = s.mats.find((x) => x.mat.id === l.mat.id);
      if (!m) { m = { mat: l.mat, mm: l.mm, lignes: [] }; s.mats.push(m); }
      m.lignes.push(l);
    });
    return (
      <div className="lv-grille fadein">
        {!parSection.length && <div className="lib-detail-empty"><Icon name="book" size={28} /><div style={{ marginTop: 10 }}>Aucune fiche pour l'instant.</div></div>}
        {parSection.map((s) => (
          <section key={s.src.id} className="lv-section">
            <h2 className="lv-section-titre">{s.src.nom}</h2>
            {s.mats.map((m) => (
              <div key={m.mat.id} className="lv-matiere">
                <div className="lv-matiere-titre"><span className="lt-point" style={{ background: m.mm.tint }} /> {m.mm.label} <span className="lv-compte">{m.lignes.length}</span></div>
                <div className="lv-cartes">
                  {m.lignes.map((l) => (
                    <div key={l.f.id} role="button" tabIndex={0} className={'lv-carte' + (l.kind ? '' : ' sans-doc')} style={{ '--teinte': l.mm.tint }}
                      onClick={() => { if (l.kind) openDoc(l.f); }} onKeyDown={(e) => { if (e.key === 'Enter' && l.kind) openDoc(l.f); }}
                      title={l.kind ? 'Ouvrir le document' : 'Fiche sans document — ▷ pour réviser'}>
                      <div className="lv-carte-bandeau"><Icon name={iconeFiche(l)} size={22} /></div>
                      <div className="lv-carte-corps">
                        <div className="lv-carte-titre">{l.f.titre}</div>
                        <div className="lv-carte-lieu">{l.dossier || 'Racine de la matière'}</div>
                        <div className="lv-carte-pied">
                          <span>{libelleType(l)}{l.nCartes ? ` · ${l.nCartes} carte${l.nCartes > 1 ? 's' : ''}` : ''}</span>
                          {actionsFiche(l)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    );
  };

  // LISTE : tableau dense, tri par colonne
  const COLONNES = [
    { id: 'titre', label: 'Fiche', val: (l) => l.f.titre.toLowerCase() },
    { id: 'section', label: 'Section › Matière', val: (l) => l.rang },
    { id: 'dossier', label: 'Dossier', val: (l) => (l.dossier || '').toLowerCase() },
    { id: 'cartes', label: 'Cartes', val: (l) => l.nCartes },
    { id: 'date', label: 'Ajoutée', val: (l) => l.f.dateImport || '' },
  ];
  const renderListe = () => {
    const col = COLONNES.find((c) => c.id === triListe.col) || COLONNES[1];
    const lignes = [...lignesBiblio].sort((a, b) => {
      const x = col.val(a), y = col.val(b);
      return (x < y ? -1 : x > y ? 1 : a.rang - b.rang) * triListe.sens;
    });
    const trier = (id) => setTriListe((t) => (t.col === id ? { col: id, sens: -t.sens } : { col: id, sens: id === 'cartes' || id === 'date' ? -1 : 1 }));
    return (
      <div className="lv-liste fadein">
        <div className="lv-ligne lv-entete" role="row">
          {COLONNES.map((c) => (
            <button key={c.id} type="button" className={'lv-col lv-col-' + c.id + (triListe.col === c.id ? ' trie' : '')} onClick={() => trier(c.id)} title={`Trier par ${c.label.toLowerCase()}`}>
              {c.label}{triListe.col === c.id && <Icon name={triListe.sens > 0 ? 'chevD' : 'chevU'} size={12} />}
            </button>
          ))}
          <span className="lv-col lv-col-actions" />
        </div>
        {lignes.map((l) => (
          <div key={l.f.id} role="row" tabIndex={0} className={'lv-ligne' + (l.kind ? '' : ' sans-doc')}
            onClick={() => { if (l.kind) openDoc(l.f); }} onKeyDown={(e) => { if (e.key === 'Enter' && l.kind) openDoc(l.f); }}
            title={l.kind ? 'Ouvrir le document' : 'Fiche sans document — ▷ pour réviser'}>
            <span className="lv-col lv-col-titre"><Icon name={iconeFiche(l)} size={14} className="lt-ic" /> <span className="lv-texte">{l.f.titre}</span></span>
            <span className="lv-col lv-col-section"><span className="lt-point" style={{ background: l.mm.tint }} /> <span className="lv-texte">{l.src.nom} › {l.mm.label}</span></span>
            <span className="lv-col lv-col-dossier"><span className="lv-texte">{l.dossier || '—'}</span></span>
            <span className="lv-col lv-col-cartes">{l.nCartes || '—'}</span>
            <span className="lv-col lv-col-date">{fmtDate(l.f.dateImport)}</span>
            <span className="lv-col lv-col-actions">{actionsFiche(l)}</span>
          </div>
        ))}
        {!lignes.length && <div className="lib-detail-empty"><Icon name="book" size={28} /><div style={{ marginTop: 10 }}>Aucune fiche pour l'instant.</div></div>}
      </div>
    );
  };

  const ficheOuverte = selected ? db.fiches.find((f) => f.id === selected.ficheId) || null : null;
  return (
    <div className={'screen scroll fadein lib-screen' + (ficheOuverte ? ' doc-ouvert' : '')}>
      {/* DOCUMENT OUVERT (01/10) : le grand titre « Bibliothèque » cède la place au
          NOM DE LA FICHE, en petit et renommable d'un clic — l'espace gagné va au
          document. Les modes d'affichage et « Nouveau transcript » concernent la
          liste : ils reviennent dès qu'on ferme le document. */}
      {/* fiche (PDF/HTML) : c'est le lecteur qui affiche le nom ET le menu Fichier
          (avecEntete) ; schéma et transcript gardent cet en-tête compact */}
      {ficheOuverte && (selected.kind === 'fiche' || selected.kind === 'document') ? null : ficheOuverte ? (
        <div className="lecteur-entete">
          <TitreRenommable titre={ficheOuverte.titre} onRenommer={(t) => ctx.renameFiche(ficheOuverte.id, t)} />
        </div>
      ) : (
      <div className="topbar">
        <div>
          <h1 className="serif">Bibliothèque</h1>
          <div className="sub">Tous tes cours, fiches et documents.</div>
          {/* (08/10) l'OCR tourne en silence : son état vit dans Réglages → Reconnaissance de
             texte et dans le menu Fichier de chaque cours, plus ici */}
        </div>
        {/* « Rechercher une notion » retiré (30/09) : pas utile ici — chercher une
           notion DANS un cours se fait dans le lecteur (Ctrl/Cmd+F). Le seul bouton
           qui restait dans la barre d'outils rejoint l'en-tête. */}
        <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* MODES D'AFFICHAGE (docs/biblio-affichages.md) — l'arbre reste le défaut */}
          <div className="seg lib-modes" role="tablist" aria-label="Affichage de la Bibliothèque">
            {MODES_AFFICHAGE.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={affichage === m.id} title={m.aide}
                className={'seg-btn' + (affichage === m.id ? ' active' : '')} onClick={() => choisirAffichage(m.id)}>
                <Icon name={m.icon} size={13} /> {m.label}
              </button>
            ))}
          </div>
          <button className="btn ghost sm" onClick={() => setNouveauDoc({ matiereId: null })}
            title="Un cours sans diapos : des pages blanches où écrire et annoter, avec le même panneau (exercices, notions, transcription)">
            <Icon name="plus" size={13} /> Nouveau document
          </button>
          {/* (08/10) thème, réglages et synchro : menu de l'avatar, en bas de la barre de navigation */}
        </div>
      </div>
      )}

      {/* input fichier PARTAGÉ (menu « … » → Attacher un document) — un seul pour
         toute la liste, jamais affiché ; voir requestAttach/onAttachInputChange. */}
      <input ref={attachInputRef} type="file" accept="application/pdf,text/html,.pdf,.html" style={{ display: 'none' }} onChange={onAttachInputChange} />

      {affichage !== 'arbre' && !selected ? (
        affichage === 'grille' ? renderGrille() : renderListe()
      ) : (
      <div className={'lib-split' + (affichage !== 'arbre' ? ' lib-split-seul' : '')}>
        <div className={'lib-master' + (listCollapsed ? ' collapsed' : '')}>
        {!listCollapsed && (
        <div className="lib-master-body">

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
                      {/* « + » COLLÉ AU NOM (02/10) : ajouter une matière à cette section d'un clic.
                          Il vit DANS le nom (avant son trait décoratif) : les actions qui
                          apparaissent à droite au survol ne peuvent pas le recouvrir. La ligne
                          « Nouvelle matière » du bas reste aussi. */}
                      {isRen('source', src.id) ? <RenameInput /> : (
                        <span className="lt-nom">{src.nom}
                          <button type="button" className="lt-sec-plus" title={`Ajouter une matière dans « ${src.nom} »`}
                            onClick={(e) => {
                              e.stopPropagation();
                              // le bouton rend le focus : sinon Entrée (pour valider le nom, si on
                              // tape avant que le champ n'apparaisse) recrée une matière
                              e.currentTarget.blur();
                              setOpenSrc((o) => ({ ...o, [src.id]: true })); createMatiere(src.id);
                            }}
                            onDoubleClick={(e) => e.stopPropagation()}>
                            <Icon name="plus" size={12} />
                          </button>
                        </span>
                      )}
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
                                <div className="lt-rangee lt-mat" role="button" style={{ '--teinte': mm.tint }} title={(matOuverte ? 'Replier' : 'Déplier') + ' la matière · double-clic = renommer'}
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
          ) : selected.kind === 'fiche' || selected.kind === 'document' ? (
            // (08/10) un document s'ouvre dans le lecteur, exactement comme un PDF
            <PdfReader key={selected.ficheId + ':' + (selected.srcTab || '')} ctx={ctx} source={{ id: selected.ficheId, ficheId: selected.ficheId }} initialSrcTab={selected.srcTab} embedded avecEntete onClose={closeDoc} />
          ) : selected.kind === 'schema' ? (
            <SchemaEditorScreen key={selected.ficheId} ctx={ctx} ficheId={selected.ficheId} embedded onClose={closeDoc} />
          ) : selected.kind === 'transcript' ? (
            <TranscriptEditor key={selected.ficheId} ctx={ctx} ficheId={selected.ficheId} onClose={closeDoc} />
          ) : null}
        </div>
      </div>
      )}

      {modaleDepot}
      {nouveauDoc && (
        <FenetreCreation ctx={ctx} titreFenetre="Nouveau document" placeholderTitre="Titre du document"
          matiereInitiale={nouveauDoc.matiereId || (ficheOuverte && ficheOuverte.matiereId) || null}
          libelleCreer="Créer" occupe={creationEnCours} onAnnuler={() => setNouveauDoc(null)} onCreer={creerDocument} />
      )}

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
            { label: 'Nouveau document', icon: 'edit', onClick: () => setNouveauDoc({ matiereId: m.id }) },
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

/* création d'un cours « document » (07/10) : destination + titre, et c'est tout — le
   document s'ouvre aussitôt, prêt à écrire. */
