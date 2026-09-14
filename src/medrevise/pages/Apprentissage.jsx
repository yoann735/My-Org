/* ============================================================
   MedRevise — écran APPRENTISSAGE : les unités (exos pédagogiques + PDF du cours).
   Espace de compréhension, sans suivi : rien ici n'écrit dans `questions`, les stats
   ou le planning (voir lib/apprentissage.js).
   Liste des unités (création, suppression) ; « Ouvrir » → écran splitté exos | PDF
   (apprentissage/UniteSplit.jsx).
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, ConfirmModal, matiereMeta } from '../components/ui.jsx';
import { ImportApprentissage } from '../components/ImportApprentissage.jsx';
import { deleteUnite, compteUnite } from '../lib/apprentissage.js';
import { UniteSplit } from '../apprentissage/UniteSplit.jsx';

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function Apprentissage({ ctx }) {
  const { db } = ctx;
  const unites = [...(db.apprentissage || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const [creation, setCreation] = useState(false);
  const [aSupprimer, setASupprimer] = useState(null);
  const [flash, setFlash] = useState(null);
  const [ouverteId, setOuverteId] = useState(null);
  const ouverte = unites.find((u) => u.id === ouverteId) || null;

  const supprimer = async () => {
    const u = aSupprimer;
    setASupprimer(null);
    await deleteUnite(u);
    await ctx.reload();
    setFlash(`« ${u.titre} » supprimée.`);
    setTimeout(() => setFlash(null), 4000);
  };

  // unité supprimée ailleurs (autre appareil) pendant qu'elle était ouverte : `ouverte`
  // devient null et on retombe simplement sur la liste.
  if (ouverte) return <UniteSplit key={ouverte.id} ctx={ctx} unite={ouverte} onRetour={() => setOuverteId(null)} />;

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Apprentissage</h1>
          <div className="sub">Apprendre un cours en pratiquant, le PDF sous les yeux — sans planification ni suivi.</div>
        </div>
        <div className="topbar-actions">
          {!creation && <button className="btn primary" onClick={() => setCreation(true)}><Icon name="plus" size={15} /> Nouvelle unité</button>}
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      {creation && (
        <Card style={{ marginBottom: 18 }}>
          <ImportApprentissage ctx={ctx}
            onCancel={() => setCreation(false)}
            onDone={(u) => { setCreation(false); setFlash(`« ${u.titre} » créée — ${pluriel(u.items.length, 'exo')}.`); setTimeout(() => setFlash(null), 5000); }} />
        </Card>
      )}

      {flash && <div className="err-mini ok" style={{ marginBottom: 14 }}><div className="em-ic"><Icon name="check" size={16} /></div><div className="em-body"><div className="em-title">{flash}</div></div></div>}

      {!unites.length && !creation && (
        <div className="rev-empty" style={{ marginTop: 50 }}>
          <Icon name="brain" size={30} />
          <div className="re-title">Aucune unité d'apprentissage</div>
          <div className="hint" style={{ maxWidth: 440, textAlign: 'center' }}>Une unité = les exos générés par ton prompt d'apprentissage + le PDF du cours, affichés côte à côte.</div>
          <button className="btn primary" onClick={() => setCreation(true)}><Icon name="plus" size={15} /> Créer une unité</button>
        </div>
      )}

      {unites.length > 0 && (
        <div className="appr-grid">
          {unites.map((u) => {
            const m = db.matieres.find((x) => x.id === u.matiereId);
            const mm = matiereMeta(m || null);
            const c = compteUnite(u);
            return (
              <div className="card appr-card" key={u.id}>
                <div className="card-body">
                  <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: m ? mm.tint : 'var(--border)', display: 'inline-block', flex: '0 0 auto' }} />
                    <span className="hint" style={{ fontSize: 12 }}>{m ? mm.label : 'Sans matière'}</span>
                  </div>
                  <button type="button" className="serif appr-titre linklike" onClick={() => setOuverteId(u.id)}>{u.titre}</button>
                  <div className="hint" style={{ marginTop: 6 }}>
                    {[c.qcm && `${c.qcm} QCM`, c.exercice && pluriel(c.exercice, 'exercice')].filter(Boolean).join(' · ')}
                  </div>
                  <div className="hint appr-pdf"><Icon name="filePdf" size={12} /> {u.pdfName || 'PDF du cours'}{u.ficheId ? ' · repris d’une fiche' : ''}</div>
                  <div className="row spread" style={{ marginTop: 14, alignItems: 'center' }}>
                    <span className="hint" style={{ fontSize: 11.5 }}>Créée le {new Date(u.createdAt).toLocaleDateString('fr-FR')}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn ghost sm" onClick={() => setASupprimer(u)} title="Supprimer l'unité"><Icon name="trash" size={13} /></button>
                      <button className="btn primary sm" onClick={() => setOuverteId(u.id)}><Icon name="play" size={13} /> Ouvrir</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {aSupprimer && (
        <ConfirmModal danger title={`Supprimer « ${aSupprimer.titre} » ?`}
          body={`${pluriel((aSupprimer.items || []).length, 'exo')} et leurs brouillons seront supprimés, sur tous tes appareils. ${aSupprimer.ficheId ? 'Le PDF reste dans sa fiche.' : 'Les surlignages faits dans ce PDF aussi.'} Tes fiches, cartes et la méthode des J ne sont pas concernées.`}
          confirmLabel="Supprimer" onConfirm={supprimer} onCancel={() => setASupprimer(null)} />
      )}
    </div>
  );
}
