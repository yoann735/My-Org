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
import { abonnementDiffere } from '../lib/gesteEnCours.js';
import { retourPossible, revenirAuCours } from './retourCours.js';

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
const abonner = abonnementDiffere((f) => { abonnes.add(f); return () => abonnes.delete(f); }); // v1.4 : différé pendant un geste

/* (20/11) la barre ramène au cours : toucher son libellé (ou « Revenir au cours ») rouvre le
   lecteur où tourne la transcription, au même endroit, panneau Transcript ouvert
   (transcription/retourCours.js). Pause / Arrêter gardent leur rôle. Sur le téléphone, le
   shell n'a pas de lecteur de cours : la barre reste un simple rappel. */
export function IndicateurTranscription({ titreDe = null }) {
  const e = useTranscription();
  useSyncExternalStore(abonner, () => version);
  if (!sessionActive() || montes.has(e.courseId)) return null;
  const enPause = e.phase === 'paused';
  const retour = retourPossible() && !!e.courseId;
  const titre = (titreDe && e.courseId && titreDe(e.courseId)) || '';
  const aide = titre ? `Revenir au cours « ${titre} » (panneau Transcript)` : 'Revenir au cours (panneau Transcript)';
  const libelle = (
    <>
      <span className={'trx-point' + (enPause ? ' arret' : '')} />
      <span className="trx-flottant-txt">Transcription {enPause ? 'en pause' : 'en cours'}</span>
      <span className="tnum trx-chrono">{mmss(e.secondes)}</span>
    </>
  );
  return (
    <div className={'trx-flottant' + (retour ? ' avec-retour' : '')} role="status" data-trx-flottant="">
      {retour ? (
        <button type="button" className="trx-flottant-retour" data-trx-retour="" onClick={() => revenirAuCours(e.courseId)} title={aide} aria-label={aide}>
          {libelle}
          <span className="trx-flottant-revenir"><span className="trx-flottant-revenir-txt">Revenir au cours</span><Icon name="chevR" size={13} /></span>
        </button>
      ) : libelle}
      {enPause
        ? <button type="button" className="btn sm" onClick={reprendreApresPause} title="Reprendre la transcription"><Icon name="play" size={12} /> Reprendre</button>
        : <button type="button" className="btn sm" onClick={pause} disabled={e.phase !== 'live'} title="Mettre la transcription en pause"><span className="trx-ic-pause" /> Pause</button>}
      <button type="button" className="btn sm trx-stop" onClick={() => arreter()} disabled={e.phase === 'stopping'} title="Arrêter la transcription"><span className="trx-ic-stop" /> Arrêter</button>
    </div>
  );
}
