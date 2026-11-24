/* ============================================================
   MedRevise — SUIVI AUTOMATIQUE DES DIAPOS : interface (24/11/2026,
   docs/compte-rendu-suivi-auto-diapos.md).
   - LigneSuiviDiapos : dans le panneau Transcript en direct (source « onglet »), l'interrupteur
     « Suivre les diapos automatiquement » et l'indication « Diapo 12 · auto » / « Diapo non reconnue ».
   - FenetreRelier : « Relier aux diapos automatiquement » (menu d'une session) — analyse, aperçu
     « 48 passages → 31 diapos, 3 non reconnus », puis Appliquer ou Annuler.
   ============================================================ */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from '../../../shared/Icon.jsx';
import { Modal, Switch } from '../../components/ui.jsx';
import { abonnerSuivi, lireSuivi } from './suivi.js';
import { basculerSuiviDiapos } from '../engine.js';
import { analyser, appliquer, resumeAnalyse } from './repartition.js';

export function useSuiviDiapos() { return useSyncExternalStore(abonnerSuivi, lireSuivi); }

function indication(s) {
  if (!s.actif) return { txt: 'Suivi coupé : la diapo du lecteur fait foi', ton: 'off' };
  if (s.statut === 'preparation') return { txt: 'Préparation des diapos…', ton: 'attente' };
  if (s.statut === 'coupe') return { txt: 'Partage arrêté', ton: 'alerte' };
  if (s.statut === 'sansPdf') return { txt: 'Pas de PDF : changements mémorisés', ton: 'attente' };
  if (s.nonReconnue) return { txt: 'Diapo non reconnue', ton: 'alerte' };
  if (s.page) return { txt: `Diapo ${s.page} · auto`, ton: 'ok' };
  return { txt: 'Recherche de la diapo…', ton: 'attente' };
}

export function LigneSuiviDiapos() {
  const s = useSuiviDiapos();
  if (!s.disponible) return null;
  const ind = indication(s);
  const aide = 'Suivre les diapos automatiquement : la diapo que le prof affiche dans l’onglet partagé est reconnue et le transcript s’y range, quel que soit l’écran ouvert ici';
  return (
    <div className="trx-suivi" data-statut={s.statut}>
      <Switch on={s.actif} onChange={(on) => basculerSuiviDiapos(on)} label={aide} />
      <span className="trx-suivi-lib" title={aide}>Suivre les diapos automatiquement</span>
      <span className={'trx-suivi-ind ' + ind.ton} role="status" aria-live="polite"
        title={s.actif && s.page ? `Les lignes dites maintenant vont sur la diapo ${s.page} (reconnue dans l’onglet partagé)` : ind.txt}>
        <Icon name={ind.ton === 'alerte' ? 'alert' : 'filePdf'} size={11} /> {ind.txt}
      </span>
    </div>
  );
}

export function FenetreRelier({ session, onFermer, onApplique }) {
  const [etape, setEtape] = useState('analyse'); // analyse | apercu | erreur | application
  const [prog, setProg] = useState([0, (session.diapos || []).length]);
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let vivant = true;
    analyser(session, { onProgres: (a, b) => vivant && setProg([a, b]) })
      .then((r) => { if (!vivant) return; if (!r.ok) { setMsg(r.message); setEtape('erreur'); } else { setRes(r); setEtape('apercu'); } })
      .catch((e) => { if (vivant) { setMsg('Analyse impossible : ' + ((e && e.message) || 'erreur inconnue')); setEtape('erreur'); } });
    return () => { vivant = false; };
  }, [session]);
  const appliquerIci = async () => {
    setEtape('application');
    try { const s = await appliquer(res); onApplique(s); } catch (e) { setMsg('Écriture impossible : ' + ((e && e.message) || '')); setEtape('erreur'); }
  };
  return (
    <Modal title="Relier aux diapos automatiquement" onClose={onFermer} width="min(460px, 94vw)">
      <div className="trx-relier">
        {etape === 'analyse' && (
          <div className="trx-relier-prog">
            <div className="hint">Reconnaissance des diapos gardées pendant le cours, contre le PDF actuel du document…</div>
            <div className="trx-relier-barre"><i style={{ width: `${prog[1] ? (100 * prog[0]) / prog[1] : 0}%` }} /></div>
            <div className="hint tnum">{prog[0]} / {prog[1]}</div>
          </div>
        )}
        {etape === 'apercu' && res && (
          <>
            <div className="trx-relier-resume tnum" data-resume>{resumeAnalyse(res.stats)}</div>
            <div className="hint">Chaque ligne du transcript passera sur la diapo affichée au moment où elle a été dite. Une version
              d’avant est gardée dans l’Historique du document : « Restaurer » la remet.</div>
            {res.stats.sansImage > 0 && <div className="hint">{res.stats.sansImage} image{res.stats.sansImage > 1 ? 's' : ''} absente{res.stats.sansImage > 1 ? 's' : ''} de cet appareil (cours enregistré ailleurs).</div>}
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" className="btn" onClick={onFermer} title="Ne rien changer">Annuler</button>
              <button type="button" className="btn primary" onClick={appliquerIci} title="Relier les lignes aux diapos reconnues (réversible depuis l’Historique)">
                <Icon name="check" size={13} /> Appliquer
              </button>
            </div>
          </>
        )}
        {etape === 'application' && <div className="hint">Enregistrement…</div>}
        {etape === 'erreur' && (
          <>
            <div className="trx-info"><Icon name="alert" size={12} /> {msg}</div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button type="button" className="btn" onClick={onFermer}>Fermer</button></div>
          </>
        )}
      </div>
    </Modal>
  );
}
