/* ============================================================
   MedRevise — Carnet d'erreurs v2 (étape 2). Écran dédié (SCREENS.carnet),
   REMPLACE l'ancien Carnet.jsx (CarnetBody, retiré) comme "LE" carnet complet.
   L'ancien mécanisme (missed/weakPoints, planning.js) reste INTACT et vit
   ailleurs (Dashboard RattrapageCard, Reviser ErrorSummary) — complémentaire,
   pas remplacé (stats par fiche pondérées coef vs. cartes précises à
   retravailler ici).

   Vocabulaire : V1 = flashcard normale en carnet (carnetAt non-null, étape 1).
   V2 = "flashcard d'erreur" liée à sa V1 par sourceErrorId (type
   'flashcard_erreur', storage.js#newErrorCard) — jamais de plan/cursor,
   jamais dans un cycle J, catégorisée à_revoir/resolu/pause (ctx.setV2Statut).

   Flux : Extraire (JSON figé, copié vers un prompt EXTERNE) → l'utilisateur
   colle le retour du prompt ici → validé par lib/parseErrorCardsJson.js →
   ctx.createErrorCards. Aucun appel réseau/IA dans l'app à aucun moment.

   "Ajouter une flashcard d'erreur" est déclenché DEPUIS chaque V1 (bouton sur
   sa ligne, à côté d'Extraire), PAS un bouton global : l'app connaît alors
   l'id RÉEL de la V1 cible et rattache les cartes créées à celle-ci,
   indépendamment du source_error_id du JSON collé (filet non bloquant, voir
   parseErrorCardsJson.js) — évite le rejet "source_error_id inconnu" quand le
   prompt externe a mal recopié/halluciné l'id.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, Modal } from '../components/ui.jsx';
import { ImportJsonField } from '../components/ImportFlow.jsx';
import { carnetV1Questions, carnetV2Questions } from '../lib/planning.js';
import { parseErrorCardsJson } from '../lib/parseErrorCardsJson.js';

const trunc = (s, n) => (s && s.length > n ? s.slice(0, n).trim() + '…' : s);

export function CarnetDashboard({ ctx }) {
  const { db } = ctx;
  const v1s = carnetV1Questions(db);
  const v2All = carnetV2Questions(db);
  const aRevoir = v2All.filter((v) => v.statut === 'a_revoir');
  const resolu = v2All.filter((v) => v.statut === 'resolu');
  const pause = v2All.filter((v) => v.statut === 'pause');
  const v1ById = Object.fromEntries(v1s.map((v) => [v.id, v]));

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Carnet d'erreurs</h1>
          <div className="sub">Tes flashcards loupées 2 fois de suite, et les cartes d'erreur ciblées qui en découlent.</div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={() => ctx.go('revise')}><Icon name="chevL" size={16} /> Retour</button>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      <div className="row" style={{ gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={!aRevoir.length}
          onClick={() => ctx.startSession(aRevoir, "Mes flashcards d'erreur", { mode: 'erreur' })}>
          <Icon name="play" size={15} fill /> Réviser mes flashcards d'erreur ({aRevoir.length})
        </button>
      </div>

      <Card title="Mes erreurs (V1)" icon="target" action={<span className="pill">{v1s.length}</span>}>
        {!v1s.length ? (
          <div className="err-empty"><Icon name="check" size={26} stroke={2.5} /><div>Aucune flashcard en carnet pour l'instant.</div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {v1s.map((v1, i) => <V1Row key={v1.id} v1={v1} v2Count={v2All.filter((v) => v.sourceErrorId === v1.id).length} first={i === 0} ctx={ctx} />)}
          </div>
        )}
      </Card>

      <div className="dash-grid" style={{ marginTop: 18 }}>
        <div className="dash-grid-col">
          <Card title="À revoir" icon="clock" action={<span className="pill accent">{aRevoir.length}</span>}>
            <V2List v2s={aRevoir} v1ById={v1ById} ctx={ctx} empty="Aucune flashcard d'erreur à revoir." actions="a_revoir" />
          </Card>
        </div>
        <div className="dash-grid-col">
          <Card title="Résolu" icon="check" action={<span className="pill">{resolu.length}</span>}>
            <V2List v2s={resolu} v1ById={v1ById} ctx={ctx} empty="Rien de résolu pour l'instant." actions="resolu" />
          </Card>
        </div>
      </div>

      {pause.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Card title="En pause" icon="bellOff" action={<span className="pill">{pause.length}</span>}>
            <V2List v2s={pause} v1ById={v1ById} ctx={ctx} empty="" actions="pause" />
          </Card>
        </div>
      )}
    </div>
  );
}

/* ---- une V1 (flashcard normale en carnet) : recto/verso + raison + boutons
   Extraire (JSON figé, copiable — format FIXE, ne pas changer les clés) ET
   Ajouter (ouvre le collage JSON EN CONTEXTE de cette V1 — voir
   AddErrorCardModal, rattachement par targetV1Id, pas par le JSON). ---- */
function V1Row({ v1, v2Count, first, ctx }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const json = JSON.stringify({
    type: 'erreur_source', flashcard_id: v1.id,
    recto: v1.recto, verso: v1.verso, raison_echec: v1.carnetRaison || '',
  }, null, 2);
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { /* ignore */ }
  };
  return (
    <div className="err-line" style={{ borderTop: first ? 'none' : undefined, flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div className="el-main">
          <div className="el-q">{trunc(v1.recto, 90)}</div>
          <div className="hint" style={{ marginTop: 4 }}>{trunc(v1.verso, 110)}</div>
          {v1.carnetRaison && <div className="hint" style={{ marginTop: 6 }}><Icon name="edit" size={11} /> {v1.carnetRaison}</div>}
          {v2Count > 0 && <div className="hint" style={{ marginTop: 4, fontSize: 11 }}>{v2Count} flashcard{v2Count > 1 ? 's' : ''} d'erreur liée{v2Count > 1 ? 's' : ''}</div>}
        </div>
        <div className="el-actions" style={{ flexWrap: 'wrap' }}>
          <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? 'chevU' : 'upload'} size={13} /> {open ? 'Masquer' : 'Extraire'}
          </button>
          <button className="btn ghost sm" onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={13} /> Ajouter
          </button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <pre className="imp-title" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 }}>{json}</pre>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copié ✓' : 'Copier'}
          </button>
        </div>
      )}
      {showAdd && <AddErrorCardModal ctx={ctx} v1={v1} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

/* ---- liste de V2, groupées par V1 — actions selon la catégorie affichée. ---- */
function V2List({ v2s, v1ById, ctx, empty, actions }) {
  if (!v2s.length) return empty ? <div className="hint">{empty}</div> : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {v2s.map((v2, i) => {
        const v1 = v1ById[v2.sourceErrorId];
        return (
          <div className="err-line" key={v2.id} style={{ borderTop: i ? '1px solid var(--border-2)' : 'none' }}>
            <div className="el-main">
              {v1 && <div className="el-concept">{trunc(v1.recto, 60)}{v2.angle && <span className="em-chip" style={{ marginLeft: 6 }}>{v2.angle}</span>}</div>}
              <div className="el-q">{trunc(v2.recto, 90)}</div>
              <div className="hint" style={{ marginTop: 4 }}>{trunc(v2.verso, 110)}</div>
            </div>
            <div className="el-actions" style={{ flexWrap: 'wrap' }}>
              {actions === 'a_revoir' && (
                <>
                  <button className="btn ghost sm" onClick={() => ctx.setV2Statut(v2.id, 'resolu')}><Icon name="check" size={13} /> Résolu</button>
                  <button className="icon-btn sm" title="Mettre en pause" style={{ color: 'var(--text-3)' }} onClick={() => ctx.setV2Statut(v2.id, 'pause')}><Icon name="bellOff" size={14} /></button>
                </>
              )}
              {actions === 'resolu' && (
                <button className="btn ghost sm" onClick={() => ctx.setV2Statut(v2.id, 'a_revoir')}><Icon name="refresh" size={13} /> À revoir</button>
              )}
              {actions === 'pause' && (
                <button className="btn ghost sm" onClick={() => ctx.setV2Statut(v2.id, 'a_revoir')}><Icon name="refresh" size={13} /> À revoir</button>
              )}
              <button className="icon-btn sm" title="Supprimer" style={{ color: 'var(--text-3)' }} onClick={() => ctx.deleteQuestion(v2.id)}><Icon name="trash" size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- "Ajouter une flashcard d'erreur" : colle le JSON renvoyé par le prompt
   EXTERNE (aucun appel réseau/IA ici). RÉUTILISE ImportJsonField tel quel
   (components/ImportFlow.jsx, même brique que l'import standard) — validateur
   DÉDIÉ (parseErrorCardsJson), pas parsePastedJson (V2 hors vocabulaire
   v1.0/fiches). Déclenchée DEPUIS une V1 précise (V1Row) : `v1` fournit l'id
   RÉEL utilisé pour le rattachement — le source_error_id du JSON collé n'est
   qu'un filet non bloquant, jamais un motif de rejet (voir
   lib/parseErrorCardsJson.js). Aperçu (créées/ignorées) avant confirmation,
   jamais de crash sur un JSON mal formé ou sans recto/verso. ---- */
function AddErrorCardModal({ ctx, v1, onClose }) {
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState(null);
  const [preview, setPreview] = useState(null); // { cards, counts }
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  const analyse = () => {
    const res = parseErrorCardsJson(jsonText, v1.id);
    if (!res.ok) { setParseError(res.error); setPreview(null); return; }
    if (!res.cards.length) {
      // dit LAQUELLE et POURQUOI, pas un total générique — voir parseErrorCardsJson#errors.
      const detail = res.errors.map((e) => `carte ${e.index} : ${e.reason}`).join(' · ');
      setParseError(detail ? `Aucune flashcard d'erreur valide (${detail}).` : "Aucune flashcard d'erreur valide trouvée.");
      setPreview(null); return;
    }
    setParseError(null);
    setPreview(res);
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const n = await ctx.createErrorCards(preview.cards);
      setDone((d) => d + n);
      setJsonText(''); setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Ajouter une flashcard d'erreur — ${trunc(v1.recto, 50)}`} onClose={onClose} width="min(640px, 94vw)">
      <div className="hint" style={{ marginBottom: 12 }}>
        Colle ici le JSON renvoyé par ton prompt externe (une ou plusieurs cartes). Elles seront rattachées à cette erreur, même si le JSON ne porte pas de <code>source_error_id</code> (ou un id incorrect).
      </div>
      {done > 0 && (
        <div className="err-mini ok" style={{ marginBottom: 12 }}>
          <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
          <div className="em-body"><div className="em-title">{done} flashcard{done > 1 ? 's' : ''} d'erreur ajoutée{done > 1 ? 's' : ''} ✓</div><div className="hint">Rangée{done > 1 ? 's' : ''} en "À revoir".</div></div>
        </div>
      )}
      {!preview ? (
        <>
          <ImportJsonField label="JSON collé" placeholder='{"cartes_erreur":[{"recto":"...","verso":"..."}]}' value={jsonText} onChange={(v) => { setJsonText(v); setParseError(null); }} error={parseError} />
          <div className="imp-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn primary" disabled={!jsonText.trim()} onClick={analyse}><Icon name="upload" size={14} /> Analyser</button>
          </div>
        </>
      ) : (
        <div className="fadein">
          <div className="err-mini ok" style={{ marginBottom: 14 }}>
            <div className="em-ic"><Icon name="check" size={16} stroke={2.5} /></div>
            <div className="em-body">
              <div className="em-title">{preview.counts.created} flashcard{preview.counts.created > 1 ? 's' : ''} d'erreur détectée{preview.counts.created > 1 ? 's' : ''}</div>
              {preview.errors.length > 0 && (
                <div className="hint" style={{ marginTop: 4, color: 'var(--accent-2)' }}>
                  <Icon name="alert" size={12} /> {preview.errors.length} ignorée{preview.errors.length > 1 ? 's' : ''} :
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {preview.errors.map((e, i) => <li key={i}>Carte {e.index} : {e.reason}</li>)}
                  </ul>
                </div>
              )}
              {preview.counts.mismatched > 0 && (
                <div className="hint" style={{ marginTop: 4 }}>
                  <Icon name="info" size={12} /> {preview.counts.mismatched} carte{preview.counts.mismatched > 1 ? 's' : ''} portai{preview.counts.mismatched > 1 ? 'ent' : 't'} un autre id dans le JSON — rattachée{preview.counts.mismatched > 1 ? 's' : ''} ici quand même.
                </div>
              )}
            </div>
          </div>
          <div className="imp-actions">
            <button className="btn ghost" onClick={() => setPreview(null)}>Annuler</button>
            <button className="btn primary" onClick={confirm} disabled={busy}><Icon name="check" size={15} /> Confirmer l'ajout</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
