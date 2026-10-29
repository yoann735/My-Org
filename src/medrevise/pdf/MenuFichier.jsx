/* ============================================================
   MedRevise — MENU « FICHIER », UN SEUL pour toutes les pages du lecteur (15/10, refait le
   17/10 en sections — docs/compte-rendu-fichier-carnet-calendrier.md) : cours PDF, document
   créé dans l'app, fiche jumelle, onglet Notes, fiche HTML.
     Cours : Renommer le cours · Fichiers du cours · Supprimer le cours
     Diapo originale — <nom>  /  Fiche — <nom> (ou « aucune » : Importer une fiche) :
       Exporter … annotée · Autres formats · Export spécial IA · Textes d'annotations ·
       Reconnaissance de texte · [propres] · Remplacer ce fichier · Supprimer …
   Une entrée qui ne s'applique pas est GRISÉE, jamais masquée ni déplacée ; sa raison
   s'affiche au survol (title) et, au doigt, dans la ligne du bas du menu.

   Actions : { [id]: { onClick } | { indispo: 'raison' } } ; entrée à choix (formats, textes) :
   { choix: { [id]: { onClick } | { indispo } } }. Facultatif : `etat` (texte à droite).
   Les RACCOURCIS (F2, ⌘P, ⌘⇧E) sont posés ici, donc identiques partout par construction ;
   ⌘P et ⌘⇧E agissent sur le document AFFICHÉ.
   Fermeture : Échap, clic à l'extérieur, ou après une action. ↑ ↓ pour naviguer.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import '../../styles/menu-fichier.css';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const cmd = (t) => (MAC ? '⌘' + t.replace('Maj+', '⇧') : 'Ctrl+' + t);

/* (17/10, docs/compte-rendu-fichier-carnet-calendrier.md) TROIS SECTIONS, pour toujours savoir
   sur quoi on agit :
     « Cours » — ce qui concerne le cours entier ;
     « Diapo originale — <nom> » et « Fiche — <nom> » (ou « Fiche — aucune ») — chacune avec les
     MÊMES actions, mêmes libellés, même ordre ; les actions propres à un document (Mise en page,
     Correspondance des pages) se glissent avant « Remplacer ce fichier ».
   La section du document affiché est teintée et marquée « affiché » ; l'autre est en retrait.
   Une action de l'autre section affiche d'abord ce document (c'est le lecteur qui s'en charge). */
export const ENTREES_COURS = [
  { id: 'renommer', label: 'Renommer le cours', icon: 'edit', raccourci: 'F2', aide: 'Renommer le cours' },
  { id: 'fichiers', label: 'Fichiers du cours…', icon: 'folder', aide: 'Diapo originale et fiche : noms, tailles, dates d’import' },
  // (29/10) plusieurs fiches de résumé par cours, chacune rattachée à une séance (lib/ficheJumelle.js)
  { id: 'ajouterFiche', label: 'Ajouter une fiche de résumé…', icon: 'upload', aide: 'Un PDF de résumé en plus (par exemple la fiche d’une séance) : la diapo et les autres fiches ne changent pas' },
  // (25/10) les séances marquées sur les pages (tags « Début / Fin de cours », pdf/TagsPages.jsx)
  { id: 'seances', label: 'Séances…', icon: 'calendar', aide: 'Les séances marquées sur les pages : date, pages début–fin, transcript lié' },
  { id: 'supprimer', label: 'Supprimer le cours…', icon: 'trash', danger: true, aide: 'Le cours part dans la corbeille (restaurable)' },
];
/* `d.genre` : 'f' (la diapo, la fiche) ou 'm' (le document) ; `d.court` : « diapo », « fiche », « document » */
const art = (d) => (d.genre === 'm' ? 'le' : 'la');
const annote = (d) => (d.genre === 'm' ? 'annoté' : 'annotée');
export const ENTREES_DOCUMENT = [
  { id: 'pdfAnnote', label: (d) => `Exporter ${art(d)} ${d.court} ${annote(d)}`, icon: 'upload', raccourci: cmd('P'), aide: 'Un PDF avec toutes les annotations de ce document' },
  { id: 'formats', label: () => 'Autres formats', icon: 'ext', choix: [{ id: 'md', label: '.md', aide: 'Texte en Markdown' }, { id: 'png', label: 'PNG par page', aide: 'Une image par page (avec annotations), dans un .zip' }] },
  { id: 'exportIA', label: () => 'Export spécial IA…', icon: 'layers', raccourci: cmd('Maj+E'), aide: 'Visuel avec repères + JSON, notions, cours complet, prompts' },
  { id: 'textes', label: () => 'Textes d’annotations', icon: 'list', choix: [{ id: 'exporter', label: 'Exporter', aide: 'Exporter les textes des boîtes (JSON)' }, { id: 'importer', label: 'Importer', aide: 'Importer des textes corrigés (JSON)' }], suffixe: 'JSON' },
  { id: 'ocr', label: () => 'Reconnaissance de texte…', icon: 'search', aide: 'État de la reconnaissance, couche de texte, relancer' },
  // actions propres : seulement dans la section qui les déclare
  { id: 'miseEnPage', propre: true, label: () => 'Mise en page…', icon: 'maximize', aide: 'Marges et fond de page' },
  { id: 'correspondance', propre: true, label: () => 'Correspondance des pages…', icon: 'grid', aide: 'Quelle page de la fiche va avec quelle diapo' },
  { id: 'remplacer', label: () => 'Remplacer ce fichier…', icon: 'refresh', aide: 'Un nouveau fichier prend la place ; les annotations suivent leur page' },
  { id: 'supprimer', label: (d) => `Supprimer ${art(d)} ${d.court}${d.cle === 'original' ? (d.genre === 'm' ? ' original' : ' originale') : ''}…`, icon: 'trash', danger: true },
];
/** pour la doc et les tests : la liste des raccourcis du menu */
export const RACCOURCIS_FICHIER = [
  { id: 'renommer', label: 'Renommer le cours', raccourci: 'F2' },
  { id: 'pdfAnnote', label: 'Exporter le document affiché, annoté', raccourci: cmd('P') },
  { id: 'exportIA', label: 'Export spécial IA du document affiché', raccourci: cmd('Maj+E') },
];

const champSaisie = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/* `compact` (tablette) : même menu, déclencheur de 44 px.
   `cours` : { renommer, fichiers, supprimer } ; `documents` : [{ cle: 'original' | 'fiche', role,
   nom, court, genre, icone, affiche, vide, actions }] — `vide` : section sans fichier (« Fiche — aucune »),
   qui ne montre que `actions.importer`. */
export function MenuFichier({ cours = {}, documents = [], compact = false, raccourcis = true }) {
  const [ouvert, setOuvert] = useState(false);
  const [raison, setRaison] = useState(null); // raison d'une entrée grisée touchée au doigt
  const racine = useRef(null);
  const bouton = useRef(null);
  const menu = useRef(null);
  const propsRef = useRef({ cours, documents }); propsRef.current = { cours, documents };
  // le menu reste dans l'écran : recalé vers la gauche s'il déborde (bouton à droite, en tablette)
  const [decalage, setDecalage] = useState(0);
  useLayoutEffect(() => {
    if (!ouvert || !menu.current) { setDecalage(0); return; }
    // largeur de MISE EN PAGE (offsetWidth) : pendant l'animation d'entrée (scale), le rectangle est plus petit
    const r = menu.current.getBoundingClientRect();
    const trop = r.left + menu.current.offsetWidth - (window.innerWidth - 8);
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

  /* RACCOURCIS : F2 Renommer le cours · ⌘/Ctrl+P et ⌘/Ctrl+Maj+E : sur le document AFFICHÉ */
  useEffect(() => {
    if (!raccourcis) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || !racine.current || !racine.current.isConnected) return;
      const mod = e.metaKey || e.ctrlKey, k = String(e.key || '').toLowerCase();
      const { cours: c, documents: ds } = propsRef.current;
      const affiche = ds.find((d) => d.affiche) || ds[0];
      let a = null;
      if (e.key === 'F2' && !mod && !e.shiftKey && !champSaisie(e.target)) a = c.renommer;
      else if (mod && !e.shiftKey && (k === 'p' || e.code === 'KeyP')) a = affiche && affiche.actions.pdfAnnote;
      else if (mod && e.shiftKey && (k === 'e' || e.code === 'KeyE')) a = affiche && affiche.actions.exportIA;
      else return;
      e.preventDefault(); // même grisée : ⌘P n'ouvre pas l'impression du navigateur à la place
      if (a && a.onClick && !a.indispo) { fermer(); a.onClick(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [raccourcis]);

  const lancer = (fn) => { fermer(); fn(); };
  const griser = (e, txt) => { e.preventDefault(); setRaison(txt); };

  /* une entrée (simple ou à choix) ; `kbd` : raccourci affiché (seulement dans la section affichée) */
  const entree = (def, a, label, kbd, cle) => {
    a = a || { indispo: 'Non disponible ici' };
    if (def.choix) {
      // entrée à choix : libellé fixe, une pastille par format (chacune peut être grisée)
      const ch = a.choix || {};
      const toutIndispo = a.indispo || def.choix.every((c) => !ch[c.id] || ch[c.id].indispo);
      return (
        <div key={cle} className={'mf-item mf-choix' + (toutIndispo ? ' indispo' : '')} data-entree={def.id} role="group" aria-label={label}
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
      <div key={cle} className={'mf-ligne' + (indispo ? ' indispo' : '')} role="none">
        <button type="button" role="menuitem" data-mf-nav="" data-entree={def.id} aria-disabled={indispo ? 'true' : undefined}
          className={'mf-item' + (def.danger ? ' danger' : '') + (indispo ? ' indispo' : '')} title={indispo || a.title || def.aide || label}
          onClick={(e) => (indispo ? griser(e, indispo) : lancer(a.onClick))}>
          <span className="mf-ic"><Icon name={def.icon} size={14} /></span>
          <span className="mf-label">{label}</span>
          {a.etat && <span className="mf-etat">{a.etat}</span>}
          {kbd && <kbd className="mf-kbd">{kbd}</kbd>}
        </button>
      </div>
    );
  };

  return (
    <div className="mf" ref={racine}>
      <button ref={bouton} type="button" className={'mf-bouton' + (compact ? ' mf-compact' : '') + (ouvert ? ' ouvert' : '')} aria-haspopup="menu" aria-expanded={ouvert}
        onClick={() => { setRaison(null); setOuvert((v) => !v); }} title="Fichier — le cours, la diapo originale, la fiche">
        Fichier
      </button>
      {ouvert && (
        <div className="mf-menu mf-fixe mf-sections" role="menu" ref={menu} aria-label="Fichier" style={decalage ? { left: decalage } : undefined}>
          <div className="mf-section" data-section="cours" role="group" aria-label="Cours">
            <div className="mf-tete"><span className="mf-tete-ic"><Icon name="book" size={13} /></span><span className="mf-tete-role">Cours</span></div>
            {ENTREES_COURS.map((def) => entree(def, cours[def.id], def.label, def.raccourci, def.id))}
          </div>
          {documents.map((d) => (
            <div key={d.cle} className={'mf-section mf-doc' + (d.affiche ? ' affiche' : ' en-retrait')} data-section={d.cle} role="group"
              aria-label={`${d.role} — ${d.vide ? 'aucune' : d.nom}${d.affiche ? ' (affiché)' : ''}`}>
              <div className="mf-tete" title={d.vide ? undefined : d.nom}>
                <span className="mf-tete-ic"><Icon name={d.icone || 'filePdf'} size={13} /></span>
                <span className="mf-tete-role">{d.role}</span>
                <span className="mf-tete-tiret">—</span>
                <span className={'mf-tete-nom' + (d.vide ? ' aucun' : '')}>{d.vide ? 'aucune' : d.nom}</span>
                {d.affiche && <span className="mf-affiche">affiché</span>}
              </div>
              {d.vide
                ? entree({ id: 'importer', icon: 'upload', aide: 'Ton PDF résumé, à côté du cours' }, d.actions.importer, 'Importer une fiche', null, 'importer')
                : ENTREES_DOCUMENT.filter((def) => !def.propre || d.actions[def.id]).map((def) => entree(def, d.actions[def.id], def.label(d), d.affiche ? def.raccourci : null, def.id))}
            </div>
          ))}
          {raison && <div className="mf-raison" role="status">{raison}</div>}
        </div>
      )}
    </div>
  );
}
