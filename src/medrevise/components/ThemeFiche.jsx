/* ============================================================
   MedRevise — THÈME PAR DÉFAUT DES FLASHCARDS D'UNE FICHE (04/10).

   Sur la fiche : `themeFlashcards` (texte, ou null). Toute flashcard CRÉÉE dans la
   fiche (formulaire, flashcard image, JSON collé, import) qui n'a pas de thème reçoit
   celui-ci — voir appendItemsToFiche (lib/import.js). Le champ rempli est le thème
   EXISTANT des cartes (`theme`, alias legacy `concept`) : aucun champ nouveau sur
   les cartes. Les formulaires sont PRÉ-REMPLIS avec ce thème : on le change carte
   par carte si l'on veut (un thème choisi n'est jamais remplacé).

   Cartes DÉJÀ créées sans thème : rien n'est modifié tout seul. Le panneau propose
   « Appliquer à N cartes sans thème », avec confirmation, et « Annuler » ensuite
   (les cartes reprennent leur thème vide).

   CHANGER LE THÈME DE LA FICHE (08/10) : les cartes qui portaient l'ANCIEN thème de la
   fiche ne changent pas toutes seules — « Appliquer aux N cartes qui avaient l'ancien
   thème » est proposé juste après, avec confirmation et « Annuler ». Une carte dont on a
   choisi un autre thème n'est jamais concernée.

   Toujours visible en tête de l'onglet Flashcards du panneau (08/10) : caché derrière
   le menu « ⋯ » depuis le panneau à 3 modes (2d62bcc), il n'était plus trouvé — et le
   champ « Thème » des cartes, seul visible, ne vaut que pour la carte.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ConfirmModal } from './ui.jsx';
import { toInternalItem } from '../lib/adapter.js';
import { putMany } from '../lib/storage.js';
import { themeFlashcardsDeFiche, carteSansTheme } from '../lib/import.js';

export function ThemeFicheFlashcards({ ctx, ficheId }) {
  const fiche = (ctx.db.fiches || []).find((f) => f.id === ficheId) || null;
  const theme = themeFlashcardsDeFiche(fiche);
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [confirmer, setConfirmer] = useState(false);
  const [annulable, setAnnulable] = useState(null); // { theme, avant: [items] }
  const [ancien, setAncien] = useState(null); // thème remplacé, tant que la proposition tient
  const [confirmerAncien, setConfirmerAncien] = useState(false);
  const [occupe, setOccupe] = useState(false);

  const sansTheme = useMemo(() => (ctx.db.questions || []).filter((q) => q.ficheId === ficheId && q.type === 'flashcard' && carteSansTheme(q)), [ctx.db, ficheId]);
  const avecAncien = useMemo(() => (!ancien ? [] : (ctx.db.questions || []).filter((q) => q.ficheId === ficheId && q.type === 'flashcard' && String(q.theme || q.concept || '').trim() === ancien)), [ctx.db, ficheId, ancien]);
  // thèmes déjà utilisés (suggestions), le plus fréquent d'abord
  const suggestions = useMemo(() => {
    const n = new Map();
    for (const q of ctx.db.questions || []) { const t = String(q.theme || q.concept || '').trim(); if (t) n.set(t, (n.get(t) || 0) + 1); }
    for (const f of ctx.db.fiches || []) { const t = themeFlashcardsDeFiche(f); if (t) n.set(t, (n.get(t) || 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t);
  }, [ctx.db]);
  if (!fiche) return null;

  const enregistrer = async () => {
    const v = saisie.trim();
    setOccupe(true);
    try {
      await ctx.saveFiche({ ...fiche, themeFlashcards: v || null }); setEdition(false); setAnnulable(null);
      setAncien(theme && v && v !== theme ? theme : null); // proposer de suivre aux cartes de l'ancien thème
    } finally { setOccupe(false); }
  };
  const appliquer = async (cibles = sansTheme) => {
    setConfirmer(false); setConfirmerAncien(false); setAncien(null); setOccupe(true);
    try {
      const avant = cibles.map((q) => ({ ...q }));
      const maj = avant.map((q) => toInternalItem({ ...q, theme, concept: theme })).filter(Boolean);
      if (maj.length) { await putMany('questions', maj); await ctx.reload(); }
      setAnnulable({ theme, avant });
    } finally { setOccupe(false); }
  };
  const annuler = async () => {
    if (!annulable) return;
    setOccupe(true);
    try {
      // seules les cartes qui portent ENCORE le thème appliqué reviennent en arrière
      // (une carte retouchée entre-temps garde sa retouche)
      const actuelles = new Map((ctx.db.questions || []).map((q) => [q.id, q]));
      const retour = annulable.avant.filter((q) => { const a = actuelles.get(q.id); return a && String(a.theme || a.concept || '').trim() === annulable.theme; })
        .map((q) => ({ ...actuelles.get(q.id), theme: q.theme ?? '', concept: q.concept ?? '' }));
      if (retour.length) { await putMany('questions', retour); await ctx.reload(); }
      setAnnulable(null);
    } finally { setOccupe(false); }
  };

  return (
    <div className="tf">
      {!edition ? (
        <div className="tf-ligne">
          <Icon name="tag" size={13} />
          {theme
            ? <span className="tf-txt" title="Thème donné automatiquement à chaque nouvelle flashcard de cette fiche">Thème auto : <b>{theme}</b></span>
            : <span className="tf-txt tf-vide">Pas de thème auto pour cette fiche</span>}
          <button type="button" className="linklike tf-modif" disabled={occupe} onClick={() => { setSaisie(theme); setEdition(true); }}>
            {theme ? 'Modifier' : 'Définir'}
          </button>
        </div>
      ) : (
        <form className="tf-edition" onSubmit={(e) => { e.preventDefault(); enregistrer(); }}>
          <label className="tf-label" htmlFor={'tf-' + ficheId}>Thème par défaut des flashcards de cette fiche</label>
          <div className="tf-champ">
            <input id={'tf-' + ficheId} className="imp-title" autoFocus list={'tf-sugg-' + ficheId} value={saisie} placeholder="ex : Myologie"
              onChange={(e) => setSaisie(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEdition(false); }} />
            <datalist id={'tf-sugg-' + ficheId}>{suggestions.map((t) => <option key={t} value={t} />)}</datalist>
            <button type="submit" className="btn primary sm" disabled={occupe}>OK</button>
            <button type="button" className="btn ghost sm" onClick={() => setEdition(false)}>Annuler</button>
          </div>
          <div className="hint tf-aide">Chaque nouvelle flashcard le reçoit (modifiable carte par carte). Vide = pas de thème par défaut.</div>
        </form>
      )}
      {theme && !edition && ancien && avecAncien.length > 0 && !annulable && (
        <div className="tf-ligne tf-propose">
          <span className="tf-txt">{avecAncien.length} carte{avecAncien.length > 1 ? 's' : ''} avai{avecAncien.length > 1 ? 'en' : ''}t l’ancien thème « {ancien} »</span>
          <button type="button" className="linklike tf-modif" disabled={occupe} onClick={() => setConfirmerAncien(true)}>Appliquer aux {avecAncien.length} carte{avecAncien.length > 1 ? 's' : ''}…</button>
          <button type="button" className="icon-btn sm" title="Laisser ces cartes telles quelles" aria-label="Ignorer" onClick={() => setAncien(null)}><Icon name="x" size={12} /></button>
        </div>
      )}
      {theme && !edition && sansTheme.length > 0 && !annulable && !(ancien && avecAncien.length > 0) && (
        <div className="tf-ligne tf-propose">
          <span className="tf-txt">{sansTheme.length} carte{sansTheme.length > 1 ? 's' : ''} sans thème</span>
          <button type="button" className="linklike tf-modif" disabled={occupe} onClick={() => setConfirmer(true)}>Leur appliquer…</button>
        </div>
      )}
      {annulable && (
        <div className="tf-ligne tf-propose">
          <Icon name="check" size={13} />
          <span className="tf-txt">« {annulable.theme} » appliqué à {annulable.avant.length} carte{annulable.avant.length > 1 ? 's' : ''}</span>
          <button type="button" className="linklike tf-modif" disabled={occupe} onClick={annuler}>Annuler</button>
        </div>
      )}
      {confirmer && (
        <ConfirmModal title="Appliquer le thème de la fiche ?"
          body={<>Les <b>{sansTheme.length}</b> flashcard{sansTheme.length > 1 ? 's' : ''} de cette fiche qui n’ont <b>pas encore de thème</b> recevront « <b>{theme}</b> ». Les cartes qui ont déjà un thème ne changent pas. Leur progression (méthode des J) est conservée. Tu pourras annuler juste après.</>}
          confirmLabel={`Appliquer à ${sansTheme.length} carte${sansTheme.length > 1 ? 's' : ''}`}
          onConfirm={() => appliquer(sansTheme)} onCancel={() => setConfirmer(false)} />
      )}
      {confirmerAncien && (
        <ConfirmModal title="Appliquer le nouveau thème ?"
          body={<>Les <b>{avecAncien.length}</b> flashcard{avecAncien.length > 1 ? 's' : ''} de cette fiche qui avai{avecAncien.length > 1 ? 'en' : ''}t l’ancien thème « <b>{ancien}</b> » passeront à « <b>{theme}</b> ». Les cartes d’un autre thème ne changent pas. Leur progression (méthode des J) est conservée. Tu pourras annuler juste après.</>}
          confirmLabel={`Appliquer aux ${avecAncien.length} carte${avecAncien.length > 1 ? 's' : ''}`}
          onConfirm={() => appliquer(avecAncien)} onCancel={() => setConfirmerAncien(false)} />
      )}
    </div>
  );
}
