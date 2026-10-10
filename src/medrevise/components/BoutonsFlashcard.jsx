/* ============================================================
   MedRevise — LES 4 BOUTONS DE NOTATION D'UNE FLASHCARD (étape 2 FSRS).
   À revoir / Difficile / Correct / Facile (= Again / Hard / Good / Easy), même place et même style
   que les 3 anciens boutons, avec l'intervalle prévu dessous : FSRS si l'interrupteur est ON,
   planificateur maison sinon (scheduler/noter.js intervallesPrevus).
   Une astuce s'affiche UNE fois (puis reste en infobulle) : « Difficile = réussi avec effort ».
   `variante` : 'bureau' (Session.jsx) · 'mobile' (MobileSession.jsx) · 'seance' (SeanceFC.jsx).
   ============================================================ */
import { useMemo, useState } from 'react';
import { BOUTONS, intervallesPrevus, libelleIntervalle } from '../scheduler/noter.js';

const CLE_ASTUCE = 'medrevise.fsrs.astuceDifficile';
const ASTUCE = 'Difficile = réussi avec effort';
const lireAstuceVue = () => { try { return localStorage.getItem(CLE_ASTUCE) === '1'; } catch (e) { return true; } };

const CLASSES = {
  bureau: { conteneur: 'rev-rate quatre', bouton: (b) => 'rate-btn ' + b.classe, sous: 'rb-sub' },
  mobile: { conteneur: 'mrm-rate quatre', bouton: (b) => 'mrm-rate-btn ' + b.classe, sous: 'sub' },
  seance: { conteneur: 'sfc-notes quatre', bouton: (b) => 'sfc-btn ' + ({ fail: 'rate', hard: 'difficile', good: 'correct', easy: 'facile' })[b.classe], sous: 'sfc-btn-sous' },
};

export function BoutonsFlashcard({ carte, reglages, onNoter, disabled = false, variante = 'bureau' }) {
  const c = CLASSES[variante] || CLASSES.bureau;
  const [astuceVue, setAstuceVue] = useState(lireAstuceVue);
  const prevus = useMemo(() => { try { return carte ? intervallesPrevus(carte, reglages) : {}; } catch (e) { return {}; } }, [carte, reglages]);
  const noter = (b) => {
    if (!astuceVue) { try { localStorage.setItem(CLE_ASTUCE, '1'); } catch (e) { /* ignore */ } setAstuceVue(true); }
    onNoter(b.note, b.cle);
  };
  return (
    <div className="bf-zone">
      {!astuceVue && <div className="bf-astuce" role="note">{ASTUCE}</div>}
      <div className={c.conteneur}>
        {BOUTONS.map((b) => (
          <button key={b.cle} type="button" className={c.bouton(b)} disabled={disabled} onClick={() => noter(b)}
            title={b.cle === 'hard' ? ASTUCE : undefined} data-note={b.note}>
            {b.libelle}
            <span className={c.sous}>{prevus[b.note] ? libelleIntervalle(prevus[b.note].jours) : ' '}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
