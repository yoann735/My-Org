/* ============================================================
   MedRevise — import ANATOMIE → THÉORIE (100 % LOCAL, AUCUNE IA).
   L'utilisateur choisit un TYPE (muscle / os / nerf / artère / veine /
   tissu conjonctif), colle le texte descriptif, et l'app EXTRAIT chaque
   champ (parsing local, cf. lib/anatParse.js). Aperçu éditable AVANT
   enregistrement, puis stockage d'une « fiche de structure anatomique »
   { id, nom, type, champs, sousCategorie, matiereId }.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { DestPicker } from '../components/ui.jsx';
import { ANAT_TYPES, champsFor, parseStructure } from '../lib/anatParse.js';
import { genId, put, remove } from '../lib/storage.js';

const TYPE_ORDER = ['muscle', 'os', 'nerf', 'artere', 'veine', 'tissu_conjonctif'];

/** rendu lisible d'une structure : tableau libellé → valeur. Réutilisable (théorie
    en Bibliothèque, panneau de révision — étape 3). */
export function StructureTable({ struct }) {
  const defs = champsFor(struct.type);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <tbody>
          {defs.map((d, i) => (
            <tr key={d.key} style={{ borderTop: i ? '1px solid var(--border-2)' : 'none' }}>
              <td style={{ padding: '7px 10px', fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top', width: '38%', color: 'var(--text-2)' }}>{d.label}</td>
              <td style={{ padding: '7px 10px' }}>{struct.champs[d.key] || <span className="hint">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImportAnatomieTheorie({ ctx }) {
  const { db } = ctx;
  const sources = db.sources.filter((s) => !s.archive);
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [type, setType] = useState('muscle');
  const [nom, setNom] = useState('');
  const [raw, setRaw] = useState('');
  const [champs, setChamps] = useState(null); // aperçu extrait (null = pas encore analysé)
  const [missing, setMissing] = useState([]);
  const [justSaved, setJustSaved] = useState(null); // nom enregistré (confirmation)

  const defs = champsFor(type);

  const changeType = (t) => { setType(t); setChamps(null); setMissing([]); };
  const analyse = () => { const r = parseStructure(raw, type); setChamps(r.champs); setMissing(r.missing); setJustSaved(null); };
  const setChamp = (k, v) => setChamps((c) => ({ ...(c || {}), [k]: v }));

  const ready = !!(matId && nom.trim() && champs);

  const save = async () => {
    if (!ready) return;
    const rec = {
      id: genId('as'), nom: nom.trim(), type, sousCategorie: ANAT_TYPES[type].label,
      matiereId: matId, champs, createdAt: new Date().toISOString(),
    };
    await put('anatstruct', rec);
    await ctx.reload();
    setJustSaved(rec.nom);
    setNom(''); setRaw(''); setChamps(null); setMissing([]);
  };

  const del = async (id) => { await remove('anatstruct', id); await ctx.reload(); };

  const existing = useMemo(() => (db.anatstruct || []).filter((s) => s.matiereId === matId), [db.anatstruct, matId]);
  const longField = (k) => champs && (champs[k] || '').length > 60;

  return (
    <div className="fadein imp-dest">
      <div className="imp-dest-head"><Icon name="folder" size={15} /> Où ranger cette structure&nbsp;?</div>

      <DestPicker ctx={ctx} srcId={srcId} setSrcId={setSrcId} matId={matId} setMatId={setMatId} />

      <div className="imp-field">
        <label>Type de structure <span className="imp-opt">(détermine les champs extraits)</span></label>
        <div className="imp-chips">
          {TYPE_ORDER.map((t) => (
            <button key={t} className={'imp-chip' + (type === t ? ' on' : '')} onClick={() => changeType(t)}>{ANAT_TYPES[t].label}</button>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          Champs attendus : {defs.map((d) => d.label).join(' · ')}.
        </div>
      </div>

      <div className="imp-field">
        <label>Nom de la structure</label>
        <input className="imp-title" placeholder="ex : Humérus" value={nom} onChange={(e) => setNom(e.target.value)} />
      </div>

      <div className="imp-field">
        <label>Texte descriptif collé</label>
        <textarea className="imp-title" style={{ minHeight: 130, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
          placeholder={'Colle ici le texte (ex : « Origine : … Insertion : … Action : … »). Les champs seront découpés automatiquement, sans IA.'}
          value={raw} onChange={(e) => setRaw(e.target.value)} />
        <div className="imp-actions" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={analyse} disabled={!raw.trim()}><Icon name="sparkle" size={15} /> Analyser le texte</button>
        </div>
      </div>

      {champs && (
        <div className="card fadein" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="imp-dest-head"><Icon name="list" size={15} /> Aperçu de l'extraction — corrige au besoin</div>
            {missing.length > 0 && (
              <div className="hint" style={{ color: 'var(--accent-2)', margin: '6px 0 10px' }}>
                <Icon name="alert" size={13} /> Champ(s) non détecté(s) : {missing.join(', ')} — laisse vide ou complète à la main.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {defs.map((d) => (
                <div key={d.key}>
                  <label className="hint" style={{ display: 'block', fontWeight: 700, marginBottom: 3 }}>
                    {d.label}{!champs[d.key] && <span style={{ color: 'var(--accent-2)', marginLeft: 6, fontWeight: 500 }}>(vide)</span>}
                  </label>
                  {longField(d.key)
                    ? <textarea className="srcmgr-input" style={{ width: '100%', minHeight: 60, resize: 'vertical', fontSize: 12.5 }} value={champs[d.key] || ''} onChange={(e) => setChamp(d.key, e.target.value)} />
                    : <input className="srcmgr-input" style={{ width: '100%', fontSize: 12.5 }} value={champs[d.key] || ''} onChange={(e) => setChamp(d.key, e.target.value)} placeholder="—" />}
                </div>
              ))}
            </div>
            <div className="imp-actions" style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={() => { setChamps(null); setMissing([]); }}>Annuler</button>
              <button className="btn primary" onClick={save} disabled={!ready}><Icon name="check" size={15} /> Enregistrer la structure</button>
            </div>
            {!ready && <div className="hint" style={{ marginTop: 8 }}>Renseigne une matière et un nom pour enregistrer.</div>}
          </div>
        </div>
      )}

      {justSaved && (
        <div className="err-mini ok" style={{ marginBottom: 16 }}>
          <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
          <div className="em-body"><div className="em-title">« {justSaved} » enregistrée</div><div className="hint">Structure ajoutée à la matière — visible ci-dessous.</div></div>
        </div>
      )}

      {existing.length > 0 && (
        <div className="imp-field">
          <label>Structures de cette matière ({existing.length})</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {existing.map((s) => (
              <div key={s.id} className="card"><div className="card-body">
                <div className="row spread" style={{ marginBottom: 8 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <span className="pill accent" style={{ height: 22 }}>{ANAT_TYPES[s.type] ? ANAT_TYPES[s.type].label : s.type}</span>
                    <strong>{s.nom}</strong>
                  </div>
                  <button className="cd-ic" title="Supprimer cette structure" onClick={() => del(s.id)} style={{ color: 'var(--accent-2)' }}><Icon name="trash" size={14} /></button>
                </div>
                <StructureTable struct={s} />
              </div></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
