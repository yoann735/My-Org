/* ============================================================
   MedRevise — SAISIE D'UNE ENTRÉE DU CARNET D'ERREURS (16/10) : la carte « Pourquoi tu l'as
   loupée ? » de la séance (ordinateur et téléphone). Pour aller vite :
   - une rangée de puces « Type d'erreur » (Réglages › Carnet d'erreurs) : une puce pré-remplit
     « Ce que j'ai confondu » avec son gabarit, le premier « ___ » est sélectionné (on tape
     directement) et Tab passe au suivant ;
   - « Astuce pour ne plus me tromper », pré-remplie depuis la flashcard ratée (recto + verso),
     modifiable ou effaçable.
   onSubmit({ raison, type, astuce }) — `raison` va dans carnetRaison comme avant.
   ============================================================ */
import { useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { pucesDe, suggestionAstuce, selectionnerTrou, TROU, PUCES_DEFAUT, nouvelIdPuce } from '../lib/carnetPuces.js';
import '../../styles/carnet-puces.css';

export function SaisieCarnet({ ctx, carte, onSubmit, onSkip, mobile = false }) {
  const puces = pucesDe(ctx && ctx.carnetPuces);
  const [type, setType] = useState(null);
  const [raison, setRaison] = useState('');
  const suggestion = suggestionAstuce(carte);
  const [astuce, setAstuce] = useState(suggestion);
  const champ = useRef(null);
  const choisir = (p) => {
    setType(p.label);
    // le gabarit remplace un texte vide ou un autre gabarit encore à trous ; un texte tapé est gardé
    const remplacer = !raison.trim() || raison.includes(TROU);
    const v = remplacer ? p.gabarit : raison;
    setRaison(v);
    requestAnimationFrame(() => { if (!selectionnerTrou(champ.current) && champ.current) champ.current.focus(); });
  };
  const tab = (e) => {
    if (e.key !== 'Tab' || e.shiftKey || !raison.includes(TROU)) return;
    e.preventDefault();
    selectionnerTrou(champ.current, champ.current.selectionEnd);
  };
  const pret = raison.trim() && raison.trim() !== (puces.find((p) => p.label === type) || {}).gabarit;
  return (
    <div className={'carnet-prompt cp-saisie' + (mobile ? ' mobile' : '')}>
      <div className="carnet-prompt-title"><Icon name="edit" size={13} /> Pourquoi tu l’as loupée ?</div>
      <div className="cp-etiquette">Type d’erreur</div>
      <div className="cp-puces" role="group" aria-label="Type d’erreur">
        {puces.map((p) => (
          <button key={p.id} type="button" className={'cp-puce' + (type === p.label ? ' actif' : '')} aria-pressed={type === p.label}
            title={p.gabarit} onClick={() => choisir(p)}>{p.label}</button>
        ))}
      </div>
      <label className="cp-etiquette" htmlFor="cp-raison">Ce que j’ai confondu</label>
      <textarea id="cp-raison" ref={champ} className="imp-title cp-champ" value={raison} onKeyDown={tab}
        onChange={(e) => setRaison(e.target.value)} placeholder="Choisis un type d’erreur, ou écris ta raison" />
      <label className="cp-etiquette" htmlFor="cp-astuce">Astuce pour ne plus me tromper</label>
      <textarea id="cp-astuce" className="imp-title cp-champ cp-astuce" value={astuce} onChange={(e) => setAstuce(e.target.value)}
        placeholder="Un moyen mnémotechnique, une règle, un repère…" />
      {suggestion && astuce === suggestion && <div className="cp-aide">Suggestion tirée de la carte (recto + verso) — modifie-la ou efface-la.</div>}
      {suggestion && !astuce.trim() && <button type="button" className="cp-lien" onClick={() => setAstuce(suggestion)}>Reprendre la suggestion</button>}
      <div className="carnet-prompt-actions">
        <button type="button" className="btn ghost sm" onClick={onSkip}>Passer</button>
        <button type="button" className="btn primary sm" disabled={!pret}
          onClick={() => onSubmit({ raison: raison.trim(), type, astuce: astuce.trim() })}>
          <Icon name="plus" size={13} /> Ajouter au carnet d’erreurs
        </button>
      </div>
    </div>
  );
}

/* Réglages › Carnet d'erreurs : ajouter, renommer, réordonner, supprimer les puces (et leur gabarit).
   Écrit à la sortie d'un champ et à chaque action — seulement l'enregistrement `carnetPuces`. */
export function ReglagesCarnet({ ctx }) {
  const [liste, setListe] = useState(() => pucesDe(ctx.carnetPuces).map((p) => ({ ...p })));
  const enregistrer = (l) => { const propres = l.map((p) => ({ ...p, label: p.label.trim() })).filter((p) => p.label); setListe(propres); ctx.saveCarnetPuces(propres); };
  const changer = (i, champ, v) => setListe((l) => l.map((p, k) => (k === i ? { ...p, [champ]: v } : p)));
  const deplacer = (i, d) => { const l = [...liste]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; enregistrer(l); };
  return (
    <div className="cp-reglages">
      <div className="hint">Les puces « Type d’erreur » proposées quand tu ajoutes une carte ratée au carnet. Chacune pré-remplit « Ce que j’ai confondu » avec son gabarit (« ___ » = à compléter). Les entrées déjà dans le carnet ne changent pas.</div>
      {liste.map((p, i) => (
        <div key={p.id} className="cp-reglage">
          <input className="imp-title" value={p.label} aria-label={`Nom de la puce ${i + 1}`} onChange={(e) => changer(i, 'label', e.target.value)} onBlur={() => enregistrer(liste)} />
          <input className="imp-title cp-gabarit" value={p.gabarit} aria-label={`Gabarit de « ${p.label} »`} placeholder="J’ai dit ___ au lieu de ___" onChange={(e) => changer(i, 'gabarit', e.target.value)} onBlur={() => enregistrer(liste)} />
          <button type="button" className="cd-ic" title="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}><Icon name="chevU" size={14} /></button>
          <button type="button" className="cd-ic" title="Descendre" disabled={i === liste.length - 1} onClick={() => deplacer(i, 1)}><Icon name="chevD" size={14} /></button>
          <button type="button" className="cd-ic" title="Supprimer cette puce" onClick={() => enregistrer(liste.filter((_, k) => k !== i))}><Icon name="trash" size={13} /></button>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 4 }}>
        <button type="button" className="btn sm" onClick={() => enregistrer([...liste, { id: nouvelIdPuce(), label: 'Nouvelle puce', gabarit: 'J’ai dit ___ au lieu de ___' }])}><Icon name="plus" size={13} /> Ajouter une puce</button>
        <button type="button" className="btn ghost sm" onClick={() => enregistrer(PUCES_DEFAUT.map((p) => ({ ...p })))}>Rétablir la liste par défaut</button>
      </div>
    </div>
  );
}
