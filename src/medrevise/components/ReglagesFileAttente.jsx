/* ============================================================
   MedRevise — Réglages → Planification → « Mode file d'attente » (15/11/2026, lib/fileAttente.js,
   docs/compte-rendu-mode-file-attente.md).
   - Interrupteur + phrase d'explication.
   - Activation : une feuille s'ouvre — date de reprise proposée (plus vieux retard), choix d'une autre date entre
     celle-ci et aujourd'hui, aperçu des 7 prochains jours mis à jour en direct ; RIEN n'est écrit avant « Activer ».
   - Désactivation : confirmation « X cartes vont repasser en retard. Désactiver ? ».
   Seul l'enregistrement `prompts/fileAttente` est écrit (ctx.activerFileAttente / ctx.desactiverFileAttente).
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Switch, Modal, ConfirmModal } from './ui.jsx';
import { dateBase, dateEffective } from '../lib/planning.js';
import { flashcardsPlanifiees } from '../session/SeanceFC.jsx';
import {
  jourFile, plusVieuxRetard, etatActivation, joursDecalage, apercu7Jours, normaliserEtat,
  decalageAffiche, cartesQuiRepassentEnRetard,
} from '../lib/fileAttente.js';
import { ajouterJours } from '../scheduler/jours.js';
import '../../styles/file-attente.css';

const fmtLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtCourt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtJourSemaine = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
const fmtNumero = (iso) => new Date(iso + 'T12:00:00').getDate();
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export const EXPLICATION_FILE = 'Les jours où tu ne révises pas, ton planning se met en pause : les révisions oubliées passent ensuite dans l’ordre, un jour de cartes après l’autre, au lieu de s’empiler en retard.';

export function ReglagesFileAttente({ ctx }) {
  const etat = normaliserEtat(ctx.fileAttente);
  const [feuille, setFeuille] = useState(false);
  const [confirmer, setConfirmer] = useState(null); // nombre de cartes qui repasseraient en retard
  const [occupe, setOccupe] = useState(false);
  const cartes = useMemo(() => flashcardsPlanifiees(ctx.db), [ctx.db]);
  const decalage = useMemo(() => decalageAffiche(etat, cartes, dateBase), [cartes, etat.actif, etat.pauses.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const basculer = (v) => {
    if (occupe) return;
    if (v) { setFeuille(true); return; }
    setConfirmer(cartesQuiRepassentEnRetard(cartes, dateBase, etat, jourFile()));
  };
  const desactiver = async () => {
    setOccupe(true);
    try { await ctx.desactiverFileAttente(); } finally { setOccupe(false); setConfirmer(null); }
  };

  return (
    <Card title="Planification" icon="calendar">
      <div className="fa-reg" data-fa="reglage">
        <div className="row spread" style={{ alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Mode file d’attente</div>
            <div className="hint">{EXPLICATION_FILE}</div>
          </div>
          <Switch on={etat.actif || feuille} onChange={basculer} label="Mode file d’attente" />
        </div>
        {etat.actif && (
          <div className="fa-etat hint" data-fa="etat">
            Actif depuis le {etat.activeLe ? fmtLong(etat.activeLe) : '—'} · <b className="tnum" data-fa="decalage-reglages">{decalage}</b> j de décalage sur ton planning
          </div>
        )}
      </div>
      {feuille && <FeuilleActivation ctx={ctx} cartes={cartes} onFermer={() => setFeuille(false)} />}
      {confirmer != null && (
        <ConfirmModal title="Désactiver le mode file d’attente"
          body={<span data-fa="confirmer-desactivation">{pluriel(confirmer, 'carte')} {confirmer > 1 ? 'vont' : 'va'} repasser en retard. Désactiver ?</span>}
          confirmLabel="Désactiver" danger onConfirm={desactiver} onCancel={() => setConfirmer(null)} />
      )}
    </Card>
  );
}

/** feuille d'activation : date de reprise, aperçu des 7 prochains jours, « Activer » (seule écriture) */
function FeuilleActivation({ ctx, cartes, onFermer }) {
  const aujourdhui = jourFile();
  const vieux = useMemo(() => plusVieuxRetard(cartes, dateBase, aujourdhui), [cartes, aujourdhui]);
  const premier = vieux || aujourdhui;
  const [reprise, setReprise] = useState(premier);
  const [occupe, setOccupe] = useState(false);
  const jours = useMemo(() => { const l = []; for (let d = premier; d <= aujourdhui; d = ajouterJours(d, 1)) l.push(d); return l; }, [premier, aujourdhui]);
  const candidat = useMemo(() => etatActivation(reprise, aujourdhui), [reprise, aujourdhui]);
  const lignes = useMemo(() => apercu7Jours(cartes, (q) => dateEffective(q, candidat), aujourdhui), [cartes, candidat, aujourdhui]);
  const n = joursDecalage(reprise, aujourdhui);
  const nVieux = joursDecalage(premier, aujourdhui);
  const bande = useRef(null);
  useEffect(() => { const el = bande.current && bande.current.querySelector('.fa-jour.actif'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [reprise]);

  const activer = async () => {
    if (occupe) return;
    setOccupe(true);
    try { await ctx.activerFileAttente(candidat); onFermer(); } finally { setOccupe(false); }
  };

  return (
    <Modal title="Mode file d’attente" onClose={onFermer} width="min(520px, 94vw)">
      <div className="fa-feuille" data-fa="feuille">
        <div className="fa-phrase" data-fa="phrase">
          {vieux
            ? <>Ton plus vieux retard date du <b>{fmtLong(vieux)}</b> → <b className="tnum">{nVieux}</b> j de décalage</>
            : <>Aucun retard : rien n’est décalé, seuls les prochains jours oubliés seront mis en pause.</>}
        </div>
        {jours.length > 1 && (
          <div className="fa-champ">
            <div className="fa-libelle">Reprendre à partir du</div>
            <div className="fa-jours" ref={bande} role="radiogroup" aria-label="Date de reprise">
              {jours.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={d === reprise} className={'fa-jour' + (d === reprise ? ' actif' : '') + (d === aujourdhui ? ' auj' : '')}
                  data-jour={d} title={d === aujourdhui ? `Aujourd’hui (${fmtLong(d)}) : aucun décalage` : fmtLong(d)} onClick={() => setReprise(d)}>
                  <span className="fa-jour-sem">{d === aujourdhui ? 'auj.' : fmtJourSemaine(d)}</span>
                  <span className="fa-jour-num tnum">{fmtNumero(d)}</span>
                </button>
              ))}
            </div>
            <div className="hint fa-choix" data-fa="choix">
              {n > 0
                ? <>Du {fmtLong(reprise)} à hier : <b className="tnum">{n}</b> jour{n > 1 ? 's' : ''} en pause{reprise > premier ? ' · les retards plus anciens restent en Retard' : ''}.</>
                : <>Aucun décalage : seuls les prochains jours oubliés seront mis en pause.</>}
            </div>
          </div>
        )}
        <div className="fa-libelle">Les 7 prochains jours, si tu fais tout chaque jour</div>
        <div className="fa-tableau" role="table" aria-label="Aperçu des 7 prochains jours" data-fa="apercu">
          <div className="fa-ligne tete" role="row"><span>Jour</span><span>Retard</span><span>Révisions</span><span>Total</span></div>
          {lignes.map((l, i) => (
            <div key={l.jour} className="fa-ligne" role="row" data-jour={l.jour}>
              <span>{i === 0 ? 'Aujourd’hui' : fmtCourt(l.jour)}</span>
              <span className="tnum" data-col="retard">{l.retard}</span>
              <span className="tnum" data-col="revisions">{l.revisions}</span>
              <span className="tnum" data-col="total">{l.total}</span>
            </div>
          ))}
        </div>
        <div className="hint fa-note">Les nouvelles cartes ne sont pas concernées.</div>
        <div className="fa-actions">
          <button type="button" className="btn" style={{ flex: 1 }} onClick={onFermer}>Annuler</button>
          <button type="button" className="btn primary" style={{ flex: 1 }} disabled={occupe} data-fa="activer" onClick={activer}>Activer</button>
        </div>
      </div>
    </Modal>
  );
}
