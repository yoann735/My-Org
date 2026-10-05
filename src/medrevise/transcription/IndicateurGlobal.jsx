/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : indicateur flottant global.

   La session vit hors du lecteur (engine.js) : elle continue quand on quitte le
   cours, passe en mode focus ou bascule sur le shell mobile. Tant que le bouton
   « Transcrire » du cours concerné n'est pas affiché, cette pastille rappelle
   que le micro tourne et permet de mettre en pause ou d'arrêter — jamais une
   session invisible.
   ============================================================ */
import { useSyncExternalStore } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { useTranscription } from './useTranscription.js';
import { arreter, pause, reprendreApresPause, sessionActive } from './engine.js';
import { mmss } from './exporter.js';

/* registre des boutons « Transcrire » montés (un par lecteur ouvert) */
const montes = new Map(); // courseId → nombre
const abonnes = new Set();
let version = 0;
export function enregistrerLecteur(courseId) {
  montes.set(courseId, (montes.get(courseId) || 0) + 1); version++; abonnes.forEach((f) => f());
  return () => {
    const n = (montes.get(courseId) || 1) - 1;
    if (n) montes.set(courseId, n); else montes.delete(courseId);
    version++; abonnes.forEach((f) => f());
  };
}
const abonner = (f) => { abonnes.add(f); return () => abonnes.delete(f); };

export function IndicateurTranscription() {
  const e = useTranscription();
  useSyncExternalStore(abonner, () => version);
  if (!sessionActive() || montes.has(e.courseId)) return null;
  const enPause = e.phase === 'paused';
  return (
    <div className="trx-flottant" role="status">
      <span className={'trx-point' + (enPause ? ' arret' : '')} />
      <span className="trx-flottant-txt">Transcription {enPause ? 'en pause' : 'en cours'}</span>
      <span className="tnum trx-chrono">{mmss(e.secondes)}</span>
      {enPause
        ? <button type="button" className="btn sm" onClick={reprendreApresPause}><Icon name="play" size={12} /> Reprendre</button>
        : <button type="button" className="btn sm" onClick={pause} disabled={e.phase !== 'live'}><span className="trx-ic-pause" /> Pause</button>}
      <button type="button" className="btn sm trx-stop" onClick={() => arreter()} disabled={e.phase === 'stopping'}><span className="trx-ic-stop" /> Arrêter</button>
    </div>
  );
}
