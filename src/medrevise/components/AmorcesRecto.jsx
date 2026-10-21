/* ============================================================
   MedRevise — AMORCES DU RECTO (04/10) : débuts de question insérables en un clic
   au recto d'une flashcard (« Définis : », « Quel est le rôle de : »…), puis on
   complète. Optionnel : rien n'est imposé, on peut toujours taper librement.

   - les amorces courantes (celles de l'utilisateur d'abord), puis d'autres utiles en
     kiné / biologie ; depuis le 22/10, dans un menu « Amorce ▾ » (MenuAmorces, plus bas) ;
   - SES amorces perso : « + Mon amorce » les ajoute, une croix les retire. Gardées sur
     l'appareil (localStorage, préférence de saisie : aucune synchro, aucun cloud).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
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

/* MENU « AMORCE » (22/10, docs/compte-rendu-tableau-flashcards.md §6) — remplace la pile de puces dans le formulaire :
   un bouton « Amorce ▾ » ; le menu a une recherche, les FAVORIS d'abord (étoile, gardés sur l'appareil), les amorces
   perso (« + Mon amorce », retirables), les courantes, puis les autres. Les mêmes amorces qu'avant, rien de perdu. */
const CLE_FAV = 'medrevise.amorcesFavoris';
function lireFav() { try { const v = JSON.parse(localStorage.getItem(CLE_FAV) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch (e) { return []; } }
function ecrireFav(l) { try { localStorage.setItem(CLE_FAV, JSON.stringify(l)); } catch (e) { /* stockage indisponible */ } }
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function MenuAmorces({ onInserer }) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState('');
  const [perso, setPerso] = useState(lirePerso);
  const [fav, setFav] = useState(lireFav);
  const [ajout, setAjout] = useState(null);
  const racine = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    const clavier = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); } };
    window.addEventListener('pointerdown', dehors, true); window.addEventListener('keydown', clavier, true);
    return () => { window.removeEventListener('pointerdown', dehors, true); window.removeEventListener('keydown', clavier, true); };
  }, [ouvert]);
  const garder = (e) => e.preventDefault(); // le recto garde le focus et son curseur
  const inserer = (a) => { onInserer(a); setOuvert(false); setQ(''); };
  const basculerFav = (a) => { const l = fav.includes(a) ? fav.filter((x) => x !== a) : [...fav, a]; setFav(l); ecrireFav(l); };
  const ajouter = () => { const a = normaliser(ajout); setAjout(null); if (!a || perso.includes(a)) return; const l = [...perso, a]; setPerso(l); ecrirePerso(l); };
  const retirer = (a) => { const l = perso.filter((x) => x !== a); setPerso(l); ecrirePerso(l); if (fav.includes(a)) basculerFav(a); };
  const filtre = (l) => (q.trim() ? l.filter((a) => sansAccents(a).includes(sansAccents(q.trim()))) : l);
  const tous = [...new Set([...perso, ...AMORCES_COURANTES, ...AMORCES_PLUS])];
  const groupes = [
    ['Favoris', filtre(fav.filter((a) => tous.includes(a)))],
    ['Mes amorces', filtre(perso.filter((a) => !fav.includes(a)))],
    ['Courantes', filtre(AMORCES_COURANTES.filter((a) => !fav.includes(a)))],
    ['Autres', filtre(AMORCES_PLUS.filter((a) => !fav.includes(a)))],
  ].filter(([, l]) => l.length);
  const ligne = (a) => (
    <div key={a} className="mam-ligne">
      <button type="button" className="mam-txt" onMouseDown={garder} onClick={() => inserer(a)} title={`Insérer « ${a.trim()} » au recto`}>{a.trim()}</button>
      <button type="button" className={'mam-fav' + (fav.includes(a) ? ' oui' : '')} onMouseDown={garder} onClick={() => basculerFav(a)}
        aria-label={fav.includes(a) ? 'Retirer des favoris' : 'Ajouter aux favoris'} title={fav.includes(a) ? 'Retirer des favoris' : 'Favori (en tête du menu)'}>{fav.includes(a) ? '★' : '☆'}</button>
      {perso.includes(a) && <button type="button" className="mam-x" onMouseDown={garder} onClick={() => retirer(a)} aria-label="Retirer cette amorce" title="Retirer cette amorce"><Icon name="x" size={10} /></button>}
    </div>
  );
  return (
    <span className="mam" ref={racine}>
      <button type="button" className={'btn ghost sm mam-bouton' + (ouvert ? ' actif' : '')} onMouseDown={garder} onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert} title="Insérer un début de question au recto">Amorce <Icon name="chevD" size={11} /></button>
      {ouvert && (
        <div className="mam-menu" role="menu">
          <input className="mam-recherche" autoFocus value={q} placeholder="Chercher une amorce…" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const p = groupes[0] && groupes[0][1][0]; if (p) inserer(p); } }} />
          <div className="mam-liste">
            {groupes.map(([titre, l]) => (
              <div key={titre} className="mam-groupe"><div className="mam-titre">{titre}</div>{l.map(ligne)}</div>
            ))}
            {!groupes.length && <div className="hint mam-vide">Aucune amorce ne correspond.</div>}
          </div>
          {ajout == null ? (
            <button type="button" className="mam-ajout-btn" onClick={() => setAjout(q.trim())}><Icon name="plus" size={11} /> Mon amorce</button>
          ) : (
            <span className="mam-ajout">
              <input autoFocus value={ajout} placeholder="ex : Quel muscle…" onChange={(e) => setAjout(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } if (e.key === 'Escape') { e.stopPropagation(); setAjout(null); } }} />
              <button type="button" className="btn sm" onClick={ajouter}>OK</button>
            </span>
          )}
        </div>
      )}
    </span>
  );
}
