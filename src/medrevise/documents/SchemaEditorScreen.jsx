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
import { MultiSchemaEditor, ZonesLayer } from '../pages/ImportAnatomieVisuel.jsx';
import { saveAnatSchema } from '../lib/import.js';
import { getBlob, putBlob, genId } from '../lib/storage.js';
import { ficheImages, vueLabel } from '../lib/anatSchema.js';

const DEFAULT_COLOR = '#7C6FE0';
const markerId = (col) => 'schr-ah-' + (col || DEFAULT_COLOR).replace('#', '');

export function SchemaEditorScreen({ ctx }) {
  const { db } = ctx;
  const fiche = db.fiches.find((f) => f.id === (ctx.schemaView && ctx.schemaView.ficheId));
  const matiere = fiche && db.matieres.find((m) => m.id === fiche.matiereId);
  const meta = matiereMeta(matiere);

  const [mode, setMode] = useState('read'); // read | edit
  // MULTI-VUES : chaque vue = { id, vue, coches[], img:{ url, w, h, blobId, newFile } }.
  const [views, setViews] = useState([]);
  const [readIdx, setReadIdx] = useState(0);
  const [titre, setTitre] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const urlsRef = useRef([]);

  // charge toutes les vues (blob → object-URL) + leurs coches. Rétro-compat mono-image
  // gérée par ficheImages().
  useEffect(() => {
    let on = true;
    if (!fiche) return;
    setTitre(fiche.titre || '');
    setReadIdx(0);
    urlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
    urlsRef.current = [];
    (async () => {
      const imgs = ficheImages(fiche);
      const built = [];
      for (const im of imgs) {
        const view = { id: im.id || genId('img'), vue: im.vue || 'non_precisee', coches: (im.coches || []).map((c) => ({ ...c })), img: null };
        if (im.imageId) {
          // on garde le blobId même si le blob ne charge pas → aucune vue n'est perdue à la sauvegarde
          view.img = { url: null, w: im.imageW || 0, h: im.imageH || 0, blobId: im.imageId, newFile: null };
          const b = await getBlob(im.imageId);
          if (b) {
            const url = URL.createObjectURL(b);
            urlsRef.current.push(url);
            const dims = await new Promise((res) => { const p = new Image(); p.onload = () => res({ w: p.naturalWidth, h: p.naturalHeight }); p.onerror = () => res({ w: im.imageW || 0, h: im.imageH || 0 }); p.src = url; });
            view.img = { url, w: dims.w || im.imageW || 0, h: dims.h || im.imageH || 0, blobId: im.imageId, newFile: null };
          }
        }
        built.push(view);
      }
      if (on) setViews(built);
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiche && fiche.id]);

  useEffect(() => () => { urlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); urlsRef.current = []; }, []);

  const back = () => ctx.closeSchemaEditor();

  const totalCoches = views.reduce((n, v) => n + (v.coches || []).length, 0);
  const named = views.reduce((n, v) => n + (v.coches || []).filter((c) => (c.texte || '').trim()).length, 0);

  const save = async () => {
    if (!fiche || saving) return;
    setSaving(true);
    const images = [];
    for (const v of views) {
      if (!v.img) continue;
      let imageId = v.img.blobId || null;
      if (v.img.newFile) { try { imageId = await putBlob(v.img.newFile); } catch (e) { /* ignore */ } }
      images.push({ id: v.id, imageId, imageW: v.img.w, imageH: v.img.h, vue: v.vue, coches: v.coches });
    }
    await saveAnatSchema({
      ficheId: fiche.id, matiereId: fiche.matiereId, titre: titre || fiche.titre,
      sousCategorie: fiche.sousCategorie || null, images,
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

  const readView = views[readIdx] || views[0] || null;

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">{fiche.titre}</h1>
          <div className="sub">Schéma d'anatomie · {views.length} vue{views.length > 1 ? 's' : ''} · {totalCoches} coche{totalCoches > 1 ? 's' : ''}{named < totalCoches ? ` · ${totalCoches - named} sans nom` : ''}</div>
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
          ? <button className="btn primary sm" onClick={save} disabled={saving}><Icon name="check" size={13} /> {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}</button>
          : <button className="btn primary sm" disabled={!totalCoches} onClick={() => ctx.startAnatQuiz(fiche, { mode: 'total' })}><Icon name="play" size={13} fill /> Lancer le quiz</button>}
      </div>

      {mode === 'edit' ? (
        <div className="card" style={{ marginTop: 4 }}>
          <div className="card-body">
            <div className="imp-field">
              <label>Titre du schéma</label>
              <input className="imp-title" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre du schéma" />
            </div>
            <div className="imp-field">
              <label>Schéma annoté <span className="imp-opt">— une ou plusieurs vues ; sur chaque image, outils Coche / Zone. Clique une annotation pour la renommer, changer sa couleur/opacité ou la supprimer.</span></label>
              <MultiSchemaEditor views={views} setViews={setViews} />
            </div>
            <div className="imp-actions">
              <button className="btn primary" onClick={save} disabled={saving}><Icon name="check" size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer le schéma'}</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 900, margin: '10px auto 0' }}>
          {views.length > 1 && (
            <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              {views.map((v, i) => (
                <button key={v.id} type="button" className={'imp-chip' + (i === readIdx ? ' on' : '')} onClick={() => setReadIdx(i)}>{vueLabel(v.vue)} <span style={{ opacity: .7 }}>({(v.coches || []).length})</span></button>
              ))}
            </div>
          )}
          <SchemaPreview image={readView && readView.img} coches={(readView && readView.coches) || []} />
          <div className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
            <Icon name="info" size={13} /> Aperçu (toutes les coches révélées){views.length > 1 ? ' — change de vue ci-dessus' : ''}. Passe en <strong>Édition</strong> pour modifier, ou lance le quiz pour réviser.
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

        <ZonesLayer coches={coches} selectedId={null} mode="read" />

        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          <defs>
            {usedColors.map((col) => (
              <marker key={col} id={markerId(col)} markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L6,3 L0,6 Z" fill={col} />
              </marker>
            ))}
          </defs>
          {coches.filter((c) => c.kind !== 'zone').map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            return <line key={c.id} x1={c.boite.x * 100 + '%'} y1={c.boite.y * 100 + '%'} x2={c.ancre.x * 100 + '%'} y2={c.ancre.y * 100 + '%'} stroke={col} strokeWidth={2.2} markerEnd={`url(#${markerId(col)})`} />;
          })}
        </svg>

        {coches.filter((c) => c.kind !== 'zone').map((c) => {
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
