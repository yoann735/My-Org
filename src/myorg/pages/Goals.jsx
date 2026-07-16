/* ============================================================
   My Org — Objectifs annuels (store myorg_goals).
   CRUD : intitulé, année, catégorie (libre), progression 0–100 %,
   statut (en cours / atteint), note. Affichage groupé par année
   (desc) avec barre de progression par objectif.
   Suppression : jamais au simple clic → ConfirmModal.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ConfirmModal, EmptyState } from '../components/ui.jsx';
import { newGoal } from '../lib/storage.js';

const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

/* formulaire création / édition */
function GoalForm({ initial, onSave, onCancel }) {
  const [intitule, setIntitule] = useState(initial?.intitule || '');
  const [annee, setAnnee] = useState(initial?.annee || new Date().getFullYear());
  const [categorie, setCategorie] = useState(initial?.categorie || '');
  const [progression, setProgression] = useState(initial?.progression ?? 0);
  const [statut, setStatut] = useState(initial?.statut || 'en_cours');
  const [note, setNote] = useState(initial?.note || '');

  const submit = (e) => {
    e.preventDefault();
    if (!intitule.trim()) return;
    const prog = clamp100(progression);
    onSave({
      intitule: intitule.trim(), annee: Number(annee) || new Date().getFullYear(),
      categorie: categorie.trim(), progression: prog,
      // à 100 % l'objectif est atteint (cohérence auto), sinon statut choisi
      statut: prog >= 100 ? 'atteint' : statut,
      note: note.trim(),
    });
  };

  return (
    <form className="mo-form" onSubmit={submit}>
      <input className="mo-input" autoFocus placeholder="Intitulé de l’objectif…" value={intitule} onChange={(e) => setIntitule(e.target.value)} />
      <div className="mo-form-row">
        <label className="mo-field">
          <span className="hint">Année</span>
          <input className="mo-input" type="number" min="2000" max="2100" value={annee} onChange={(e) => setAnnee(e.target.value)} />
        </label>
        <label className="mo-field">
          <span className="hint">Catégorie</span>
          <input className="mo-input" placeholder="Santé, finances, études…" value={categorie} onChange={(e) => setCategorie(e.target.value)} />
        </label>
      </div>
      <div className="mo-form-row">
        <label className="mo-field" style={{ flex: 2 }}>
          <span className="hint">Progression : {clamp100(progression)} %</span>
          <input type="range" min="0" max="100" step="5" value={clamp100(progression)} onChange={(e) => setProgression(e.target.value)} />
        </label>
        <label className="mo-field">
          <span className="hint">Statut</span>
          <select className="mo-input" value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="en_cours">En cours</option>
            <option value="atteint">Atteint</option>
          </select>
        </label>
      </div>
      <textarea className="mo-input" rows={2} placeholder="Note (optionnelle)…" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mo-form-foot">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn primary" disabled={!intitule.trim()}>
          <Icon name="check" size={15} /> {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}

export function Goals({ ctx }) {
  const { db } = ctx;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // groupé par année, la plus récente d'abord
  const years = [...new Set(db.goals.map((g) => g.annee))].sort((a, b) => b - a);
  const goalsOf = (y) => db.goals.filter((g) => g.annee === y)
    .sort((a, b) => (b.progression - a.progression) || a.intitule.localeCompare(b.intitule));

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div><h1 className="serif">Objectifs</h1><div className="sub">{db.goals.length} objectif(s) · {db.goals.filter((g) => g.statut === 'atteint').length} atteint(s).</div></div>
        <div className="topbar-actions">
          {!adding && <button className="btn primary" onClick={() => { setEditing(null); setAdding(true); }}><Icon name="plus" size={15} stroke={2.6} /> Nouvel objectif</button>}
          <button className="icon-btn" type="button" title="Changer d'app" onClick={ctx.goHub}><Icon name="grid" size={19} /></button>
          <button className="icon-btn" type="button" title={ctx.theme === 'dark' ? 'Mode clair' : 'Mode sombre'} onClick={ctx.toggleTheme}>
            <Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
        </div>
      </div>

      {adding && (
        <div className="card" style={{ maxWidth: 820, marginBottom: 16 }}>
          <div className="card-head"><Icon name="target" size={17} className="ic" /><h3>Nouvel objectif</h3></div>
          <div className="card-body">
            <GoalForm
              onSave={async (fields) => { await ctx.saveGoal(newGoal(fields)); setAdding(false); }}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      )}

      {!db.goals.length && !adding && (
        <div className="card" style={{ maxWidth: 820 }}>
          <div className="card-body">
            <EmptyState icon="target" title="Aucun objectif pour l’instant" hint="Fixe ton premier objectif de l’année avec « Nouvel objectif »." />
          </div>
        </div>
      )}

      {years.map((y) => (
        <div className="card" style={{ maxWidth: 820, marginBottom: 16 }} key={y}>
          <div className="card-head">
            <Icon name="trophy" size={17} className="ic" />
            <h3>{y}</h3>
            <div className="right"><span className="pill accent" style={{ height: 24, fontSize: 11.5 }}>{goalsOf(y).length} objectif(s)</span></div>
          </div>
          <div className="card-body">
            <div className="mo-list">
              {goalsOf(y).map((g) => editing?.id === g.id ? (
                <GoalForm key={g.id} initial={g}
                  onSave={async (fields) => { await ctx.saveGoal({ ...g, ...fields }); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={g.id} className={'mo-row' + (g.statut === 'atteint' ? ' done' : '')}>
                  <div className="mo-row-main">
                    <div className="mo-row-title">
                      {g.intitule}
                      {g.statut === 'atteint' && <span className="pill ok" style={{ height: 22, fontSize: 11, marginLeft: 8 }}><Icon name="check" size={11} /> Atteint</span>}
                    </div>
                    {g.note && <div className="hint" style={{ fontSize: 12.5 }}>{g.note}</div>}
                    <div className="mo-goal-prog">
                      <div className={'bar' + (g.statut === 'atteint' ? ' ok' : '')} style={{ flex: 1 }}><span style={{ width: `${clamp100(g.progression)}%` }} /></div>
                      <span className="mo-goal-pct">{clamp100(g.progression)} %</span>
                    </div>
                    {g.categorie && <div className="mo-row-meta"><span className="pill" style={{ height: 24, fontSize: 11.5 }}>{g.categorie}</span></div>}
                  </div>
                  <div className="mo-row-actions">
                    <button className="icon-btn" type="button" title="Modifier" onClick={() => { setAdding(false); setEditing(g); }}><Icon name="edit" size={16} /></button>
                    <button className="icon-btn" type="button" title="Supprimer" onClick={() => setDeleting(g)}><Icon name="trash" size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {deleting && (
        <ConfirmModal
          title="Supprimer cet objectif ?"
          body={<>« {deleting.intitule} » ({deleting.annee}) sera supprimé définitivement.</>}
          confirmLabel="Supprimer" danger
          onConfirm={async () => { await ctx.deleteGoal(deleting.id); setDeleting(null); }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
