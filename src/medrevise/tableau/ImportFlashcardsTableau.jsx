/* ============================================================
   MedRevise — « + DEPUIS LES FLASHCARDS » (22/10, docs/compte-rendu-tableau-flashcards.md §1) : les flashcards de la
   fiche, avec des cases à cocher ; chaque carte choisie devient une carte du tableau (lib/board.js#carteDepuisFlashcard),
   copie indépendante qui garde un lien vers la flashcard.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import { sorteFlashcard } from '../lib/board.js';

const LIB = { texte: 'Texte', image: 'Image', muscle: 'Muscle', tableau: 'Tableau', molecule: 'Molécule' };
const sansTrous = (t) => String(t || '').replace(/\{\{([^{}]+)\}\}/g, '$1');

export function ImportFlashcardsTableau({ cartes, dejaLa = new Set(), onImporter, onFermer }) {
  const [choix, setChoix] = useState(() => new Set());
  const [q, setQ] = useState('');
  const vues = useMemo(() => { const k = q.trim().toLowerCase(); return cartes.filter((c) => !k || `${c.recto} ${c.verso} ${c.theme || ''}`.toLowerCase().includes(k)); }, [cartes, q]);
  const basculer = (id) => setChoix((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toutes = vues.length > 0 && vues.every((c) => choix.has(c.id));
  return (
    <Modal title="Ajouter des flashcards au tableau" onClose={onFermer} width="min(560px, 94vw)">
      <div className="tb2-import">
        {!cartes.length ? <div className="hint">Cette fiche n’a pas encore de flashcards.</div> : (<>
          <div className="tb2-import-outils">
            <input className="imp-title" value={q} placeholder="Chercher…" onChange={(e) => setQ(e.target.value)} aria-label="Chercher une flashcard" />
            <label className="tb2-import-tout"><input type="checkbox" checked={toutes} onChange={() => setChoix(toutes ? new Set() : new Set(vues.map((c) => c.id)))} /> Tout</label>
          </div>
          <div className="tb2-import-liste" role="list">
            {vues.map((c) => (
              <label key={c.id} className={'tb2-import-ligne' + (choix.has(c.id) ? ' oui' : '')} role="listitem" data-flashcard={c.id}>
                <input type="checkbox" checked={choix.has(c.id)} onChange={() => basculer(c.id)} />
                <span className="tb2-import-sorte">{LIB[sorteFlashcard(c)]}</span>
                <span className="tb2-import-recto">{sansTrous(c.recto) || '—'}</span>
                {dejaLa.has(c.id) && <span className="tb2-import-deja" title="Déjà posée sur le tableau (une autre copie sera ajoutée)">déjà sur le tableau</span>}
              </label>
            ))}
          </div>
        </>)}
        <div className="tb2-import-pied">
          <span className="hint">Chaque carte reste indépendante de sa flashcard ; une icône rouvre la flashcard.</span>
          <button type="button" className="btn ghost" onClick={onFermer}>Annuler</button>
          <button type="button" className="btn primary" data-act="importer-tableau" disabled={!choix.size} onClick={() => onImporter([...choix])}>
            <Icon name="plus" size={13} /> Ajouter {choix.size || ''} carte{choix.size > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
