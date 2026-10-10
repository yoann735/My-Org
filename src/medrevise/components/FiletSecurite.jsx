/* ============================================================
   MedRevise — FILET DE SÉCURITÉ : interface (11/10/2026, docs/compte-rendu-filet-securite.md).
   - BandeauFilet : RIEN tant que tout va bien. Sinon, en haut de l'app, une seule ligne discrète,
     par priorité : rouge « N cartes de moins qu'hier » → orange « Pas de copie depuis N jours » →
     « N cartes à vérifier ». Un clic ouvre l'écran Intégrité (ou Réglages pour la copie).
   - EcranIntegrite : chaque anomalie (carte, cours, problème) ; par carte « Remettre dans le planning
     (aujourd'hui) » et « Voir la carte » ; « Tout remettre dans le planning ». AUCUNE correction
     automatique : seule une action cliquée écrit (dueDate = aujourd'hui, comme « Déplacer »).
   - CarteSauvegardes : Réglages → Sauvegardes (copie serveur, dossier local, contrôle du jour).
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card } from './ui.jsx';
import { putMany } from '../lib/storage.js';
import { todayISO } from '../lib/sm2.js';
import { resultatIntegrite, surIntegrite, lancerControle, dernierResultat } from '../integrite/executer.js';
import { statutCopieServeur, lancerCopieServeur, quandLisible, joursSansCopie } from '../sauvegarde/statutServeur.js';
import { etatDossier, choisirDossier, autoriserDossier, copierDansDossier, dossierDisponible } from '../sauvegarde/dossierLocal.js';

const PROCEDURE = 'scripts/sauvegarde/restore-from-github.md';
const LIBELLES = { 'sans-date': 'Sans date valide', orpheline: 'Cours introuvable', enterree: 'Enterrée (jamais revue)', doublon: 'Identifiant en double' };
const nf = (n) => Number(n || 0).toLocaleString('fr-FR');

/* ---- état partagé : résultat du contrôle + statut de la copie serveur (lu une fois par ouverture) ---- */
let statutServeur = null; let promesseStatut = null;
const abonnesStatut = new Set();
export function rafraichirStatutServeur() {
  promesseStatut = statutCopieServeur().then((s) => { statutServeur = s; abonnesStatut.forEach((fn) => fn(s)); return s; });
  return promesseStatut;
}
function useStatutServeur() {
  const [s, setS] = useState(statutServeur);
  useEffect(() => { abonnesStatut.add(setS); if (!statutServeur && !promesseStatut) rafraichirStatutServeur(); return () => abonnesStatut.delete(setS); }, []);
  return s;
}
function useIntegrite() {
  const [r, setR] = useState(resultatIntegrite());
  useEffect(() => { const off = surIntegrite(setR); if (!r) dernierResultat().then((x) => { if (x) setR((v) => v || x); }); return off; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return r;
}

export function BandeauFilet({ ctx, onOuvrirIntegrite, onOuvrirReglages }) {
  const r = useIntegrite();
  const s = useStatutServeur();
  const jours = joursSansCopie(s);
  if (r && r.jour === todayISO() && r.baisse) {
    return (
      <button type="button" className="filet-bandeau rouge" onClick={onOuvrirIntegrite} data-testid="bandeau-baisse">
        <Icon name="alert" size={14} /> {nf(r.baisse.total || Object.values(r.baisse.parType).reduce((a, b) => a + b, 0))} carte{(r.baisse.total || 2) > 1 ? 's' : ''} de moins qu’hier — voir la liste et la restauration
      </button>
    );
  }
  if (jours) {
    return (
      <button type="button" className="filet-bandeau orange" onClick={onOuvrirReglages} data-testid="bandeau-copie">
        <Icon name="alert" size={14} /> Pas de copie depuis {jours} jour{jours > 1 ? 's' : ''} — voir Réglages › Sauvegardes
      </button>
    );
  }
  if (r && r.jour === todayISO() && (r.cartesAVerifier || (r.globales || []).length)) {
    const n = r.cartesAVerifier;
    return (
      <button type="button" className="filet-bandeau discret" onClick={onOuvrirIntegrite} data-testid="bandeau-anomalies">
        <Icon name="alert" size={13} /> {n ? `${nf(n)} carte${n > 1 ? 's' : ''} à vérifier` : 'Contrôle du jour : un point à vérifier'}
      </button>
    );
  }
  return null;
}

export function EcranIntegrite({ ctx, onRetour = null }) {
  const r = useIntegrite();
  const [ouvertes, setOuvertes] = useState({});
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState('');
  const parId = Object.fromEntries((ctx.db.questions || []).map((q) => [q.id, q]));
  const remettre = async (ids) => {
    setOccupe(true);
    try {
      const jour = todayISO();
      const cartes = ids.map((id) => parId[id]).filter(Boolean).map((q) => ({ ...q, dueDate: jour, termine: false }));
      if (cartes.length) await putMany('questions', cartes);
      await ctx.reload();
      await lancerControle({ avecCloud: false });
      setMessage(`${cartes.length} carte${cartes.length > 1 ? 's' : ''} remise${cartes.length > 1 ? 's' : ''} dans le planning (aujourd’hui).`);
    } finally { setOccupe(false); }
  };
  if (!r) return <div className="page-wrap"><p className="hint">Contrôle en cours…</p></div>;
  const reparables = (r.anomalies || []).filter((a) => a.reparable && parId[a.carteId]);
  return (
    <div className="page-wrap filet-ecran">
      <div className="filet-entete">
        <button type="button" className="btn ghost sm" onClick={() => (onRetour ? onRetour() : ctx.go('settings'))}><Icon name="chevL" size={14} /> {onRetour ? 'Retour' : 'Réglages'}</button>
        <h1>Contrôle d’intégrité</h1>
        <span className="hint">du {new Date(r.le || Date.now()).toLocaleString('fr-FR')} · {nf(r.flashcards)} flashcards · {nf(r.questions)} questions · {r.dureeMs} ms</span>
      </div>
      {r.ok && <div className="filet-ok"><span className="filet-point" /> Tout est en ordre.</div>}
      {r.baisse && (
        <div className="filet-bloc rouge">
          <b>{nf(r.baisse.total)} carte{r.baisse.total > 1 ? 's' : ''} de moins que le {r.baisse.depuis}</b>
          <div className="hint">Par type : {Object.entries(r.baisse.parType).map(([t, n]) => `${t} −${n}`).join(' · ')}. Si ce n’est pas toi qui les as supprimées, elles peuvent être restaurées depuis la copie GitHub ou le dossier local : procédure dans <code>{PROCEDURE}</code>.</div>
          {r.baisse.idsManquants.length > 0 && <div className="filet-ids">Identifiants manquants : {r.baisse.idsManquants.slice(0, 200).join(', ')}{r.baisse.idsManquants.length > 200 ? '…' : ''}</div>}
        </div>
      )}
      {(r.globales || []).map((g, i) => (
        <div key={i} className="filet-bloc"><b>{g.type === 'empreinte' ? 'Écart avec le cloud' : 'Journal en attente'}</b> <span className="hint">{g.detail} — voir Réglages › Synchronisation.</span></div>
      ))}
      {reparables.length > 1 && (
        <button type="button" className="btn primary" disabled={occupe} onClick={() => remettre(reparables.map((a) => a.carteId))}>
          <Icon name="calendar" size={14} /> Tout remettre dans le planning ({reparables.length})
        </button>
      )}
      {message && <div className="hint" style={{ color: 'var(--accent)' }}>{message}</div>}
      <div className="filet-liste">
        {(r.anomalies || []).map((a) => {
          const q = parId[a.carteId];
          return (
            <div key={a.type + a.carteId} className="filet-anomalie" data-carte={a.carteId}>
              <div className="filet-a-tete">
                <span className={'filet-type ' + a.type}>{LIBELLES[a.type] || a.type}</span>
                <span className="filet-a-recto">{a.recto || a.carteId}</span>
              </div>
              <div className="hint">{a.cours} · {a.detail}</div>
              <div className="filet-a-actions">
                {a.reparable && q && <button type="button" className="btn sm" disabled={occupe} onClick={() => remettre([a.carteId])}>Remettre dans le planning (aujourd’hui)</button>}
                {q && <button type="button" className="btn ghost sm" onClick={() => setOuvertes((o) => ({ ...o, [a.carteId]: !o[a.carteId] }))}>{ouvertes[a.carteId] ? 'Masquer la carte' : 'Voir la carte'}</button>}
              </div>
              {ouvertes[a.carteId] && q && (
                <div className="filet-apercu"><div><b>Recto</b> {String(q.recto || q.question || '').slice(0, 400)}</div><div><b>Verso</b> {String(q.verso || '').slice(0, 400)}</div><div className="hint">id {q.id} · dueDate {String(q.dueDate)} · {(q.historique || []).length} note(s)</div></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CarteSauvegardes({ ctx }) {
  const s = useStatutServeur();
  const r = useIntegrite();
  const [copie, setCopie] = useState(null); // null | 'en cours' | résultat
  const [dossier, setDossier] = useState(null);
  const [progression, setProgression] = useState('');
  const relireDossier = () => etatDossier().then(setDossier).catch(() => setDossier({ disponible: false }));
  useEffect(() => { relireDossier(); }, []);
  const lancer = async () => { setCopie('en cours'); const x = await lancerCopieServeur(); setCopie(x); rafraichirStatutServeur(); };
  const copierDossier = async (force) => {
    setProgression('Préparation…');
    try { const x = await copierDansDossier({ force, surProgression: setProgression }); setProgression(x.ok ? (x.saute ? 'Copie récente : rien à faire.' : `Copie faite : ${x.nouveaux} nouveau(x), ${x.misAJour} mis à jour, ${x.inchanges} inchangé(s) · données du ${x.jour}`) : x.raison === 'permission' ? 'Accès au dossier à autoriser.' : 'Aucun dossier choisi.'); } catch (e) { setProgression('Copie interrompue : ' + String((e && e.message) || e)); }
    relireDossier();
  };
  const jours = joursSansCopie(s);
  return (
    <Card title="Sauvegardes" icon="archive" style={{ gridColumn: '1 / -1' }}>
      <div className="filet-reg" data-testid="carte-sauvegardes">
        <div className="filet-ligne">
          <span className={'filet-point ' + (!s ? 'gris' : !s.ok || !s.configure ? 'gris' : jours ? 'orange' : 'vert')} />
          <div style={{ flex: 1 }}>
            <div className="filet-titre">Copie quotidienne (dépôt GitHub privé)</div>
            <div className="hint" data-testid="statut-copie">
              {!s ? 'Lecture de l’état…'
                : s.configure === false ? 'Copie serveur non configurée (variables Vercel à créer, voir docs/compte-rendu-filet-securite.md).'
                  : !s.ok ? s.message
                    : s.aucune ? 'Aucune copie pour l’instant.'
                      : <>Dernière copie : {quandLisible(s.date)} {jours ? `— il y a ${jours} jour${jours > 1 ? 's' : ''}` : '✓'} · {nf(s.comptes && s.comptes.flashcards)} flashcards · {nf(s.comptes && s.comptes.questions)} questions · commit {s.commit}</>}
            </div>
          </div>
          <button type="button" className="btn sm" disabled={copie === 'en cours' || (s && s.configure === false)} onClick={lancer}>
            <Icon name="refresh" size={13} /> {copie === 'en cours' ? 'Copie…' : 'Lancer une copie maintenant'}
          </button>
        </div>
        {copie && copie !== 'en cours' && <div className="hint filet-retour">{copie.ok ? (copie.cree ? `Copie faite : commit ${String(copie.commit).slice(0, 7)} (« backup ${copie.jour} »).` : 'Rien n’a changé depuis la dernière copie du jour : aucun nouveau commit.') : copie.message}</div>}

        {dossier && dossier.disponible && (
          <div className="filet-ligne">
            <span className={'filet-point ' + (!dossier.choisi ? 'gris' : dossier.permission === 'granted' ? 'vert' : 'orange')} />
            <div style={{ flex: 1 }}>
              <div className="filet-titre">Fichiers et données dans un dossier de cet ordinateur</div>
              <div className="hint" data-testid="statut-dossier">
                {!dossier.choisi ? 'Aucun dossier choisi : PDF, images et un export des données y seront copiés une fois par semaine.'
                  : <>Dossier « {dossier.nom} » · {dossier.derniere ? `dernière copie ${quandLisible(dossier.derniere.le)} (${nf(dossier.derniere.fichiers)} fichiers)` : 'pas encore de copie'}</>}
              </div>
              {dossier.choisi && dossier.permission !== 'granted' && (
                <div className="filet-autoriser">Autoriser l’accès au dossier de sauvegarde <button type="button" className="linklike" onClick={async () => { await autoriserDossier(); relireDossier(); }}>Autoriser</button></div>
              )}
              {progression && <div className="hint filet-retour">{progression}</div>}
            </div>
            {!dossier.choisi
              ? <button type="button" className="btn sm" onClick={async () => { try { await choisirDossier(); await relireDossier(); await copierDossier(true); } catch (e) { /* annulé */ } }}><Icon name="folder" size={13} /> Choisir le dossier des fichiers</button>
              : <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn sm" disabled={dossier.permission !== 'granted'} onClick={() => copierDossier(true)}>Copier maintenant</button>
                  <button type="button" className="btn ghost sm" onClick={async () => { try { await choisirDossier(); relireDossier(); } catch (e) { /* annulé */ } }}>Changer</button>
                </span>}
          </div>
        )}

        <div className="filet-ligne">
          <span className={'filet-point ' + (!r ? 'gris' : r.ok ? 'vert' : r.baisse ? 'rouge' : 'orange')} data-testid="point-controle" />
          <div style={{ flex: 1 }}>
            <div className="filet-titre">Contrôle du jour</div>
            <div className="hint" data-testid="statut-controle">
              {!r ? 'pas encore lancé' : r.ok ? `OK · ${nf(r.flashcards)} flashcards · ${nf(r.questions)} questions` : `${r.cartesAVerifier ? nf(r.cartesAVerifier) + ' carte(s) à vérifier' : ''}${r.baisse ? ` · ${nf(r.baisse.total)} de moins qu’hier` : ''}${(r.globales || []).length ? ' · ' + r.globales.map((g) => g.type === 'empreinte' ? 'écart avec le cloud' : 'journal en attente').join(', ') : ''}`}
            </div>
          </div>
          {r && !r.ok && <button type="button" className="btn sm" onClick={() => ctx.go('integrite')}>Voir</button>}
        </div>
        <div className="hint">Restauration depuis une copie : <code>{PROCEDURE}</code>.</div>
      </div>
    </Card>
  );
}

export { dossierDisponible };
