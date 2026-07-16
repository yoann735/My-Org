/* ============================================================
   My Org — To-do (store myorg_todos).
   CRUD complet : titre, note, échéance (date), priorité, statut.
   Filtres : toutes / à faire / faites / en retard.
   Tri : échéance croissante (sans échéance en dernier) puis priorité.
   Suppression : jamais au simple clic → ConfirmModal.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ConfirmModal, EmptyState, PrioPill, PRIORITES } from '../components/ui.jsx';
import { newTodo, isLate, todayISO } from '../lib/storage.js';

const PRIO_ORDER = { haute: 0, moyenne: 1, basse: 2 };
const FILTRES = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'todo', label: 'À faire' },
  { id: 'done', label: 'Faites' },
  { id: 'late', label: 'En retard' },
];

function fmtDate(iso) {
  if (!iso) return null;
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

/* formulaire création / édition (mêmes champs) */
function TodoForm({ initial, onSave, onCancel }) {
  const [titre, setTitre] = useState(initial?.titre || '');
  const [note, setNote] = useState(initial?.note || '');
  const [echeance, setEcheance] = useState(initial?.echeance || '');
  const [priorite, setPriorite] = useState(initial?.priorite || 'moyenne');

  const submit = (e) => {
    e.preventDefault();
    if (!titre.trim()) return;
    onSave({ titre: titre.trim(), note: note.trim(), echeance: echeance || null, priorite });
  };

  return (
    <form className="mo-form" onSubmit={submit}>
      <input className="mo-input" autoFocus placeholder="Titre de la tâche…" value={titre} onChange={(e) => setTitre(e.target.value)} />
      <textarea className="mo-input" rows={2} placeholder="Note (optionnelle)…" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mo-form-row">
        <label className="mo-field">
          <span className="hint">Échéance</span>
          <input className="mo-input" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        </label>
        <label className="mo-field">
          <span className="hint">Priorité</span>
          <select className="mo-input" value={priorite} onChange={(e) => setPriorite(e.target.value)}>
            {PRIORITES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <div className="mo-form-foot">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn primary" disabled={!titre.trim()}>
          <Icon name="check" size={15} /> {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}

export function Todos({ ctx }) {
  const { db } = ctx;
  const [filtre, setFiltre] = useState('toutes');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // todo en cours d'édition
  const [deleting, setDeleting] = useState(null); // todo dont la suppression est à confirmer

  const todos = db.todos
    .filter((t) => {
      if (filtre === 'todo') return t.statut !== 'done';
      if (filtre === 'done') return t.statut === 'done';
      if (filtre === 'late') return isLate(t);
      return true;
    })
    .sort((a, b) => {
      // échéance croissante, les tâches sans échéance en dernier
      if (a.echeance !== b.echeance) {
        if (!a.echeance) return 1;
        if (!b.echeance) return -1;
        if (a.echeance < b.echeance) return -1;
        if (a.echeance > b.echeance) return 1;
      }
      return (PRIO_ORDER[a.priorite] ?? 1) - (PRIO_ORDER[b.priorite] ?? 1);
    });

  const nbLate = db.todos.filter(isLate).length;

  const toggle = (t) => ctx.saveTodo({
    ...t,
    statut: t.statut === 'done' ? 'todo' : 'done',
    doneAt: t.statut === 'done' ? null : new Date().toISOString(),
  });

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div><h1 className="serif">To-do</h1><div className="sub">{db.todos.filter((t) => t.statut !== 'done').length} tâche(s) à faire{nbLate ? ` · ${nbLate} en retard` : ''}.</div></div>
        <div className="topbar-actions">
          <button className="icon-btn" type="button" title="Changer d'app" onClick={ctx.goHub}><Icon name="grid" size={19} /></button>
          <button className="icon-btn" type="button" title={ctx.theme === 'dark' ? 'Mode clair' : 'Mode sombre'} onClick={ctx.toggleTheme}>
            <Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 820 }}>
        <div className="card-head">
          <Icon name="check" size={17} className="ic" />
          <h3>Mes tâches</h3>
          <div className="right">
            <div className="seg">
              {FILTRES.map((f) => (
                <button key={f.id} type="button" className={'seg-btn' + (filtre === f.id ? ' active' : '')} onClick={() => setFiltre(f.id)}>{f.label}</button>
              ))}
            </div>
            {!adding && <button className="btn primary sm" onClick={() => { setEditing(null); setAdding(true); }}><Icon name="plus" size={14} stroke={2.6} /> Nouvelle tâche</button>}
          </div>
        </div>
        <div className="card-body">
          {adding && (
            <TodoForm
              onSave={async (fields) => { await ctx.saveTodo(newTodo(fields)); setAdding(false); }}
              onCancel={() => setAdding(false)}
            />
          )}

          {!todos.length && !adding && (
            <EmptyState icon="check" title={filtre === 'toutes' ? 'Aucune tâche pour l’instant' : 'Rien dans ce filtre'}
              hint={filtre === 'toutes' ? 'Ajoute ta première tâche avec « Nouvelle tâche ».' : null} />
          )}

          <div className="mo-list">
            {todos.map((t) => {
              const late = isLate(t);
              const dueToday = t.statut !== 'done' && t.echeance === todayISO();
              return editing?.id === t.id ? (
                <TodoForm key={t.id} initial={t}
                  onSave={async (fields) => { await ctx.saveTodo({ ...t, ...fields }); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={t.id} className={'mo-row' + (t.statut === 'done' ? ' done' : '') + (late ? ' late' : '')}>
                  <button className={'mo-check' + (t.statut === 'done' ? ' on' : '')} type="button"
                    title={t.statut === 'done' ? 'Marquer à faire' : 'Marquer faite'} onClick={() => toggle(t)}>
                    {t.statut === 'done' && <Icon name="check" size={13} stroke={3} />}
                  </button>
                  <div className="mo-row-main">
                    <div className="mo-row-title">{t.titre}</div>
                    {t.note && <div className="hint" style={{ fontSize: 12.5 }}>{t.note}</div>}
                    <div className="mo-row-meta">
                      <PrioPill priorite={t.priorite} />
                      {t.echeance && (
                        <span className={'pill' + (late ? ' crit' : dueToday ? ' amber' : '')} style={{ height: 24, fontSize: 11.5 }}>
                          <Icon name="calendar" size={12} /> {fmtDate(t.echeance)}{late ? ' · en retard' : dueToday ? ' · aujourd’hui' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mo-row-actions">
                    <button className="icon-btn" type="button" title="Modifier" onClick={() => { setAdding(false); setEditing(t); }}><Icon name="edit" size={16} /></button>
                    <button className="icon-btn" type="button" title="Supprimer" onClick={() => setDeleting(t)}><Icon name="trash" size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {deleting && (
        <ConfirmModal
          title="Supprimer cette tâche ?"
          body={<>« {deleting.titre} » sera supprimée définitivement.</>}
          confirmLabel="Supprimer" danger
          onConfirm={async () => { await ctx.deleteTodo(deleting.id); setDeleting(null); }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
