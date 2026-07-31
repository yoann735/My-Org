/* ============================================================
   MedRevise — sidebar persistante de l'atelier "Voir le cours" (PdfReader,
   branche HTML) : liste TOUS les items de la fiche par type (onglets QCM /
   Flashcard / Exercice / Feynman), réponse visible, éditables sur place,
   + ajout intégré. RÉUTILISE STRICTEMENT :
   - ItemForm/PasteJsonForm (AddItemForm.jsx) pour l'ajout ET l'édition —
     mêmes formulaires que la modale "Ajouter un item" existante ;
   - toInternalItem (lib/adapter.js) pour fusionner un patch d'édition SANS
     toucher l'état SM-2 (interval/palier/nextReview/historique/missed) —
     c'est le même mécanisme "préserve les extras" déjà utilisé à l'import ;
   - ctx.saveQuestion / ctx.deleteQuestion (outbox durable, comme partout
     ailleurs dans l'app) ;
   - ConfirmModal (ui.jsx) pour la suppression.
   Jamais de nouvelle fiche créée : tout est rattaché à `ficheId`.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from './Tex.jsx';
import { ConfirmModal } from './ui.jsx';
import { ItemForm, PasteJsonForm, TYPES } from './AddItemForm.jsx';
import { appendItemsToFiche } from '../lib/import.js';
import { toInternalItem } from '../lib/adapter.js';

export function CourseItemsSidebar({ ctx, ficheId }) {
  const ficheItems = useMemo(() => (ctx.db.questions || []).filter((q) => q.ficheId === ficheId), [ctx.db, ficheId]);
  const countByType = useMemo(() => {
    const c = { qcm: 0, flashcard: 0, exercice: 0, feynman: 0 };
    ficheItems.forEach((q) => { if (c[q.type] != null) c[q.type]++; });
    return c;
  }, [ficheItems]);

  const [activeType, setActiveType] = useState('qcm');
  const items = useMemo(() => ficheItems.filter((q) => q.type === activeType), [ficheItems, activeType]);
  const activeLabel = (TYPES.find((t) => t.id === activeType) || {}).label || '';

  // ---- ajout (réutilise ItemForm/PasteJsonForm, même flux que AddItemModal) ----
  const [adding, setAdding] = useState(false);
  const [addSource, setAddSource] = useState('form');
  const [busyAdd, setBusyAdd] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const submitAdd = async (raw) => {
    setBusyAdd(true);
    try {
      await appendItemsToFiche({ ficheId, items: [raw] });
      await ctx.reload();
      setAddedCount((n) => n + 1);
    } finally { setBusyAdd(false); }
  };
  const closeAdd = () => { setAdding(false); setAddedCount(0); setAddSource('form'); };

  // ---- édition inline (même ItemForm, préremplie ; toInternalItem fusionne
  //      le patch dans l'item EXISTANT sans réinitialiser son état SM-2) ----
  const [editingId, setEditingId] = useState(null);
  const [busyEdit, setBusyEdit] = useState(false);
  const submitEdit = async (item, raw) => {
    setBusyEdit(true);
    try {
      const updated = toInternalItem({ ...item, ...raw });
      if (updated) await ctx.saveQuestion(updated);
      setEditingId(null);
    } finally { setBusyEdit(false); }
  };

  // ---- suppression (même canal durable que partout ailleurs) ----
  const [confirmDel, setConfirmDel] = useState(null);
  const doDelete = async () => {
    if (!confirmDel) return;
    await ctx.deleteQuestion(confirmDel.id);
    setConfirmDel(null);
  };

  return (
    <div className="pis">
      <div className="pis-tabs">
        {TYPES.map((t) => (
          <button key={t.id} type="button" className={'pis-tab' + (activeType === t.id ? ' active' : '')}
            onClick={() => { setActiveType(t.id); setAdding(false); setEditingId(null); }}>
            <Icon name={t.icon} size={13} /> {t.label} <span className="pis-tab-n tnum">{countByType[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="pis-scroll scroll">
        {!adding ? (
          <button type="button" className="btn primary sm" style={{ width: '100%', justifyContent: 'center', margin: '12px 0' }} onClick={() => setAdding(true)}>
            <Icon name="plus" size={13} /> Ajouter — {activeLabel}
          </button>
        ) : (
          <div className="pis-add card" style={{ margin: '12px 0' }}>
            <div className="card-body">
              <div className="row spread" style={{ marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Nouvel item — {activeLabel}</span>
                <button type="button" className="cd-ic" onClick={closeAdd} title="Fermer"><Icon name="x" size={12} /></button>
              </div>
              <div className="seg" style={{ marginBottom: 12 }}>
                <button type="button" className={'seg-btn' + (addSource === 'form' ? ' active' : '')} onClick={() => { setAddSource('form'); setAddedCount(0); }}><Icon name="edit" size={12} /> Formulaire</button>
                <button type="button" className={'seg-btn' + (addSource === 'json' ? ' active' : '')} onClick={() => { setAddSource('json'); setAddedCount(0); }}><Icon name="upload" size={12} /> Coller du JSON</button>
              </div>
              {addSource === 'form' ? (
                <>
                  {addedCount > 0 && (
                    <div className="err-mini ok" style={{ marginBottom: 12 }}>
                      <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
                      <div className="em-body"><div className="em-title">{addedCount} item{addedCount > 1 ? 's' : ''} ajouté{addedCount > 1 ? 's' : ''} ✓</div></div>
                    </div>
                  )}
                  <ItemForm type={activeType} onSubmit={submitAdd} busy={busyAdd} onCancel={closeAdd} submitLabel="Ajouter" />
                </>
              ) : (
                <PasteJsonForm ctx={ctx} ficheId={ficheId} done={addedCount} setDone={setAddedCount} />
              )}
            </div>
          </div>
        )}

        <div className="pis-list">
          {items.length === 0 && !adding && (
            <div className="hint" style={{ padding: '14px 4px' }}>Aucun item « {activeLabel} » pour ce cours.</div>
          )}
          {items.map((item) => (
            editingId === item.id ? (
              <div key={item.id} className="pis-item card fadein">
                <div className="card-body">
                  <ItemForm type={item.type} initial={item} submitLabel="Enregistrer" busy={busyEdit}
                    onCancel={() => setEditingId(null)} onSubmit={(raw) => submitEdit(item, raw)} />
                </div>
              </div>
            ) : (
              <ItemReadCard key={item.id} item={item}
                onEdit={() => { setEditingId(item.id); setAdding(false); }}
                onDelete={() => setConfirmDel(item)} />
            )
          ))}
        </div>
      </div>

      {confirmDel && (
        <ConfirmModal
          title="Supprimer cet item ?"
          body="Sera supprimé définitivement (sur tous tes appareils, dès la prochaine synchro). Cette action est irréversible."
          confirmLabel="Supprimer" danger
          onConfirm={doDelete} onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

/* ---- carte de lecture (réponse toujours visible) + Éditer/Supprimer ---- */
function ItemReadCard({ item, onEdit, onDelete }) {
  return (
    <div className="pis-item card">
      <div className="card-body">
        <div className="row spread" style={{ marginBottom: 8, alignItems: 'flex-start', gap: 8 }}>
          <span className="hint" style={{ fontWeight: 700, color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.theme || 'Sans thème'}</span>
          <div className="row" style={{ gap: 4, flex: '0 0 auto' }}>
            <button type="button" className="cd-ic" title="Éditer" onClick={onEdit}><Icon name="edit" size={12} /></button>
            <button type="button" className="cd-ic" title="Supprimer" onClick={onDelete}><Icon name="trash" size={12} /></button>
          </div>
        </div>
        {item.type === 'qcm' && <QcmReadBody item={item} />}
        {item.type === 'flashcard' && <FlashcardReadBody item={item} />}
        {item.type === 'feynman' && <FeynmanReadBody item={item} />}
        {item.type === 'exercice' && <ExerciceReadBody item={item} />}
      </div>
    </div>
  );
}

function QcmReadBody({ item }) {
  const correct = new Set(item.reponses_correctes || []);
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13.5 }}><Tex>{item.enonce}</Tex></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {(item.options || []).map((o) => (
          <div key={o.id} className={'pis-opt' + (correct.has(o.id) ? ' ok' : '')}>
            {correct.has(o.id) ? <Icon name="check" size={12} stroke={3} /> : <span className="pis-opt-dot" />}
            <span><Tex>{o.texte}</Tex></span>
          </div>
        ))}
      </div>
      {item.explication && <div className="hint" style={{ marginTop: 8 }}><Tex>{item.explication}</Tex></div>}
    </>
  );
}

function FlashcardReadBody({ item }) {
  return (
    <>
      <div className="pis-face"><span className="pis-face-tag">Recto</span><Tex>{item.recto}</Tex></div>
      <div className="pis-face"><span className="pis-face-tag">Verso</span><Tex>{item.verso}</Tex></div>
      {item.a_retenir && <div className="hint" style={{ marginTop: 6 }}><strong>À retenir : </strong><Tex>{item.a_retenir}</Tex></div>}
    </>
  );
}

function FeynmanReadBody({ item }) {
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13.5 }}><Tex>{item.consigne}</Tex></div>
      <div className="hint"><Tex>{item.reponse_modele}</Tex></div>
      {(item.points_cles_attendus || []).length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {item.points_cles_attendus.map((p, i) => <li key={i} className="hint"><Tex>{p}</Tex></li>)}
        </ul>
      )}
    </>
  );
}

function ExerciceReadBody({ item }) {
  const numeric = item.sous_type === 'numerique';
  const r = item.reponse || {};
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13.5 }}><Tex>{item.enonce}</Tex></div>
      {numeric
        ? <div className="hint">Réponse : <strong className="tnum">{r.valeur_min} – {r.valeur_max}</strong> {r.unite || ''}</div>
        : (
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {(item.grille_autoevaluation || []).map((g, i) => (
              <li key={i} className="hint"><Tex>{g.critere}</Tex>{g.essentiel && <span className="pill accent" style={{ marginLeft: 6, height: 18, fontSize: 10 }}>essentiel</span>}</li>
            ))}
          </ul>
        )}
      {item.correction && item.correction.conclusion && <div className="hint" style={{ marginTop: 8 }}><Tex>{item.correction.conclusion}</Tex></div>}
    </>
  );
}
