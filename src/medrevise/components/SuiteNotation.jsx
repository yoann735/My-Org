/* ============================================================
   MedRevise — APRÈS UNE NOTE EN RÉVISION : CARNET D'ERREURS ET APPRENTISSAGE EN UN GESTE
   (17/10, docs/compte-rendu-fichier-carnet-calendrier.md).
   Sous les boutons de note, pour la carte QUI VIENT D'ÊTRE NOTÉE :
   - deux actions discrètes, visibles 2 s puis repliées dans une icône (toujours accessibles) ;
   - « Carnet d'erreurs » : un menu de pré-réponses à UN tap (feuille du bas au téléphone) ;
     l'entrée est créée tout de suite (lib/carnetPreReponses.js) — toast « Ajouté au carnet ·
     Modifier » ; « Autre… » ouvre le formulaire complet (SaisieCarnet) ;
   - « Apprentissage » : la carte rejoint la liste du mode Apprentissage (rangée par matière puis
     cours à l'affichage) — toast « Ajoutée à l'apprentissage ».
   INDÉPENDANCE : « Apprentissage » n'écrit QUE `learning_set` (ctx.setLearningSet) — jamais la
   carte, ses J, son état FSRS ni le journal. Le carnet n'écrit que ses champs (carnetAt,
   carnetType, carnetRaison) sur la version enregistrée de la carte.

   `carte` : { id, type, recto } de la carte notée ; `cle` : change à chaque note (relance les 2 s).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from './ui.jsx';
import { SaisieCarnet } from './SaisieCarnet.jsx';
import { preReponsesDe, ajouterAuCarnet, admissibleCarnet } from '../lib/carnetPreReponses.js';
import { ajouter as ajouterAListe, estAdmissible } from '../apprentissageLibre/liste.js';
import { getOne } from '../lib/storage.js';
import { todayISO } from '../lib/sm2.js';
import '../../styles/suite-notation.css';

export const DUREE_VISIBLE = 2000;
const etroit = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
const apercu = (c) => String((c && (c.recto || c.concept || c.question || c.enonce)) || '')
  .replace(/<[^>]+>/g, ' ').replace(/\{\{c\d+::([^}:]*)(::[^}]*)?\}\}/g, '$1').replace(/\s+/g, ' ').trim();

export function SuiteNotation({ ctx, carte, cle, mobile: mobileProp }) {
  const mobile = mobileProp ?? etroit();
  const [deplie, setDeplie] = useState(false);
  const [menu, setMenu] = useState(false); // menu des pré-réponses
  const [posMenu, setPosMenu] = useState(null); // ordinateur : position FIXE (le menu ne doit pas être rogné par la zone qui défile)
  const boutonCarnet = useRef(null);
  const [autre, setAutre] = useState(null); // carte (relue) pour le formulaire complet
  const [modifier, setModifier] = useState(null); // { id, type, note }
  const [toast, setToast] = useState(null); // { texte, sous, action }
  const minuteur = useRef(null);
  const racine = useRef(null);

  // nouvelle note : les actions s'affichent 2 s, puis se replient (sauf si un menu est ouvert)
  useEffect(() => {
    if (!carte) return undefined;
    setDeplie(true); setMenu(false);
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setDeplie(false), DUREE_VISIBLE);
    return () => clearTimeout(minuteur.current);
  }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const apprOk = estAdmissible(carte) && !carte.ephemeral && !!ctx.setLearningSet;
  const dejaAppr = ((ctx.db && ctx.db.learningSet) || []).includes(carte.id);
  const preReponses = preReponsesDe(ctx.carnetPreReponses);
  const garderOuvert = () => { clearTimeout(minuteur.current); setDeplie(true); };

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
    <div className={'sn' + (mobile ? ' sn-mobile' : '') + (deplie ? ' deplie' : ' replie')} ref={racine} data-suite-notation="" onPointerEnter={deplie ? garderOuvert : undefined}>
      {deplie ? (
        <div className="sn-actions" role="group" aria-label={`Carte notée : ${titre}`}>
          <span className="sn-carte" title={titre}>Carte notée · <b>{titre || 'sans titre'}</b></span>
          <div className="sn-boutons">
            <span className="sn-ancre">
              <button type="button" className="sn-btn" data-sn="carnet" disabled={!carnetOk} aria-haspopup="menu" aria-expanded={menu}
                title={carnetOk ? 'Ajouter cette carte au carnet d’erreurs, en un tap' : 'Le carnet d’erreurs reçoit les flashcards'}
                ref={boutonCarnet}
                onClick={() => {
                  garderOuvert();
                  if (!menu && boutonCarnet.current) {
                    // sous le bouton s'il y a la place, sinon au-dessus
                    const r = boutonCarnet.current.getBoundingClientRect();
                    const haut = window.innerHeight - r.bottom < 330;
                    setPosMenu({ left: Math.max(8, Math.min(r.left, window.innerWidth - 348)), ...(haut ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
                  }
                  setMenu((v) => !v);
                }}><Icon name="edit" size={13} /> Carnet d’erreurs</button>
              {menu && !mobile && createPortal(listePre, document.body) /* portail : un ancêtre animé (transform) décalerait le `fixed` */}
            </span>
            <button type="button" className="sn-btn" data-sn="apprentissage" disabled={!apprOk}
              title={apprOk ? (dejaAppr ? 'Déjà dans la liste du mode Apprentissage' : 'Ajouter cette carte à la liste du mode Apprentissage (indépendant des J)') : 'Le mode Apprentissage reçoit les flashcards'}
              onClick={apprentissage}><Icon name="brain" size={13} /> Apprentissage{dejaAppr && <Icon name="check" size={12} />}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="sn-icone" data-sn="deplier" title="Carte notée : carnet d’erreurs, apprentissage" aria-label="Carte notée : carnet d’erreurs, apprentissage"
          onClick={() => { garderOuvert(); }}><Icon name="more" size={15} /></button>
      )}

      {menu && mobile && (
        <div className="sn-feuille-fond" onClick={() => setMenu(false)}>
          <div className="sn-feuille" role="dialog" aria-label="Carnet d’erreurs" onClick={(e) => e.stopPropagation()}>
            <div className="sn-feuille-poignee" />
            <div className="sn-feuille-titre">Carnet d’erreurs</div>
            <div className="sn-feuille-sous">{titre}</div>
            {listePre}
            <button type="button" className="sn-feuille-annuler" onClick={() => setMenu(false)}>Annuler</button>
          </div>
        </div>
      )}

      {autre && (
        <Modal title="Carnet d’erreurs" onClose={() => setAutre(null)} width="min(560px, 96vw)">
          <SaisieCarnet ctx={ctx} carte={autre} mobile={mobile} onSubmit={enregistrerAutre} onSkip={() => setAutre(null)} />
        </Modal>
      )}
      {modifier && (
        <Modal title="Modifier l’entrée du carnet" onClose={() => setModifier(null)} width="min(480px, 94vw)">
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
        </Modal>
      )}

      {toast && (
        <div className={'sn-toast' + (mobile ? ' mobile' : '')} role="status">
          <Icon name="check" size={14} />
          <span className="sn-toast-texte">{toast.texte}{toast.sous && <span className="sn-toast-sous"> · {toast.sous}</span>}</span>
          {toast.action && <button type="button" className="sn-toast-action" onClick={() => { const a = toast.action; setToast(null); a.fn(); }}>{toast.action.label}</button>}
        </div>
      )}
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
