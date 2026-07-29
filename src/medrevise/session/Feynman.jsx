/* ============================================================
   MedRevise — mode Feynman v1.0, AUTO-ÉVALUÉ (aucun appel IA/réseau).
   Flux : consigne → saisie libre → révélation du modèle (reponse_modele,
   points_cles_attendus, analogie_suggeree, erreurs_frequentes) →
   l'étudiant coche la grille_autoevaluation → verdict selon regle_reussite
   (tous les critères "essentiel" validés). Fiches Feynman héritées (sans
   grille) : repli sur une auto-note simple Réussi / À revoir.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Breadcrumb, EdTop, matiereMeta, EtiquetteQuickSet } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { index } from '../lib/planning.js';
import { feynmanVerdict } from '../lib/sm2.js';

export function Feynman({ ctx }) {
  const payload = ctx.feynman || { items: [], title: 'Feynman' };
  const ix = useMemo(() => index(ctx.db), [ctx.db]);
  const items = payload.items || [];
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState({}); // { [critereId]: bool }
  const [selfNote, setSelfNote] = useState(null); // repli sans grille : 'ok' | 'ko'
  const [checkedPoints, setCheckedPoints] = useState({}); // { [pointIndex]: bool } — synthèse globale (checklist points_cles_attendus)

  if (!items.length) {
    return (
      <div className="screen scroll fadein">
        <div className="rev-empty" style={{ marginTop: 60 }}>
          <Icon name="lightbulb" size={30} /><div className="re-title">Aucun concept Feynman</div>
          <button className="btn primary" onClick={() => ctx.go('revise')}>Retour</button>
        </div>
      </div>
    );
  }

  const item = items[idx];
  const fiche = ix.fById[item.ficheId];
  const meta = matiereMeta(fiche && ix.mById[fiche.matiereId]);
  const grille = item.grille_autoevaluation || [];
  const essentiels = grille.filter((c) => c.essentiel);
  // v1.1 — Feynman de SYNTHÈSE GLOBALE : "points_cles_attendus" devient une
  // checklist de must-have (au lieu d'une simple liste à puces).
  const isGlobal = !!item.synthese_globale;
  const points = item.points_cles_attendus || [];

  const reset = () => { setText(''); setRevealed(false); setChecked({}); setSelfNote(null); setCheckedPoints({}); };
  const go = (d) => { setIdx((i) => Math.min(items.length - 1, Math.max(0, i + d))); reset(); };
  const toggle = (id) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const togglePoint = (i) => setCheckedPoints((c) => ({ ...c, [i]: !c[i] }));

  // verdict : "tous_essentiels" → tous les critères essentiels cochés.
  // Sans grille (Feynman hérité) → auto-note manuelle. Partagé avec le
  // Feynman mobile (mobile/MobileFeynman.jsx) via lib/sm2.js.
  const verdict = feynmanVerdict({ revealed, grille, checked, selfNote });

  return (
    <div className="screen scroll fadein">
      <div className="ctx-bar">
        <div style={{ minWidth: 0 }}>
          <Breadcrumb parts={['Réviser', meta.label, (fiche && fiche.titre) || payload.title, 'Feynman']} />
          <div className="row" style={{ gap: 10, marginTop: 9 }}>
            <span className="rp-count tnum">{idx + 1} / {items.length}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={() => ctx.go('revise')}><Icon name="x" size={16} /> Quitter</button>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      <div className={'card' + (isGlobal ? ' fey-global' : '')} style={{ maxWidth: 820, margin: '0 auto' }}>
        <div className="card-body">
          <div className="rev-concept">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.tint, display: 'inline-block' }} /> {meta.label} · {item.theme || item.concept}
            {isGlobal && <span className="pill accent" style={{ marginLeft: 8, height: 22 }}><Icon name="layers" size={11} /> Synthèse globale</span>}
          </div>
          <div className="serif" style={{ fontSize: 22, margin: '8px 0 4px' }}>
            <Tex>{item.consigne || (isGlobal ? "Explique l'ensemble du cours comme à quelqu'un qui découvre…" : `Explique « ${item.theme || item.concept} »`)}</Tex>
          </div>
          <div className="hint" style={{ marginBottom: 8 }}>{isGlobal ? 'Explique tout le cours de bout en bout, avec tes propres mots, puis compare-toi au modèle.' : 'Explique avec tes propres mots, puis compare-toi au modèle.'}</div>

          {fiche && fiche.synthese && (
            <details className="rev-synthese" style={{ margin: '10px 0 2px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="lightbulb" size={14} /> Synthèse du cours
              </summary>
              <div className="hint" style={{ marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}><Tex>{fiche.synthese}</Tex></div>
            </details>
          )}

          <textarea className="imp-title" style={{ minHeight: 150, resize: 'vertical', fontFamily: 'inherit', width: '100%', marginTop: 12 }}
            placeholder="Écris ton explication avec tes mots…" value={text} onChange={(e) => setText(e.target.value)} readOnly={revealed} />

          {!revealed && (
            <div className="row spread" style={{ marginTop: 14 }}>
              <button className="btn ghost" onClick={() => go(-1)} disabled={idx === 0}><Icon name="chevL" size={15} /> Précédent</button>
              <button className="btn primary lg" onClick={() => setRevealed(true)} disabled={!text.trim()}><Icon name="lightbulb" size={15} /> Révéler le modèle</button>
              <button className="btn ghost" onClick={() => go(1)} disabled={idx >= items.length - 1}>Suivant <Icon name="chevR" size={15} /></button>
            </div>
          )}

          {revealed && (
            <div className="fadein" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <RevealBlock icon="check" title="Réponse modèle">
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}><Tex>{item.reponse_modele}</Tex></div>
              </RevealBlock>

              {item.analogie_suggeree && (
                <RevealBlock icon="lightbulb" title="Analogie suggérée">
                  <div style={{ lineHeight: 1.6 }}><Tex>{item.analogie_suggeree}</Tex></div>
                </RevealBlock>
              )}

              {points.length > 0 && (isGlobal ? (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Icon name="list" size={15} /> Checklist — coche ce que tu as couvert
                    <span className="hint" style={{ marginLeft: 'auto' }}>{points.filter((_p, i) => checkedPoints[i]).length}/{points.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {points.map((p, i) => (
                      <label key={i} className="fey-crit" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '8px 10px', borderRadius: 9, background: checkedPoints[i] ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (checkedPoints[i] ? 'var(--accent)' : 'var(--border)') }}>
                        <input type="checkbox" checked={!!checkedPoints[i]} onChange={() => togglePoint(i)} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
                        <span style={{ fontSize: 14 }}><Tex>{p}</Tex></span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <RevealBlock icon="list" title="Points clés attendus">
                  <ul className="fey-list" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>{points.map((p, i) => <li key={i}><Tex>{p}</Tex></li>)}</ul>
                </RevealBlock>
              ))}

              {(item.erreurs_frequentes || []).length > 0 && (
                <RevealBlock icon="alert" title="Erreurs fréquentes" tint="var(--accent-2)">
                  <ul className="fey-list" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>{item.erreurs_frequentes.map((p, i) => <li key={i}><Tex>{p}</Tex></li>)}</ul>
                </RevealBlock>
              )}

              {/* auto-évaluation */}
              {grille.length > 0 ? (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Icon name="check" size={15} /> Auto-évaluation — coche ce que tu as bien couvert
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {grille.map((c) => (
                      <label key={c.id} className="fey-crit" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '8px 10px', borderRadius: 9, background: checked[c.id] ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (checked[c.id] ? 'var(--accent)' : 'var(--border)') }}>
                        <input type="checkbox" checked={!!checked[c.id]} onChange={() => toggle(c.id)} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
                        <span style={{ fontSize: 14 }}>
                          <Tex>{c.critere}</Tex>
                          {c.essentiel && <span className="pill accent" style={{ marginLeft: 8, height: 20, fontSize: 11 }}>essentiel</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Comment t'en es-tu sorti ?</div>
                  <div className="row" style={{ gap: 10 }}>
                    <button className={'btn' + (selfNote === 'ok' ? ' primary' : '')} onClick={() => setSelfNote('ok')}><Icon name="check" size={15} /> Réussi</button>
                    <button className={'btn' + (selfNote === 'ko' ? ' primary' : '')} onClick={() => setSelfNote('ko')}><Icon name="refresh" size={15} /> À revoir</button>
                  </div>
                </div>
              )}

              {verdict && (
                <div className={'err-mini' + (verdict === 'ok' ? ' ok' : '')} style={{ alignItems: 'center' }}>
                  <div className={'em-ic' + (verdict === 'ok' ? '' : ' crit')}><Icon name={verdict === 'ok' ? 'check' : 'target'} size={18} stroke={2.5} /></div>
                  <div className="em-body">
                    <div className="em-title">{verdict === 'ok' ? 'Réussi — tu as couvert l\'essentiel.' : 'À revoir — il manque des critères essentiels.'}</div>
                    {grille.length > 0 && essentiels.length > 0 && (
                      <div className="hint">{essentiels.filter((c) => checked[c.id]).length}/{essentiels.length} critère(s) essentiel(s) validé(s).</div>
                    )}
                  </div>
                </div>
              )}

              {/* proposition (non bloquante) en fin de série, sur la fiche du dernier concept */}
              {verdict && idx >= items.length - 1 && fiche && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card-2)' }}>
                  <EtiquetteQuickSet value={fiche.etiquette} onChange={(v) => ctx.setFicheEtiquette(fiche.id, v)} />
                </div>
              )}

              <div className="row spread" style={{ marginTop: 4 }}>
                <button className="btn ghost" onClick={() => go(-1)} disabled={idx === 0}><Icon name="chevL" size={15} /> Précédent</button>
                <button className="btn" onClick={reset}><Icon name="refresh" size={14} /> Recommencer</button>
                <button className="btn primary" onClick={() => go(1)} disabled={idx >= items.length - 1}>Suivant <Icon name="chevR" size={15} /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RevealBlock({ icon, title, tint, children }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 7, color: tint || 'var(--text)' }}>
        <Icon name={icon} size={14} /> {title}
      </div>
      <div className="hint" style={{ fontSize: 14, color: 'var(--text-2)' }}>{children}</div>
    </div>
  );
}
