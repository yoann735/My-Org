/* ============================================================
   MedRevise — import ANATOMIE (handoff §9.2). Formulaire répétable :
   1 image (recadrée par l'utilisateur) + nom + infos par structure.
   → flashcards reconnaissance MÉCANIQUES (image→nom) + QCM de
   raisonnement générés par l'IA depuis le TEXTE (jamais l'image).
   ============================================================ */
import { useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { DestPicker } from '../components/ui.jsx';
import { importAnatomie } from '../lib/import.js';
import { putBlob } from '../lib/storage.js';

const SOUS_CATS = ['Muscles', 'Os', 'Nerfs', 'Ligaments', 'Vaisseaux'];
const emptyStruct = () => ({ key: Math.random().toString(36).slice(2), nom: '', file: null, preview: null, orig: null, origPreview: null, infos: { origine: '', insertion: '', action: '', innervation: '', vascularisation: '' } });

export function ImportAnatomie({ ctx, onDone, onDebug }) {
  const { db } = ctx;
  const sources = db.sources.filter((s) => !s.archive);
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [titre, setTitre] = useState('');
  const [sousCat, setSousCat] = useState('Muscles');
  const [structs, setStructs] = useState([emptyStruct()]);
  const [state, setState] = useState('form'); // form | loading | done
  const [result, setResult] = useState(null);
  const [cropping, setCropping] = useState(null); // { key, src }

  const setStruct = (key, patch) => setStructs((arr) => arr.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const setInfo = (key, field, val) => setStructs((arr) => arr.map((s) => (s.key === key ? { ...s, infos: { ...s.infos, [field]: val } } : s)));
  const addStruct = () => setStructs((arr) => [...arr, emptyStruct()]);
  const delStruct = (key) => setStructs((arr) => (arr.length > 1 ? arr.filter((s) => s.key !== key) : arr));
  // new image (upload / paste / drop) → also becomes the kept ORIGINAL
  const onImg = (key, file) => { if (!file) return; const url = URL.createObjectURL(file); setStruct(key, { file, preview: url, orig: file, origPreview: url }); };
  // crop result → updates the working image, keeps the original
  const applyCrop = (key, blob) => { const url = URL.createObjectURL(blob); setStruct(key, { file: blob, preview: url }); };
  const resetToOriginal = (key) => setStructs((arr) => arr.map((s) => (s.key === key ? { ...s, file: s.orig, preview: s.origPreview } : s)));
  const removeImg = (key) => setStruct(key, { file: null, preview: null, orig: null, origPreview: null });
  const onPasteImg = (key, e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); onImg(key, f); return; } }
    }
  };

  const valid = matId && structs.some((s) => s.nom.trim());

  const generate = async () => {
    if (!valid) return;
    setState('loading');
    const prepared = [];
    for (const s of structs.filter((x) => x.nom.trim())) {
      let imageId = null;
      if (s.file) { try { imageId = await putBlob(s.file); } catch (e) { /* ignore */ } }
      prepared.push({ nom: s.nom.trim(), imageId, infos: s.infos });
    }
    const res = await importAnatomie({ matiereId: matId, titre: titre || ('Anatomie · ' + sousCat), sousCategorie: sousCat, structures: prepared });
    await ctx.reload();
    if (onDebug) onDebug(res.debug || null);
    setResult(res); setState('done');
  };

  if (state === 'loading') {
    return (
      <div className="fadein" style={{ textAlign: 'center', padding: '24px 0' }}>
        <div className="gen-spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} />
        <div style={{ fontWeight: 600, fontSize: 16 }}>Création des cartes d'anatomie…</div>
        <div className="hint" style={{ marginTop: 6 }}>Flashcards reconnaissance + QCM de raisonnement</div>
      </div>
    );
  }
  if (state === 'done' && result) {
    return (
      <div className="fadein" style={{ textAlign: 'center', padding: '6px 0' }}>
        <div className="gd-badge" style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 14px' }}><Icon name="check" size={30} stroke={3} /></div>
        <div className="serif" style={{ fontSize: 21 }}>Fiche anatomie prête !</div>
        <div className="hint" style={{ marginTop: 8 }}>✓ {result.structures} structures · {result.count} cartes{result.mock ? ' (QCM en démo hors-ligne)' : ''}.</div>
        <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => { setStructs([emptyStruct()]); setTitre(''); setResult(null); setState('form'); }}><Icon name="refresh" size={14} /> Autre fiche</button>
          <button className="btn primary" onClick={() => onDone && onDone()}><Icon name="check" size={14} /> Terminé</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fadein imp-dest">
      <DestPicker ctx={ctx} srcId={srcId} setSrcId={setSrcId} matId={matId} setMatId={setMatId} />

      <div className="imp-field">
        <label>Sous-catégorie</label>
        <div className="imp-chips">
          {SOUS_CATS.map((s) => <button key={s} className={'imp-chip' + (sousCat === s ? ' on' : '')} onClick={() => setSousCat(s)}>{s}</button>)}
        </div>
      </div>

      <div className="imp-field">
        <label>Titre de la fiche <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder={'ex : Membre inférieur — ' + sousCat} value={titre} onChange={(e) => setTitre(e.target.value)} />
      </div>

      <div className="imp-field">
        <label>Structures ({structs.length})</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {structs.map((s, i) => (
            <div key={s.key} className="anat-struct" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
              <div className="row spread" style={{ marginBottom: 8 }}>
                <span className="hint" style={{ fontWeight: 700 }}>Structure {i + 1}</span>
                {structs.length > 1 && <button className="cd-ic" title="Retirer" onClick={() => delStruct(s.key)}><Icon name="trash" size={14} /></button>}
              </div>
              <div className="row" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 auto' }}>
                  <label className="anat-img" tabIndex={0} onPaste={(e) => onPasteImg(s.key, e)}
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onImg(s.key, e.dataTransfer.files[0]); }}
                    title="Cliquer pour choisir, ou coller une image (Ctrl/Cmd+V)"
                    style={{ width: 96, height: 96, border: '2px dashed var(--border)', borderRadius: 10, display: 'grid', placeItems: 'center', cursor: 'pointer', overflow: 'hidden', background: 'var(--card-2)' }}>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onImg(s.key, e.target.files[0])} />
                    {s.preview ? <img src={s.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--text-3)', textAlign: 'center', fontSize: 11 }}><Icon name="image" size={20} /><br />Cliquer<br />ou coller</span>}
                  </label>
                  {s.preview && (
                    <div className="row" style={{ gap: 6, marginTop: 6, justifyContent: 'center' }}>
                      <button type="button" className="cd-ic" title="Recadrer l'image" onClick={() => setCropping({ key: s.key, src: s.origPreview || s.preview })}><Icon name="maximize" size={14} /></button>
                      <button type="button" className="cd-ic" title="Supprimer l'image" onClick={() => removeImg(s.key)}><Icon name="trash" size={14} /></button>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <input className="imp-title" placeholder="Nom (ex : Muscle vaste intermédiaire)" value={s.nom} onChange={(e) => setStruct(s.key, { nom: e.target.value })} />
                  {['origine', 'insertion', 'action', 'innervation', 'vascularisation'].map((field) => (
                    <input key={field} className="srcmgr-input" style={{ fontSize: 12.5 }} placeholder={field.charAt(0).toUpperCase() + field.slice(1)} value={s.infos[field]} onChange={(e) => setInfo(s.key, field, e.target.value)} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="imp-new" style={{ marginTop: 10 }} onClick={addStruct}><Icon name="plus" size={13} stroke={2.6} /> Ajouter une structure</button>
      </div>

      <div className="imp-actions">
        <button className="btn primary" onClick={generate} disabled={!valid}><Icon name="sparkle" size={15} /> Créer les cartes d'anatomie</button>
      </div>
      {!valid && <div className="hint" style={{ marginTop: 8 }}>Choisis une matière et renseigne au moins une structure (nom).</div>}
      <div className="hint" style={{ marginTop: 8 }}><Icon name="info" size={13} /> Les images restent sur l'appareil — seul le texte est envoyé à l'IA pour les QCM.</div>

      {cropping && (
        <CropModal src={cropping.src} onClose={() => setCropping(null)}
          onApply={(blob) => { applyCrop(cropping.key, blob); setCropping(null); }}
          onResetOriginal={() => { resetToOriginal(cropping.key); setCropping(null); }} />
      )}
    </div>
  );
}

/* ---- recadrage : sélection à la souris → crop via canvas ---- */
function CropModal({ src, onApply, onClose, onResetOriginal }) {
  const imgRef = useRef(null);
  const [sel, setSel] = useState(null); // {x,y,w,h} en px d'affichage
  const drag = useRef(null);

  const rel = (e) => { const r = imgRef.current.getBoundingClientRect(); return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) }; };
  const onDown = (e) => { e.preventDefault(); const p = rel(e); drag.current = p; setSel({ x: p.x, y: p.y, w: 0, h: 0 }); };
  const onMove = (e) => { if (!drag.current) return; const p = rel(e); setSel({ x: Math.min(drag.current.x, p.x), y: Math.min(drag.current.y, p.y), w: Math.abs(p.x - drag.current.x), h: Math.abs(p.y - drag.current.y) }); };
  const onUp = () => { drag.current = null; };

  const apply = () => {
    const img = imgRef.current; if (!img) return;
    const r = img.getBoundingClientRect();
    const sx = img.naturalWidth / r.width, sy = img.naturalHeight / r.height;
    const reg = sel && sel.w > 6 && sel.h > 6 ? sel : { x: 0, y: 0, w: r.width, h: r.height };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(reg.w * sx));
    canvas.height = Math.max(1, Math.round(reg.h * sy));
    canvas.getContext('2d').drawImage(img, reg.x * sx, reg.y * sy, reg.w * sx, reg.h * sy, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => { if (b) onApply(b); }, 'image/png');
  };

  return (
    <div className="day-pop-scrim" onClick={onClose}>
      <div className="day-pop" style={{ width: 'min(560px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head"><div className="row spread"><div className="serif" style={{ fontSize: 18 }}>Recadrer l'image</div><button className="icon-btn sm" onClick={onClose}><Icon name="x" size={16} /></button></div></div>
        <div className="day-pop-body" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'relative', userSelect: 'none', touchAction: 'none', cursor: 'crosshair', maxWidth: '100%' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
            <img ref={imgRef} src={src} alt="" draggable={false} style={{ maxWidth: '100%', maxHeight: '48vh', display: 'block', borderRadius: 8 }} />
            {sel && sel.w > 0 && (
              <div style={{ position: 'absolute', left: sel.x, top: sel.y, width: sel.w, height: sel.h, border: '2px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 18%, transparent)', pointerEvents: 'none' }} />
            )}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>Dessine un rectangle sur l'image, puis « Recadrer ». « Image originale » remet la photo entière, sans recadrage.</div>
        </div>
        <div className="day-pop-foot">
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn ghost" onClick={onResetOriginal} title="Revenir à l'image d'origine, sans recadrage"><Icon name="refresh" size={14} /> Image originale</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={apply}><Icon name="check" size={15} /> Recadrer</button>
        </div>
      </div>
    </div>
  );
}
