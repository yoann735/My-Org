/* ============================================================
   MedRevise — ÉLÉMENTS À RÉVÉLER du verso d'une carte Texte (26/10, docs/compte-rendu-flashcards.md).
   Champ additif `items: [{ text, masked }]` sur la carte : au retournement, le texte du verso s'affiche, puis la
   liste des éléments ; les éléments masqués se révèlent un par un au clic / tap, avec « Tout révéler ».
   AUCUNE nouvelle mécanique : LE composant de révélation des cartes Muscle (FlashcardMuscle.jsx LignesARevelerer).
   Une carte sans éléments n'affiche rien de plus.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from './Tex.jsx';
import { LignesARevelerer } from './FlashcardMuscle.jsx';

/** éléments non vides d'une carte (dans l'ordre) */
export const elementsDe = (q) => (q && Array.isArray(q.items) ? q.items.filter((x) => x && String(x.text || '').trim()) : []);

/* `masquable` : en révision, les éléments masqués sont cachés ; ailleurs (liste du panneau, aperçu) tout est visible */
export function ElementsVerso({ carte, masquable = true, compact = false }) {
  const els = elementsDe(carte);
  if (!els.length) return null;
  return (
    <LignesARevelerer key={carte.id} masquable={masquable} compact={compact} classe="mu-elements"
      lignes={els.map((x, i) => ({ id: 'e' + i, etiquette: String(i + 1), pleine: true, masque: x.masked !== false, contenu: <div className="mu-element"><Tex>{x.text}</Tex></div> }))} />
  );
}

/* ---- FORMULAIRE (carte Texte) : sous le champ Verso, « + Élément » ajoute un champ ; chaque élément : poignée de
   réordonnement (glisser, souris ou doigt), texte, œil masqué / visible (masqué par défaut), suppression.
   `elements` : [{ cle, text, masked }] (cle = identifiant local stable, jamais enregistré). ---- */
let n = 0;
export const nouvelElement = (x = {}) => ({ cle: 'el' + (++n) + Date.now().toString(36), text: x.text || '', masked: x.masked !== false });

/* œil (le jeu d'icônes partagé n'en a pas) : ouvert = visible, barré = masqué */
export const Oeil = ({ barre, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" />
    {barre && <path d="M4 20 20 4" />}
  </svg>
);

export function EditeurElements({ elements, onChange }) {
  const listeRef = useRef(null);
  const [glisse, setGlisse] = useState(null); // cle de l'élément tenu
  const focusApres = useRef(null);
  useEffect(() => {
    if (!focusApres.current || !listeRef.current) return;
    const champ = listeRef.current.querySelector(`[data-element="${focusApres.current}"] textarea`);
    focusApres.current = null;
    if (champ) champ.focus();
  });
  const maj = (cle, patch) => onChange(elements.map((x) => (x.cle === cle ? { ...x, ...patch } : x)));
  const ajouter = (apres = null) => {
    const e = nouvelElement();
    const i = apres ? elements.findIndex((x) => x.cle === apres) + 1 : elements.length;
    focusApres.current = e.cle;
    onChange([...elements.slice(0, i), e, ...elements.slice(i)]);
  };
  // réordonner en glissant la poignée : l'élément tenu prend la place de la ligne survolée
  const tenir = (cle) => (e) => {
    e.preventDefault();
    const poignee = e.currentTarget;
    try { poignee.setPointerCapture(e.pointerId); } catch (x) { /* navigateur ancien */ }
    setGlisse(cle);
    let liste = elements;
    const bouger = (ev) => {
      // place visée = nombre d'AUTRES lignes dont le milieu est au-dessus du pointeur
      const autres = [...listeRef.current.querySelectorAll('[data-element]')].filter((l) => l.dataset.element !== cle);
      const dest = autres.filter((l) => { const r = l.getBoundingClientRect(); return r.top + r.height / 2 < ev.clientY; }).length;
      const i = liste.findIndex((x) => x.cle === cle);
      if (dest === i) return;
      const l = [...liste]; const [x] = l.splice(i, 1); l.splice(dest, 0, x);
      liste = l; onChange(l);
    };
    const lacher = () => { setGlisse(null); poignee.removeEventListener('pointermove', bouger); poignee.removeEventListener('pointerup', lacher); poignee.removeEventListener('pointercancel', lacher); };
    poignee.addEventListener('pointermove', bouger); poignee.addEventListener('pointerup', lacher); poignee.addEventListener('pointercancel', lacher);
  };
  return (
    <div className="fce" ref={listeRef} data-elements="">
      {elements.map((x, i) => (
        <div key={x.cle} className={'fce-ligne' + (glisse === x.cle ? ' glisse' : '') + (x.masked ? ' masque' : '')} data-element={x.cle}>
          <span className="fce-poignee" role="button" tabIndex={-1} title="Glisser pour réordonner" aria-label={`Réordonner l’élément ${i + 1}`} onPointerDown={tenir(x.cle)}><Icon name="grip" size={14} /></span>
          <span className="fce-num tnum" aria-hidden="true">{i + 1}</span>
          <textarea className="imp-title fcf-champ fce-champ" rows={1} value={x.text} placeholder={`Élément ${i + 1}`} aria-label={`Élément ${i + 1}`}
            onChange={(e) => maj(x.cle, { text: e.target.value })}
            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 2 + 'px'; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) { e.preventDefault(); ajouter(x.cle); } }} />
          <button type="button" className={'cd-ic fce-oeil' + (x.masked ? '' : ' visible')} data-oeil={x.masked ? 'masque' : 'visible'} aria-pressed={!x.masked}
            title={x.masked ? 'Masqué au verso : se révèle au toucher — rendre toujours visible' : 'Toujours visible au verso — masquer'}
            aria-label={x.masked ? 'Élément masqué (rendre visible)' : 'Élément visible (masquer)'} onClick={() => maj(x.cle, { masked: !x.masked })}><Oeil barre={x.masked} /></button>
          <button type="button" className="cd-ic fce-suppr" title="Supprimer l’élément" aria-label={`Supprimer l’élément ${i + 1}`} onClick={() => onChange(elements.filter((y) => y.cle !== x.cle))}><Icon name="trash" size={12} /></button>
        </div>
      ))}
      <button type="button" className="fce-ajouter" data-act="ajouter-element" onClick={() => ajouter()} title="Ajouter un élément à révéler au verso (Entrée dans un élément en ajoute un autre)">
        <Icon name="plus" size={12} /> Élément
      </button>
    </div>
  );
}
