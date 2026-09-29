/* ============================================================
   MedRevise — CONFIRMATION D'ORDRE DES PAGES (Prise de notes).

   Ce composant ne sert plus qu'à UN cas : plusieurs images déposées d'un coup,
   dont il faut valider l'ordre avant d'en faire les pages d'un PDF. Tout le
   reste — un PDF, une image seule — s'importe et s'ouvre SANS passer par ici
   (voir pages/PriseDeNotes.jsx : on glisse, c'est ouvert).

   La lecture du dépôt et l'écriture vivent dans lib/noteImport.js.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { analyserFichiers, importerNote } from '../lib/noteImport.js';
import { ordonnerImages } from '../lib/imageToPdf.js';

export function ImportNote({ ctx, fichiersInitiaux = [], titreInitial = '', onDone, onCancel }) {
  const [fichiers, setFichiers] = useState(fichiersInitiaux);
  const [titre, setTitre] = useState(titreInitial);
  const [over, setOver] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [busy, setBusy] = useState(false);

  const ajouter = (liste) => {
    const lu = analyserFichiers(liste);
    if (!lu.ok) { setErreur(lu.erreur); return; }
    if (lu.kind !== 'images') { setErreur('Ici, on n’ajoute que des images (une page par image).'); return; }
    setErreur(null);
    setFichiers(ordonnerImages([...fichiers, ...lu.fichiers]));
  };
  const retirer = (i) => setFichiers(fichiers.filter((_, k) => k !== i));
  const deplacer = (i, pas) => {
    const j = i + pas;
    if (j < 0 || j >= fichiers.length) return;
    const copie = [...fichiers];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    setFichiers(copie);
  };

  const valider = async () => {
    if (!fichiers.length || busy) return;
    setBusy(true); setErreur(null);
    try {
      const note = await importerNote({ kind: 'images', fichiers, titre });
      await ctx.reload();
      onDone && onDone(note);
    } catch (e) {
      setErreur((e && e.message) || "L'import a échoué — le fichier n'a pas pu être enregistré.");
    } finally { setBusy(false); }
  };

  return (
    <div className="imp-form">
      <div className="imp-field">
        <label>Ordre des pages <span className="imp-opt">({fichiers.length} image{fichiers.length > 1 ? 's' : ''} → {fichiers.length} page{fichiers.length > 1 ? 's' : ''})</span></label>
        <div style={{ display: 'grid', gap: 6 }}>
          {fichiers.map((f, i) => (
            <div key={f.name + i} className="row spread" style={{ gap: 10, padding: '9px 12px', border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--bg-2)' }}>
              <div className="row" style={{ gap: 8, minWidth: 0, alignItems: 'center' }}>
                <span className="hint tnum" style={{ fontSize: 11.5, minWidth: 26 }}>p.{i + 1}</span>
                <Icon name="image" size={15} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              </div>
              <div className="row" style={{ gap: 4, flex: '0 0 auto' }}>
                <button type="button" className="icon-btn sm" title="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}><Icon name="chevU" size={13} /></button>
                <button type="button" className="icon-btn sm" title="Descendre" disabled={i === fichiers.length - 1} onClick={() => deplacer(i, 1)}><Icon name="chevD" size={13} /></button>
                <button type="button" className="btn ghost sm" title="Retirer" onClick={() => retirer(i)}><Icon name="x" size={13} /></button>
              </div>
            </div>
          ))}
        </div>
        <label className={'imp-drop' + (over ? ' over' : '')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', marginTop: 8, border: '1.5px dashed var(--border)', borderRadius: 10, cursor: 'pointer', background: over ? 'var(--accent-soft)' : 'transparent' }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); ajouter(e.dataTransfer.files); }}>
          <Icon name="upload" size={15} /> Ajouter d’autres images
          <input type="file" multiple accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { ajouter(e.target.files); e.target.value = ''; }} />
        </label>
        <div className="hint" style={{ marginTop: 6 }}>Trié par nom de fichier au dépôt — réordonne ici si besoin.</div>
      </div>

      <div className="imp-field">
        <label>Titre</label>
        <input className="imp-title" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre du document" style={{ width: '100%' }} />
      </div>

      {erreur && (
        <div className="err-mini" style={{ marginTop: 4 }}>
          <div className="em-ic crit"><Icon name="alert" size={16} /></div>
          <div className="em-body"><div className="em-title">{erreur}</div></div>
        </div>
      )}

      <div className="imp-actions">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        <button className="btn primary" onClick={valider} disabled={!fichiers.length || busy}>
          <Icon name="check" size={15} /> {busy ? 'Conversion…' : 'Créer le document'}
        </button>
      </div>
    </div>
  );
}
