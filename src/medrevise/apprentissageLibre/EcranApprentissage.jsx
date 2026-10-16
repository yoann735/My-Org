/* ============================================================
   MedRevise — onglet « APPRENTISSAGE » (mode libre, 11/10,
   docs/compte-rendu-mode-apprentissage-libre.md). Espace d'entraînement en rafale,
   TOTALEMENT indépendant de la méthode des J et de FSRS : les cartes de la liste
   `learning_set`, rangées par cours ; cases à cocher par cours (et « Tout ») ; « Lancer ».
   Retrait d'un clic. Rien n'entre ni ne sort de la liste automatiquement.
   Même écran sur ordinateur et sur téléphone (`mobile` : en-tête du shell mobile).
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { grouperParMatiere, idsDesCours, retirer } from './liste.js';
import { typeDeCarte } from './FaceCarte.jsx';
import { SessionApprentissage } from './SessionApprentissage.jsx';
import '../../styles/apprentissage-libre.css';

const pl = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;

export function EcranApprentissage({ ctx, mobile = false, onRetour = null }) {
  const liste = ctx.db.learningSet || [];
  // (16/10) TOUJOURS par matière puis par cours (une matière vide disparaît d'elle-même) ; la
  // séance suit le même ordre que l'écran
  const matieres = useMemo(() => grouperParMatiere(ctx.db, liste), [ctx.db, liste]);
  const groupes = useMemo(() => matieres.flatMap((m) => m.cours), [matieres]);
  const notes = ctx.db.learningNotes || {};
  const [noteOuverte, setNoteOuverte] = useState(() => new Set());
  const basculerNote = (id) => setNoteOuverte((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
            {matieres.map((m) => (
              <div key={m.matiere.id} className="alib-matiere" data-matiere={m.matiere.id}>
                <h2 className="alib-mtitre">{m.matiere.nom} <span className="hint tnum">{pl(m.cours.reduce((n, g) => n + g.cartes.length, 0), 'carte')}</span></h2>
                {m.cours.map((g) => (
                  <section key={g.fiche.id} className="card alib-groupe" data-cours={g.fiche.id}>
                    <label className="alib-gtete">
                      <input type="checkbox" checked={cochesValides.has(g.fiche.id)} onChange={() => basculer(g.fiche.id)} />
                      <span className="alib-gtitre">{g.fiche.titre}</span>
                      <span className="pill alib-n tnum">{g.cartes.length}</span>
                    </label>
                    <ul className="alib-cartes">
                      {g.cartes.map((q) => {
                        const t = typeDeCarte(q);
                        const aNote = !!(notes[q.id] && notes[q.id].trim());
                        const ouverte = noteOuverte.has(q.id);
                        return (
                          <li key={q.id} className={'alib-carte' + (aNote || ouverte ? ' avec-note' : '')} data-carte={q.id}>
                            <div className="alib-ligne">
                              <span className="alib-recto"><Tex>{String(q.recto || (q.molecule && q.molecule.nom) || '').replace(/\{\{[^{}]+\}\}/g, '[…]')}</Tex></span>
                              {t && <span className="alib-type">{t}</span>}
                              <button type="button" className={'alib-crayon' + (aNote ? ' a-note' : '') + (ouverte ? ' actif' : '')} onClick={() => basculerNote(q.id)}
                                aria-label={aNote ? 'Modifier la note' : 'Ajouter une note'} aria-expanded={ouverte} title={aNote ? 'Modifier la note' : 'Ajouter une note'}><Icon name="edit" size={13} /></button>
                              <button type="button" className="alib-retirer" onClick={() => retirerCarte(q.id)}
                                aria-label="Retirer de l’apprentissage" title="Retirer de l’apprentissage"><Icon name="x" size={14} /></button>
                            </div>
                            {ouverte
                              ? <NoteCarte ctx={ctx} cardId={q.id} initiale={notes[q.id] || ''} />
                              : aNote && <button type="button" className="alib-note-apercu" onClick={() => basculerNote(q.id)}>{notes[q.id]}</button>}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* NOTE LIBRE d'une carte (16/10) : plein texte, sauvegarde automatique (0,6 s après la frappe, et à
   la sortie du champ) dans l'enregistrement learning_set — jamais sur la carte. */
function NoteCarte({ ctx, cardId, initiale }) {
  const [texte, setTexte] = useState(initiale);
  const [etat, setEtat] = useState('');
  const minuteur = useRef(null);
  const dernier = useRef(initiale);
  const champ = useRef(null);
  const sauver = async (v) => {
    clearTimeout(minuteur.current); minuteur.current = null;
    if (v === dernier.current) return;
    dernier.current = v; setEtat('…');
    await ctx.setLearningNote(cardId, v); setEtat('Enregistré');
  };
  useEffect(() => { if (champ.current) champ.current.focus(); return () => clearTimeout(minuteur.current); }, []);
  return (
    <div className="alib-note">
      <textarea ref={champ} className="imp-title alib-note-champ" value={texte} placeholder="Ta note sur cette carte (visible en session, sous la réponse)"
        aria-label="Note sur la carte"
        onChange={(e) => { const v = e.target.value; setTexte(v); setEtat(''); clearTimeout(minuteur.current); minuteur.current = setTimeout(() => sauver(v), 600); }}
        onBlur={() => sauver(texte)} />
      <span className="alib-note-etat" aria-live="polite">{etat}</span>
    </div>
  );
}
