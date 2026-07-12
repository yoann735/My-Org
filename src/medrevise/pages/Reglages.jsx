/* ============================================================
   MedRevise — Réglages : gestion des cours (sources) + matières,
   rappels J, archivage ; profil ; méthode des J ; objectif ; reset.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, Switch, matiereMeta } from '../components/ui.jsx';
import { J_INTERVALS } from '../lib/sm2.js';
import { wipeAll, seedIfEmpty } from '../lib/storage.js';

export function Reglages({ ctx }) {
  const { db, stats } = ctx;
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState('');
  const [addCatFor, setAddCatFor] = useState(null);
  const [catDraft, setCatDraft] = useState('');
  const [showArch, setShowArch] = useState(false);

  const active = db.sources.filter((s) => !s.archive);
  const archived = db.sources.filter((s) => s.archive);
  const matsOf = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const archivedMatieres = db.matieres.filter((m) => m.archive);

  const commitRename = () => { if (renaming) ctx.renameSource(renaming, draft); setRenaming(null); };
  const commitCat = () => { if (catDraft.trim() && addCatFor) ctx.addMatiere(addCatFor, catDraft); setAddCatFor(null); setCatDraft(''); };
  const resetData = async () => {
    if (!window.confirm('Réinitialiser MedRevise (toutes les fiches, questions et statistiques) ?')) return;
    await wipeAll(); await seedIfEmpty(); await ctx.reload();
  };
  const setObjectif = (v) => ctx.saveStats({ ...(stats || {}), objectifQuotidien: Math.max(5, v) });

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div><h1 className="serif">Réglages</h1><div className="sub">Préférences de ton espace de révision.</div></div>
        <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
      </div>

      {/* Cours */}
      <Card title="Cours" icon="grad"
        action={<button className="btn primary sm" onClick={() => ctx.addSource('Nouveau cours')}><Icon name="plus" size={14} stroke={2.6} /> Ajouter un cours</button>}
        style={{ maxWidth: 820, marginBottom: 16 }}>
        <div className="hint" style={{ marginBottom: 14 }}>Un cours regroupe des matières (Cours → Matière → Fiche). Mets un cours en pause pour le sortir du planning des J — il reste consultable en bibliothèque.</div>
        <div className="srcmgr">
          {active.map((s) => {
            const on = s.rappelsJ !== false;
            const cats = matsOf(s.id);
            return (
              <div className={'srcmgr-row' + (on ? '' : ' paused')} key={s.id}>
                <span className="srcmgr-ic" style={{ background: `color-mix(in srgb, ${s.tint || '#7C6FE0'} 16%, transparent)`, color: s.tint || '#7C6FE0' }}><Icon name={s.icon || 'folder'} size={18} /></span>
                <div className="srcmgr-main">
                  {renaming === s.id ? (
                    <input className="srcmgr-input" autoFocus defaultValue={s.nom} onFocus={(e) => e.target.select()}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }} onBlur={commitRename} />
                  ) : (
                    <div className="srcmgr-name" onDoubleClick={() => { setDraft(s.nom); setRenaming(s.id); }}>
                      {s.nom}
                      <button className="srcmgr-edit" title="Renommer" onClick={() => { setDraft(s.nom); setRenaming(s.id); }}><Icon name="edit" size={13} /></button>
                    </div>
                  )}
                  <div className="srcmgr-cats">
                    {cats.map((c) => { const mm = matiereMeta(c); return <span className="cat-badge" key={c.id} style={{ height: 21, fontSize: 11, background: `color-mix(in srgb, ${mm.tint} 13%, transparent)`, color: mm.tint, borderColor: `color-mix(in srgb, ${mm.tint} 28%, transparent)` }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: mm.tint }} /> {mm.label}</span>; })}
                    {addCatFor === s.id ? (
                      <input className="srcmgr-catinput" autoFocus placeholder="Nom de la matière" value={catDraft}
                        onChange={(e) => setCatDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitCat(); if (e.key === 'Escape') { setAddCatFor(null); setCatDraft(''); } }} onBlur={commitCat} />
                    ) : (
                      <button className="srcmgr-addcat" onClick={() => { setCatDraft(''); setAddCatFor(s.id); }}><Icon name="plus" size={11} stroke={2.6} /> Matière</button>
                    )}
                  </div>
                </div>
                <div className="srcmgr-actions">
                  <div className="src-set-toggle"><span className={'src-set-state' + (on ? ' on' : '')}>{on ? 'Rappels J' : 'En pause'}</span><Switch on={on} onChange={(v) => ctx.setSourceRappels(s.id, v)} /></div>
                  <button className="srcmgr-arch" title="Archiver ce cours" onClick={() => ctx.setSourceArchived(s.id, true)}><Icon name="archive" size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
        {archived.length > 0 && (
          <div className="srcmgr-archived">
            <button className="srcmgr-archtoggle" onClick={() => setShowArch((v) => !v)}><Icon name={showArch ? 'chevD' : 'chevR'} size={14} /> {archived.length} cours archivé{archived.length > 1 ? 's' : ''}</button>
            {showArch && archived.map((s) => (
              <div className="srcmgr-archrow" key={s.id}>
                <span className="srcmgr-ic sm" style={{ background: `color-mix(in srgb, ${s.tint || '#7C6FE0'} 16%, transparent)`, color: s.tint || '#7C6FE0' }}><Icon name={s.icon || 'folder'} size={13} /></span>
                <span className="srcmgr-archname">{s.nom}</span>
                <button className="btn ghost sm" onClick={() => ctx.setSourceArchived(s.id, false)}><Icon name="refresh" size={13} /> Restaurer</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Corbeille : matières supprimées depuis Réviser (clic droit), restaurables */}
      {archivedMatieres.length > 0 && (
        <Card title="Corbeille — matières supprimées" icon="trash" style={{ maxWidth: 820, marginBottom: 16 }}>
          <div className="hint" style={{ marginBottom: 12 }}>Matières supprimées depuis l'onglet Réviser (clic droit). Leurs fiches ont été déplacées dans « À classer » dans le même cours ; restaure la matière ici si besoin.</div>
          {archivedMatieres.map((m) => {
            const src = db.sources.find((s) => s.id === m.sourceId);
            return (
              <div className="srcmgr-archrow" key={m.id}>
                <span className="srcmgr-archname">{m.nom}{src && <span className="hint"> — {src.nom}</span>}</span>
                <button className="btn ghost sm" onClick={() => ctx.setMatiereArchived(m.id, false)}><Icon name="refresh" size={13} /> Restaurer</button>
              </div>
            );
          })}
        </Card>
      )}

      <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 820 }}>
        <Card title="Profil" icon="settings">
          <div className="row" style={{ gap: 14 }}>
            <div className="avatar" style={{ width: 56, height: 56, fontSize: 20, borderRadius: 16 }}>MR</div>
            <div><div style={{ fontWeight: 600, fontSize: 16 }}>Mon espace</div><div className="hint">Révision médicale</div></div>
          </div>
        </Card>
        <Card title="Méthode des J" icon="calendar">
          <div className="row wrap" style={{ gap: 7 }}>{J_INTERVALS.map((j) => <span className="j-tag" key={j}>J+{j}</span>)}</div>
          <div className="hint" style={{ marginTop: 10 }}>Intervalles de répétition espacée (plafonnés à 90 j).</div>
        </Card>
        <Card title="Objectif quotidien" icon="target">
          <div className="stepper">
            <button type="button" onClick={() => setObjectif(((stats && stats.objectifQuotidien) || 20) - 5)}><Icon name="minus" size={16} /></button>
            <span className="val" style={{ minWidth: 90 }}>{(stats && stats.objectifQuotidien) || 20} / jour</span>
            <button type="button" onClick={() => setObjectif(((stats && stats.objectifQuotidien) || 20) + 5)}><Icon name="plus" size={16} /></button>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>Volume cible de cartes par jour.</div>
        </Card>
        <Card title="Données & confidentialité" icon="box">
          <div className="hint" style={{ marginBottom: 12 }}>100 % local : fiches, images et PDF sont stockés sur cet appareil (IndexedDB).</div>
          <button type="button" className="btn" style={{ color: 'var(--crit)' }} onClick={resetData}><Icon name="trash" size={15} /> Réinitialiser MedRevise</button>
        </Card>
      </div>
    </div>
  );
}
