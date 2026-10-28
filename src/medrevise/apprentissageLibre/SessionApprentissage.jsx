/* ============================================================
   MedRevise — MODE APPRENTISSAGE LIBRE : la session en rafale (bureau et téléphone).
   Question → retourner → réponse ; « Pas su » / « Su » ; « Skip » discret. Logique pure dans
   ./session.js. L'état vit en mémoire seulement : quitter = abandonner (rien à reprendre).
   (26/10) seule écriture possible : l'étoile « À apprendre » de la carte affichée (champ `aApprendre`, geste explicite).
   (28/10) COMPTEUR DE PASSAGES : quand une carte devient « sue » (2 « Su » d'affilée), +1 dans learning_set.passages
   (ctx.addLearningPassages), tout de suite — quitter la session ne le perd pas ; badge « ×n » sur la carte affichée.
   AUCUNE autre écriture, ni pendant ni après la session (v2, 25/10 : plus de liste à vider — toutes les
   flashcards sont dans le mode Apprentissage d'office).
   Gestes (téléphone) : toucher = retourner ; au verso, glisser à droite = Su, à gauche = Pas su.
   Clavier (bureau) : Espace = retourner ; ← ou 1 = Pas su ; → ou 2 = Su ; S = Skip.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ligneParLigne } from '../components/FlashcardMuscle.jsx';
import { FaceCarte, BadgePassages } from './FaceCarte.jsx';
import { BoutonAApprendre } from '../components/BoutonAApprendre.jsx';
import { nouvelleSession, carteCourante, repondre, passer, finir, bilan } from './session.js';
import { passagesDe } from './tableauBord.js';

const pl = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;

export function SessionApprentissage({ ctx, ids, onQuitter, pleinEcran = false }) {
  const [s, setS] = useState(() => nouvelleSession(ids));
  const [retournee, setRetournee] = useState(false);
  const cartes = useMemo(() => Object.fromEntries((ctx.db.questions || []).map((q) => [q.id, q])), [ctx.db.questions]);
  const fiches = useMemo(() => Object.fromEntries((ctx.db.fiches || []).map((f) => [f.id, f])), [ctx.db.fiches]);
  const id = carteCourante(s);
  const carte = id ? cartes[id] || null : null;

  // carte supprimée ailleurs pendant la session : elle sort simplement de la file
  useEffect(() => {
    if (id && !cartes[id]) setS((x) => { const file = x.file.filter((k) => k !== id); return { ...x, file, fin: file.length === 0 }; });
  }, [id, cartes]);

  const agir = (f) => { setS(f); setRetournee(false); };
  const su = () => {
    if (!retournee) return;
    const n = repondre(s, true);
    const neuves = n.sues.filter((k) => !s.sues.includes(k));
    if (neuves.length && ctx.addLearningPassages) ctx.addLearningPassages(neuves).catch(() => {});
    agir(() => n);
  };
  const pasSu = () => retournee && agir((x) => repondre(x, false));
  const skip = () => agir(passer);

  // clavier (bureau)
  const actions = useRef({}); actions.current = { su, pasSu, skip, retourner: () => setRetournee(true), retournee, fin: s.fin };
  useEffect(() => {
    const onKey = (e) => {
      const a = actions.current;
      if (a.fin || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === ' ' || e.key === 'Enter') { if (!a.retournee) { e.preventDefault(); a.retourner(); } }
      else if (e.key === 'ArrowRight' || e.key === '2') { if (a.retournee) { e.preventDefault(); a.su(); } }
      else if (e.key === 'ArrowLeft' || e.key === '1') { if (a.retournee) { e.preventDefault(); a.pasSu(); } }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); a.skip(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // glisser (téléphone) : au verso, droite = Su, gauche = Pas su
  const geste = useRef(null);
  const ignorerClic = useRef(false);
  const [decal, setDecal] = useState(0);
  const onTouchStart = (e) => { const t = e.touches[0]; geste.current = { x: t.clientX, y: t.clientY, horiz: null }; };
  const onTouchMove = (e) => {
    const g = geste.current; if (!g || !retournee) return;
    const t = e.touches[0]; const dx = t.clientX - g.x; const dy = t.clientY - g.y;
    if (g.horiz == null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) g.horiz = Math.abs(dx) > Math.abs(dy) * 1.5;
    if (g.horiz) setDecal(dx);
  };
  const onTouchEnd = (e) => {
    const g = geste.current; geste.current = null;
    if (!g || !retournee || !g.horiz) { setDecal(0); return; }
    const dx = e.changedTouches[0].clientX - g.x;
    setDecal(0);
    if (Math.abs(dx) >= 80) { ignorerClic.current = true; setTimeout(() => { ignorerClic.current = false; }, 400); if (dx > 0) su(); else pasSu(); }
  };

  const b = bilan(s);
  const total = s.total;
  const pct = total ? (s.sues.length / total) * 100 : 100;
  const suite = id ? s.suites[id] || 0 : 0;

  return (
    <div className={'sfc alib-session' + (pleinEcran ? ' plein-ecran' : '')}>
      <div className="sfc-tete">
        <button type="button" className="sfc-quitter" onClick={onQuitter} aria-label="Quitter la session" title="Quitter (la session est abandonnée, rien n’est enregistré)"><Icon name="x" size={18} /></button>
        <div className="sfc-barre"><span style={{ width: Math.max(0, Math.min(100, pct)) + '%' }} /></div>
        <span className="sfc-prog tnum" title="Cartes sues dans cette session">{s.sues.length} / {total} sues</span>
        {!s.fin && <button type="button" className="alib-finir" onClick={() => agir(finir)} title="Finir la session et voir le bilan">Finir</button>}
      </div>

      {s.fin && (
        <div className="sfc-centre sfc-synthese alib-fin">
          <div className="sfc-titre">{b.vues && !s.file.length ? 'Toutes les cartes sont sues' : 'Session terminée'}</div>
          <div className="alib-bilan tnum">{pl(b.vues, 'carte vue', 'cartes vues')} · {pl(b.sues, 'sue', 'sues')} · {b.aRetravailler} à retravailler</div>
          <button type="button" className="sfc-btn principal" onClick={onQuitter}>Terminer</button>
        </div>
      )}

      {!s.fin && carte && (
        <div className="sfc-corps">
          <div className="sfc-etiquette alib-etiquette">
            <span className="alib-cours">{(fiches[carte.ficheId] || {}).titre || ''}</span>
            <BadgePassages n={passagesDe(ctx.db.learningPassages, carte.id)} />
            {suite > 0 && <span className="pill accent alib-suite" title="Encore un « Su » d’affilée et la carte est sue">1 Su sur 2</span>}
            <BoutonAApprendre ctx={ctx} carte={carte} classe="ac-icone" taille={pleinEcran ? 18 : 15} mobile={pleinEcran} />
          </div>
          <button type="button" className="sfc-carte" key={carte.id + ':' + (retournee ? 'v' : 'r')} data-carte={carte.id}
            style={decal ? { transform: `translateX(${decal}px) rotate(${decal / 40}deg)`, transition: 'none' } : undefined}
            onClick={() => { if (!ignorerClic.current) setRetournee((r) => !r); }}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            <FaceCarte carte={carte} cote={retournee ? 'verso' : 'recto'} masquable={ligneParLigne(ctx)} />
            {!retournee && <span className="sfc-indication">Touche pour voir la réponse</span>}
          </button>
          {/* (16/10) la note libre de la carte, après retournement, sous la réponse */}
          {retournee && ((ctx.db.learningNotes || {})[carte.id] || '').trim() && (
            <div className="alib-note-session" data-note={carte.id}><Icon name="edit" size={12} /> <span>{ctx.db.learningNotes[carte.id]}</span></div>
          )}
          <div className="sfc-bas alib-bas">
            {!retournee
              ? <button type="button" className="sfc-btn neutre" onClick={() => setRetournee(true)}>Voir la réponse</button>
              : (
                <div className="alib-notes">
                  <button type="button" className="sfc-btn alib-passu" onClick={pasSu}>Pas su</button>
                  <button type="button" className="sfc-btn alib-su" onClick={su}>Su</button>
                </div>
              )}
            <button type="button" className="alib-skip" onClick={skip} disabled={s.file.length < 2} title="Passer à la carte suivante sans rien noter">Skip</button>
          </div>
        </div>
      )}

    </div>
  );
}
