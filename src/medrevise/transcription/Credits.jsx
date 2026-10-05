/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : affichage des crédits Deepgram (v1.1).
   - CreditsPastille : « ≈ 612 h restantes » dans l'en-tête du panneau Transcript,
     détail au survol / focus (solde, consommé, tarif effectif, source, mise à jour) ;
   - CreditsFeuille  : ligne de la feuille « Transcrire » ;
   - CarteCreditsTranscription : carte des Réglages, avec « Actualiser ».
   Tons neutres ; ambre sous 20 h, rouge sous 5 h (« Pense à recharger Deepgram »).
   Aucune donnée → rien d'affiché (pastille) ou un message calme (feuille, réglages).
   ============================================================ */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { Card } from '../components/ui.jsx';
import { abonnerCredits, lireCredits, actualiserCredits, niveauCredits, fmtUsd, fmtHeures, fmtQuand } from './credits.js';

export const useCredits = () => useSyncExternalStore(abonnerCredits, lireCredits);

function Detail({ d }) {
  const estimation = d.source !== 'balance';
  return (
    <div className="trx-credits-detail">
      <div className="trx-cd-ligne"><span>Solde{estimation ? ' (estimation)' : ''}</span><b className="tnum">{fmtUsd(d.remainingUsd)}</b></div>
      <div className="trx-cd-ligne"><span>Consommé</span><b className="tnum">{fmtUsd(d.spentUsd)}{d.hoursUsed != null ? ` · ${fmtHeures(d.hoursUsed)}` : ''}</b></div>
      <div className="trx-cd-ligne"><span>Tarif effectif</span><b className="tnum">{fmtUsd(d.effectiveRateUsdPerHour)} / h</b></div>
      <div className="trx-cd-ligne"><span>Restant</span><b className="tnum">≈ {fmtHeures(d.estimatedHoursLeft)}</b></div>
      <div className="trx-cd-note">
        {estimation
          ? `Estimation : solde initial − ${d.spentSource === 'billing' ? 'dépense facturée' : 'heures × 0,0048 $/min'} (la clé ne permet pas de lire le solde).`
          : 'Solde lu sur le compte Deepgram.'}
        {d.hoursUsed != null && d.hoursUsed < 0.5 ? ' Tarif par défaut (0,29 $/h) tant que moins de 30 min ont été transcrites.' : ''}
      </div>
      <div className="trx-cd-note">Mis à jour {fmtQuand(d.updatedAt)}{d.stale ? ' — dernière valeur connue (Deepgram injoignable)' : ''}.</div>
    </div>
  );
}

/** Pastille de l'en-tête du panneau. */
export function CreditsPastille() {
  const { donnees: d } = useCredits();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  if (!d) return null;
  const niveau = niveauCredits(d.estimatedHoursLeft);
  const ouvrir = () => {
    const r = ref.current && ref.current.getBoundingClientRect();
    if (r) setPos({ x: Math.max(8, Math.min(r.right - 280, window.innerWidth - 288)), y: r.bottom + 6 });
  };
  return (
    <>
      <span ref={ref} className={'trx-credits ' + niveau + (d.stale ? ' stale' : '')} tabIndex={0}
        onMouseEnter={ouvrir} onMouseLeave={() => setPos(null)} onFocus={ouvrir} onBlur={() => setPos(null)}
        aria-label={`Crédits Deepgram : environ ${fmtHeures(d.estimatedHoursLeft)} restantes`}>
        {niveau !== 'ok' && <Icon name="alert" size={11} />}≈ {fmtHeures(d.estimatedHoursLeft)} restantes
      </span>
      {pos && createPortal(
        <div className="trx-credits-pop" style={{ left: pos.x, top: pos.y }} role="tooltip">
          {niveau === 'critique' && <div className="trx-cd-alerte">Pense à recharger Deepgram.</div>}
          <Detail d={d} />
        </div>,
        document.body,
      )}
    </>
  );
}

/** Ligne « Il te reste ≈ … » de la feuille de démarrage. */
export function CreditsFeuille() {
  const { donnees: d, erreur } = useCredits();
  if (!d) {
    if (!erreur) return null;
    return <div className="trx-credits-ligne"><Icon name="info" size={13} /> Crédits Deepgram indisponibles ({erreur.message.replace(/\.$/, '')}).</div>;
  }
  const niveau = niveauCredits(d.estimatedHoursLeft);
  const cours = Math.floor((d.estimatedHoursLeft || 0) / 2);
  return (
    <div className={'trx-credits-ligne ' + niveau}>
      <Icon name={niveau === 'ok' ? 'clock' : 'alert'} size={13} />
      <span>
        Il te reste ≈ <b>{fmtHeures(d.estimatedHoursLeft)}</b> ({cours > 0 ? `≈ ${cours.toLocaleString('fr-FR')} cours de 2 h` : 'moins d’un cours de 2 h'})
        {d.stale ? ' — dernière valeur connue' : ''}.
        {niveau === 'critique' && <b> Pense à recharger Deepgram.</b>}
      </span>
    </div>
  );
}

/** Carte des Réglages. */
export function CarteCreditsTranscription() {
  const { donnees: d, erreur, chargement } = useCredits();
  const premier = useRef(false);
  useLayoutEffect(() => { if (!premier.current) { premier.current = true; actualiserCredits(); } }, []);
  return (
    <Card title="Crédits de transcription" icon="mic">
      {d ? (
        <>
          <div className={'trx-credits-grand ' + niveauCredits(d.estimatedHoursLeft)}>≈ {fmtHeures(d.estimatedHoursLeft)} <span>de transcription restantes</span></div>
          {niveauCredits(d.estimatedHoursLeft) === 'critique' && <div className="trx-cd-alerte">Pense à recharger Deepgram (console.deepgram.com).</div>}
          <Detail d={d} />
        </>
      ) : (
        <div className="hint" style={{ marginBottom: 10 }}>
          {erreur ? erreur.message : chargement ? 'Lecture des crédits Deepgram…' : 'Aucune donnée pour l’instant.'}
        </div>
      )}
      {d && erreur && <div className="hint" style={{ marginTop: 8 }}>Dernier essai : {erreur.message}</div>}
      <button type="button" className="btn" style={{ marginTop: 12 }} disabled={chargement} onClick={() => actualiserCredits({ force: true })}>
        <Icon name="refresh" size={15} /> {chargement ? 'Actualisation…' : 'Actualiser'}
      </button>
      <div className="hint" style={{ marginTop: 8, fontSize: 11.5 }}>Les crédits ne sont jamais relus pendant une transcription. Côté serveur, la valeur est mise en cache 10 min.</div>
    </Card>
  );
}
