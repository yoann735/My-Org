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
import { Modal } from './ui.jsx';

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

/* ---- pop-up MINIMAL du dépôt : titre pré-rempli (modifiable) + date de J0, rien
   d'autre. Réutilise Modal (ui.jsx) et les champs `.imp-field`/`.imp-title` des
   écrans d'import — un date-picker identique à celui de l'aperçu d'import
   (components/ImportFlow.jsx). RIEN n'est écrit tant qu'« Importer » n'est pas
   cliqué : annuler laisse la base exactement dans son état d'avant. ---- */
export function FileDropModal({ file, kind, destLabel, titre, onTitre, date, onDate, ignored = 0, busy, onCancel, onConfirm }) {
  const canImport = !busy && !!titre.trim();
  return (
    <Modal title="Importer cette fiche" width="min(460px, 94vw)" onClose={onCancel}>
      <div className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0, marginBottom: 10 }}>
        <Icon name={kind === 'html' ? 'fileHtml' : 'filePdf'} size={16} />
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
      </div>
      <div className="hint" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="folder" size={12} /> {destLabel}
      </div>

      <div className="imp-field">
        <label>Titre de la fiche</label>
        <input className="imp-title" autoFocus value={titre} onChange={(e) => onTitre(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === 'Enter' && canImport) onConfirm(); }} />
      </div>

      <div className="imp-field">
        <label>Premier passage (J0)</label>
        <input type="date" className="imp-title" style={{ maxWidth: 190 }} value={date} onChange={(e) => onDate(e.target.value)} />
        <div className="hint" style={{ marginTop: 4 }}>Par défaut aujourd'hui — change-la pour démarrer cette fiche plus tard.</div>
      </div>

      {ignored > 0 && (
        <div className="hint" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="alert" size={12} /> {ignored} autre{ignored > 1 ? 's' : ''} fichier{ignored > 1 ? 's' : ''} ignoré{ignored > 1 ? 's' : ''} — un seul par dépôt.
        </div>
      )}

      <div className="imp-actions">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        <button className="btn primary" onClick={onConfirm} disabled={!canImport}><Icon name="check" size={15} /> {busy ? 'Import…' : 'Importer'}</button>
      </div>
    </Modal>
  );
}
