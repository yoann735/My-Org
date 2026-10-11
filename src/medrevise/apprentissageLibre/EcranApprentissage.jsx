/* ============================================================
   MedRevise — onglet « APPRENTISSAGE » (mode libre, 11/10,
   docs/compte-rendu-mode-apprentissage-libre.md). Espace d'entraînement en rafale,
   TOTALEMENT indépendant de la méthode des J et de FSRS : les cartes de la liste
   `learning_set`, rangées par cours ; cases à cocher par cours (et « Tout ») ; « Lancer ».
   Retrait d'un clic. Rien n'entre ni ne sort de la liste automatiquement.
   Même écran sur ordinateur et sur téléphone (`mobile` : en-tête du shell mobile).
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { grouperParCours, idsDesCours, retirer } from './liste.js';
import { typeDeCarte } from './FaceCarte.jsx';
import { SessionApprentissage } from './SessionApprentissage.jsx';
import '../../styles/apprentissage-libre.css';

const pl = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;

export function EcranApprentissage({ ctx, mobile = false, onRetour = null }) {
  const liste = ctx.db.learningSet || [];
  const groupes = useMemo(() => grouperParCours(ctx.db, liste), [ctx.db, liste]);
  const [coches, setCoches] = useState(() => new Set());
  const [session, setSession] = useState(null); // ids de la session en cours
  const nCartes = groupes.reduce((n, g) => n + g.cartes.length, 0);
  const cochesValides = new Set(groupes.filter((g) => coches.has(g.fiche.id)).map((g) => g.fiche.id));
  const aLancer = idsDesCours(groupes, cochesValides);
  const tout = groupes.length > 0 && cochesValides.size === groupes.length;

  const basculer = (ficheId) => setCoches((c) => { const n = new Set(c); if (n.has(ficheId)) n.delete(ficheId); else n.add(ficheId); return n; });
  const basculerTout = () => setCoches(tout ? new Set() : new Set(groupes.map((g) => g.fiche.id)));
  const retirerCarte = (id) => ctx.setLearningSet(retirer(liste, [id]));

  if (session) return <SessionApprentissage key={session.n} ctx={ctx} ids={session.ids} pleinEcran={mobile} onQuitter={() => setSession(null)} />;

  const titre = (
    <div>
      <h1 className="serif">Apprentissage</h1>
      <div className="sub">Entraînement en rafale sur les cartes que tu choisis. Hors méthode des J : rien n’est noté, rien n’est planifié.</div>
    </div>
  );

  return (
    <div className={(mobile ? 'mrm-app alib-mobile' : 'screen scroll fadein') + ' alib'}>
      {mobile ? (
        <div className="alib-mtete">
          <button type="button" className="mrm-icon-btn" onClick={onRetour} aria-label="Retour à l’accueil"><Icon name="chevL" size={20} /></button>
          {titre}
        </div>
      ) : (
        <div className="topbar">
          {titre}
          <div className="topbar-actions"><EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} /></div>
        </div>
      )}

      {nCartes === 0 ? (
        <div className="rev-empty alib-vide">
          <Icon name="refresh" size={30} />
          <div className="re-title">Aucune carte en apprentissage</div>
          <div className="hint" style={{ maxWidth: 460, textAlign: 'center' }}>
            Dans le panneau Flashcards d’une fiche, « Mettre en apprentissage » sur une carte (ou « Sélectionner » pour en mettre plusieurs). Elles restent ici jusqu’à ce que tu les retires.
          </div>
        </div>
      ) : (
        <>
          <div className="alib-barre">
            <label className="alib-coche">
              <input type="checkbox" checked={tout} onChange={basculerTout} />
              <span>Tout <span className="hint tnum">({pl(nCartes, 'carte')})</span></span>
            </label>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn primary alib-lancer" disabled={!aLancer.length}
              onClick={() => setSession({ ids: aLancer, n: Date.now() })}>
              <Icon name="play" size={14} /> Lancer{aLancer.length ? <span className="tnum"> ({aLancer.length})</span> : null}
            </button>
          </div>

          <div className="alib-cours-liste">
            {groupes.map((g) => (
              <section key={g.fiche.id} className="card alib-groupe" data-cours={g.fiche.id}>
                <label className="alib-gtete">
                  <input type="checkbox" checked={cochesValides.has(g.fiche.id)} onChange={() => basculer(g.fiche.id)} />
                  <span className="alib-gtitre">{g.fiche.titre}</span>
                  <span className="pill alib-n tnum">{g.cartes.length}</span>
                </label>
                <ul className="alib-cartes">
                  {g.cartes.map((q) => {
                    const t = typeDeCarte(q);
                    return (
                      <li key={q.id} className="alib-carte" data-carte={q.id}>
                        <span className="alib-recto"><Tex>{String(q.recto || (q.molecule && q.molecule.nom) || '').replace(/\{\{[^{}]+\}\}/g, '[…]')}</Tex></span>
                        {t && <span className="alib-type">{t}</span>}
                        <button type="button" className="alib-retirer" onClick={() => retirerCarte(q.id)}
                          aria-label="Retirer de l’apprentissage" title="Retirer de l’apprentissage"><Icon name="x" size={14} /></button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
