/* ============================================================
   MedRevise — Réglages : gestion des cours (sources) + matières,
   rappels J, archivage ; profil ; méthode des J ; objectif ; reset.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, Switch, matiereMeta, syncStatusLabel } from '../components/ui.jsx';
import { isClassicUI, setClassicUI } from '../../shared/uiMode.js';
import { wipeAll } from '../lib/storage.js';
import { exportBackup } from '../lib/backupExport.js';

export function Reglages({ ctx }) {
  const { db } = ctx;
  // « Exporter toutes mes données » — lecture seule intégrale (voir
  // lib/backupExport.js) : aucune écriture, aucun appel réseau, aucune synchro
  // déclenchée. `busy` empêche juste un double clic pendant la lecture.
  const [backup, setBackup] = useState({ busy: false, message: '' });
  const runExport = async (withBlobs) => {
    setBackup({ busy: true, message: 'Lecture des données…' });
    const res = await exportBackup({
      withBlobs,
      onProgress: (m) => setBackup({ busy: true, message: m }),
    });
    setBackup({ busy: false, message: res.message });
  };
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState('');
  const [addCatFor, setAddCatFor] = useState(null);
  const [catDraft, setCatDraft] = useState('');
  const [showArch, setShowArch] = useState(false);
  // Lu une fois : la seule façon de le changer est l'interrupteur, qui recharge.
  const uiClassique = isClassicUI();

  const active = db.sources.filter((s) => !s.archive);
  const archived = db.sources.filter((s) => s.archive);
  const matsOf = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const archivedMatieres = db.matieres.filter((m) => m.archive);
  const archivedFiches = db.fiches.filter((f) => f.archive);
  const allMatieres = db.matieres.filter((m) => !m.archive);

  const commitRename = () => { if (renaming) ctx.renameSource(renaming, draft); setRenaming(null); };
  const commitCat = () => { if (catDraft.trim() && addCatFor) ctx.addMatiere(addCatFor, catDraft); setAddCatFor(null); setCatDraft(''); };
  const resetData = async () => {
    if (!window.confirm('Réinitialiser MedRevise (toutes les fiches, questions et statistiques) ?')) return;
    await wipeAll(); await ctx.reload();
  };
  const resetAllJ = async () => {
    if (!window.confirm("Réinitialiser les dates ? Efface toutes les échéances J (calendrier, dus, retards) de TOUTES les fiches — le contenu (flashcards, QCM, Feynman, historique) est conservé. Chaque fiche redevient « sans planning », en attente qu'on lui pose un nouveau J0.")) return;
    await ctx.resetAllJ();
  };

  const deleteSource = (s) => {
    if (!window.confirm(`Supprimer le cours « ${s.nom} » ? Il sera déplacé dans la corbeille (restaurable ici tant que la corbeille n'est pas vidée).`)) return;
    ctx.setSourceArchived(s.id, true);
  };
  const trashCount = archived.length + archivedMatieres.length + archivedFiches.length;
  const emptyTrash = () => {
    if (!window.confirm(`Vider la corbeille ? ${archived.length} cours, ${archivedMatieres.length} matière(s) et ${archivedFiches.length} fiche(s) seront supprimés DÉFINITIVEMENT, sur tous tes appareils. Cette action est IRRÉVERSIBLE.`)) return;
    ctx.emptyTrash();
  };
  const deleteSourceForever = (s) => {
    if (!window.confirm(`Supprimer définitivement le cours « ${s.nom} » et tout son contenu ? Action IRRÉVERSIBLE, sur tous tes appareils.`)) return;
    ctx.permanentlyDeleteSource(s.id);
  };
  const deleteMatiereForever = (m) => {
    if (!window.confirm(`Supprimer définitivement la matière « ${m.nom} » et ses fiches ? Action IRRÉVERSIBLE, sur tous tes appareils.`)) return;
    ctx.permanentlyDeleteMatiere(m.id);
  };
  const deleteFicheForever = (f) => {
    if (!window.confirm(`Supprimer définitivement la fiche « ${f.titre} » ? Action IRRÉVERSIBLE, sur tous tes appareils.`)) return;
    ctx.permanentlyDeleteFiche(f.id);
  };

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
                  <button type="button" className="srcmgr-edit" title="Supprimer ce cours" onClick={() => deleteSource(s)}><Icon name="trash" size={14} /></button>
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
                <button className="btn ghost sm" style={{ color: 'var(--crit)' }} title="Supprimer définitivement" onClick={() => deleteSourceForever(s)}><Icon name="trash" size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Couleur par matière : alimente le calendrier (WeekCalendar/DayPopup) ET
         sa légende — matiereMeta (ui.jsx) lit m.couleur en priorité, avec un
         fallback distinct par matière tant que rien n'est choisi ici. */}
      {allMatieres.length > 0 && (
        <Card title="Couleurs par matière" icon="cards" style={{ maxWidth: 820, marginBottom: 16 }}>
          <div className="hint" style={{ marginBottom: 14 }}>Colore les fiches et exercices de chaque matière dans le calendrier. Sans choix ici, chaque matière garde une couleur par défaut distincte.</div>
          <div className="matcolor-list">
            {allMatieres.map((m) => {
              const src = db.sources.find((s) => s.id === m.sourceId);
              const tint = matiereMeta(m).tint;
              return (
                <div className="matcolor-row" key={m.id}>
                  <label className="matcolor-swatch" style={{ background: tint }}>
                    <input type="color" value={tint} onChange={(e) => ctx.setMatiereCouleur(m.id, e.target.value)} />
                  </label>
                  <div className="matcolor-name">{m.nom}{src && <span className="hint"> — {src.nom}</span>}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {trashCount > 0 && (
        <div className="row" style={{ maxWidth: 820, marginBottom: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="hint">{trashCount} élément{trashCount > 1 ? 's' : ''} dans la corbeille.</div>
          <button type="button" className="btn" style={{ color: 'var(--crit)' }} onClick={emptyTrash}><Icon name="trash" size={14} /> Vider la corbeille</button>
        </div>
      )}

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
                <button className="btn ghost sm" style={{ color: 'var(--crit)' }} title="Supprimer définitivement" onClick={() => deleteMatiereForever(m)}><Icon name="trash" size={13} /></button>
              </div>
            );
          })}
        </Card>
      )}

      {/* Corbeille : fiches supprimées depuis Réviser (clic droit), restaurables */}
      {archivedFiches.length > 0 && (
        <Card title="Corbeille — fiches supprimées" icon="trash" style={{ maxWidth: 820, marginBottom: 16 }}>
          <div className="hint" style={{ marginBottom: 12 }}>Fiches supprimées depuis l'onglet Réviser (clic droit).</div>
          {archivedFiches.map((f) => {
            const mat = db.matieres.find((m) => m.id === f.matiereId);
            return (
              <div className="srcmgr-archrow" key={f.id}>
                <span className="srcmgr-archname">{f.titre}{mat && <span className="hint"> — {matiereMeta(mat).label}</span>}</span>
                <button className="btn ghost sm" onClick={() => ctx.setFicheArchived(f.id, false)}><Icon name="refresh" size={13} /> Restaurer</button>
                <button className="btn ghost sm" style={{ color: 'var(--crit)' }} title="Supprimer définitivement" onClick={() => deleteFicheForever(f)}><Icon name="trash" size={13} /></button>
              </div>
            );
          })}
        </Card>
      )}

      <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 820 }}>
        {/* Bascule d'apparence — voir src/shared/uiMode.js pour ce qu'elle
            annule exactement et pourquoi elle recharge la page. Elle est ici
            plutôt que dans un réglage propre à MedRevise parce que la couche
            visuelle est GLOBALE : MealWeek et le hub la reçoivent aussi. */}
        <Card title="Apparence" icon="sliders">
          <div className="row spread" style={{ alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Retrouver l'UI d'avant</div>
              <div className="hint">Rend l'ancienne interface à l'identique — couleurs, polices, rayons, animations. Les fonctionnalités et les gestes ne changent pas.</div>
            </div>
            <Switch on={uiClassique} onChange={setClassicUI} />
          </div>
          <div className="hint" style={{ marginTop: 12 }}>
            {uiClassique
              ? 'Interface d\'origine active. Coupe l\'interrupteur pour revenir à la direction actuelle.'
              : 'Direction actuelle active.'}
            {' '}S'applique aussi à MealWeek et au hub, et recharge la page.
          </div>
        </Card>
        <Card title="Profil" icon="settings">
          <div className="row" style={{ gap: 14 }}>
            <div className="avatar" style={{ width: 56, height: 56, fontSize: 20, borderRadius: 16 }}>MR</div>
            <div><div style={{ fontWeight: 600, fontSize: 16 }}>Mon espace</div><div className="hint">Révision médicale</div></div>
          </div>
        </Card>
        <Card title="Méthode des J" icon="calendar">
          <div className="row wrap" style={{ gap: 7 }}>
            <span className="j-tag">Facile ×2,5</span>
            <span className="j-tag">Difficile ×1,3</span>
            <span className="j-tag">Raté → 1 j</span>
            <span className="j-tag">Plafond J+90</span>
          </div>
          <div className="hint" style={{ marginTop: 10, marginBottom: 12 }}>Moteur adaptatif : chaque carte porte son propre intervalle (en jours), qui démarre à 1 et se multiplie à chaque révision. Un Raté le remet à 1 jour (reprise le jour même, puis due à J+1). Au-delà de 90 jours, l'intervalle est plafonné à J+90 pile ; après cette dernière révision, Facile/Difficile termine la carte, Raté relance un cycle complet.</div>
          <button type="button" className="btn" style={{ color: 'var(--crit)' }} onClick={resetAllJ}><Icon name="calendar" size={15} /> Réinitialiser les dates</button>
        </Card>
        <Card title="Sauvegarde" icon="archive">
          <div className="hint" style={{ marginBottom: 12 }}>
            Enregistre TOUT ce que contient cet appareil dans un seul fichier JSON
            (cours, matières, dossiers, fiches, cartes, méthode des J, carnet
            d'erreurs, schémas, statistiques, prompts). Opération en lecture
            seule : rien n'est modifié, rien n'est envoyé au cloud, aucune
            synchro n'est déclenchée. À faire sur chaque appareil.
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn" disabled={backup.busy} onClick={() => runExport(false)}>
              <Icon name="archive" size={15} /> {backup.busy ? 'Export en cours…' : 'Exporter toutes mes données'}
            </button>
            <button type="button" className="btn" disabled={backup.busy} onClick={() => runExport(true)}>
              <Icon name="image" size={15} /> Avec les images et PDF
            </button>
          </div>
          {backup.message && <div className="hint" style={{ marginTop: 10 }}>{backup.message}</div>}
        </Card>
        <Card title="Données & confidentialité" icon="box">
          <div className="hint" style={{ marginBottom: 12 }}>100 % local : fiches, images et PDF sont stockés sur cet appareil (IndexedDB).</div>
          <button type="button" className="btn" style={{ color: 'var(--crit)' }} onClick={resetData}><Icon name="trash" size={15} /> Réinitialiser MedRevise</button>
        </Card>
        <Card title="Synchronisation" icon="refresh">
          <div className="hint" style={{ marginBottom: 12 }}>{syncStatusLabel(ctx.syncState)}</div>
          <button type="button" className="btn" disabled={ctx.syncState?.status === 'syncing'} onClick={ctx.forceSync}>
            <Icon name="refresh" size={15} /> {ctx.syncState?.status === 'syncing' ? 'Synchronisation…' : 'Forcer la synchro'}
          </button>
        </Card>
      </div>
    </div>
  );
}
