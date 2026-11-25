/* ============================================================
   MedRevise — SECTION « EXOS » (25/11/2026, docs/compte-rendu-section-exos.md).
   Une grille de cartes (une par notion, façon « Documents récents ») → la vue d'une notion (tuiles Fiche /
   Exercices 1, 2…) → le fichier : PDF dans le PdfReader existant (mêmes outils, enregistrement continu,
   Historique), HTML dans le lecteur intégré isolé (exos/LecteurHtml.jsx). Données : exos/notions.js.
   Ordinateur, tablette (même écran) et téléphone (`mobile`, depuis l'accueil du shell téléphone).
   Ne touche à rien d'autre : ni aux cours, ni à leurs documents, ni à l'onglet « Exos » du panneau du lecteur.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { ContextMenu, ConfirmModal, Modal, matiereMeta } from '../components/ui.jsx';
import { MenuDeroulant } from '../components/FenetreCreation.jsx';
import { PdfReader } from '../pdf/PdfReader.jsx';
import { LecteurHtml } from './LecteurHtml.jsx';
import {
  lireNotions, creerNotion, enregistrerNotion, supprimerNotion, importerFichier, compterAnnotations,
  fichiersDe, nsFichier, nomLisible, estHtml, estPdf, dateModif, STORE,
} from './notions.js';
import { demanderApercu, apercuEnMemoire, surApercu, fichierApercu, prechargerFichiers, oublierEchecs } from './apercus.js';
import '../../styles/exos.css';

const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const TRIS = [{ id: 'modif', label: 'Date de modification' }, { id: 'az', label: 'A → Z' }];

/* ---- les notions, relues à chaque écriture du store et après chaque synchro ---- */
function useNotions() {
  const [notions, setNotions] = useState(null);
  const relire = useCallback(() => lireNotions().then(setNotions).catch(() => setNotions((n) => n || [])), []);
  useEffect(() => {
    relire();
    const ecr = (e) => { if (!e.detail || e.detail.store === STORE) relire(); };
    window.addEventListener('medrevise:ecriture', ecr);
    window.addEventListener('medrevise:recharge', relire);
    return () => { window.removeEventListener('medrevise:ecriture', ecr); window.removeEventListener('medrevise:recharge', relire); };
  }, [relire]);
  return [notions, relire];
}

/* ---- infos d'un cours (fiche) rattaché : titre + teinte de sa matière ---- */
function useCours(ctx) {
  return useMemo(() => {
    const mById = Object.fromEntries((ctx.db.matieres || []).map((m) => [m.id, m]));
    const liste = (ctx.db.fiches || []).filter((f) => !f.archive && f.type !== 'anat_schema')
      .map((f) => { const mm = matiereMeta(mById[f.matiereId]); return { id: f.id, label: f.titre, tint: mm.tint, matiere: mm.label }; })
      .sort((a, b) => a.matiere.localeCompare(b.matiere, 'fr') || a.label.localeCompare(b.label, 'fr'));
    return { liste, parId: Object.fromEntries(liste.map((c) => [c.id, c])) };
  }, [ctx.db.fiches, ctx.db.matieres]);
}

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso); const auj = new Date();
  const memeJour = d.toDateString() === auj.toDateString();
  return memeJour ? 'Aujourd’hui, ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === auj.getFullYear() ? undefined : 'numeric' });
};
const plurielFichiers = (n) => `${n} fichier${n > 1 ? 's' : ''}`;
/** « Supprimer « X » et ses N fichiers ? » (« et son fichier ? » pour un seul, rien pour aucun) */
const texteSuppression = (n) => { const k = fichiersDe(n).length; return `Supprimer « ${n.nom} »${k === 0 ? '' : k === 1 ? ' et son fichier' : ` et ses ${k} fichiers`} ?`; };

/* ---- aperçu d'une carte (image en cache, vignette neutre sinon) ---- */
function Apercu({ notion, teinte }) {
  const f = fichierApercu(notion);
  const [a, setA] = useState(() => (f ? apercuEnMemoire(f.fileId) : null));
  useEffect(() => {
    if (!f) return undefined;
    const off = surApercu((id, v) => { if (id === f.fileId) setA(v); });
    const v = demanderApercu(f); if (v) setA(v);
    return off;
  }, [f && f.fileId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (a && a.kind === 'image') return <div className="exo-apercu image"><img src={a.src} alt="" draggable={false} /></div>;
  return (
    <div className="exo-apercu neutre" style={{ '--teinte': teinte }}>
      <Icon name={!f ? 'flask' : f.type === 'html' ? 'fileHtml' : 'filePdf'} size={26} />
      {a && a.kind === 'html' && a.titre ? <span className="exo-apercu-titre">{a.titre}</span> : !f ? <span className="exo-apercu-titre">Aucun fichier</span> : null}
    </div>
  );
}

/* ============================================================ écran ============================================================ */
export function EcranExos({ ctx, mobile = false, onRetour = null }) {
  const [notions, relire] = useNotions();
  const cours = useCours(ctx);
  const [vue, setVue] = useState({ kind: 'grille' }); // grille | notion { id } | pdf { id, fichierId } | html { id, fichierId }
  const [filtre, setFiltre] = useState(() => lireLS('medrevise.exos.filtre', 'tous'));
  const [tri, setTri] = useState(() => lireLS('medrevise.exos.tri', 'modif'));
  const [affichage, setAffichage] = useState(() => lireLS('medrevise.exos.affichage', 'grille'));
  const [menu, setMenu] = useState(null); // { x, y, items }
  const [feuille, setFeuille] = useState(null); // { notion|null }
  const [aSupprimer, setASupprimer] = useState(null);
  useEffect(() => { ecrireLS('medrevise.exos.filtre', filtre); }, [filtre]);
  useEffect(() => { ecrireLS('medrevise.exos.tri', tri); }, [tri]);
  useEffect(() => { ecrireLS('medrevise.exos.affichage', affichage); }, [affichage]);
  // HORS LIGNE : les fichiers des notions sont copiés sur l'appareil en tâche de fond (après l'affichage)
  useEffect(() => {
    if (!notions || !notions.length) return undefined;
    const t = setTimeout(() => { prechargerFichiers(notions).then(() => oublierEchecs()); }, 1500);
    return () => clearTimeout(t);
  }, [notions]);

  const coursAvecNotions = useMemo(() => {
    const ids = new Set((notions || []).map((n) => n.coursId).filter(Boolean));
    return cours.liste.filter((c) => ids.has(c.id));
  }, [notions, cours]);
  const filtreValide = filtre === 'tous' || coursAvecNotions.some((c) => c.id === filtre) ? filtre : 'tous';
  const visibles = useMemo(() => {
    const l = (notions || []).filter((n) => filtreValide === 'tous' || n.coursId === filtreValide);
    return tri === 'az' ? l.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))
      : l.sort((a, b) => String(dateModif(b)).localeCompare(String(dateModif(a))));
  }, [notions, filtreValide, tri]);

  const notion = vue.id ? (notions || []).find((n) => n.id === vue.id) || null : null;
  useEffect(() => { if (vue.kind !== 'grille' && notions && !notion) setVue({ kind: 'grille' }); }, [vue.kind, notions, notion]); // supprimée ailleurs
  const fichier = notion && vue.fichierId ? fichiersDe(notion).find((f) => f.id === vue.fichierId) || null : null;

  const ouvrirMenu = (e, items) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: Math.max(8, r.right - 210), y: r.bottom + 4, hautAncre: r.top, items }); };
  const menuCarte = (e, n) => ouvrirMenu(e, [
    { label: 'Modifier', icon: 'edit', onClick: () => setFeuille({ notion: n }) },
    { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => setASupprimer(n) },
  ]);

  /* ---- lecteurs ---- */
  if (notion && fichier && vue.kind === 'pdf') {
    const fermer = () => setVue({ kind: 'notion', id: notion.id });
    return (
      <div className={'exo-lecteur-pdf' + (mobile ? ' mobile' : '')} data-lecteur="pdf">
        <PdfReader key={nsFichier(fichier)} ctx={ctx} onClose={fermer} coursCartes={notion.coursId || null} ajusterLargeur={mobile}
          source={{ id: nsFichier(fichier), titre: `${notion.nom} — ${fichier.nom}`, pdfId: fichier.fileId, pdfName: fichier.nomFichier || fichier.nom }} />
      </div>
    );
  }
  if (notion && fichier && vue.kind === 'html') {
    return <LecteurHtml fichier={fichier} onRetour={() => setVue({ kind: 'notion', id: notion.id })} />;
  }

  const cAttache = notion && notion.coursId ? cours.parId[notion.coursId] : null;
  const ecran = (contenu) => (
    <div className={(mobile ? 'mrm-app exo-mobile' : 'screen scroll fadein') + ' exo-ecran'}>
      {contenu}
      {menu && <ContextMenu x={menu.x} y={menu.y} hautAncre={menu.hautAncre} items={menu.items} onClose={() => setMenu(null)} />}
      {feuille && <FeuilleNotion ctx={ctx} cours={cours} notion={feuille.notion} onFermer={() => setFeuille(null)}
        onFait={async (id) => { setFeuille(null); await relire(); if (id && !feuille.notion) setVue({ kind: 'notion', id }); }} />}
      {aSupprimer && <ConfirmModal danger title="Supprimer la notion"
        body={`${texteSuppression(aSupprimer)} Une sauvegarde est faite avant ; les annotations restent récupérables dans l’Historique.`}
        confirmLabel="Supprimer" onCancel={() => setASupprimer(null)}
        onConfirm={async () => { const n = aSupprimer; setASupprimer(null); await supprimerNotion(n); if (vue.id === n.id) setVue({ kind: 'grille' }); await relire(); }} />}
    </div>
  );

  /* ---- vue d'une notion ---- */
  if (notion && vue.kind === 'notion') {
    const ex = notion.exercices || [];
    const tuile = (f, libelle, i) => (
      <button key={f.id} type="button" className="exo-tuile" data-fichier={f.id} onClick={() => setVue({ kind: f.type, id: notion.id, fichierId: f.id })}
        title={`Ouvrir ${f.nomFichier || f.nom}`} style={{ '--teinte': cAttache ? cAttache.tint : 'var(--accent)' }}>
        <span className="exo-tuile-ic"><Icon name={f.type === 'html' ? 'fileHtml' : 'filePdf'} size={22} /></span>
        <span className="exo-tuile-txt">
          <span className="exo-tuile-lib">{libelle}{i != null ? ` ${i}` : ''}</span>
          <span className="exo-tuile-nom">{f.nom}</span>
        </span>
        <span className="exo-tuile-type">{f.type === 'html' ? 'HTML' : 'PDF'}</span>
      </button>
    );
    return ecran(<>
      <div className="exo-tete">
        <button type="button" className="icon-btn" onClick={() => setVue({ kind: 'grille' })} title="Retour à la grille des notions" aria-label="Retour à la grille"><Icon name="chevL" size={18} /></button>
        <div className="exo-tete-txt">
          <h1 className="serif exo-titre-notion">{notion.nom}</h1>
          <div className="exo-sous">{cAttache ? <><span className="exo-point" style={{ background: cAttache.tint }} /> {cAttache.label}</> : 'Sans cours'} · modifiée {fmtDate(dateModif(notion)).toLowerCase()}</div>
        </div>
        <div className="exo-tete-actions">
          <button type="button" className="btn sm" onClick={() => setFeuille({ notion })} title="Modifier la notion (nom, cours, fichiers)"><Icon name="edit" size={13} /> Modifier</button>
          <button type="button" className="icon-btn" onClick={(e) => ouvrirMenu(e, [{ label: 'Supprimer', icon: 'trash', danger: true, onClick: () => setASupprimer(notion) }])} title="Autres actions" aria-label="Autres actions"><Icon name="more" size={16} /></button>
        </div>
      </div>
      <div className="exo-tuiles">
        <div className="exo-groupe-titre">Fiche</div>
        {notion.fiche ? tuile(notion.fiche, 'Fiche') : <div className="exo-tuile vide">Pas de fiche PDF — <button type="button" className="exo-lien" onClick={() => setFeuille({ notion })}>en ajouter une</button></div>}
        <div className="exo-groupe-titre">Exercices <span className="lv-compte">{ex.length}</span></div>
        {ex.length ? ex.map((f, i) => tuile(f, 'Exercices', i + 1)) : <div className="exo-tuile vide">Aucun fichier d’exercices — <button type="button" className="exo-lien" onClick={() => setFeuille({ notion })}>en ajouter</button></div>}
      </div>
    </>);
  }

  /* ---- grille / liste ---- */
  const libFiltre = filtreValide === 'tous' ? 'Tous' : (cours.parId[filtreValide] || {}).label || 'Tous';
  return ecran(<>
    <div className="topbar exo-topbar">
      {mobile && onRetour && <button type="button" className="icon-btn" onClick={onRetour} title="Retour à l’accueil" aria-label="Retour à l’accueil"><Icon name="chevL" size={18} /></button>}
      <div><h1 className="serif">Exos</h1>{!mobile && <div className="sub">Une fiche et des exercices par notion.</div>}</div>
      <div className="topbar-actions exo-actions">
        <button type="button" className="btn sm exo-filtre" title="Filtrer par cours" aria-haspopup="menu"
          onClick={(e) => ouvrirMenu(e, [{ label: (filtreValide === 'tous' ? '✓ ' : '') + 'Tous', onClick: () => setFiltre('tous') },
            ...coursAvecNotions.map((c) => ({ label: (filtreValide === c.id ? '✓ ' : '') + c.label, onClick: () => setFiltre(c.id) }))])}>
          <Icon name="filter" size={13} /> <span className="exo-filtre-lib">{libFiltre}</span> <Icon name="chevD" size={12} />
        </button>
        <div className="seg" role="tablist" aria-label="Affichage">
          <button type="button" role="tab" aria-selected={affichage === 'grille'} className={'seg-btn' + (affichage === 'grille' ? ' active' : '')} onClick={() => setAffichage('grille')} title="Grille" aria-label="Grille"><Icon name="grid" size={13} /></button>
          <button type="button" role="tab" aria-selected={affichage === 'liste'} className={'seg-btn' + (affichage === 'liste' ? ' active' : '')} onClick={() => setAffichage('liste')} title="Liste" aria-label="Liste"><Icon name="list" size={13} /></button>
        </div>
        <button type="button" className="btn sm" title={`Trier — ${TRIS.find((t) => t.id === tri).label}`} aria-haspopup="menu"
          onClick={(e) => ouvrirMenu(e, TRIS.map((t) => ({ label: (tri === t.id ? '✓ ' : '') + t.label, onClick: () => setTri(t.id) })))}>
          <Icon name="sliders" size={13} /> <span className="exo-tri-lib">{tri === 'az' ? 'A → Z' : 'Récents'}</span>
        </button>
        <button type="button" className="btn primary sm" onClick={() => setFeuille({ notion: null })} title="Créer une notion (fiche PDF + exercices)"><Icon name="plus" size={13} /> <span className="exo-nouvelle-lib">Nouvelle notion</span></button>
      </div>
    </div>
    {notions == null ? <div className="exo-vide"><div className="hint">Chargement…</div></div>
      : !visibles.length ? (
        <div className="exo-vide">
          <Icon name="flask" size={28} />
          <div style={{ fontWeight: 600 }}>{notions.length ? 'Aucune notion pour ce cours.' : 'Aucune notion pour l’instant.'}</div>
          <div className="hint">Une notion réunit une fiche PDF et un ou plusieurs fichiers d’exercices (HTML ou PDF).</div>
          {!notions.length && <button type="button" className="btn primary sm" onClick={() => setFeuille({ notion: null })}><Icon name="plus" size={13} /> Nouvelle notion</button>}
        </div>
      ) : affichage === 'grille' ? (
        <div className="exo-grille fadein">
          {visibles.map((n) => {
            const c = n.coursId ? cours.parId[n.coursId] : null;
            const teinte = c ? c.tint : 'var(--accent)';
            return (
              <div key={n.id} role="button" tabIndex={0} className="lv-carte exo-carte" data-notion={n.id} style={{ '--teinte': teinte }}
                onClick={() => setVue({ kind: 'notion', id: n.id })} onKeyDown={(e) => { if (e.key === 'Enter') setVue({ kind: 'notion', id: n.id }); }} title={`Ouvrir « ${n.nom} »`}>
                <Apercu notion={n} teinte={teinte} />
                <div className="lv-carte-corps">
                  <div className="lv-carte-titre">{n.nom}</div>
                  <div className="lv-carte-lieu">{c ? <><span className="exo-point" style={{ background: c.tint }} /> {c.label}</> : 'Sans cours'}</div>
                  <div className="lv-carte-pied">
                    <span>{fmtDate(dateModif(n))} · {plurielFichiers(fichiersDe(n).length)}</span>
                    <span className="lv-actions"><button type="button" className="cd-ic" title="Autres actions (modifier, supprimer)" aria-label="Autres actions" onClick={(e) => menuCarte(e, n)}><Icon name="more" size={14} stroke={2.6} /></button></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="exo-liste fadein">
          {visibles.map((n) => {
            const c = n.coursId ? cours.parId[n.coursId] : null;
            return (
              <div key={n.id} role="button" tabIndex={0} className="exo-ligne" data-notion={n.id} onClick={() => setVue({ kind: 'notion', id: n.id })}
                onKeyDown={(e) => { if (e.key === 'Enter') setVue({ kind: 'notion', id: n.id }); }} title={`Ouvrir « ${n.nom} »`}>
                <span className="exo-ligne-ic" style={{ '--teinte': c ? c.tint : 'var(--accent)' }}><Icon name="flask" size={15} /></span>
                <span className="exo-ligne-nom">{n.nom}</span>
                <span className="exo-ligne-cours">{c ? <><span className="exo-point" style={{ background: c.tint }} /> {c.label}</> : 'Sans cours'}</span>
                <span className="exo-ligne-n">{plurielFichiers(fichiersDe(n).length)}</span>
                <span className="exo-ligne-date">{fmtDate(dateModif(n))}</span>
                <button type="button" className="cd-ic" title="Autres actions (modifier, supprimer)" aria-label="Autres actions" onClick={(e) => menuCarte(e, n)}><Icon name="more" size={14} stroke={2.6} /></button>
              </div>
            );
          })}
        </div>
      )}
  </>);
}

/* ============================================================ feuille Nouvelle notion / Modifier ============================================================ */
function FeuilleNotion({ ctx, cours, notion, onFermer, onFait }) {
  const nouvelle = !notion;
  const [nom, setNom] = useState(notion ? notion.nom : '');
  const [coursId, setCoursId] = useState(notion ? notion.coursId || '' : '');
  const [fiche, setFiche] = useState(notion ? notion.fiche : null); // entrée existante, ou { id, _file, nom, type }
  const [exercices, setExercices] = useState(notion ? notion.exercices || [] : []);
  const [retires, setRetires] = useState(notion ? notion.fichiersRetires || [] : []);
  const [renomme, setRenomme] = useState(null); // id de l'exercice en renommage
  const [confirmer, setConfirmer] = useState(null); // { titre, texte, label, faire }
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const champFiche = useRef(null); const champExos = useRef(null);
  const idTemp = () => 'tmp-' + Math.random().toString(36).slice(2, 10);

  const avecConfirmation = async (f, action, verbe) => {
    const n = f && !f._file ? await compterAnnotations(f) : 0;
    if (!n) { action(); return; }
    setConfirmer({
      titre: `${verbe} « ${f.nom} »`,
      texte: `Ce fichier porte ${n} annotation${n > 1 ? 's' : ''}. Elles ne sont pas effacées : une sauvegarde est faite, le fichier reste dans « Fichiers retirés » (bouton Remettre) et ses annotations dans l’Historique.`,
      label: verbe, faire: action,
    });
  };
  const choisirFiche = (l) => {
    const file = l && l[0]; if (!file) return;
    if (!estPdf(file)) { setErreur('La fiche doit être un PDF.'); return; }
    setErreur(null);
    const neuve = { id: idTemp(), _file: file, nom: nomLisible(file.name), nomFichier: file.name, type: 'pdf' };
    if (fiche) avecConfirmation(fiche, () => setFiche(neuve), 'Remplacer'); else setFiche(neuve);
  };
  const ajouterExos = (l) => {
    const ok = [...(l || [])].filter((f) => estHtml(f) || estPdf(f));
    if (ok.length < (l || []).length) setErreur('Seuls les fichiers HTML et PDF sont acceptés.'); else setErreur(null);
    setExercices((e) => [...e, ...ok.map((file) => ({ id: idTemp(), _file: file, nom: nomLisible(file.name), nomFichier: file.name, type: estHtml(file) ? 'html' : 'pdf' }))]);
  };
  const deplacer = (i, d) => setExercices((e) => { const c = [...e]; const j = i + d; if (j < 0 || j >= c.length) return e; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const retirerExo = (f) => avecConfirmation(f, () => setExercices((e) => e.filter((x) => x.id !== f.id)), 'Retirer');
  const remettre = (r) => {
    const { retireLe, raison, role, ...f } = r;
    const sortir = () => setRetires((l) => l.filter((x) => x.id !== r.id));
    if (role === 'fiche' && f.type === 'pdf') {
      if (fiche) avecConfirmation(fiche, () => { sortir(); setFiche(f); }, 'Remplacer'); else { sortir(); setFiche(f); }
    } else { sortir(); setExercices((e) => [...e, f]); }
  };

  const valider = async (e) => {
    if (e) e.preventDefault();
    if (!nom.trim()) { setErreur('Le nom de la notion est obligatoire.'); return; }
    setEnCours(true); setErreur(null);
    try {
      const reel = async (f) => (f && f._file ? { ...(await importerFichier(f._file)), nom: f.nom || nomLisible(f._file.name) } : f);
      const ficheReelle = await reel(fiche);
      const exosReels = [];
      for (const f of exercices) exosReels.push(await reel(f));
      const base = { nom: nom.trim(), coursId: coursId || null, fiche: ficheReelle || null, exercices: exosReels.map((f) => ({ ...f, nom: (f.nom || '').trim() || 'Exercices' })) };
      if (nouvelle) { const r = await creerNotion(base); await onFait(r.id); }
      else { await enregistrerNotion(notion, { ...notion, ...base, fichiersRetires: retires }); await onFait(notion.id); }
    } catch (err) { setErreur(String((err && err.message) || err)); setEnCours(false); }
  };

  const ligneFichier = (f, { i = null, n = 0 } = {}) => (
    <div key={f.id} className="exo-f-ligne" data-fichier-ligne={f.id}>
      <Icon name={f.type === 'html' ? 'fileHtml' : 'filePdf'} size={15} />
      {i != null && renomme === f.id ? (
        <input autoFocus className="fc-champ exo-f-renommer" defaultValue={f.nom} aria-label="Nouveau nom du fichier"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenomme(null); } }}
          onBlur={(e) => { const v = e.currentTarget.value.trim(); if (renomme === f.id && v) setExercices((l) => l.map((x) => (x.id === f.id ? { ...x, nom: v } : x))); setRenomme(null); }} />
      ) : (
        <span className="exo-f-nom" title={f.nomFichier || f.nom} onDoubleClick={() => i != null && setRenomme(f.id)}>{i != null ? <b>{i + 1}.</b> : null} {f.nom}{f._file ? <em className="exo-f-neuf"> · nouveau</em> : null}</span>
      )}
      {i != null && <>
        <button type="button" className="cd-ic" title="Renommer" aria-label="Renommer" onClick={() => setRenomme(f.id)}><Icon name="edit" size={12} /></button>
        <button type="button" className="cd-ic" title="Monter" aria-label="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}><Icon name="chevU" size={13} /></button>
        <button type="button" className="cd-ic" title="Descendre" aria-label="Descendre" disabled={i === n - 1} onClick={() => deplacer(i, 1)}><Icon name="chevD" size={13} /></button>
        <button type="button" className="cd-ic" title="Retirer ce fichier" aria-label="Retirer" onClick={() => retirerExo(f)}><Icon name="x" size={13} /></button>
      </>}
      {i == null && <>
        <button type="button" className="cd-ic" title="Remplacer la fiche PDF" aria-label="Remplacer" onClick={() => champFiche.current && champFiche.current.click()}><Icon name="refresh" size={12} /></button>
        <button type="button" className="cd-ic" title="Retirer la fiche" aria-label="Retirer" onClick={() => avecConfirmation(f, () => setFiche(null), 'Retirer')}><Icon name="x" size={13} /></button>
      </>}
    </div>
  );

  const optionsCours = [{ id: '', label: 'Aucun cours', tint: 'var(--border-2)' }, ...cours.liste];
  return (
    <Modal title={nouvelle ? 'Nouvelle notion' : 'Modifier la notion'} onClose={onFermer} width="min(560px, 96vw)">
      <form className="exo-feuille" onSubmit={valider} data-feuille="notion">
        <label className="exo-champ"><span className="exo-etiquette">Nom <em>(obligatoire)</em></span>
          <input className="fc-champ" autoFocus={nouvelle} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Équilibre acido-basique" aria-label="Nom de la notion" /></label>
        <div className="exo-champ"><span className="exo-etiquette">Cours <em>(facultatif)</em></span>
          <MenuDeroulant id="exo-cours" valeur={coursId} options={optionsCours} onChoisir={(id) => setCoursId(id || '')} vide="Aucun cours" /></div>

        <div className="exo-champ"><span className="exo-etiquette">Fiche PDF <em>(facultative)</em></span>
          {fiche ? ligneFichier(fiche) : <button type="button" className="btn sm exo-ajout" onClick={() => champFiche.current && champFiche.current.click()}><Icon name="upload" size={13} /> Ajouter une fiche PDF</button>}
          <input ref={champFiche} type="file" accept=".pdf,application/pdf" hidden data-champ="fiche" onChange={(e) => { choisirFiche(e.target.files); e.target.value = ''; }} />
        </div>

        <div className="exo-champ"><span className="exo-etiquette">Exercices <em>(HTML ou PDF, 0 à N)</em></span>
          {exercices.map((f, i) => ligneFichier(f, { i, n: exercices.length }))}
          <button type="button" className="btn sm exo-ajout" onClick={() => champExos.current && champExos.current.click()}><Icon name="plus" size={13} /> Ajouter des exercices</button>
          <input ref={champExos} type="file" multiple accept=".html,.htm,text/html,.pdf,application/pdf" hidden data-champ="exos" onChange={(e) => { ajouterExos(e.target.files); e.target.value = ''; }} />
        </div>

        {!nouvelle && retires.length > 0 && (
          <div className="exo-champ"><span className="exo-etiquette">Fichiers retirés <em>(récupérables, annotations comprises)</em></span>
            {retires.map((r) => (
              <div key={r.id} className="exo-f-ligne retire" data-retire={r.id}>
                <Icon name={r.type === 'html' ? 'fileHtml' : 'filePdf'} size={15} />
                <span className="exo-f-nom">{r.nom} <em className="exo-f-neuf">· {r.raison || 'retiré'} {fmtDate(r.retireLe).toLowerCase()}</em></span>
                <button type="button" className="btn sm" title="Remettre ce fichier dans la notion" onClick={() => remettre(r)}>Remettre</button>
              </div>
            ))}
          </div>
        )}

        {erreur && <div className="exo-erreur" role="alert"><Icon name="alert" size={13} /> {erreur}</div>}
        <div className="exo-feuille-pied">
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button type="submit" className="btn primary" disabled={enCours || !nom.trim()}>{enCours ? 'Enregistrement…' : nouvelle ? 'Créer la notion' : 'Enregistrer'}</button>
        </div>
      </form>
      {confirmer && <ConfirmModal danger title={confirmer.titre} body={confirmer.texte} confirmLabel={confirmer.label}
        onCancel={() => setConfirmer(null)} onConfirm={() => { const f = confirmer.faire; setConfirmer(null); f(); }} />}
    </Modal>
  );
}
