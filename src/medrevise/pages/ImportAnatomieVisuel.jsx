/* ============================================================
   MedRevise — import ANATOMIE, sous-mode VISUEL : ÉDITEUR DE SCHÉMA
   ANNOTÉ (Étape B). Éditeur d'image DÉDIÉ (overlay SVG + boîtes HTML
   au-dessus d'une <img>), SANS pdf.js.

   DÉCISIONS D'ARCHI (voir spec) :
   - Les annotations (coches + flèches) sont des DONNÉES STRUCTURÉES,
     jamais aplaties dans l'image → le quiz masque un CHAMP, pas un pixel.
   - Toutes les positions sont en COORDONNÉES RELATIVES (0..1) : elles
     survivent au zoom et au redimensionnement (rendu = relatif × taille
     affichée, via des % CSS/SVG — aucun désalignement possible).
   - L'export image/PDF n'existe QUE pour l'archivage/impression : il
     APLATIT tout et n'est PAS réimportable en quiz.

   Une coche = { id, ancre{x,y}, boite{x,y}, texte, couleur, numero }.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { DestPicker } from '../components/ui.jsx';
import { genId, putBlob } from '../lib/storage.js';
import { saveAnatSchema } from '../lib/import.js';
import { ANAT_TYPES, champsFor, parseStructure, detectType } from '../lib/anatParse.js';

const SOUS_CATS = ['Muscles', 'Os', 'Nerfs', 'Ligaments', 'Vaisseaux'];
const COLORS = ['#7C6FE0', '#E0556B', '#4FB87A', '#4FA6D9', '#E0A34F', '#B45FD9'];
const DEFAULT_COLOR = COLORS[0];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const markerId = (col) => 'anat-ah-' + (col || DEFAULT_COLOR).replace('#', '');

export function ImportAnatomieVisuel({ ctx }) {
  const { db } = ctx;
  const sources = db.sources.filter((s) => !s.archive);
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [titre, setTitre] = useState('');
  const [sousCat, setSousCat] = useState('Muscles');

  const [image, setImage] = useState(null); // { blob, url, w, h }
  const [coches, setCoches] = useState([]);
  const [state, setState] = useState('edit'); // edit | saving | done
  const [result, setResult] = useState(null);

  // charge une image (coller ou upload) → URL objet + dimensions naturelles
  const loadImageFile = (file) => {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => setImage((prev) => { if (prev && prev.url) URL.revokeObjectURL(prev.url); return { blob: file, url, w: probe.naturalWidth, h: probe.naturalHeight }; });
    probe.src = url;
    setCoches([]);
  };

  // COLLER (Ctrl/Cmd+V) — cas principal : capture du logiciel 3D. Écoute globale
  // tant que ce sous-mode est monté (pas besoin de focus précis).
  useEffect(() => {
    const onPaste = (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); loadImageFile(f); return; } }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);
  useEffect(() => () => { if (image && image.url) URL.revokeObjectURL(image.url); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const named = coches.filter((c) => (c.texte || '').trim()).length;
  const valid = !!(matId && image && coches.length >= 1);

  const save = async () => {
    if (!valid) return;
    setState('saving');
    let imageId = null;
    try { imageId = await putBlob(image.blob); } catch (e) { /* ignore */ }
    const res = await saveAnatSchema({ matiereId: matId, titre: titre || ('Schéma · ' + sousCat), sousCategorie: sousCat, imageId, imageW: image.w, imageH: image.h, coches });
    await ctx.reload();
    setResult(res); setState('done');
  };
  const resetForm = () => { if (image && image.url) URL.revokeObjectURL(image.url); setImage(null); setCoches([]); setTitre(''); setResult(null); setState('edit'); };

  if (state === 'saving') {
    return (
      <div className="fadein" style={{ textAlign: 'center', padding: '24px 0' }}>
        <div className="gen-spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }} />
        <div style={{ fontWeight: 600, fontSize: 16 }}>Enregistrement du schéma…</div>
      </div>
    );
  }
  if (state === 'done' && result) {
    return (
      <div className="fadein" style={{ textAlign: 'center', padding: '6px 0' }}>
        <div className="gd-badge" style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 14px' }}><Icon name="check" size={30} stroke={3} /></div>
        <div className="serif" style={{ fontSize: 21 }}>Schéma enregistré !</div>
        <div className="hint" style={{ marginTop: 8 }}>✓ {result.count} coche{result.count > 1 ? 's' : ''} · révisable en quiz d'anatomie visuelle.</div>
        <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn" onClick={resetForm}><Icon name="refresh" size={14} /> Autre schéma</button>
          <button className="btn primary" onClick={() => ctx.go('library')}><Icon name="book" size={14} /> Bibliothèque</button>
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
        <input className="imp-title" placeholder={'ex : Coupe du membre supérieur — ' + sousCat} value={titre} onChange={(e) => setTitre(e.target.value)} />
      </div>

      <div className="imp-field">
        <label>Schéma annoté {coches.length > 0 && <span className="imp-opt">({coches.length} coche{coches.length > 1 ? 's' : ''}{named < coches.length ? ` · ${coches.length - named} sans nom` : ''})</span>}</label>
        <SchemaEditor image={image} setImage={loadImageFile} coches={coches} setCoches={setCoches} />
      </div>

      <div className="imp-actions">
        <button className="btn primary" onClick={save} disabled={!valid}><Icon name="check" size={15} /> Enregistrer le schéma</button>
      </div>
      {!valid && <div className="hint" style={{ marginTop: 8 }}>Choisis une matière, colle/importe une image, puis place au moins une coche.</div>}
      {valid && named < coches.length && <div className="hint" style={{ marginTop: 8, color: 'var(--accent-2)' }}><Icon name="alert" size={13} /> {coches.length - named} coche(s) sans nom seront enregistrées vides (réponse impossible en quiz).</div>}
    </div>
  );
}

/* ============================================================
   ÉDITEUR — image + overlay (flèches SVG + boîtes HTML + ancres).
   Tout est positionné en % (coords relatives × taille affichée) → le
   zoom / redimensionnement ne désaligne jamais les coches.
   ============================================================ */
export function SchemaEditor({ image, setImage, coches, setCoches }) {
  const frameRef = useRef(null);
  const [mode, setMode] = useState('select'); // select | add
  const [selectedId, setSelectedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [theorieFor, setTheorieFor] = useState(null); // id de la coche dont on édite la théorie

  const updateCoche = (id, patch) => setCoches((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const delCoche = (id) => { setCoches((cs) => cs.filter((c) => c.id !== id)); setSelectedId(null); };

  const relFromEvent = (clientX, clientY) => {
    const r = frameRef.current.getBoundingClientRect();
    return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
  };

  const addCocheAt = (p) => {
    const numero = coches.length + 1;
    const c = {
      id: genId('c'), ancre: { x: p.x, y: p.y },
      boite: { x: clamp01(p.x + 0.11), y: clamp01(p.y - 0.06) },
      texte: '', couleur: COLORS[coches.length % COLORS.length], numero,
    };
    setCoches((cs) => [...cs, c]);
    setSelectedId(c.id);
  };

  // clic sur le fond : add-mode → place une coche ; sinon → désélectionne
  const onFrameDown = (e) => {
    if (e.button !== 0) return;
    if (mode === 'add') addCocheAt(relFromEvent(e.clientX, e.clientY));
    else setSelectedId(null);
  };

  // drag générique d'un point relatif (boîte ou ancre) avec seuil clic/déplacement
  const startDrag = (e, coche, field) => {
    e.stopPropagation();
    if (e.target && e.target.tagName === 'INPUT') return; // édition du texte
    const startX = e.clientX, startY = e.clientY;
    const orig = coche[field];
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) moved = true;
      if (!moved) return;
      const r = frameRef.current.getBoundingClientRect();
      updateCoche(coche.id, { [field]: { x: clamp01(orig.x + (ev.clientX - startX) / r.width), y: clamp01(orig.y + (ev.clientY - startY) / r.height) } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) setSelectedId(coche.id); // simple clic → sélection / édition
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const doExport = async (kind) => {
    if (!image || !frameRef.current) return;
    setExporting(true);
    try {
      const imgEl = frameRef.current.querySelector('img');
      const canvas = flattenSchema(imgEl, image.w, image.h, coches);
      if (kind === 'png') {
        await new Promise((res) => canvas.toBlob((b) => { if (b) downloadBlob(b, 'schema-anatomie.png'); res(); }, 'image/png'));
      } else {
        const { PDFDocument } = await import('pdf-lib');
        const bytes = await new Promise((res) => canvas.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));
        const pdf = await PDFDocument.create();
        const png = await pdf.embedPng(bytes);
        const page = pdf.addPage([image.w, image.h]);
        page.drawImage(png, { x: 0, y: 0, width: image.w, height: image.h });
        const out = await pdf.save();
        downloadBlob(new Blob([out], { type: 'application/pdf' }), 'schema-anatomie.pdf');
      }
    } catch (e) { /* ignore */ }
    setExporting(false);
  };

  const usedColors = [...new Set(coches.map((c) => c.couleur || DEFAULT_COLOR))];

  if (!image) {
    return (
      <label className="anat-vis-drop" tabIndex={0}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setImage(e.dataTransfer.files[0]); }}
        style={{ display: 'grid', placeItems: 'center', border: '2px dashed var(--border)', borderRadius: 12, padding: '40px 18px', textAlign: 'center', cursor: 'pointer', background: 'var(--card-2)' }}>
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setImage(e.target.files[0])} />
        <div style={{ color: 'var(--text-3)', marginBottom: 8 }}><Icon name="image" size={30} /></div>
        <div style={{ fontWeight: 600 }}>Colle une capture (Ctrl/Cmd+V) ou importe une image</div>
        <div className="hint" style={{ marginTop: 6 }}>Ensuite, clique sur l'image pour placer tes coches.</div>
      </label>
    );
  }

  return (
    <div>
      {/* barre d'outils */}
      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={'btn' + (mode === 'add' ? ' primary' : '')} onClick={() => setMode((m) => (m === 'add' ? 'select' : 'add'))}>
          <Icon name="plus" size={14} /> {mode === 'add' ? 'Mode ajout actif' : 'Ajouter une coche'}
        </button>
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          <Icon name="image" size={14} /> Changer l'image
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setImage(e.target.files[0])} />
        </label>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn ghost sm" disabled={exporting} onClick={() => doExport('png')}><Icon name="upload" size={13} /> Export image</button>
        <button type="button" className="btn ghost sm" disabled={exporting} onClick={() => doExport('pdf')}><Icon name="filePdf" size={13} /> Export PDF</button>
      </div>
      {mode === 'add' && <div className="hint" style={{ marginBottom: 8, color: 'var(--accent)' }}><Icon name="target" size={13} /> Clique un point de l'image pour y placer une coche. Clique une coche existante pour la modifier. Reclique « Mode ajout » pour terminer.</div>}

      {/* zone image + overlay */}
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
        <div ref={frameRef} style={{ position: 'relative', width: '100%', lineHeight: 0, cursor: mode === 'add' ? 'crosshair' : 'default', touchAction: 'none' }} onPointerDown={onFrameDown}>
          <img src={image.url} alt="schéma" draggable={false} style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }} />

          {/* flèches (px space : pas de viewBox → orient auto non déformé) */}
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

          {/* ancres (points désignés) — déplaçables indépendamment */}
          {coches.map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            const sel = c.id === selectedId;
            return (
              <span key={'a' + c.id} title="Déplace la pointe de flèche"
                onPointerDown={(e) => startDrag(e, c, 'ancre')}
                style={{ position: 'absolute', left: c.ancre.x * 100 + '%', top: c.ancre.y * 100 + '%', width: sel ? 15 : 12, height: sel ? 15 : 12, marginLeft: sel ? -7.5 : -6, marginTop: sel ? -7.5 : -6, borderRadius: '50%', background: col, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.35)', cursor: 'grab', touchAction: 'none' }} />
            );
          })}

          {/* boîtes de libellé — déplaçables + édition inline + popover */}
          {coches.map((c) => {
            const col = c.couleur || DEFAULT_COLOR;
            const sel = c.id === selectedId;
            return (
              <div key={'b' + c.id} onPointerDown={(e) => startDrag(e, c, 'boite')}
                style={{ position: 'absolute', left: c.boite.x * 100 + '%', top: c.boite.y * 100 + '%', transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 6, maxWidth: '46%', padding: '4px 8px', borderRadius: 8, background: 'var(--card)', border: `2px solid ${col}`, boxShadow: sel ? `0 0 0 3px color-mix(in srgb, ${col} 30%, transparent), 0 4px 12px rgba(0,0,0,.2)` : '0 2px 8px rgba(0,0,0,.18)', cursor: 'grab', touchAction: 'none', lineHeight: 1.2, zIndex: sel ? 5 : 2 }}>
                <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', background: col, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{c.numero}</span>
                {sel ? (
                  <input autoFocus value={c.texte} placeholder="nom de la structure"
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => updateCoche(c.id, { texte: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setSelectedId(null); }}
                    style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 13, fontWeight: 600, width: Math.max(90, (c.texte || '').length * 8 + 20), maxWidth: 220 }} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.texte ? 'var(--text)' : 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.texte || '(sans nom)'}</span>
                )}
                {sel && (
                  <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 8, padding: '9px 10px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 6px 20px rgba(0,0,0,.25)', zIndex: 10, width: 250 }}>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <div className="row" style={{ gap: 5, flex: 1 }}>
                        {COLORS.map((sc) => (
                          <button key={sc} type="button" title="Changer la couleur" onClick={() => updateCoche(c.id, { couleur: sc })}
                            style={{ width: 18, height: 18, borderRadius: '50%', background: sc, border: sc === col ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', flex: '0 0 auto' }} />
                        ))}
                      </div>
                      <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
                      <button type="button" className="cd-ic" title="Supprimer cette coche" onClick={() => delCoche(c.id)} style={{ color: 'var(--accent-2)' }}><Icon name="trash" size={14} /></button>
                    </div>
                    <div>
                      <label className="hint" style={{ display: 'block', fontSize: 11, marginBottom: 3 }}>Autres réponses acceptées <span style={{ opacity: .7 }}>(virgules)</span></label>
                      <input value={(c.reponses_acceptees || []).join(', ')}
                        placeholder="ex : nerf cubital, N. ulnaire"
                        onChange={(e) => updateCoche(c.id, { reponses_acceptees: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, outline: 'none', background: 'var(--bg-2)', color: 'var(--text)', font: 'inherit', fontSize: 12, fontWeight: 500, padding: '5px 7px' }} />
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      {(() => {
                        const nb = c.champs ? Object.values(c.champs).filter((v) => (v || '').trim()).length : 0;
                        return (
                          <button type="button" className={'btn sm' + (nb ? '' : ' ghost')} style={{ width: '100%', justifyContent: 'center' }} onClick={() => setTheorieFor(c.id)}>
                            <Icon name="list" size={12} /> Théorie {nb > 0 ? `· ${ANAT_TYPES[c.type] ? ANAT_TYPES[c.type].label : c.type} (${nb})` : '— coller le texte'}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="hint" style={{ marginTop: 10 }}>
        <Icon name="info" size={13} /> Positions en coordonnées relatives — le zoom ne désaligne rien. L'export image/PDF aplatit tout (archivage/impression seulement) et <strong>n'est pas réimportable en quiz</strong>.
      </div>

      {theorieFor && (() => {
        const c = coches.find((x) => x.id === theorieFor);
        if (!c) return null;
        return (
          <TheorieCocheModal coche={c}
            onSave={(patch) => { updateCoche(c.id, patch); setTheorieFor(null); }}
            onClose={() => setTheorieFor(null)} />
        );
      })()}
    </div>
  );
}

/* ---- THÉORIE INTRINSÈQUE À LA COCHE (étape 1 refonte) : coller un texte →
   détection auto du type (confirmée) → extraction locale des champs → aperçu
   ÉDITABLE → enregistrement dans la coche (c.type + c.champs). Aucune IA. ---- */
const TYPE_ORDER = ['os', 'muscle', 'nerf', 'artere', 'veine', 'tissu_conjonctif'];

function TheorieCocheModal({ coche, onSave, onClose }) {
  const [type, setType] = useState(coche.type || 'muscle');
  const [champs, setChamps] = useState(coche.champs && Object.keys(coche.champs).length ? coche.champs : null);
  const [raw, setRaw] = useState('');
  const [missing, setMissing] = useState([]);
  const [detected, setDetected] = useState(false);

  const defs = champsFor(type);

  // « Analyser » : détecte le type PUIS extrait les champs de ce type.
  const analyse = () => {
    if (!raw.trim()) return;
    const t = detectType(raw);
    setType(t); setDetected(true);
    const r = parseStructure(raw, t);
    setChamps(r.champs); setMissing(r.missing);
  };
  // changement manuel du type : re-parse le texte collé avec le nouveau type
  const changeType = (t) => {
    setType(t);
    if (raw.trim()) { const r = parseStructure(raw, t); setChamps(r.champs); setMissing(r.missing); }
    else { const next = {}; champsFor(t).forEach((d) => { next[d.key] = (champs && champs[d.key]) || ''; }); setChamps(next); }
  };
  const setChamp = (k, v) => setChamps((c) => ({ ...(c || {}), [k]: v }));
  const longField = (k) => champs && (champs[k] || '').length > 60;

  const save = () => onSave({ type, champs: champs || {} });
  const clear = () => onSave({ type: null, champs: {} });

  return (
    <div className="day-pop-scrim" onClick={onClose}>
      <div className="day-pop" style={{ width: 'min(560px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head"><div className="row spread"><div className="serif" style={{ fontSize: 18 }}>Théorie · {coche.texte || 'coche'}</div><button className="icon-btn sm" onClick={onClose}><Icon name="x" size={16} /></button></div></div>
        <div className="day-pop-body" style={{ overflowY: 'auto' }}>
          <div className="imp-field">
            <label>Coller la théorie</label>
            <textarea className="imp-title" style={{ minHeight: 110, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              placeholder={'Colle le texte (ex : « Origine : … Insertion : … »). Le type et les champs sont détectés automatiquement, sans IA.'}
              value={raw} onChange={(e) => setRaw(e.target.value)} />
            <div className="imp-actions" style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={analyse} disabled={!raw.trim()}><Icon name="sparkle" size={15} /> Analyser</button>
            </div>
          </div>

          <div className="imp-field">
            <label>Type de structure {detected && <span className="imp-opt">(détecté — confirme ou corrige)</span>}</label>
            <div className="imp-chips">
              {TYPE_ORDER.map((t) => <button key={t} className={'imp-chip' + (type === t ? ' on' : '')} onClick={() => changeType(t)}>{ANAT_TYPES[t].label}</button>)}
            </div>
          </div>

          {champs && (
            <div className="imp-field">
              <label>Champs extraits — corrige au besoin</label>
              {missing.length > 0 && <div className="hint" style={{ color: 'var(--accent-2)', margin: '2px 0 8px' }}><Icon name="alert" size={13} /> Non détecté(s) : {missing.join(', ')}.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {defs.map((d) => (
                  <div key={d.key}>
                    <label className="hint" style={{ display: 'block', fontWeight: 700, marginBottom: 3 }}>{d.label}{!(champs[d.key] || '').trim() && <span style={{ color: 'var(--accent-2)', marginLeft: 6, fontWeight: 500 }}>(vide)</span>}</label>
                    {longField(d.key)
                      ? <textarea className="srcmgr-input" style={{ width: '100%', minHeight: 54, resize: 'vertical', fontSize: 12.5 }} value={champs[d.key] || ''} onChange={(e) => setChamp(d.key, e.target.value)} />
                      : <input className="srcmgr-input" style={{ width: '100%', fontSize: 12.5 }} value={champs[d.key] || ''} onChange={(e) => setChamp(d.key, e.target.value)} placeholder="—" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="day-pop-foot">
          {coche.champs && Object.keys(coche.champs).length > 0 && <button className="btn ghost" onClick={clear} title="Retirer la théorie de cette coche"><Icon name="trash" size={14} /> Retirer</button>}
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={save} disabled={!champs}><Icon name="check" size={15} /> Enregistrer la théorie</button>
        </div>
      </div>
    </div>
  );
}

/* aplatit image + annotations sur un canvas à la taille naturelle (export) */
function flattenSchema(imgEl, w, h, coches) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, w, h);
  const fs = Math.max(13, Math.round(w * 0.016));
  const lw = Math.max(2, w * 0.002);
  ctx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  coches.forEach((c) => {
    const col = c.couleur || DEFAULT_COLOR;
    const ax = c.ancre.x * w, ay = c.ancre.y * h, bx = c.boite.x * w, by = c.boite.y * h;
    // flèche
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
    const ang = Math.atan2(ay - by, ax - bx); const ah = Math.max(9, w * 0.013);
    ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.lineTo(ax - ah * Math.cos(ang - 0.45), ay - ah * Math.sin(ang - 0.45));
    ctx.lineTo(ax - ah * Math.cos(ang + 0.45), ay - ah * Math.sin(ang + 0.45));
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    // ancre
    ctx.beginPath(); ctx.arc(ax, ay, Math.max(3, w * 0.0035), 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    // libellé
    const label = `${c.numero}. ${c.texte || ''}`.trim();
    const padX = fs * 0.55, padY = fs * 0.4;
    const tw = ctx.measureText(label).width;
    const boxW = tw + padX * 2, boxH = fs + padY * 2;
    const lx = bx - boxW / 2, ly = by - boxH / 2;
    roundRect(ctx, lx, ly, boxW, boxH, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.lineWidth = Math.max(1.5, w * 0.0016); ctx.strokeStyle = col; roundRect(ctx, lx, ly, boxW, boxH, 6); ctx.stroke();
    ctx.fillStyle = '#15151b'; ctx.fillText(label, lx + padX, by + 1);
  });
  return canvas;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
