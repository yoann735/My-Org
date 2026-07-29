/* ============================================================
   MedRevise mobile — Feynman. RÉUTILISE feynmanVerdict (lib/sm2.js, aussi
   utilisé par le desktop session/Feynman.jsx) — aucune logique dupliquée,
   présentation neuve : consigne, saisie plein écran, révélation, grille ou
   auto-note.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from '../components/Tex.jsx';
import { index } from '../lib/planning.js';
import { feynmanVerdict } from '../lib/sm2.js';

export function MobileFeynman({ ctx, onQuit }) {
  const payload = ctx.feynman || { items: [], title: 'Feynman' };
  const ix = useMemo(() => index(ctx.db), [ctx.db]);
  const items = payload.items || [];
  const [idx, setIdx] = useState(0);

  if (!items.length) {
    return (
      <div className="mrm-app">
        <div className="mrm-done">
          <Icon name="lightbulb" size={34} />
          <div>Aucun concept Feynman.</div>
          <button type="button" className="mrm-primary-btn" style={{ maxWidth: 220 }} onClick={onQuit}>Retour</button>
        </div>
      </div>
    );
  }

  const item = items[idx];
  const fiche = ix.fById[item.ficheId];
  const isLast = idx >= items.length - 1;

  return (
    <div className="mrm-app">
      <div className="mrm-header">
        <button type="button" className="mrm-quit" onClick={onQuit} aria-label="Quitter"><Icon name="x" size={18} /></button>
        <div className="mrm-progress"><span style={{ width: (idx / items.length) * 100 + '%' }} /></div>
        <span className="mrm-progress-n">{idx + 1} / {items.length}</span>
      </div>
      <div className="mrm-body">
        <FeynmanCard key={item.id} item={item} fiche={fiche}
          onNext={isLast ? onQuit : () => setIdx((i) => i + 1)} isLast={isLast} />
      </div>
    </div>
  );
}

function FeynmanCard({ item, fiche, onNext, isLast }) {
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState({});
  const [selfNote, setSelfNote] = useState(null);
  const [checkedPoints, setCheckedPoints] = useState({}); // synthèse globale — checklist points_cles_attendus
  const grille = item.grille_autoevaluation || [];
  const verdict = feynmanVerdict({ revealed, grille, checked, selfNote });
  // v1.1 — Feynman de SYNTHÈSE GLOBALE : points_cles_attendus devient une checklist.
  const isGlobal = !!item.synthese_globale;
  const points = item.points_cles_attendus || [];

  return (
    <div>
      <div className="mrm-concept">
        {item.theme || item.concept}
        {isGlobal && <span className="mrm-chip-btn" style={{ marginLeft: 8, minHeight: 'auto', padding: '2px 10px', fontSize: 11 }}><Icon name="layers" size={11} /> Synthèse globale</span>}
      </div>
      <div className="mrm-question">
        <Tex>{item.consigne || (isGlobal ? "Explique l'ensemble du cours comme à quelqu'un qui découvre…" : `Explique « ${item.theme || item.concept} »`)}</Tex>
      </div>

      <textarea className="mrm-textarea" style={{ minHeight: 130 }} value={text} readOnly={revealed}
        onChange={(e) => setText(e.target.value)} placeholder="Écris ton explication avec tes mots…" />

      {!revealed ? (
        <button type="button" className="mrm-primary-btn" disabled={!text.trim()} onClick={() => setRevealed(true)}>
          <Icon name="lightbulb" size={16} /> Révéler le modèle
        </button>
      ) : (
        <>
          <div className="mrm-explication" style={{ marginTop: 14 }}>
            <strong>Réponse modèle</strong>
            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}><Tex>{item.reponse_modele}</Tex></div>
          </div>
          {item.analogie_suggeree && (
            <div className="mrm-explication" style={{ marginTop: 10 }}><strong>Analogie</strong><div style={{ marginTop: 6 }}><Tex>{item.analogie_suggeree}</Tex></div></div>
          )}
          {points.length > 0 && (isGlobal ? (
            <div style={{ marginTop: 14 }}>
              <div className="mrm-section-head" style={{ marginBottom: 8 }}>Checklist — coche ce que tu as couvert ({points.filter((_p, i) => checkedPoints[i]).length}/{points.length})</div>
              {points.map((p, i) => (
                <button type="button" key={i} className={'mrm-criterion' + (checkedPoints[i] ? ' on' : '')} onClick={() => setCheckedPoints((c) => ({ ...c, [i]: !c[i] }))}>
                  <input type="checkbox" readOnly checked={!!checkedPoints[i]} />
                  <span><Tex>{p}</Tex></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mrm-explication" style={{ marginTop: 10 }}>
              <strong>Points clés</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{points.map((p, i) => <li key={i}><Tex>{p}</Tex></li>)}</ul>
            </div>
          ))}

          {grille.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div className="mrm-section-head" style={{ marginBottom: 8 }}>Auto-évaluation</div>
              {grille.map((c) => (
                <button type="button" key={c.id} className={'mrm-criterion' + (checked[c.id] ? ' on' : '')} onClick={() => setChecked((ch) => ({ ...ch, [c.id]: !ch[c.id] }))}>
                  <input type="checkbox" readOnly checked={!!checked[c.id]} />
                  <span><Tex>{c.critere}</Tex></span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="button" className={'mrm-btn' + (selfNote === 'ok' ? ' primary' : '')} onClick={() => setSelfNote('ok')}>Réussi</button>
              <button type="button" className={'mrm-btn' + (selfNote === 'ko' ? ' primary' : '')} onClick={() => setSelfNote('ko')}>À revoir</button>
            </div>
          )}

          {verdict && (
            <div className={'mrm-verdict ' + (verdict === 'ok' ? 'ok' : 'ko')}>
              <Icon name={verdict === 'ok' ? 'check' : 'target'} size={18} stroke={2.5} />
              <span>{verdict === 'ok' ? "Réussi — l'essentiel est couvert." : 'À revoir — critères essentiels manquants.'}</span>
            </div>
          )}

          <button type="button" className="mrm-primary-btn" onClick={onNext}>
            {isLast ? <><Icon name="check" size={16} /> Terminer</> : <>Suivant <Icon name="chevR" size={16} /></>}
          </button>
        </>
      )}
    </div>
  );
}
