/* ============================================================
   MedRevise — CARNET D'ERREURS ET APPRENTISSAGE EN UN GESTE, depuis la CARTE AFFICHÉE en révision
   (17/10, refait le 17/10 soir — docs/compte-rendu-import-tableau-nettete.md, point 5).
   Une petite rangée d'ICÔNES dans l'en-tête de la carte (coin supérieur droit) : elle appartient à
   la carte affichée, apparaît dès que la carte est RETOURNÉE (avant même de noter) et disparaît avec
   elle quand on passe à la suivante. Hors du flux du contenu : toujours visible, quel que soit le
   défilement interne de la carte.
   - « Carnet d'erreurs » (icône cible) : menu de pré-réponses à UN tap (feuille du bas au téléphone) ;
     l'entrée est créée tout de suite (lib/carnetPreReponses.js) — toast « Ajouté au carnet ·
     Modifier » ; « Autre… » ouvre le formulaire complet (SaisieCarnet) ;
   - « Apprentissage » (icône rafale) : la carte rejoint la liste du mode Apprentissage.
   INDÉPENDANCE : « Apprentissage » n'écrit QUE `learning_set` (ctx.setLearningSet) — jamais la
   carte, ses J, son état FSRS ni le journal. Le carnet n'écrit que ses champs (carnetAt,
   carnetType, carnetRaison) sur la version enregistrée de la carte.
   Les clics ne remontent jamais à la carte (qui se retourne au clic).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { IconeRafale } from './IconeRafale.jsx';
import { SaisieCarnet } from './SaisieCarnet.jsx';
import { preReponsesDe, ajouterAuCarnet, admissibleCarnet } from '../lib/carnetPreReponses.js';
import { ajouter as ajouterAListe, estAdmissible } from '../apprentissageLibre/liste.js';
import { getOne } from '../lib/storage.js';
import { todayISO } from '../lib/sm2.js';
import '../../styles/actions-carte.css';

const etroit = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
const apercu = (c) => String((c && (c.recto || c.concept || c.question || c.enonce)) || '')
  .replace(/<[^>]+>/g, ' ').replace(/\{\{c\d+::([^}:]*)(::[^}]*)?\}\}/g, '$1').replace(/\s+/g, ' ').trim();


/* fenêtre AU-DESSUS DE TOUT, montée sur document.body : la carte retournée (transform 3D) et les
   boutons de notation ne peuvent ni la recouvrir ni lui imposer leur mise en page */
function Fenetre({ titre, onFermer, largeur = 'min(480px, 94vw)', children }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFermer]);
  return createPortal(
    <div className="ac-fenetre-fond" onClick={onFermer}>
      <div className="day-pop ac-fenetre" role="dialog" aria-label={titre} style={{ width: largeur }} onClick={(e) => e.stopPropagation()}>
        <div className="day-pop-head"><div className="row spread"><div className="serif" style={{ fontSize: 19 }}>{titre}</div>
          <button type="button" className="icon-btn sm" onClick={onFermer} title="Fermer (Échap)" aria-label="Fermer"><Icon name="x" size={16} /></button></div></div>
        <div className="day-pop-body ac-fenetre-corps">{children}</div>
      </div>
    </div>, document.body);
}

/* `carte` : la carte AFFICHÉE (id, type, recto) ; `mobile` : icônes de 40 px, feuille du bas */
export function ActionsCarte({ ctx, carte, mobile: mobileProp, sansApprentissage = false }) {
  const mobile = mobileProp ?? etroit();
  const [menu, setMenu] = useState(false); // menu des pré-réponses
  const [posMenu, setPosMenu] = useState(null); // ordinateur : position FIXE (jamais rognée par la zone qui défile)
  const boutonCarnet = useRef(null);
  const [autre, setAutre] = useState(null); // carte (relue) pour le formulaire complet
  const [modifier, setModifier] = useState(null); // { id, type, note }
  const [toast, setToast] = useState(null); // { texte, sous, action }
  const racine = useRef(null);

  // autre carte : menu refermé (le toast de la carte précédente peut finir sa course)
  useEffect(() => { setMenu(false); }, [carte && carte.id]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  // menu (ordinateur) : se ferme au clic à l'extérieur ou sur Échap
  useEffect(() => {
    if (!menu) return undefined;
    const dehors = (e) => { if (!mobile && racine.current && !racine.current.contains(e.target) && !(e.target.closest && e.target.closest('.sn-menu'))) setMenu(false); };
    const echap = (e) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('pointerdown', dehors); window.addEventListener('keydown', echap);
    return () => { window.removeEventListener('pointerdown', dehors); window.removeEventListener('keydown', echap); };
  }, [menu, mobile]);

  if (!carte) return null;
  const carnetOk = admissibleCarnet(carte);
  // `sansApprentissage` (22/10) : la liste des flashcards du panneau a déjà son interrupteur Apprentissage
  const apprOk = !sansApprentissage && estAdmissible(carte) && !carte.ephemeral && !!ctx.setLearningSet;
  if (!carnetOk && !apprOk) return null;
  const dejaAppr = ((ctx.db && ctx.db.learningSet) || []).includes(carte.id);
  const dejaCarnet = !!((ctx.db && ctx.db.questions) || []).find((q) => q.id === carte.id && q.carnetAt);
  const preReponses = preReponsesDe(ctx.carnetPreReponses);
  const stop = (e) => e.stopPropagation();

  const choisir = async (pr) => {
    setMenu(false);
    try {
      await ajouterAuCarnet(carte.id, { type: pr.label }, ctx.saveQuestion);
      setToast({ texte: 'Ajouté au carnet', sous: pr.label, action: { label: 'Modifier', fn: () => setModifier({ id: carte.id, type: pr.label, note: '' }) } });
    } catch (e) { setToast({ texte: e.message }); }
  };
  const ouvrirAutre = async () => { setMenu(false); setAutre((await getOne('questions', carte.id)) || carte); };
  const enregistrerAutre = async ({ raison, type, astuce }) => {
    const q = (await getOne('questions', carte.id)) || carte;
    await ctx.saveQuestion({ ...q, carnetAt: q.carnetAt || todayISO(), carnetType: type || 'Autre', carnetRaison: raison, ...(astuce ? { carnetAstuce: astuce } : {}) });
    setAutre(null);
    setToast({ texte: 'Ajouté au carnet', sous: type || 'Autre' });
  };
  const apprentissage = async () => {
    if (dejaAppr) { setToast({ texte: 'Déjà dans l’apprentissage' }); return; }
    await ctx.setLearningSet(ajouterAListe((ctx.db && ctx.db.learningSet) || [], [carte.id]));
    const q = (ctx.db.questions || []).find((x) => x.id === carte.id) || carte;
    const f = (ctx.db.fiches || []).find((x) => x.id === q.ficheId);
    const m = f && (ctx.db.matieres || []).find((x) => x.id === f.matiereId);
    setToast({ texte: 'Ajoutée à l’apprentissage', sous: [m && m.nom, f && f.titre].filter(Boolean).join(' › ') });
  };

  const titre = apercu(carte);
  const listePre = (
    <div className={mobile ? 'sn-feuille-liste' : 'sn-menu ctx-menu'} role="menu" aria-label="Pré-réponses du carnet d’erreurs" style={!mobile && posMenu ? posMenu : undefined}>
      {preReponses.map((p) => (
        <button key={p.id} type="button" role="menuitem" className={mobile ? 'sn-feuille-item' : 'ctx-menu-item sn-menu-item'} data-pre={p.id} onClick={() => choisir(p)}>{p.label}</button>
      ))}
      <button type="button" role="menuitem" className={(mobile ? 'sn-feuille-item' : 'ctx-menu-item sn-menu-item') + ' sn-autre'} data-pre="autre" onClick={ouvrirAutre}>Autre…</button>
    </div>
  );

  return (
    <div className={'ac' + (mobile ? ' ac-mobile' : '')} ref={racine} data-actions-carte={carte.id} role="group" aria-label="Cette carte"
      onClick={stop} onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onTouchEnd={stop} onKeyDown={stop}>
      {carnetOk && (
        <button type="button" className={'ac-icone' + (menu ? ' ouvert' : '') + (dejaCarnet ? ' fait' : '')} data-sn="carnet" ref={boutonCarnet} aria-haspopup="menu" aria-expanded={menu}
          title={dejaCarnet ? 'Déjà dans le carnet d’erreurs — choisir une autre pré-réponse' : 'Carnet d’erreurs : ajouter cette carte en un tap'} aria-label="Carnet d’erreurs"
          onClick={() => {
            if (!menu && boutonCarnet.current && !mobile) {
              // sous l'icône s'il y a la place, sinon au-dessus ; aligné à droite de l'icône
              const r = boutonCarnet.current.getBoundingClientRect();
              const haut = window.innerHeight - r.bottom < 330;
              setPosMenu({ left: Math.max(8, Math.min(r.right - 300, window.innerWidth - 348)), ...(haut ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
            }
            setMenu((v) => !v);
          }}><Icon name="target" size={mobile ? 19 : 15} /></button>
      )}
      {menu && !mobile && createPortal(listePre, document.body) /* portail : un ancêtre animé (transform 3D de la carte) décalerait le `fixed` */}
      {apprOk && (
        <button type="button" className={'ac-icone' + (dejaAppr ? ' fait' : '')} data-sn="apprentissage"
          title={dejaAppr ? 'Déjà dans la liste du mode Apprentissage' : 'Apprentissage : ajouter cette carte à la liste (indépendant des J)'} aria-label="Apprentissage"
          onClick={apprentissage}><IconeRafale size={mobile ? 19 : 15} />{dejaAppr && <span className="ac-coche"><Icon name="check" size={9} /></span>}</button>
      )}

      {menu && mobile && createPortal(
        <div className="sn-feuille-fond" onClick={() => setMenu(false)}>
          <div className="sn-feuille" role="dialog" aria-label="Carnet d’erreurs" onClick={(e) => e.stopPropagation()}>
            <div className="sn-feuille-poignee" />
            <div className="sn-feuille-titre">Carnet d’erreurs</div>
            <div className="sn-feuille-sous">{titre}</div>
            {listePre}
            <button type="button" className="sn-feuille-annuler" onClick={() => setMenu(false)}>Annuler</button>
          </div>
        </div>, document.body)}

      {autre && (
        <Fenetre titre="Carnet d’erreurs" onFermer={() => setAutre(null)} largeur="min(560px, 96vw)">
          <SaisieCarnet ctx={ctx} carte={autre} mobile={mobile} onSubmit={enregistrerAutre} onSkip={() => setAutre(null)} />
        </Fenetre>
      )}
      {modifier && (
        <Fenetre titre="Modifier l’entrée du carnet" onFermer={() => setModifier(null)}>
          <div className="sn-modif">
            <div className="cp-etiquette">Type</div>
            <div className="cp-puces" role="group" aria-label="Type d’erreur">
              {preReponses.map((p) => (
                <button key={p.id} type="button" className={'cp-puce' + (modifier.type === p.label ? ' actif' : '')} aria-pressed={modifier.type === p.label}
                  onClick={() => setModifier((m) => ({ ...m, type: p.label }))}>{p.label}</button>
              ))}
            </div>
            <label className="cp-etiquette" htmlFor="sn-note">Note (facultative)</label>
            <textarea id="sn-note" className="imp-title cp-champ" value={modifier.note} autoFocus placeholder="Ce que j’ai confondu, un repère…"
              onChange={(e) => setModifier((m) => ({ ...m, note: e.target.value }))} />
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn ghost sm" onClick={() => setModifier(null)}>Annuler</button>
              <button type="button" className="btn primary sm" data-sn="enregistrer" onClick={async () => {
                const m = modifier; setModifier(null);
                await ajouterAuCarnet(m.id, { type: m.type, note: m.note }, ctx.saveQuestion);
                setToast({ texte: 'Entrée du carnet modifiée', sous: m.type });
              }}><Icon name="check" size={13} /> Enregistrer</button>
            </div>
          </div>
        </Fenetre>
      )}

      {toast && createPortal(
        <div className={'sn-toast' + (mobile ? ' mobile' : '')} role="status">
          <Icon name="check" size={14} />
          <span className="sn-toast-texte">{toast.texte}{toast.sous && <span className="sn-toast-sous"> · {toast.sous}</span>}</span>
          {toast.action && <button type="button" className="sn-toast-action" onClick={() => { const a = toast.action; setToast(null); a.fn(); }}>{toast.action.label}</button>}
        </div>, document.body)}
    </div>
  );
}

/* Réglages › Carnet d'erreurs : les pré-réponses rapides (ajouter, renommer, réordonner, supprimer).
   Écrit l'enregistrement `carnetPreReponses` seulement. « Autre… » est toujours proposé en plus. */
export function ReglagesPreReponses({ ctx }) {
  const [liste, setListe] = useState(() => preReponsesDe(ctx.carnetPreReponses).map((p) => ({ ...p })));
  const enregistrer = (l) => { const propres = l.map((p) => ({ ...p, label: p.label.trim() })).filter((p) => p.label); setListe(propres); ctx.saveCarnetPreReponses(propres); };
  const changer = (i, v) => setListe((l) => l.map((p, k) => (k === i ? { ...p, label: v } : p)));
  const deplacer = (i, d) => { const l = [...liste]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; enregistrer(l); };
  return (
    <div className="sn-reglages" data-reglages="pre-reponses">
      <div className="hint">Pré-réponses rapides : le menu à un tap « Carnet d’erreurs » qui suit une note en révision. Chacune devient le type de l’entrée ; « Autre… » ouvre toujours le formulaire complet.</div>
      {liste.map((p, i) => (
        <div key={p.id} className="sn-reglage">
          <input className="imp-title" value={p.label} aria-label={`Pré-réponse ${i + 1}`} onChange={(e) => changer(i, e.target.value)} onBlur={() => enregistrer(liste)} />
          <button type="button" className="cd-ic" title="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}><Icon name="chevU" size={14} /></button>
          <button type="button" className="cd-ic" title="Descendre" disabled={i === liste.length - 1} onClick={() => deplacer(i, 1)}><Icon name="chevD" size={14} /></button>
          <button type="button" className="cd-ic" title="Supprimer cette pré-réponse" onClick={() => enregistrer(liste.filter((_, k) => k !== i))}><Icon name="trash" size={13} /></button>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 4 }}>
        <button type="button" className="btn sm" onClick={() => enregistrer([...liste, { id: 'r' + Date.now().toString(36), label: 'Nouvelle pré-réponse' }])}><Icon name="plus" size={13} /> Ajouter une pré-réponse</button>
      </div>
    </div>
  );
}
