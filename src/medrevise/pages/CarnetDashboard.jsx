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
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, Modal, ConfirmModal, matiereMeta } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { ImportJsonField } from '../components/ImportFlow.jsx';
import { carnetV1Questions, carnetV2Questions, index } from '../lib/planning.js';
import { parseErrorCardsJson } from '../lib/parseErrorCardsJson.js';

const trunc = (s, n) => (s && s.length > n ? s.slice(0, n).trim() + '…' : s);
// affichage LISTE (pas la carte de révision elle-même, qui a déjà son propre
// rendu cloze interactif via ClassicFlashCard/ClozeRecto) : les {{mots}} de
// cloze sont ici juste dépliés en texte normal (pas de trou à remplir dans un
// aperçu), PUIS rendu via <Tex> pour le LaTeX ($...$/$$...$$, KaTeX déjà
// utilisé partout ailleurs dans l'app). Dépliage AVANT troncature pour ne
// jamais couper une accolade en plein milieu.
const stripCloze = (s) => (s || '').replace(/\{\{([^{}]+)\}\}/g, '$1');
const previewText = (s, n) => trunc(stripCloze(s), n);
// carte V1 (redesign) : question ET réponse en ENTIER, jamais tronquées —
// nettoyées (cloze déplié) et rendues KaTeX, mais aucune troncature ici,
// contrairement à previewText (listes V2, volontairement compactes).
const cleanFull = (s) => stripCloze(s);

export function CarnetDashboard({ ctx }) {
  const { db } = ctx;
  const ix = useMemo(() => index(db), [db]);
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

      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="target" size={17} />
        <h2 className="serif" style={{ fontSize: 18, margin: 0 }}>Mes erreurs (V1)</h2>
        <span className="pill">{v1s.length}</span>
      </div>
      {!v1s.length ? (
        <Card><div className="err-empty"><Icon name="check" size={26} stroke={2.5} /><div>Aucune flashcard en carnet pour l'instant.</div></div></Card>
      ) : (
        v1s.map((v1) => {
          const fiche = ix.fById[v1.ficheId];
          const matiere = fiche && ix.mById[fiche.matiereId];
          return (
            <V1Row key={v1.id} v1={v1} v2Count={v2All.filter((v) => v.sourceErrorId === v1.id).length}
              fiche={fiche} matiere={matiere} ctx={ctx} />
          );
        })
      )}

      <div className="dash-grid" style={{ marginTop: 18 }}>
        <div className="dash-grid-col">
          <Card title="À revoir" icon="clock" action={<span className="pill accent">{aRevoir.length}</span>}>
            <V2Groups v2s={aRevoir} v1ById={v1ById} ctx={ctx} empty="Aucune flashcard d'erreur à revoir." actions="a_revoir" showRevise />
          </Card>
        </div>
        <div className="dash-grid-col">
          <Card title="Résolu" icon="check" action={<span className="pill">{resolu.length}</span>}>
            <V2Groups v2s={resolu} v1ById={v1ById} ctx={ctx} empty="Rien de résolu pour l'instant." actions="resolu" />
          </Card>
        </div>
      </div>

      {pause.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Card title="En pause" icon="bellOff" action={<span className="pill">{pause.length}</span>}>
            <V2Groups v2s={pause} v1ById={v1ById} ctx={ctx} empty="" actions="pause" />
          </Card>
        </div>
      )}
    </div>
  );
}

/* ---- une V1 (flashcard normale en carnet) — carte COMPACTE : hiérarchie par
   typo (taille/gris), pas par des cadres. Question KaTeX pleine (courte,
   1 flashcard) ; réponse + note d'erreur en texte simple, condensées à 1-2
   lignes visuellement (lc-1/lc-2, le texte complet reste dans le DOM — rien
   n'est perdu, juste moins étalé). Cours d'appartenance + boutons Voir le
   cours/Extraire/Ajouter/Supprimer inchangés dans leur fonction, juste plus
   denses. Supprimer = ctx.removeFromCarnet (carnetAt/carnetRaison → null +
   cascade suppression des V2 liées). ---- */
function V1Row({ v1, v2Count, fiche, matiere, ctx }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const json = JSON.stringify({
    type: 'erreur_source', flashcard_id: v1.id,
    recto: v1.recto, verso: v1.verso, raison_echec: v1.carnetRaison || '',
  }, null, 2);
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { /* ignore */ }
  };
  const meta = matiereMeta(matiere);
  const hasHtml = !!(fiche && fiche.htmlId);
  const viewCours = () => { if (fiche) ctx.openPdfReader(fiche.id, 'read', 'carnet', 'html'); };

  return (
    <div className="card err-v1-card">
      <div className="card-body">
        {/* cours d'appartenance — ligne meta discrète, pas un pill imposant */}
        <div className="err-v1-meta">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.tint, flex: '0 0 auto' }} />
          <span>{fiche ? fiche.titre : 'Cours introuvable'}{fiche ? ` · ${meta.label}` : ''}</span>
        </div>

        {/* question — texte normal, pas de cadre */}
        <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.45, color: 'var(--text)' }}>
          <Tex>{cleanFull(v1.recto)}</Tex>
        </div>

        {/* réponse — texte simple, gris, condensée à 2 lignes visuellement */}
        <div className="err-v1-a lc-2"><Tex>{cleanFull(v1.verso)}</Tex></div>

        {/* note d'erreur — libellé discret, pas de fond coloré */}
        {v1.carnetRaison && (
          <div className="err-v1-note lc-1"><span className="err-v1-note-label">Ma note</span>{v1.carnetRaison}</div>
        )}

        {v2Count > 0 && <div className="hint" style={{ marginTop: 4, fontSize: 11 }}>{v2Count} flashcard{v2Count > 1 ? 's' : ''} d'erreur liée{v2Count > 1 ? 's' : ''}</div>}

        {/* actions */}
        <div className="err-v1-actions">
          {hasHtml && (
            <button className="btn ghost sm" onClick={viewCours} title="Ouvrir la fiche HTML du cours">
              <Icon name="fileHtml" size={13} /> Voir le cours
            </button>
          )}
          <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? 'chevU' : 'upload'} size={13} /> {open ? 'Masquer' : 'Extraire'}
          </button>
          <button className="btn ghost sm" onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={13} /> Ajouter
          </button>
          <button className="icon-btn sm" title="Retirer du carnet" style={{ color: 'var(--text-3)', marginLeft: 'auto' }} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={14} /></button>
        </div>
        {open && (
          <div style={{ marginTop: 8 }}>
            <pre className="imp-title" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 }}>{json}</pre>
            <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copié ✓' : 'Copier'}
            </button>
          </div>
        )}
      </div>
      {showAdd && <AddErrorCardModal ctx={ctx} v1={v1} onClose={() => setShowAdd(false)} />}
      {confirmDelete && (
        <ConfirmModal
          title="Retirer cette flashcard du carnet ?"
          body={v2Count > 0
            ? `La flashcard reste intacte dans son cycle J normal, elle sort juste du carnet d'erreurs. Ses ${v2Count} flashcard${v2Count > 1 ? 's' : ''} d'erreur liée${v2Count > 1 ? 's' : ''} ${v2Count > 1 ? 'seront supprimées' : 'sera supprimée'} aussi — comme si cette erreur n'avait jamais existé dans le carnet.`
            : "La flashcard reste intacte dans son cycle J normal, elle sort juste du carnet d'erreurs."}
          confirmLabel="Retirer"
          danger
          onConfirm={() => { ctx.removeFromCarnet(v1.id); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

/* ---- V2 "à revoir"/"résolu"/"pause", GROUPÉES sous leur V1 d'origine (un
   en-tête par V1 + ses V2 en dessous) — plus lisible qu'un vrac plat. Bouton
   "Réviser ces cartes" par groupe (showRevise, section "À revoir" seulement) :
   lance la série UNIQUEMENT avec les V2 de CETTE V1 (même mode 'erreur' que
   le bouton global). V2 sans V1 résolvable (cas défensif, rare) : regroupées
   sous un en-tête générique plutôt que de disparaître. ---- */
function V2Groups({ v2s, v1ById, ctx, empty, actions, showRevise }) {
  if (!v2s.length) return empty ? <div className="hint">{empty}</div> : null;
  const groups = [];
  const byV1 = new Map();
  v2s.forEach((v2) => {
    const key = v2.sourceErrorId;
    let g = byV1.get(key);
    if (!g) { g = { v1: v1ById[key] || null, items: [] }; byV1.set(key, g); groups.push(g); }
    g.items.push(v2);
  });
  return (
    <div>
      {groups.map((g, gi) => (
        <div className="err-course" key={g.v1 ? g.v1.id : 'orphelines-' + gi}>
          <div className="err-course-head">
            <span className="ec-bar" style={{ background: 'var(--accent)' }} />
            <span className="ec-title">{g.v1 ? <Tex>{previewText(g.v1.recto, 60)}</Tex> : 'Autres flashcards d\'erreur'}</span>
            <span className="ec-badge tnum">{g.items.length} carte{g.items.length > 1 ? 's' : ''}</span>
            {showRevise && (
              <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => ctx.startSession(g.items, g.v1 ? previewText(g.v1.recto, 40) : 'Mes flashcards d\'erreur', { mode: 'erreur' })}>
                <Icon name="play" size={12} fill /> Réviser ces cartes
              </button>
            )}
          </div>
          {g.items.map((v2, i) => (
            <div className="err-line" key={v2.id} style={{ borderTop: i ? '1px solid var(--border-2)' : 'none' }}>
              <div className="el-main">
                {v2.angle && <div className="el-concept"><span className="em-chip">{v2.angle}</span></div>}
                <div className="el-q"><Tex>{previewText(v2.recto, 90)}</Tex></div>
                <div className="hint" style={{ marginTop: 4 }}><Tex>{previewText(v2.verso, 110)}</Tex></div>
              </div>
              <div className="el-actions" style={{ flexWrap: 'wrap' }}>
                {actions === 'a_revoir' && (
                  <>
                    <button className="btn ghost sm" onClick={() => ctx.setV2Statut(v2.id, 'resolu')}><Icon name="check" size={13} /> Résolu</button>
                    <button className="icon-btn sm" title="Mettre en pause" style={{ color: 'var(--text-3)' }} onClick={() => ctx.setV2Statut(v2.id, 'pause')}><Icon name="bellOff" size={14} /></button>
                  </>
                )}
                {(actions === 'resolu' || actions === 'pause') && (
                  <button className="btn ghost sm" onClick={() => ctx.setV2Statut(v2.id, 'a_revoir')}><Icon name="refresh" size={13} /> À revoir</button>
                )}
                <button className="icon-btn sm" title="Supprimer" style={{ color: 'var(--text-3)' }} onClick={() => ctx.deleteQuestion(v2.id)}><Icon name="trash" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ))}
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
    <Modal title={`Ajouter une flashcard d'erreur — ${previewText(v1.recto, 50)}`} onClose={onClose} width="min(640px, 94vw)">
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
