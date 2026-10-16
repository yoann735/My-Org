/* ============================================================
   MedRevise — MENU « FICHIER », UN SEUL pour toutes les pages du lecteur (15/10,
   docs/compte-rendu-bibliotheque-fichier.md) : cours PDF, document, fiche jumelle,
   onglet Notes, fiche HTML. Toujours les MÊMES entrées, dans le MÊME ordre, avec les
   mêmes libellés, icônes et raccourcis :
     1. Renommer · 2. Fichiers du cours (principal + fiche jumelle) · 3. Mise en page ·
     4. Reconnaissance de texte · 5. Exporter le PDF annoté · 6. Exporter (.md / PNG) ·
     7. Export spécial IA · 8. Textes d'annotations (JSON) · — · 10. Supprimer
   Une entrée qui ne s'applique pas à la page est GRISÉE, jamais masquée ni déplacée :
   chaque bouton reste à la même place partout. Sa raison s'affiche au survol (title)
   et, au doigt, dans la ligne du bas du menu quand on la touche.

   `actions` : { [id]: { onClick } | { indispo: 'raison' } } ; pour une entrée à choix
   (exporter, textes) : { choix: { [id]: { onClick } | { indispo } } }. Facultatifs :
   `etat` (texte à droite, ex. l'état de l'OCR), `remplacer` (jumelle : libellé
   « Remplacer »), `extras` ([{ label, title, onClick }] : pastilles à droite).
   Les RACCOURCIS (F2, ⌘P, ⌘⇧E) sont posés ici, donc identiques partout par construction.
   Fermeture : Échap, clic à l'extérieur, ou après une action. ↑ ↓ pour naviguer.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import '../../styles/menu-fichier.css';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const cmd = (t) => (MAC ? '⌘' + t.replace('Maj+', '⇧') : 'Ctrl+' + t);

/* la liste FIXE — l'ordre de ce tableau est l'ordre du menu partout */
export const ENTREES_FICHIER = [
  { id: 'renommer', label: 'Renommer', icon: 'edit', raccourci: 'F2', aide: 'Renommer le cours' },
  // (16/10) « Fichiers du cours » : document principal + fiche jumelle (importer, remplacer, supprimer, exporter)
  { id: 'fichiers', label: 'Fichiers du cours…', icon: 'filePdf', aide: 'Document principal et fiche jumelle : importer, remplacer, supprimer, exporter' },
  { id: 'miseEnPage', label: 'Mise en page…', icon: 'maximize', aide: 'Marges et fond de page' },
  { id: 'ocr', label: 'Reconnaissance de texte…', icon: 'search', aide: 'État de la reconnaissance, couche de texte, relancer' },
  { id: 'pdfAnnote', label: 'Exporter le PDF annoté', icon: 'upload', raccourci: cmd('P'), aide: 'Un PDF avec toutes tes annotations' },
  { id: 'exporter', label: 'Exporter', icon: 'ext', choix: [{ id: 'md', label: '.md', aide: 'Texte en Markdown' }, { id: 'png', label: 'PNG par page', aide: 'Une image par page (avec annotations), dans un .zip' }] },
  { id: 'exportIA', label: 'Export spécial IA…', icon: 'layers', raccourci: cmd('Maj+E'), aide: 'Visuel avec repères + JSON, notions, cours complet, prompts' },
  { id: 'textes', label: 'Textes d’annotations', icon: 'list', choix: [{ id: 'exporter', label: 'Exporter', aide: 'Exporter les textes des boîtes (JSON)' }, { id: 'importer', label: 'Importer', aide: 'Importer des textes corrigés (JSON)' }], suffixe: 'JSON' },
  { id: '—' },
  { id: 'supprimer', label: 'Supprimer…', icon: 'trash', danger: true, aide: 'Supprimer le cours (corbeille) ou seulement détacher son PDF' },
];
/** pour la doc et les tests : la liste des raccourcis du menu */
export const RACCOURCIS_FICHIER = ENTREES_FICHIER.filter((e) => e.raccourci).map((e) => ({ id: e.id, label: e.label, raccourci: e.raccourci }));

const champSaisie = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/* `compact` (tablette) : même menu, déclencheur de 44 px. */
export function MenuFichier({ actions = {}, compact = false, raccourcis = true }) {
  const [ouvert, setOuvert] = useState(false);
  const [raison, setRaison] = useState(null); // raison d'une entrée grisée touchée au doigt
  const racine = useRef(null);
  const bouton = useRef(null);
  const menu = useRef(null);
  const actionsRef = useRef(actions); actionsRef.current = actions;
  // le menu reste dans l'écran : recalé vers la gauche s'il déborde (bouton à droite, en tablette)
  const [decalage, setDecalage] = useState(0);
  useLayoutEffect(() => {
    if (!ouvert || !menu.current) { setDecalage(0); return; }
    const r = menu.current.getBoundingClientRect();
    const trop = r.right - (window.innerWidth - 8);
    if (trop > 0) setDecalage(-Math.min(trop, Math.max(0, r.left - 8)));
  }, [ouvert]);
  const fermer = (rendreFocus = false) => { setOuvert(false); setRaison(null); if (rendreFocus && bouton.current) bouton.current.focus(); };
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) fermer(); };
    const touche = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fermer(true); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !menu.current) return;
      const liste = [...menu.current.querySelectorAll('[data-mf-nav]')];
      if (!liste.length) return;
      e.preventDefault();
      const i = liste.indexOf(document.activeElement);
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? liste.length - 1
        : e.key === 'ArrowDown' ? (i + 1) % liste.length : (i <= 0 ? liste.length - 1 : i - 1);
      liste[j].focus();
    };
    window.addEventListener('pointerdown', dehors);
    window.addEventListener('keydown', touche);
    // le premier bouton prend le focus (clavier) — sans faire défiler quoi que ce soit
    const t = setTimeout(() => { const p = menu.current && menu.current.querySelector('[data-mf-nav]'); if (p) p.focus({ preventScroll: true }); }, 0);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', dehors); window.removeEventListener('keydown', touche); };
  }, [ouvert]);

  /* RACCOURCIS : F2 Renommer · ⌘/Ctrl+P PDF annoté · ⌘/Ctrl+Maj+E Export spécial IA */
  useEffect(() => {
    if (!raccourcis) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || !racine.current || !racine.current.isConnected) return;
      const mod = e.metaKey || e.ctrlKey, k = String(e.key || '').toLowerCase();
      let id = null;
      if (e.key === 'F2' && !mod && !e.shiftKey && !champSaisie(e.target)) id = 'renommer';
      else if (mod && !e.shiftKey && (k === 'p' || e.code === 'KeyP')) id = 'pdfAnnote';
      else if (mod && e.shiftKey && (k === 'e' || e.code === 'KeyE')) id = 'exportIA';
      if (!id) return;
      e.preventDefault(); // même grisée : ⌘P n'ouvre pas l'impression du navigateur à la place
      const a = actionsRef.current[id];
      if (a && a.onClick && !a.indispo) { fermer(); a.onClick(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [raccourcis]);

  const lancer = (fn) => { fermer(); fn(); };
  const griser = (e, txt) => { e.preventDefault(); setRaison(txt); };

  return (
    <div className="mf" ref={racine}>
      <button ref={bouton} type="button" className={'mf-bouton' + (compact ? ' mf-compact' : '') + (ouvert ? ' ouvert' : '')} aria-haspopup="menu" aria-expanded={ouvert}
        onClick={() => { setRaison(null); setOuvert((v) => !v); }} title="Fichier — renommer, fiche jumelle, exporter…">
        Fichier
      </button>
      {ouvert && (
        <div className="mf-menu mf-fixe" role="menu" ref={menu} aria-label="Fichier" style={decalage ? { left: decalage } : undefined}>
          {ENTREES_FICHIER.map((def) => {
            if (def.id === '—') return <div key="sep" className="mf-sep" role="separator" />;
            const a = actions[def.id] || { indispo: 'Non disponible ici' };
            const label = def.label;
            if (def.choix) {
              // entrée à choix : libellé fixe, une pastille par format (chacune peut être grisée)
              const ch = a.choix || {};
              const toutIndispo = a.indispo || def.choix.every((c) => !ch[c.id] || ch[c.id].indispo);
              return (
                <div key={def.id} className={'mf-item mf-choix' + (toutIndispo ? ' indispo' : '')} data-entree={def.id} role="group" aria-label={label}
                  title={a.indispo || (toutIndispo ? def.choix.map((c) => (ch[c.id] && ch[c.id].indispo) || '').find(Boolean) : def.choix.map((c) => c.aide).join(' · '))}>
                  <span className="mf-ic"><Icon name={def.icon} size={14} /></span>
                  <span className="mf-label">{label}{def.suffixe && <span className="mf-suffixe"> ({def.suffixe})</span>}</span>
                  <span className="mf-pastilles">
                    {def.choix.map((c) => {
                      const x = a.indispo ? { indispo: a.indispo } : ch[c.id] || { indispo: 'Non disponible ici' };
                      return (
                        <button key={c.id} type="button" role="menuitem" data-mf-nav="" data-choix={c.id} aria-disabled={x.indispo ? 'true' : undefined}
                          className={'mf-pastille' + (x.indispo ? ' indispo' : '')} title={x.indispo || c.aide}
                          onClick={(e) => (x.indispo ? griser(e, x.indispo) : lancer(x.onClick))}>{c.label}</button>
                      );
                    })}
                  </span>
                </div>
              );
            }
            const indispo = a.indispo || null;
            return (
              <div key={def.id} className={'mf-ligne' + (indispo ? ' indispo' : '')} role="none">
                <button type="button" role="menuitem" data-mf-nav="" data-entree={def.id} aria-disabled={indispo ? 'true' : undefined}
                  className={'mf-item' + (def.danger ? ' danger' : '') + (indispo ? ' indispo' : '')} title={indispo || a.title || def.aide}
                  onClick={(e) => (indispo ? griser(e, indispo) : lancer(a.onClick))}>
                  <span className="mf-ic"><Icon name={def.icon} size={14} /></span>
                  <span className="mf-label">{label}</span>
                  {a.etat && <span className="mf-etat">{a.etat}</span>}
                  {def.raccourci && <kbd className="mf-kbd">{def.raccourci}</kbd>}
                </button>
                {!indispo && (a.extras || []).length > 0 && (
                  <span className="mf-pastilles mf-extras">
                    {a.extras.map((x) => (
                      <button key={x.label} type="button" role="menuitem" data-mf-nav="" className="mf-pastille" title={x.title || x.label} onClick={() => lancer(x.onClick)}>{x.label}</button>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
          {raison && <div className="mf-raison" role="status">{raison}</div>}
        </div>
      )}
    </div>
  );
}
