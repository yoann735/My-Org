/* ============================================================
   MedRevise mobile — accueil (cul-de-sac). Trois blocs seulement :
   Série du jour, À rattraper, fiches dues aujourd'hui. Réutilise
   todayPlan/dueToday/overdueByFiche (planning.js) et ctx.dismissOverdue —
   même logique que le Dashboard/Réviser desktop, présentation neuve.
   Les fiches "schéma anatomique" (quiz visuel canvas) sont exclues : hors
   périmètre mobile (voir le plan validé).
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { index, dueToday, todayPlan, overdueByFiche, isFicheScheduled, carnetV1Questions, carnetV2Questions } from '../lib/planning.js';
import { todayISO } from '../lib/sm2.js';
import { matiereMeta, syncStatusLabel, DateActionModal, ConfirmModal } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { exportBackup } from '../lib/backupExport.js';

// carnet d'erreurs v2 : aperçu LISTE (pas la carte de révision interactive) —
// déplie les {{mots}} de cloze en texte normal avant rendu <Tex> (LaTeX), même
// traitement que CarnetDashboard.jsx desktop (voir là-bas pour le détail).
const stripCloze = (s) => (s || '').replace(/\{\{([^{}]+)\}\}/g, '$1');

export function MobileHome({ ctx, onStartSession, onStartExercice, onStartFeynman }) {
  const { db } = ctx;
  const ix = useMemo(() => index(db), [db]);
  const due = useMemo(() => dueToday(db, ix), [db, ix]);
  const plan = useMemo(() => todayPlan(db, ix), [db, ix]);
  const overdue = useMemo(() => overdueByFiche(db, ix).filter((g) => !g.isSchema), [db, ix]);
  const [confirmDismiss, setConfirmDismiss] = useState(null);
  // rééquilibrage calendrier (étape 2/3) : côté mobile, source = toujours
  // "aujourd'hui" (pas de calendrier hebdo mobile) — désengorger la journée
  // qu'on regarde. moveTarget déclenche la même modale date que le desktop ;
  // seule `dueDate` change (voir ctx.moveSourceDay/moveFicheDay). Pas de
  // toggle cascade (moteur adaptatif : une seule échéance connue par carte,
  // voir Dashboard.jsx desktop pour le détail).
  const [moveTarget, setMoveTarget] = useState(null); // { type: 'source'|'fiche', id, nom, count }
  const coursToday = useMemo(() => {
    const bySource = {};
    plan.forEach((g) => {
      if (!g.source) return;
      if (!bySource[g.source.id]) bySource[g.source.id] = { source: g.source, total: 0 };
      bySource[g.source.id].total += g.items.length;
    });
    return Object.values(bySource);
  }, [plan]);
  const startMove = (target) => setMoveTarget(target);
  const confirmMove = async (toDate) => {
    if (!moveTarget) return;
    if (moveTarget.type === 'source') await ctx.moveSourceDay(moveTarget.id, todayISO(), toDate);
    else await ctx.moveFicheDay(moveTarget.id, todayISO(), toDate);
    setMoveTarget(null);
  };
  // « Sauter aujourd'hui » — persiste `skippedOn = aujourd'hui` (voir
  // MedReviseApp.jsx skipDaySource/skipDayFiche) : aucune écriture de
  // progression, la carte redevient due normalement dès demain.
  const [skipTarget, setSkipTarget] = useState(null); // { type, id, nom, count }
  const confirmSkip = async () => {
    if (!skipTarget) return;
    if (skipTarget.type === 'source') await ctx.skipDaySource(skipTarget.id, todayISO());
    else await ctx.skipDayFiche(skipTarget.id, todayISO());
    setSkipTarget(null);
  };

  // « Exporter toutes mes données » — le mobile n'a pas d'écran Réglages (voir
  // MobileApp.jsx), donc la sauvegarde vit ici, en bas de l'accueil. MÊME
  // fonction que le desktop (lib/backupExport.js), donc mêmes garanties :
  // lecture seule, aucun appel réseau, aucune synchro déclenchée. Sur iPhone,
  // deliverFile passe par la feuille de partage iOS (« Enregistrer dans
  // Fichiers ») plutôt que par un <a download>, peu fiable sur Safari iOS.
  const [backup, setBackup] = useState({ busy: false, message: '' });
  const runExport = async (withBlobs) => {
    setBackup({ busy: true, message: 'Lecture des données…' });
    const res = await exportBackup({
      withBlobs,
      onProgress: (m) => setBackup({ busy: true, message: m }),
    });
    setBackup({ busy: false, message: res.message });
  };

  const startAll = () => due.length && onStartSession(due, "Série du jour");
  const startFiche = (group) => onStartSession(group.items, group.fiche.titre);

  // carnet d'erreurs v2 (étape 2) : portée mobile = CONSULTATION + lancer la
  // série (le geste "au pouce", week-end inclus) — PAS l'extraction/collage
  // JSON, geste "bureau" réservé au tableau de bord desktop (SCREENS.carnet).
  const carnetV1 = useMemo(() => carnetV1Questions(db), [db]);
  const carnetARevoir = useMemo(() => carnetV2Questions(db, 'a_revoir'), [db]);
  const startErreurs = () => carnetARevoir.length && onStartSession(carnetARevoir, "Mes flashcards d'erreur", { mode: 'erreur' });

  // exercices/Feynman : HORS méthode des J (pas de date d'échéance), donc
  // jamais dans todayPlan — regroupés à part pour rester joignables. NE
  // DÉPENDENT PAS de "due aujourd'hui" : contrairement aux cartes QCM/flash,
  // finir la série du jour ne doit pas les faire disparaître de l'accueil.
  const extrasByFiche = useMemo(() => {
    const m = {};
    (db.questions || []).forEach((q) => {
      if (q.type !== 'exercice' && q.type !== 'feynman') return;
      (m[q.ficheId] || (m[q.ficheId] = { exercice: [], feynman: [] }))[q.type].push(q);
    });
    return m;
  }, [db.questions]);

  // liste affichée = fiches avec cartes dues aujourd'hui (todayPlan) UNION
  // fiches ayant des exercices/Feynman disponibles (respecte la pause/retrait
  // de la méthode des J pour ces dernières, comme le reste de l'accueil).
  const ficheRows = useMemo(() => {
    const byId = {};
    plan.forEach((g) => { byId[g.fiche.id] = { fiche: g.fiche, matiere: g.matiere, items: g.items, jLabel: g.jLabel }; });
    Object.keys(extrasByFiche).forEach((ficheId) => {
      if (byId[ficheId]) return;
      const f = ix.fById[ficheId];
      if (!f || f.archive || !isFicheScheduled(db, f, ix)) return;
      byId[ficheId] = { fiche: f, matiere: ix.mById[f.matiereId], items: [], jLabel: null };
    });
    return Object.values(byId);
  }, [plan, extrasByFiche, ix, db]);

  return (
    <div className="mrm-app">
      <div className="mrm-header">
        <div className="mrm-header-left">
          <button type="button" className="mrm-icon-btn" onClick={ctx.goHub} aria-label="Changer d'app" title="Retour au sélecteur d'applications">
            <Icon name="grid" size={17} />
          </button>
          <span className="mrm-brand"><Icon name="grad" size={18} /> MedRevise</span>
        </div>
        <div className="mrm-header-actions">
          <button type="button" className="mrm-icon-btn" disabled={ctx.syncState?.status === 'syncing'}
            onClick={ctx.forceSync} aria-label="Forcer la synchro" title={syncStatusLabel(ctx.syncState)}>
            <Icon name="refresh" size={18} className={ctx.syncState?.status === 'syncing' ? 'spin' : ''} />
          </button>
          <button type="button" className="mrm-icon-btn" onClick={ctx.toggleTheme} aria-label="Thème">
            <Icon name={ctx.theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
        </div>
      </div>

      <div className="mrm-scroll">
        <div className="mrm-card mrm-hero">
          <div className="mrm-hero-n">{due.length}</div>
          <div className="mrm-hero-label">carte{due.length > 1 ? 's' : ''} due{due.length > 1 ? 's' : ''} aujourd'hui</div>
          {(ctx.stats && ctx.stats.streak > 0) && (
            <div className="mrm-streak"><Icon name="fire" size={14} fill /> {ctx.stats.streak} jour{ctx.stats.streak > 1 ? 's' : ''} d'affilée</div>
          )}
          <button type="button" className="mrm-cta" onClick={startAll} disabled={!due.length}>
            <Icon name="play" size={20} fill /> Commencer la série
          </button>
        </div>

        {overdue.length > 0 && (
          <div className="mrm-section">
            <div className="mrm-section-head">
              <Icon name="clock" size={15} />
              <span>À rattraper</span>
              <span className="mrm-count">{overdue.length}</span>
            </div>
            <div className="mrm-list">
              {overdue.map((g) => (
                <div className="mrm-row" key={g.fiche.id}>
                  <div className="mrm-row-main">
                    <div className="mrm-row-title">{g.fiche.titre}</div>
                    <div className="mrm-row-sub">{matiereMeta(g.matiere).label} · {g.items.length} carte{g.items.length > 1 ? 's' : ''}</div>
                  </div>
                  <div className="mrm-row-actions">
                    <button type="button" className="mrm-chip-btn" onClick={() => startFiche(g)}>Rattraper</button>
                    <button type="button" className="mrm-icon-btn sm" title="Retirer du retard" onClick={() => setConfirmDismiss(g)}><Icon name="x" size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {coursToday.length > 0 && (
          <div className="mrm-section">
            <div className="mrm-section-head"><Icon name="folder" size={15} /> <span>Cours du jour</span></div>
            <div className="mrm-list">
              {coursToday.map((c) => (
                <div className="mrm-row" key={c.source.id}>
                  <div className="mrm-row-main">
                    <div className="mrm-row-title">{c.source.nom}</div>
                    <div className="mrm-row-sub">{c.total} carte{c.total > 1 ? 's' : ''} due{c.total > 1 ? 's' : ''}</div>
                  </div>
                  <div className="mrm-row-actions">
                    <button type="button" className="mrm-chip-btn ghost" onClick={() => setSkipTarget({ type: 'source', id: c.source.id, nom: c.source.nom, count: c.total })}>Sauter aujourd'hui</button>
                    <button type="button" className="mrm-chip-btn ghost" onClick={() => startMove({ type: 'source', id: c.source.id, nom: c.source.nom, count: c.total })}>Déplacer</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {ficheRows.length > 0 && (
          <div className="mrm-section">
            <div className="mrm-section-head"><Icon name="cards" size={15} /> <span>Fiches</span></div>
            <div className="mrm-list">
              {ficheRows.map((g) => {
                const extras = extrasByFiche[g.fiche.id];
                return (
                  <div className="mrm-row" key={g.fiche.id}>
                    <div className="mrm-row-main">
                      <div className="mrm-row-title">{g.fiche.titre}</div>
                      <div className="mrm-row-sub">
                        {matiereMeta(g.matiere).label}
                        {g.items.length > 0 ? ` · ${g.items.length} carte${g.items.length > 1 ? 's' : ''} · ${g.jLabel}` : ' · exercices/Feynman'}
                      </div>
                    </div>
                    <div className="mrm-row-actions">
                      {g.items.length > 0 && (
                        <button type="button" className="mrm-chip-btn" onClick={() => startFiche(g)}>Réviser</button>
                      )}
                      {g.items.length > 0 && (
                        <button type="button" className="mrm-chip-btn ghost" onClick={() => setSkipTarget({ type: 'fiche', id: g.fiche.id, nom: g.fiche.titre, count: g.items.length })}>Sauter</button>
                      )}
                      {g.items.length > 0 && (
                        <button type="button" className="mrm-chip-btn ghost" onClick={() => startMove({ type: 'fiche', id: g.fiche.id, nom: g.fiche.titre, count: g.items.length })}>Déplacer</button>
                      )}
                      {extras && extras.exercice.length > 0 && (
                        <button type="button" className="mrm-chip-btn ghost" onClick={() => onStartExercice(extras.exercice, g.fiche.titre)}>Exercices ({extras.exercice.length})</button>
                      )}
                      {extras && extras.feynman.length > 0 && (
                        <button type="button" className="mrm-chip-btn ghost" onClick={() => onStartFeynman({ items: extras.feynman, title: g.fiche.titre })}>Feynman ({extras.feynman.length})</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {carnetV1.length > 0 && (
          <div className="mrm-section">
            <div className="mrm-section-head">
              <Icon name="target" size={15} />
              <span>Carnet d'erreurs</span>
              <span className="mrm-count">{carnetV1.length}</span>
            </div>
            <div className="mrm-list">
              {carnetV1.map((v1) => (
                <div className="mrm-row" key={v1.id}>
                  <div className="mrm-row-main">
                    <div className="mrm-row-title"><Tex>{stripCloze(v1.recto)}</Tex></div>
                    {v1.carnetRaison && <div className="mrm-row-sub">{v1.carnetRaison}</div>}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="mrm-primary-btn" disabled={!carnetARevoir.length} onClick={startErreurs}>
              <Icon name="play" size={17} fill /> Réviser mes flashcards d'erreur ({carnetARevoir.length})
            </button>
          </div>
        )}

        {!due.length && !overdue.length && (
          <div className="mrm-empty">
            <Icon name="check" size={30} />
            <div>Tout est à jour pour aujourd'hui 🎉</div>
          </div>
        )}

        <div className="mrm-section">
          <div className="mrm-section-head"><Icon name="archive" size={15} /> <span>Sauvegarde</span></div>
          <div className="mrm-card">
            <div className="mrm-row-sub" style={{ marginBottom: 12 }}>
              Enregistre tout ce que contient cet appareil dans un fichier JSON.
              Lecture seule : rien n'est modifié, rien n'est envoyé au cloud.
            </div>
            <button type="button" className="mrm-primary-btn" disabled={backup.busy} onClick={() => runExport(false)}>
              <Icon name="archive" size={17} /> {backup.busy ? 'Export en cours…' : 'Exporter toutes mes données'}
            </button>
            <button type="button" className="mrm-btn" style={{ marginTop: 8, width: '100%' }} disabled={backup.busy} onClick={() => runExport(true)}>
              <Icon name="image" size={16} /> Avec les images et PDF
            </button>
            {backup.message && <div className="mrm-row-sub" style={{ marginTop: 10 }}>{backup.message}</div>}
          </div>
        </div>
      </div>

      {moveTarget && (
        <DateActionModal
          title={`Déplacer « ${moveTarget.nom} »`}
          label="Nouvelle date"
          confirmLabel="Déplacer"
          count={moveTarget.count}
          body={(date) => `${moveTarget.count} carte${moveTarget.count > 1 ? 's' : ''} ${moveTarget.count > 1 ? 'seront déplacées' : 'sera déplacée'} vers cette date. Intervalle, historique et progression restent inchangés — seule la date de réapparition change.`}
          onConfirm={confirmMove}
          onCancel={() => setMoveTarget(null)}
        />
      )}

      {skipTarget && (
        <ConfirmModal
          title={`Sauter aujourd'hui — « ${skipTarget.nom} »`}
          body={`${skipTarget.count} carte${skipTarget.count > 1 ? 's' : ''} oubliée${skipTarget.count > 1 ? 's' : ''} pour aujourd'hui seulement — l'intervalle et la progression ne bougent pas, elles redeviendront dues normalement demain.`}
          confirmLabel="Sauter"
          onConfirm={confirmSkip}
          onCancel={() => setSkipTarget(null)}
        />
      )}

      {confirmDismiss && (
        <div className="mrm-scrim" onClick={() => setConfirmDismiss(null)}>
          <div className="mrm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mrm-sheet-title">Retirer « {confirmDismiss.fiche.titre} » du retard ?</div>
            <div className="mrm-sheet-body">Elle ne sera pas révisée. Sa prochaine échéance est recalée à partir d'aujourd'hui.</div>
            <div className="mrm-sheet-actions">
              <button type="button" className="mrm-btn" onClick={() => setConfirmDismiss(null)}>Annuler</button>
              <button type="button" className="mrm-btn primary" onClick={() => { ctx.dismissOverdue(confirmDismiss); setConfirmDismiss(null); }}>Retirer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
