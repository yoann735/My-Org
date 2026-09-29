/* ============================================================
   MedRevise — IMPORT d'un DOCUMENT DE NOTES (onglet Prise de notes).

   Le fichier n'est rattaché à AUCUNE fiche : il devient un enregistrement du
   store `notes` (lib/notes.js) et son contenu part dans le store `blobs` par
   `putBlob`, exactement comme le PDF d'une unité d'apprentissage
   (ImportApprentissage.jsx) — même canal, même outbox, même synchro.

   Formats : PDF uniquement pour l'instant. Un .docx / .pptx ne peut pas être
   converti proprement hors ligne dans le navigateur : on le REFUSE avec un
   message explicite plutôt que d'échouer à moitié.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { putBlob } from '../lib/storage.js';
import { titreFromFilename } from '../lib/fileTitre.js';
import { createNote } from '../lib/notes.js';

const estPdf = (f) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
const estBureautique = (f) => /\.(docx?|pptx?|odt|odp|pages|key)$/i.test((f && f.name) || '');

export function ImportNote({ ctx, onDone, onCancel }) {
  const [fichier, setFichier] = useState(null);
  const [titre, setTitre] = useState('');
  const [over, setOver] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [busy, setBusy] = useState(false);

  const choisirFichier = (f) => {
    if (!f) return;
    if (estBureautique(f)) {
      setErreur(`« ${f.name} » n'est pas lisible ici. Convertis-le en PDF d'abord (Fichier → Exporter au format PDF), puis dépose le PDF.`);
      return;
    }
    if (!estPdf(f)) {
      setErreur(`« ${f.name} » n'est pas un PDF. Formats acceptés : PDF.`);
      return;
    }
    setErreur(null);
    setFichier(f);
    if (!titre.trim()) setTitre(titreFromFilename(f.name));
  };

  const importer = async () => {
    if (!fichier || busy) return;
    setBusy(true);
    try {
      const pdfId = await putBlob(fichier);
      const note = await createNote({ titre, pdfId, pdfName: fichier.name, origine: 'pdf' });
      await ctx.reload();
      onDone && onDone(note);
    } catch (e) {
      setErreur("L'import a échoué — le fichier n'a pas pu être enregistré.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="imp-form">
      <div className="imp-field">
        <label>Document</label>
        {fichier ? (
          <div className="row spread" style={{ gap: 10, padding: '10px 12px', border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--bg-2)' }}>
            <div className="row" style={{ gap: 8, minWidth: 0, alignItems: 'center' }}>
              <Icon name="filePdf" size={16} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fichier.name}</span>
            </div>
            <button type="button" className="btn ghost sm" onClick={() => setFichier(null)}><Icon name="x" size={13} /> Retirer</button>
          </div>
        ) : (
          <label className={'imp-drop' + (over ? ' over' : '')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '22px 12px', border: '1.5px dashed var(--border)', borderRadius: 10, cursor: 'pointer', background: over ? 'var(--accent-soft)' : 'transparent' }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); choisirFichier(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
            <Icon name="upload" size={15} /> Glisse un PDF ici ou clique pour le choisir
            <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
              onChange={(e) => { choisirFichier(e.target.files[0]); e.target.value = ''; }} />
          </label>
        )}
        <div className="hint" style={{ marginTop: 6 }}>
          Stocké sur cet appareil et envoyé au cloud comme les autres PDF. Aucun lien avec tes fiches : ce document n'entre ni dans la méthode des J, ni dans les statistiques.
        </div>
      </div>

      <div className="imp-field">
        <label>Titre</label>
        <input className="imp-title" value={titre} onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre du document" style={{ width: '100%' }} />
      </div>

      {erreur && (
        <div className="err-mini" style={{ marginTop: 4 }}>
          <div className="em-ic crit"><Icon name="alert" size={16} /></div>
          <div className="em-body"><div className="em-title">{erreur}</div></div>
        </div>
      )}

      <div className="imp-actions">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        <button className="btn primary" onClick={importer} disabled={!fichier || busy}>
          <Icon name="check" size={15} /> {busy ? 'Import…' : 'Ajouter le document'}
        </button>
      </div>
    </div>
  );
}
