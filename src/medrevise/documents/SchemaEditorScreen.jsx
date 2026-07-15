/* ============================================================
   MedRevise — ÉCRAN SCHÉMA (mode Documents). Ouvre un schéma d'anatomie
   enregistré (fiche type "anat_schema") avec une BASCULE explicite :
     - Lecture : aperçu (image + coches révélées) + lancement du quiz visuel.
     - Édition : réutilise LE MÊME éditeur de coches que l'import (SchemaEditor)
       — ajouter / déplacer (boîte + ancre indépendamment) / renommer / couleur /
       supprimer via popover ancrée. Enregistre en coordonnées relatives (0..1)
       via saveAnatSchema({ ficheId }) → conserve l'état SM-2 de la fiche.
   Ne recrée AUCUN éditeur parallèle : SchemaEditor est l'unique éditeur de schéma.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, matiereMeta } from '../components/ui.jsx';
import { SchemaEditor } from '../pages/ImportAnatomieVisuel.jsx';
import { saveAnatSchema } from '../lib/import.js';
import { getBlob, putBlob } from '../lib/storage.js';

const DEFAULT_COLOR = '#7C6FE0';
const markerId = (col) => 'schr-ah-' + (col || DEFAULT_COLOR).replace('#', '');

export function SchemaEditorScreen({ ctx }) {
  const { db } = ctx;
  const fiche = db.fiches.find((f) => f.id === (ctx.schemaView && ctx.schemaView.ficheId));
  const matiere = fiche && db.matieres.find((m) => m.id === fiche.matiereId);
  const meta = matiereMeta(matiere);

  const [mode, setMode] = useState('read'); // read | edit
  const [image, setImage] = useState(null); // { url, w, h, blobId }
  const [coches, setCoches] = useState([]);
  const [titre, setTitre] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const objectUrl = useRef(null);

  // charge l'image (blob → object-URL) + les coches existantes de la fiche
  useEffect(() => {
    let on = true;
    if (!fiche) return;
    setTitre(fiche.titre || '');
    setCoches((fiche.coches || []).map((c) => ({ ...c, ancre: { ...c.ancre }, boite: { ...c.boite } })));
    (async () => {
      if (!fiche.imageId) { setImage(null); return; }
      const b = await getBlob(fiche.imageId);
      if (!on || !b) return;
      const url = URL.createObjectURL(b);
      objectUrl.current = url;
      const probe = new Image();
      probe.onload = () => { if (on) setImage({ url, w: probe.naturalWidth || fiche.imageW || 0, h: probe.naturalHeight || fiche.imageH || 0, blobId: fiche.imageId }); };
      probe.src = url;
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiche && fiche.id]);

  useEffect(() => () => { if (objectUrl.current) { try { URL.revokeObjectURL(objectUrl.current); } catch (e) { /* ignore */ } } }, []);

  // « Changer l'image » depuis SchemaEditor → nouveau fichier : object-URL + dims + blob neuf
  const changeImage = (file) => {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => setImage((prev) => {
      if (prev && prev.url && prev.url !== url) { try { URL.revokeObjectURL(prev.url); } catch (e) { /* ignore */ } }
      return { url, w: probe.naturalWidth, h: probe.naturalHeight, blobId: null, newFile: file };
    });
    probe.src = url;
  };

  const back = () => ctx.closeSchemaEditor();

  const save = async () => {
    if (!fiche || saving) return;
    setSaving(true);
    let imageId = image && image.blobId;
    if (image && image.newFile) { try { imageId = await putBlob(image.newFile); } catch (e) { /* ignore */ } }
    await saveAnatSchema({
      ficheId: fiche.id, matiereId: fiche.matiereId, titre: titre || fiche.titre,
      sousCategorie: fiche.sousCategorie || null, imageId,
      imageW: image && image.w, imageH: image && image.h, coches,
    });
    await ctx.reload();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!fiche) {
    return (
      <div className="screen scroll fadein">
        <div className="hint">Schéma introuvable.</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={back}><Icon name="chevL" size={14} /> Retour</button>
      </div>
    );
  }

  const named = coches.filter((c) => (c.texte || '').trim()).length;

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">{fiche.titre}</h1>
          <div className="sub">Schéma d'anatomie · {coches.length} coche{coches.length > 1 ? 's' : ''}{named < coches.length ? ` · ${coches.length - named} sans nom` : ''}</div>
        </div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      <div className="pdfr-toolbar">
        <button className="btn ghost sm" onClick={back}><Icon name="chevL" size={14} /> Retour</button>
        <div className="seg" style={{ marginLeft: 4 }}>
          <button type="button" className={'seg-btn' + (mode === 'read' ? ' active' : '')} onClick={() => setMode('read')}><Icon name="book" size={13} /> Lecture</button>
          <button type="button" className={'seg-btn' + (mode === 'edit' ? ' active' : '')} onClick={() => setMode('edit')}><Icon name="edit" size={13} /> Édition</button>
        </div>
        <div style={{ flex: 1 }} />
        {mode === 'edit'
          ? <button className="btn primary sm" onClick={save} disabled={saving}><Icon name={saved ? 'check' : 'check'} size={13} /> {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}</button>
          : <button className="btn primary sm" disabled={!coches.length} onClick={() => ctx.startAnatQuiz(fiche, { mode: 'total' })}><Icon name="play" size={13} fill /> Lancer le quiz</button>}
      </div>

      {mode === 'edit' ? (
        <div className="card" style={{ marginTop: 4 }}>
          <div className="card-body">
            <div className="imp-field">
              <label>Titre du schéma</label>
              <input className="imp-title" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre du schéma" />
            </div>
            <div className="imp-field">
              <label>Schéma annoté <span className="imp-opt">— clique « Ajouter une coche » puis un point de l'image ; déplace la boîte et l'ancre indépendamment ; clique une coche pour la renommer, changer sa couleur ou la supprimer.</span></label>
              <SchemaEditor image={image} setImage={changeImage} coches={coches} setCoches={setCoches}
                structures={db.anatstruct ? db.anatstruct.filter((s) => s.matiereId === fiche.matiereId) : []} />
            </div>
            <div className="imp-actions">
              <button className="btn primary" onClick={save} disabled={saving}><Icon name="check" size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer le schéma'}</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 900, margin: '10px auto 0' }}>
          <SchemaPreview image={image} coches={coches} />
          <div className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
            <Icon name="info" size={13} /> Aperçu (toutes les coches révélées). Passe en <strong>Édition</strong> pour modifier, ou lance le quiz pour réviser.
          </div>
        </div>
      )}
    </div>
  );
}

/* aperçu lecture seule : image + flèches + ancres + libellés (toutes révélées). En % →
   aligné quel que soit le zoom (mêmes coordonnées relatives que l'éditeur et le quiz). */
function SchemaPreview({ image, coches }) {
  const usedColors = [...new Set((coches || []).map((c) => c.couleur || DEFAULT_COLOR))];
  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
      <div style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
        {image && image.url
          ? <img src={image.url} alt="schéma" draggable={false} style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }} />
          : <div style={{ width: '100%', height: 320, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}><Icon name="image" size={32} /></div>}

        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          <defs>
            {usedColors.map((col) => (
              <marker key={col} id={markerId(col)} markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L6,3 L0,6 Z" fill={col} />
              </marker>
            ))}
          </defs>
          {coches.map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            return <line key={c.id} x1={c.boite.x * 100 + '%'} y1={c.boite.y * 100 + '%'} x2={c.ancre.x * 100 + '%'} y2={c.ancre.y * 100 + '%'} stroke={col} strokeWidth={2.2} markerEnd={`url(#${markerId(col)})`} />;
          })}
        </svg>

        {coches.map((c) => {
          const col = c.couleur || DEFAULT_COLOR;
          return <span key={'a' + c.id} style={{ position: 'absolute', left: c.ancre.x * 100 + '%', top: c.ancre.y * 100 + '%', width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: '50%', background: col, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.35)' }} />;
        })}

        {coches.map((c) => {
          const col = c.couleur || DEFAULT_COLOR;
          return (
            <div key={'b' + c.id} style={{ position: 'absolute', left: c.boite.x * 100 + '%', top: c.boite.y * 100 + '%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 6, maxWidth: '46%', padding: '4px 8px', borderRadius: 8, background: 'var(--card)', border: `2px solid ${col}`, boxShadow: '0 2px 8px rgba(0,0,0,.18)', lineHeight: 1.2, zIndex: 2 }}>
              <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', background: col, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{c.numero}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: c.texte ? 'var(--text)' : 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.texte || '(sans nom)'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
