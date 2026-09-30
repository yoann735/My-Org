/* ============================================================
   MedRevise — BARRE D'OUTILS DU LECTEUR PDF (étape 5 du refactor).

   L'ancienne barre alignait 21 contrôles sur UNE rangée à plat, sans
   regroupement ni hiérarchie : un export rare y pesait autant qu'un outil de
   travail, et deux boutons « Voir les prompts » se suivaient à l'identique.

   Nouveau découpage, celui des outils de dessin sérieux (Acrobat, Aperçu,
   Figma) : LES OUTILS AU CENTRE, tout le reste sur les bords.

     ┌──────────────────────────────────────────────────────────────────┐
     │ ← │ ◀ 3/48 ▶ │ ⊖ 160% ⊕ ⤢ │  ✋ 🖍 ▭ ✏ ⌫  │ ↶ ↷ │ 🔍 │ ◫ 12 │ ⋯ │
     └──────────────────────────────────────────────────────────────────┘
       retour  page       zoom        OUTILS      annuler  rech. panneau menu

   Deuxième rangée : la BARRE CONTEXTUELLE, qui n'apparaît que si l'outil actif
   a des réglages (couleur, épaisseur, aimant). Elle évite d'encombrer la barre
   principale avec des contrôles qui ne servent qu'à un outil.

   Tout ce qui est rare ou propre à une fiche (exports, prompts, items) part
   dans le menu « ⋯ Document » : huit boutons de moins sur la barre.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ContextMenu } from '../components/ui.jsx';
import { COLORS, RACCOURCI } from './pdfShared.js';

/** Les outils, dans l'ordre d'apparition. `main` est le défaut et remplace à lui
    seul l'ancien couple « Lecture / Édition » : il sélectionne du texte, ouvre
    une annotation, déplace une boîte. Plus de mode global. */
export const OUTILS = [
  { id: 'main', label: 'Sélection', icon: 'grip', aide: 'Sélectionner du texte, ouvrir une annotation, déplacer une boîte' },
  { id: 'surligneur', label: 'Surligneur', icon: 'edit', aide: 'Sélectionner du texte le surligne aussitôt, dans la couleur active' },
  { id: 'boite', label: 'Boîte', icon: 'list', aide: 'Tracer une boîte de texte n’importe où sur la page' },
  { id: 'crayon', label: 'Crayon', icon: 'sparkle', aide: 'Dessiner à main levée' },
  { id: 'gomme', label: 'Gomme', icon: 'ban', aide: 'Efface les traits de crayon — cliquer, ou glisser pour en effacer plusieurs' },
];
/** Outils dont la couleur se règle dans la barre contextuelle. */
const OUTILS_COLORES = new Set(['surligneur', 'boite', 'crayon']);

export function PdfToolbar({
  onClose, pageCourante, numPages, onAllerPage,
  scale, onZoom, onAjuster,
  outil, setOutil, couleurActive, setCouleurActive,
  hist,
  search, setSearch, matches, activeMatch, searching, onPrecedent, onSuivant, onFermerRecherche,
  panelOpen, setPanelOpen, nbNotions,
  actionsDocument, outilsAnnotation = true, contexteSupplementaire = null,
}) {
  const [menu, setMenu] = useState(null);
  const actions = (actionsDocument || []).filter(Boolean);
  const outilActif = OUTILS.find((o) => o.id === outil) || OUTILS[0];

  return (
    <>
      <div className="pdfr-toolbar pdfr-barre">
        {/* ---- ZONE GAUCHE : naviguer dans le document ---- */}
        <div className="ptb-zone">
          <button className="btn ghost sm" onClick={onClose} title="Revenir à la liste"><Icon name="chevL" size={14} /> Retour</button>
          <span className="ptb-sep" />
          <div className="ptb-pages" title="Page affichée">
            <button className="icon-btn sm" disabled={pageCourante <= 1} onClick={() => onAllerPage(pageCourante - 1)} title="Page précédente"><Icon name="chevU" size={13} /></button>
            <span className="tnum">{numPages ? `${pageCourante} / ${numPages}` : '—'}</span>
            <button className="icon-btn sm" disabled={!numPages || pageCourante >= numPages} onClick={() => onAllerPage(pageCourante + 1)} title="Page suivante"><Icon name="chevD" size={13} /></button>
          </div>
          <span className="ptb-sep" />
          <div className="ptb-zoom">
            <button className="icon-btn sm" onClick={() => onZoom(1 / 1.15)} title="Dézoomer"><Icon name="minus" size={14} /></button>
            <span className="hint tnum" style={{ minWidth: 42, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
            <button className="icon-btn sm" onClick={() => onZoom(1.15)} title="Zoomer"><Icon name="plus" size={14} /></button>
            <button className="icon-btn sm" onClick={onAjuster} title="Ajuster à la largeur"><Icon name="maximize" size={13} /></button>
          </div>
        </div>

        {/* ---- ZONE CENTRE : LES OUTILS. Le cœur du lecteur, donc au centre. ---- */}
        {outilsAnnotation && (
          <div className="ptb-outils" role="group" aria-label="Outils d'annotation">
            {OUTILS.map((o) => (
              <button key={o.id} type="button" title={`${o.label} — ${o.aide}`}
                className={'ptb-outil' + (outil === o.id ? ' actif' : '')}
                onClick={() => setOutil(o.id)}>
                <Icon name={o.icon} size={15} /><span className="ptb-outil-lbl">{o.label}</span>
              </button>
            ))}
            <span className="ptb-sep" />
            <button className="icon-btn sm" onClick={hist.annuler} disabled={!hist.peutAnnuler}
              title={hist.peutAnnuler ? `Annuler — ${hist.libelleAnnuler} (${RACCOURCI}Z)` : `Annuler (${RACCOURCI}Z)`}>
              <Icon name="refresh" size={14} style={{ transform: 'scaleX(-1)' }} />
            </button>
            <button className="icon-btn sm" onClick={hist.retablir} disabled={!hist.peutRetablir}
              title={hist.peutRetablir ? `Rétablir — ${hist.libelleRetablir} (${RACCOURCI}Maj+Z)` : `Rétablir (${RACCOURCI}Maj+Z)`}>
              <Icon name="refresh" size={14} />
            </button>
          </div>
        )}

        {/* ---- ZONE DROITE : chercher, lire ses notions, agir sur le document ---- */}
        <div className="ptb-zone ptb-droite">
          <div className="search ptb-recherche">
            <Icon name="search" size={14} className="ic" />
            <input placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) onPrecedent(); else onSuivant(); } if (e.key === 'Escape') onFermerRecherche(); }} />
            {search && <button className="icon-btn sm" onClick={onFermerRecherche} title="Fermer la recherche"><Icon name="x" size={13} /></button>}
          </div>
          {!!search && (
            <div className="ptb-resultats">
              <span className="hint tnum">{searching ? '…' : matches.length ? `${activeMatch + 1}/${matches.length}` : '0'}</span>
              <button className="icon-btn sm" disabled={!matches.length} onClick={onPrecedent} title="Précédent (Maj+Entrée)"><Icon name="chevU" size={13} /></button>
              <button className="icon-btn sm" disabled={!matches.length} onClick={onSuivant} title="Suivant (Entrée)"><Icon name="chevD" size={13} /></button>
            </div>
          )}
          <button className="btn ghost sm" onClick={() => setPanelOpen((v) => !v)} title="Panneau des notions surlignées">
            <Icon name={panelOpen ? 'chevR' : 'chevL'} size={13} /> Notions {nbNotions ? `(${nbNotions})` : ''}
          </button>
          {!!actions.length && (
            <button className="icon-btn sm" title="Actions sur le document"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: Math.min(r.left, window.innerWidth - 260), y: r.bottom + 6 }); }}>
              <Icon name="more" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ---- BARRE CONTEXTUELLE : seulement si l'outil actif a des réglages ---- */}
      {outilsAnnotation && (OUTILS_COLORES.has(outil) || contexteSupplementaire) && (
        <div className="pdfr-contexte">
          <span className="ptb-contexte-titre">{outilActif.label}</span>
          {OUTILS_COLORES.has(outil) && COLORS.map((c) => (
            <button key={c.id} type="button" title={c.label} onClick={() => setCouleurActive(c.id)}
              className={'ptb-pastille' + (couleurActive === c.id ? ' actif' : '')} style={{ background: c.hex }} />
          ))}
          {contexteSupplementaire}
          <span style={{ flex: 1 }} />
          <span className="hint" style={{ fontSize: 11.5 }}>{outilActif.aide}</span>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={actions} onClose={() => setMenu(null)} />}
    </>
  );
}
