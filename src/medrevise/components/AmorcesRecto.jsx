/* ============================================================
   MedRevise — AMORCES DU RECTO (04/10) : débuts de question insérables en un clic
   au recto d'une flashcard (« Définis : », « Quel est le rôle de : »…), puis on
   complète. Optionnel : rien n'est imposé, on peut toujours taper librement.

   - les amorces courantes (celles de l'utilisateur d'abord), puis d'autres utiles en
     kiné / biologie, repliées derrière « Plus… » ;
   - SES amorces perso : « + Mon amorce » les ajoute, une croix les retire. Gardées sur
     l'appareil (localStorage, préférence de saisie : aucune synchro, aucun cloud).
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';

export const AMORCES_COURANTES = [
  'Qu’est-ce que c’est que : ',
  'C’est quoi : ',
  'Définis : ',
  'Quel est le rôle de : ',
  'À quoi sert : ',
  'Cite : ',
  'Explique : ',
];
export const AMORCES_PLUS = [
  'Où se situe : ',
  'Quelle est l’origine et la terminaison de : ',
  'Quelle est l’innervation de : ',
  'Quelle est la vascularisation de : ',
  'Quelles sont les actions de : ',
  'Quels sont les rapports de : ',
  'Quels sont les signes cliniques de : ',
  'Quelles sont les causes de : ',
  'Quel est le mécanisme de : ',
  'Quelle est la différence entre ',
  'Quelle est la valeur normale de : ',
  'Comment évaluer : ',
  'Quelles sont les indications de : ',
  'Quelles sont les contre-indications de : ',
  'Donne un exemple de : ',
];

const CLE = 'medrevise.amorcesRecto';
function lirePerso() {
  try { const v = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 30) : []; } catch (e) { return []; }
}
function ecrirePerso(liste) { try { localStorage.setItem(CLE, JSON.stringify(liste)); } catch (e) { /* stockage indisponible : l'amorce sert quand même cette fois */ } }
/** « Définis » → « Définis : » (une amorce finit par « : » ou une espace, pour enchaîner) */
const normaliser = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); if (!s) return ''; return /[:?]$/.test(s) ? s + ' ' : s + ' : '; };

/** `onInserer(texte)` : l'appelant insère au curseur du recto et y replace le curseur. */
export function AmorcesRecto({ onInserer }) {
  const [plus, setPlus] = useState(false);
  const [perso, setPerso] = useState(lirePerso);
  const [ajout, setAjout] = useState(null); // texte en cours de saisie d'une amorce perso
  const ajouter = () => {
    const a = normaliser(ajout);
    setAjout(null);
    if (!a || perso.includes(a)) return;
    const l = [...perso, a]; setPerso(l); ecrirePerso(l);
  };
  const retirer = (a) => { const l = perso.filter((x) => x !== a); setPerso(l); ecrirePerso(l); };
  // mousedown empêché : le recto garde le focus et sa position de curseur
  const garder = (e) => e.preventDefault();
  const puce = (a, perso2 = false) => (
    <span key={(perso2 ? 'p:' : '') + a} className={'amr-puce' + (perso2 ? ' perso' : '')}>
      <button type="button" className="amr-txt" onMouseDown={garder} onClick={() => onInserer(a)} title={`Insérer « ${a.trim()} » au recto`}>{a.trim()}</button>
      {perso2 && <button type="button" className="amr-x" onMouseDown={garder} onClick={() => retirer(a)} title="Retirer cette amorce" aria-label="Retirer"><Icon name="x" size={9} /></button>}
    </span>
  );
  return (
    <div className="amr" aria-label="Débuts de question">
      {AMORCES_COURANTES.map((a) => puce(a))}
      {perso.map((a) => puce(a, true))}
      {plus && AMORCES_PLUS.map((a) => puce(a))}
      <button type="button" className="amr-lien" onMouseDown={garder} onClick={() => setPlus((v) => !v)}>{plus ? 'Moins' : 'Plus…'}</button>
      {ajout == null ? (
        <button type="button" className="amr-lien" onClick={() => setAjout('')} title="Ajouter ta propre amorce (gardée sur cet appareil)"><Icon name="plus" size={10} /> Mon amorce</button>
      ) : (
        <span className="amr-ajout">
          <input autoFocus value={ajout} placeholder="ex : Quel muscle…" onChange={(e) => setAjout(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } if (e.key === 'Escape') { e.stopPropagation(); setAjout(null); } }} />
          <button type="button" className="amr-lien" onClick={ajouter}>OK</button>
        </span>
      )}
    </div>
  );
}
