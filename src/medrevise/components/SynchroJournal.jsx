/* ============================================================
   MedRevise — Réglages → Synchronisation : état du JOURNAL DES RÉVISIONS (étape 2 FSRS).
   Dernière synchro du journal, révisions en attente d'envoi, « Synchroniser maintenant »
   (synchro générale puis journal). Lecture seule tant qu'on ne clique pas.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { surChangementJournal } from '../journal/journal.js';
import { synchroniserJournal, resumeJournal, etatSynchroJournal, surEtatSynchroJournal } from '../journal/synchro.js';

const quand = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'jamais');

export function SynchroJournal({ ctx }) {
  const [resume, setResume] = useState(null);
  const [etat, setEtat] = useState(etatSynchroJournal());
  const relire = () => resumeJournal().then(setResume).catch(() => {});
  useEffect(() => {
    relire();
    const a = surChangementJournal(relire);
    const b = surEtatSynchroJournal((e) => { setEtat(e); relire(); });
    return () => { a(); b(); };
  }, []);
  const maintenant = async () => {
    if (ctx && ctx.forceSync) await ctx.forceSync({ complet: true });
    await synchroniserJournal();
    relire();
  };
  return (
    <div className="sj" data-testid="synchro-journal">
      <div className="sj-titre">Journal des révisions</div>
      <div className="hint">
        Dernière synchro : <b>{quand(resume && resume.derniere)}</b> · révisions en attente : <b className="tnum">{resume ? resume.enAttente : '…'}</b>
        {resume && <> · <span className="tnum">{resume.total}</span> réponse{resume.total > 1 ? 's' : ''} sur cet appareil</>}
      </div>
      {etat.tableAbsente && <div className="hint" style={{ color: 'var(--warn)' }}>Table cloud du journal absente : migration SQL à appliquer dans Supabase (les réponses restent en attente, rien n’est perdu).</div>}
      {!etat.tableAbsente && etat.erreur && <div className="hint" style={{ color: 'var(--warn)' }}>Dernière tentative : {etat.erreur}</div>}
      <button type="button" className="btn" disabled={etat.enCours} onClick={maintenant} style={{ marginTop: 8 }}>
        <Icon name="refresh" size={15} /> {etat.enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
      </button>
    </div>
  );
}
