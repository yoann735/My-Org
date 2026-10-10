/* ============================================================
   MedRevise — Réglages → FSRS (ombre) (étape 2, docs/fsrs-etape2-compte-rendu.md).
   - interrupteur « Utiliser FSRS pour les dates » : OFF par défaut, disponible seulement une fois
     la migration appliquée ; réversible (OFF → planificateur maison, anciens champs intacts) ;
   - « Intervalle maximum » (7–365 j, 45 par défaut) ;
   - mode ombre : réponses journalisées, charge maison vs FSRS sur 30 jours, 10 exemples, export ;
   - « Appliquer la migration » : rapport affiché AVANT validation, confirmation, putBackup auto.
   Aucune donnée n'est écrite tant que Yoann ne valide pas explicitement.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, Switch } from './ui.jsx';
import { putMany, putBackup } from '../lib/storage.js';
import { index, isFicheScheduled, nextDate } from '../lib/planning.js';
import { reglagesFC, BORNES_FC } from '../lib/apprentissageFC.js';
import { deliverFile } from '../lib/backupExport.js';
import { toutLeJournal, surChangementJournal } from '../journal/journal.js';
import { rapportOmbre } from '../scheduler/ombre.js';
import { migrerVersFSRS, basculerVersFSRS, chargeParJour } from '../scheduler/migration.js';
import { jourDeRevision } from '../scheduler/jours.js';
import { VERSION_TS_FSRS } from '../scheduler/config.js';

const fmt = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—');

export function ReglagesFSRS({ ctx }) {
  const r = reglagesFC(ctx.reglagesFC);
  const jour = jourDeRevision(new Date());
  const [journal, setJournal] = useState([]);
  const [prep, setPrep] = useState(null);       // migration préparée : { maj, rapport, charge }
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let vivant = true;
    const lire = () => toutLeJournal().then((j) => { if (vivant) setJournal(j); }).catch(() => {});
    lire();
    const off = surChangementJournal(lire);
    return () => { vivant = false; off(); };
  }, [ctx.db]);

  const ix = useMemo(() => index(ctx.db), [ctx.db]);
  const planifiee = (q) => isFicheScheduled(ctx.db, ix.fById[q.ficheId], ix);
  const cartes = useMemo(() => (ctx.db.questions || []).filter((q) => q.type === 'flashcard' && planifiee(q)), [ctx.db, ix]); // eslint-disable-line react-hooks/exhaustive-deps
  const ombre = useMemo(() => rapportOmbre(cartes, journal, jour, nextDate), [cartes, journal, jour]);
  const migree = !!r.fsrsMigration;

  const enregistrer = (patch) => ctx.saveReglagesFC({ ...(ctx.reglagesFC || {}), ...patch });

  const preparer = () => {
    const { maj, rapport } = migrerVersFSRS(ctx.db.questions || [], jour, ctx.reglagesFC);
    const parId = Object.fromEntries(maj.map((c) => [c.id, c]));
    const avant = chargeParJour(cartes, nextDate, jour);
    const apres = chargeParJour(cartes.map((c) => parId[c.id] || c), nextDate, jour);
    const identique = avant.retard === apres.retard && avant.lignes.every((l, i) => l.n === apres.lignes[i].n);
    setPrep({ maj, rapport, avant, apres, identique });
    setMessage('');
  };
  const appliquer = async () => {
    if (!prep || prep.rapport.ecartsDueDate || prep.rapport.ecartsContenu || !prep.identique) return;
    setOccupe(true);
    try {
      const ids = new Set(prep.maj.map((c) => c.id));
      await putBackup('pre-fsrs-migration-' + Date.now(), (ctx.db.questions || []).filter((q) => ids.has(q.id)));
      for (let i = 0; i < prep.maj.length; i += 200) await putMany('questions', prep.maj.slice(i, i + 200));
      const { maj, ...resume } = prep.rapport; // eslint-disable-line no-unused-vars
      await enregistrer({ fsrsMigration: { le: new Date().toISOString(), jour, version: VERSION_TS_FSRS, ...resume } });
      await ctx.reload();
      setMessage(`Migration appliquée : ${prep.rapport.migrees} cartes, aucune date modifiée. Sauvegarde automatique faite avant écriture.`);
      setPrep(null);
    } catch (e) { setMessage('Migration interrompue : ' + String((e && e.message) || e)); } finally { setOccupe(false); }
  };

  const basculer = async (on) => {
    setOccupe(true);
    try {
      if (on) {
        const { maj, rapport } = basculerVersFSRS(ctx.db.questions || [], jour, ctx.reglagesFC, planifiee);
        for (let i = 0; i < maj.length; i += 200) await putMany('questions', maj.slice(i, i + 200));
        await enregistrer({ planificateur: 'fsrs' });
        setMessage(rapport.etalement.length
          ? `FSRS activé. ${rapport.etalement.length} cartes auraient été dues le même jour (plus de 80) : elles ont été étalées sur 7 jours.`
          : 'FSRS décide désormais des dates. Aucune date n’a changé au moment de la bascule.');
      } else {
        await enregistrer({ planificateur: 'maison' });
        setMessage('Retour au planificateur maison. Les dates actuelles sont conservées, les anciens champs sont intacts.');
      }
      await ctx.reload();
    } finally { setOccupe(false); }
  };

  const exporter = async () => {
    const d = { schema: 'medrevise-ombre-fsrs/1', genereLe: new Date().toISOString(), reglages: r, ...ombre,
      journal: journal.map((e) => ({ id: e.id, card_id: e.card_id, rating: e.rating, reviewed_at: e.reviewed_at, jour: e.jour, device: e.device, planificateur: e.planificateur, dueMaison: e.details && e.details.dueMaison, dueFsrs: e.details && e.details.dueFsrs, relearn: !!(e.details && e.details.relearn) })) };
    const via = await deliverFile(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }), `medrevise-rapport-ombre-fsrs-${jour}.json`);
    setMessage(via === 'annule' ? 'Export annulé.' : 'Rapport ombre exporté.');
  };

  return (
    <Card title="FSRS (ombre)" icon="sliders" style={{ gridColumn: '1 / -1' }}>
      <div className="fsrs-reg">
        <div className="row spread" style={{ alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Utiliser FSRS pour les dates</div>
            <div className="hint">
              {!migree ? 'Disponible après « Appliquer la migration » (plus bas). En attendant, FSRS calcule en ombre sans rien changer.'
                : r.planificateur === 'fsrs' ? 'FSRS décide des prochaines dates. Couper revient au planificateur maison.'
                  : 'Désactivé : le planificateur maison décide des dates ; FSRS calcule en ombre.'}
            </div>
          </div>
          <Switch on={r.planificateur === 'fsrs' && migree} onChange={(v) => { if (migree && !occupe) basculer(v); }} label="Utiliser FSRS pour les dates" />
        </div>

        <label className="rfc-champ" style={{ marginTop: 12 }}>
          <span className="rfc-libelle">Intervalle maximum<span className="hint">jours, de {BORNES_FC.intervalleMax[0]} à {BORNES_FC.intervalleMax[1]} (FSRS)</span></span>
          <input type="number" className="rfc-nombre" min={BORNES_FC.intervalleMax[0]} max={BORNES_FC.intervalleMax[1]} step={1} defaultValue={r.intervalleMax} key={'imax' + r.intervalleMax}
            onBlur={(e) => { const v = reglagesFC({ ...r, intervalleMax: e.target.value }).intervalleMax; e.target.value = v; if (v !== r.intervalleMax) enregistrer({ intervalleMax: v }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>

        <div className="fsrs-titre">Mode ombre</div>
        <div className="hint"><b className="tnum">{ombre.reponses}</b> réponse{ombre.reponses > 1 ? 's' : ''} journalisée{ombre.reponses > 1 ? 's' : ''}
          {ombre.repetitions > 0 && <> (+ {ombre.repetitions} répétition{ombre.repetitions > 1 ? 's' : ''} de séance)</>} · <b className="tnum">{ombre.cartesVuesParFsrs}</b> carte{ombre.cartesVuesParFsrs > 1 ? 's' : ''} déjà calculée{ombre.cartesVuesParFsrs > 1 ? 's' : ''} par FSRS
          · À revoir {ombre.parNote[1]} · Difficile {ombre.parNote[2]} · Correct {ombre.parNote[3]} · Facile {ombre.parNote[4]}</div>
        <div className="fsrs-tableau" role="table" aria-label="Cartes dues par jour, maison et FSRS">
          <div className="fsrs-ligne tete" role="row"><span>Jour</span><span>Maison</span><span>FSRS</span></div>
          {(ombre.retard.maison || ombre.retard.fsrs) ? <div className="fsrs-ligne" role="row"><span>En retard</span><span className="tnum">{ombre.retard.maison}</span><span className="tnum">{ombre.retard.fsrs}</span></div> : null}
          {ombre.tableau.map((l) => (
            <div key={l.jour} className={'fsrs-ligne' + (l.maison !== l.fsrs ? ' diff' : '')} role="row"><span>{fmt(l.jour)}</span><span className="tnum">{l.maison}</span><span className="tnum">{l.fsrs}</span></div>
          ))}
          <div className="fsrs-ligne" role="row"><span>Au-delà de 30 j</span><span className="tnum">{ombre.au_dela.maison}</span><span className="tnum">{ombre.au_dela.fsrs}</span></div>
        </div>
        {ombre.exemples.length > 0 && (
          <div className="fsrs-exemples">
            <div className="fsrs-sous">Exemples (cartes notées depuis l’installation)</div>
            {ombre.exemples.map((x) => (
              <div key={x.id} className="fsrs-ex"><span className="fsrs-ex-recto">{x.recto || x.id}</span><span className="tnum">maison {fmt(x.dateMaison)}</span><span className="tnum">FSRS {fmt(x.dateFsrs)}</span></div>
            ))}
          </div>
        )}
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <button type="button" className="btn" onClick={exporter}><Icon name="archive" size={15} /> Exporter le rapport ombre</button>
        </div>

        <div className="fsrs-titre">Migration FSRS</div>
        {migree ? (
          <div className="hint">Appliquée le {new Date(r.fsrsMigration.le).toLocaleString('fr-FR')} : {r.fsrsMigration.migrees} cartes, {r.fsrsMigration.ecartsDueDate} écart de date.</div>
        ) : !prep ? (
          <>
            <div className="hint">Initialise l’état FSRS de chaque flashcard (historique rejoué, ou estimation ; difficulté de départ 7) sans changer aucune date. Un rapport s’affiche avant toute écriture.</div>
            <button type="button" className="btn" style={{ marginTop: 8 }} onClick={preparer}><Icon name="sliders" size={15} /> Appliquer la migration…</button>
          </>
        ) : (
          <div className="fsrs-prep">
            <div style={{ fontWeight: 600 }}>Rapport avant validation</div>
            <ul className="hint">
              <li>{prep.rapport.migrees} cartes à initialiser ({prep.rapport.dejaMigrees} déjà migrées) — historique rejoué {prep.rapport.parSource.historique || 0}, estimation {prep.rapport.parSource.estimation || 0}, nouvelles {prep.rapport.parSource.nouvelle || 0}, état ombre conservé {prep.rapport.parSource.ombreConservee || 0}</li>
              <li>Dates modifiées : <b>{prep.rapport.ecartsDueDate}</b> · contenu modifié : <b>{prep.rapport.ecartsContenu}</b></li>
              <li>Charge sur 30 jours avant = après : <b>{prep.identique ? 'oui' : 'NON'}</b> (retard {prep.avant.retard} → {prep.apres.retard})</li>
            </ul>
            <div className="row wrap" style={{ gap: 8 }}>
              <button type="button" className="btn" disabled={occupe} onClick={() => setPrep(null)}>Annuler</button>
              <button type="button" className="btn primary" disabled={occupe || prep.rapport.ecartsDueDate > 0 || prep.rapport.ecartsContenu > 0 || !prep.identique} onClick={appliquer}>
                <Icon name="check" size={15} /> {occupe ? 'Migration…' : `Confirmer : migrer ${prep.rapport.migrees} cartes`}
              </button>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>Une sauvegarde des cartes est faite automatiquement avant l’écriture.</div>
          </div>
        )}
        {message && <div className="hint" style={{ marginTop: 10, color: 'var(--accent)' }}>{message}</div>}
      </div>
    </Card>
  );
}
