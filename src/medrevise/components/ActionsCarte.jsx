/* ============================================================
   MedRevise — CARNET D'ERREURS ET APPRENTISSAGE EN UN GESTE, depuis la CARTE AFFICHÉE en révision
   (17/10, refait le 17/10 soir — docs/compte-rendu-import-tableau-nettete.md, point 5).
   Une petite rangée d'ICÔNES dans l'en-tête de la carte (coin supérieur droit) : elle appartient à
   la carte affichée, apparaît dès que la carte est RETOURNÉE (avant même de noter) et disparaît avec
   elle quand on passe à la suivante. Hors du flux du contenu : toujours visible, quel que soit le
   défilement interne de la carte.
   - « Carnet d'erreurs » (icône cible) : (24/10, docs/compte-rendu-seance-categories.md § 6) PETIT MENU —
     les pré-réponses en puces sur 2 lignes au plus, un tap crée l'entrée (lib/carnetPreReponses.js) et
     ferme — toast « Ajouté au carnet · Modifier » ; « Ajouter une note » replié, facultatif (la note part
     avec la puce touchée ensuite). Téléphone : feuille du bas ≤ 35 % de la hauteur, sans défilement ;
     ordinateur : popover compact sous l'icône. Remplace la grande liste (et le formulaire « Autre… ») ;
   - (25/10) l'ancien bouton « Apprentissage » est retiré : toutes les flashcards sont dans le mode
     Apprentissage d'office (apprentissageLibre/).
   Le carnet n'écrit que ses champs (carnetAt,
   carnetType, carnetRaison) sur la version enregistrée de la carte.
   Les clics ne remontent jamais à la carte (qui se retourne au clic).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { preReponsesDe, ajouterAuCarnet, admissibleCarnet } from '../lib/carnetPreReponses.js';
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
export function ActionsCarte({ ctx, carte, mobile: mobileProp }) {
  const mobile = mobileProp ?? etroit();
  const [menu, setMenu] = useState(false); // menu des pré-réponses
  const [posMenu, setPosMenu] = useState(null); // ordinateur : position FIXE (jamais rognée par la zone qui défile)
  const boutonCarnet = useRef(null);
  const [note, setNote] = useState(null); // note facultative du carnet : null = repliée
  const [modifier, setModifier] = useState(null); // { id, type, note }
  const [toast, setToast] = useState(null); // { texte, sous, action }
  const racine = useRef(null);

  // autre carte : menu refermé (le toast de la carte précédente peut finir sa course)
  useEffect(() => { setMenu(false); setNote(null); }, [carte && carte.id]);
  useEffect(() => { if (!menu) setNote(null); else setToast(null); }, [menu]); // menu ouvert : le toast précédent ne le recouvre pas
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  // menu (ordinateur) : se ferme au clic à l'extérieur ou sur Échap
  useEffect(() => {
    if (!menu) return undefined;
    const dehors = (e) => { if (!mobile && racine.current && !racine.current.contains(e.target) && !(e.target.closest && e.target.closest('.cn-pop'))) setMenu(false); };
    const echap = (e) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('pointerdown', dehors); window.addEventListener('keydown', echap);
    return () => { window.removeEventListener('pointerdown', dehors); window.removeEventListener('keydown', echap); };
  }, [menu, mobile]);

  if (!carte) return null;
  const carnetOk = admissibleCarnet(carte);
  // (25/10, Apprentissage v2) plus de bouton « Apprentissage » : toutes les flashcards y sont d'office
  if (!carnetOk) return null;
  const dejaCarnet = !!((ctx.db && ctx.db.questions) || []).find((q) => q.id === carte.id && q.carnetAt);
  const preReponses = preReponsesDe(ctx.carnetPreReponses);
  const stop = (e) => e.stopPropagation();

  const choisir = async (pr) => {
    const n = String(note || '').trim();
    setMenu(false);
    try {
      await ajouterAuCarnet(carte.id, { type: pr.label, note: n }, ctx.saveQuestion);
      setToast({ texte: 'Ajouté au carnet', sous: pr.label, action: { label: 'Modifier', fn: () => setModifier({ id: carte.id, type: pr.label, note: n }) } });
    } catch (e) { setToast({ texte: e.message }); }
  };
  const titre = apercu(carte);
  // puces : 2 lignes au plus (colonnes = moitié des puces) ; libellé court (sans la parenthèse), le complet en infobulle
  const court = (l) => String(l || '').replace(/\s*\(.*\)\s*$/, '').trim() || l;
  const puces = [...preReponses, { id: 'autre', label: 'Autre' }];
  const listePre = (
    <div className="cn" data-carnet="menu">
      <div className="cn-puces" role="menu" aria-label="Pré-réponses du carnet d’erreurs" style={{ '--cn-col': Math.ceil(puces.length / 2) }}>
        {puces.map((p) => (
          <button key={p.id} type="button" role="menuitem" className={'cn-puce' + (p.id === 'autre' ? ' cn-autre' : '')} data-pre={p.id} title={p.label} onClick={() => choisir(p)}>
            <span>{court(p.label)}</span></button>
        ))}
      </div>
      {note == null
        ? <button type="button" className="cn-note-bt" data-carnet="note" onClick={() => setNote('')}><Icon name="plus" size={12} /> Ajouter une note</button>
        : <input className="cn-note" data-carnet="champ-note" autoFocus value={note} placeholder="Note facultative, puis touche un type"
            aria-label="Note du carnet (facultative)" onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); choisir({ label: 'Autre' }); } }} />}
    </div>
  );
  const popover = !mobile && (
    <div className="cn-pop" role="dialog" aria-label="Carnet d’erreurs" style={posMenu || undefined}>{listePre}</div>
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
              const L = Math.min(380, window.innerWidth - 16);
              const haut = window.innerHeight - r.bottom < 170;
              setPosMenu({ width: L, left: Math.max(8, Math.min(r.right - L, window.innerWidth - L - 8)), ...(haut ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
            }
            setMenu((v) => !v);
          }}><Icon name="target" size={mobile ? 19 : 15} /></button>
      )}
      {menu && !mobile && createPortal(popover, document.body) /* portail : un ancêtre animé (transform 3D de la carte) décalerait le `fixed` */}

      {menu && mobile && createPortal(
        <div className="sn-feuille-fond" onClick={() => setMenu(false)}>
          <div className="sn-feuille cn-feuille" role="dialog" aria-label="Carnet d’erreurs" onClick={(e) => e.stopPropagation()}>
            <div className="sn-feuille-poignee" />
            <div className="cn-tete">
              <span className="cn-titre">Carnet d’erreurs</span><span className="cn-sous">{titre}</span>
              <button type="button" className="cn-fermer" onClick={() => setMenu(false)} aria-label="Fermer"><Icon name="x" size={15} /></button>
            </div>
            {listePre}
          </div>
        </div>, document.body)}

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
