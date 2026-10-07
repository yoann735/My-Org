/* ============================================================
   MedRevise — IMPORT ULTRA-RAPIDE : dépôt d'un fichier venu du SYSTÈME (Finder)
   directement sur l'arbre de Réviser. Deux briques neuves seulement ; tout le
   chemin d'import derrière est celui qui existait déjà (putBlob →
   createFicheFromQuestions → ctx.moveFicheTo, voir Reviser.jsx#confirmFileDrop).

   1. `useTreeFileDrop` — cibles de dépôt en events HTML5 NATIFS (dragenter/
      dragover/drop + dataTransfer.files). AUCUN conflit possible avec le
      glisser-déposer INTERNE des fiches (@dnd-kit, ui.jsx#FicheDndProvider) :
      dnd-kit écoute `pointerdown`, qu'un glisser venu du système n'émet jamais.
      Les deux canaux sont disjoints — le DnD interne n'est pas touché d'une ligne.
   2. « spring-loaded folders » — survol prolongé (SPRING_DELAY) au-dessus d'un
      cours / d'une unité / d'un chapitre : le dossier s'OUVRE, comme dans le
      Finder, ce qui permet de descendre la hiérarchie sans relâcher. Rien n'est
      REFERMÉ automatiquement (choix explicite : ce qui s'ouvre pendant le glisser
      reste ouvert après le dépôt, c'est là qu'on veut travailler ensuite).

   Le fichier n'est LU (et encore moins écrit en base) qu'au dépôt, et jamais
   exécuté — voir lib/fileTitre.js.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { detectDocKind } from './ui.jsx';
import { FenetreCreation } from './FenetreCreation.jsx';
import { putBlob } from '../lib/storage.js';
import { todayISO } from '../lib/sm2.js';
import { titreFromFile, titreFromFilename } from '../lib/fileTitre.js';
import { createFicheFromQuestions } from '../lib/import.js';
import { estImage, ordonnerImages, imagesToPdf } from '../lib/imageToPdf.js';
import { estBureautique } from '../lib/noteImport.js';

/** délai d'ouverture au survol prolongé — le Finder se situe autour de 500-700 ms. */
export const SPRING_DELAY = 600;

/** ce glisser porte-t-il des FICHIERS ? Sinon : glisser interne, texte, image… */
const hasFiles = (e) => {
  const t = e.dataTransfer && e.dataTransfer.types;
  return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0;
};

export function useTreeFileDrop({ onSpring, onFiles }) {
  const [overKey, setOverKey] = useState(null);
  const timer = useRef(null);   // minuterie du spring en cours
  const armed = useRef(null);   // clé de la cible pour laquelle il est armé

  const clearDrag = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    armed.current = null;
    setOverKey(null);
  };

  useEffect(() => {
    /* GARDE-FOU : un fichier lâché À CÔTÉ de l'arbre ferait, par défaut, quitter
       l'app pour AFFICHER le fichier dans l'onglet — travail en cours perdu. On
       neutralise ce défaut au niveau de la fenêtre, en phase remontante : les
       zones de dépôt légitimes (l'arbre ici) ont déjà lu leurs fichiers à ce
       stade. Écouteurs montés/démontés avec l'écran qui utilise ce hook. */
    const onWinDragOver = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const onWinDrop = (e) => { if (hasFiles(e)) e.preventDefault(); clearDrag(); };
    window.addEventListener('dragover', onWinDragOver);
    window.addEventListener('drop', onWinDrop);
    window.addEventListener('dragend', clearDrag);
    return () => {
      window.removeEventListener('dragover', onWinDragOver);
      window.removeEventListener('drop', onWinDrop);
      window.removeEventListener('dragend', clearDrag);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Props d'UNE cible de dépôt.
   * @param key        identifiant d'affichage (surbrillance) — unique dans l'arbre
   * @param matiereId  destination ; null = zone sans destination possible. Le dépôt
   *                   est quand même AVALÉ (sinon le navigateur ouvre le fichier),
   *                   puis signalé à l'appelant, qui l'explique à l'utilisateur.
   * @param dossierId  unité ou chapitre visé ; null = racine de la matière
   * @param spring     { type:'source'|'dossier', id } à déplier au survol prolongé
   */
  const dropProps = ({ key, matiereId = null, dossierId = null, spring = null }) => ({
    onDragEnter: (e) => { if (hasFiles(e)) e.preventDefault(); },
    onDragOver: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      // la cible la PLUS PROFONDE gagne : chapitre > unité > matière > arbre.
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setOverKey((k) => (k === key ? k : key));
      if (!spring) {
        // cible sans spring (ligne de fiche, racine de matière) : on désarme celui
        // d'un parent, sinon un dossier quitté s'ouvrirait quand même.
        if (armed.current !== null) { clearTimeout(timer.current); timer.current = null; armed.current = null; }
        return;
      }
      if (armed.current === key) return; // déjà armé (ou déjà déclenché) pour cette cible
      if (timer.current) clearTimeout(timer.current);
      armed.current = key;
      timer.current = setTimeout(() => { timer.current = null; onSpring(spring); }, SPRING_DELAY);
    },
    onDragLeave: (e) => {
      // un dragleave part AUSSI vers un enfant de la cible : ce n'est pas une sortie.
      if (e.currentTarget.contains(e.relatedTarget)) return;
      if (armed.current === key) { clearTimeout(timer.current); timer.current = null; armed.current = null; }
      setOverKey((k) => (k === key ? null : k));
    },
    onDrop: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      clearDrag();
      onFiles({ files, matiereId, dossierId });
    },
  });

  /** classe de surbrillance de la cible survolée (voir .file-drop-over, etudes.css) */
  const dropClass = (key) => (overKey === key ? ' file-drop-over' : '');

  return { dropProps, dropClass, overKey };
}

/* ---- FENÊTRE DU DÉPÔT (08/10) : la MÊME que « Nouveau document » (FenetreCreation.jsx) —
   titre pré-rempli, cours et matière pré-sélectionnés là où le fichier a été lâché, plus
   la date de J0. Rien n'est écrit tant qu'« Importer » n'est pas cliqué. ---- */

/* ============================================================
   IMPORT PAR DÉPÔT SUR UN ARBRE — la logique COMPLÈTE, partagée par Réviser et la
   Bibliothèque (auparavant écrite dans Reviser.jsx seul) : un dépôt → la modale
   minimale → putBlob → createFicheFromQuestions (items: [], dossier visé posé dès
   la création). Aucune fiche n'est écrite avant « Importer ».

   Formats : PDF et HTML comme avant ; IMAGES (une ou plusieurs) converties en un
   PDF, par la conversion déjà utilisée par Prise de notes (lib/imageToPdf.js) ;
   Word/PowerPoint/Keynote refusés AVEC l'explication (pas de conversion fiable
   hors ligne — même message que Prise de notes).

   @param ctx
   @param onSpring   déplier une section/un dossier au survol prolongé
   @param annoncer   (texte, ok) → message transitoire à l'écran
   @param onImporte  (fiche) → après un import réussi (sélection, ouverture…)
   @returns { fd, modale } — `fd` = useTreeFileDrop (dropProps/dropClass),
            `modale` = l'élément à rendre (null si aucun dépôt en cours)
   ============================================================ */
export function useImportParDepot(ctx, { onSpring, annoncer, onImporte }) {
  const { db } = ctx;
  const [depot, setDepot] = useState(null); // { file, fichiers?, kind, matiereId, dossierId, titre, date, ignored }
  const [occupe, setOccupe] = useState(false);

  const onFiles = async ({ files, matiereId, dossierId }) => {
    if (!files.length) return;
    if (!matiereId) { annoncer('Aucune destination ici — dépose le fichier sur une matière ou un dossier.'); return; }
    const docs = files.filter((f) => detectDocKind(f));
    const images = files.filter((f) => !detectDocKind(f) && estImage(f));
    const bureau = files.find(estBureautique);
    if (!docs.length && !images.length) {
      annoncer(bureau
        ? `« ${bureau.name} » ne se convertit pas proprement hors ligne : exporte-le en PDF (Fichier → Exporter au format PDF), puis dépose le PDF.`
        : 'Formats acceptés : PDF, HTML ou images.');
      return;
    }
    if (docs.length) {
      const file = docs[0];
      const kind = detectDocKind(file);
      // lecture SEULE du HTML (DOMParser, aucun script exécuté — voir lib/fileTitre.js)
      const titre = await titreFromFile(file, kind);
      setDepot({ file, kind, matiereId, dossierId: dossierId || null, titre, date: todayISO(), ignored: files.length - 1 });
      return;
    }
    const ordonnees = ordonnerImages(images);
    setDepot({ file: ordonnees[0], fichiers: ordonnees, kind: 'images', matiereId, dossierId: dossierId || null,
      titre: titreFromFilename(ordonnees[0].name), date: todayISO(), ignored: files.length - images.length });
  };

  const fd = useTreeFileDrop({ onSpring, onFiles });

  // dossier visé par le dépôt (Dossier / Sous-dossier), affiché sous le nom du fichier
  const dossierVise = () => {
    const dos = depot && depot.dossierId ? db.dossiers.find((d) => d.id === depot.dossierId) : null;
    const parent = dos && dos.parentId ? db.dossiers.find((d) => d.id === dos.parentId) : null;
    return [parent && parent.nom, dos && dos.nom].filter(Boolean).join(' / ');
  };

  // `choix` : titre et matière de la fenêtre ; une autre matière que celle du dépôt → à sa racine
  const confirmer = async (choix) => {
    if (!depot || occupe) return;
    const { file, fichiers, kind, date } = depot;
    const titre = choix.titre;
    const matiereId = choix.matiereId;
    const dossierId = choix.matiereId === depot.matiereId ? depot.dossierId : null;
    setOccupe(true);
    try {
      const estImages = kind === 'images';
      const blobId = await putBlob(estImages ? await imagesToPdf(fichiers) : file);
      const nomPdf = estImages ? `${(titre.trim() || titreFromFilename(file.name))}.pdf` : file.name;
      // rang de fin dans le bucket visé — même tri que partout (ordre ?? 0), pour que
      // la fiche importée se pose SOUS celles qui y sont déjà.
      const voisines = db.fiches.filter((f) => f.matiereId === matiereId && (f.dossierId || null) === (dossierId || null) && !f.archive);
      const ordre = voisines.length ? Math.max(...voisines.map((f) => f.ordre ?? 0)) + 1 : 0;
      // le rattachement est posé DÈS LA CRÉATION (dossierId/ordre) plutôt qu'après coup
      // par ctx.moveFicheTo : ce dernier cherche la fiche dans le `db` du rendu courant,
      // où celle qu'on vient de créer ne figure pas encore — il sortirait sans rien faire.
      const r = await createFicheFromQuestions({
        matiereId, dossierId, ordre, items: [],
        titre: titre.trim() || titreFromFilename(file.name),
        htmlId: kind === 'html' ? blobId : null, htmlName: kind === 'html' ? file.name : null,
        pdfId: kind !== 'html' ? blobId : null, pdfName: kind !== 'html' ? nomPdf : null,
        startDate: date,
      });
      await ctx.reload();
      setDepot(null);
      annoncer(`« ${r.fiche.titre} » importée.`, true);
      if (onImporte) onImporte(r.fiche);
    } catch (e) {
      annoncer("L'import a échoué — le fichier n'a pas pu être enregistré.");
    } finally {
      setOccupe(false);
    }
  };

  const nbImages = depot && depot.kind === 'images' ? depot.fichiers.length : 0;
  const dossier = depot ? dossierVise() : '';
  const modale = depot ? (
    <FenetreCreation ctx={ctx} titreFenetre={depot.kind === 'html' ? 'Importer une fiche HTML' : 'Importer un PDF'}
      sousTitre={<><Icon name={depot.kind === 'html' ? 'fileHtml' : 'filePdf'} size={13} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{depot.file.name}{nbImages > 1 ? ` + ${nbImages - 1} image${nbImages > 2 ? 's' : ''}` : ''}{dossier ? ` · dans « ${dossier} »` : ''}</span></>}
      placeholderTitre="Titre du cours" titreInitial={depot.titre} selectionnerTitre
      matiereInitiale={depot.matiereId} libelleCreer="Importer" iconeCreer="check" occupe={occupe}
      supplement={(<>
        <label className="fc-ligne">
          <span className="fc-etiquette">Premier passage (J0)</span>
          <input type="date" className="fc-champ" value={depot.date} onChange={(e) => setDepot((d) => ({ ...d, date: e.target.value }))} />
          <span className="hint">Par défaut aujourd'hui — change-la pour démarrer ce cours plus tard.</span>
        </label>
        {nbImages > 0 && <div className="hint">{nbImages > 1 ? `${nbImages} images → un PDF de ${nbImages} pages (ordre des noms de fichier).` : 'Image → un PDF d’une page.'}</div>}
        {depot.ignored > 0 && <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="alert" size={12} /> {depot.ignored} autre{depot.ignored > 1 ? 's' : ''} fichier{depot.ignored > 1 ? 's' : ''} ignoré{depot.ignored > 1 ? 's' : ''} — un seul par dépôt.</div>}
      </>)}
      onAnnuler={() => { if (!occupe) setDepot(null); }}
      onCreer={confirmer} />
  ) : null;

  return { fd, modale };
}
