/* ============================================================
   MedRevise — FLASHCARD « TABLEAU » : formulaire et révision (17/10, lib/carteTableau.js,
   docs/compte-rendu-import-tableau-nettete.md).
   - FormulaireTableau : titre, colonnes (2 à 6, nommées), lignes (1 à 12) ; collage depuis un
     tableur (TSV) pour pré-remplir — dans la zone prévue ou directement dans la grille ;
   - TableauRevision : les NOMS DE COLONNES restent visibles ; chaque cellule est masquée puis
     révélée au tap, une ligne d'un coup (« Révéler la ligne ») ou tout (« Tout révéler ») ;
     (31/10) sauf si la carte a choisi son masque (tableau.masque) : seules les cases masquées sont cachées,
     les noms de colonnes masqués aussi ; l'éditeur a un œil par case, ligne, colonne et nom + un menu « Masquage » ;
     défilement horizontal interne si le tableau est plus large que la carte.
   Les clics ne remontent jamais à la carte (qui se retourne au clic).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { CaseACocher } from './CaseACocher.jsx';
import { Tex } from './Tex.jsx';
import { echapDansFormulaire } from './AddItemForm.jsx';
import { LIMITES, carteTableau, normaliserTableau, lireTSV, estTSV, masqueDe, masqueParDefaut } from '../lib/carteTableau.js';
import { Oeil } from './ElementsVerso.jsx';
import { styleCellule } from '../pdf/BoiteTableau.jsx';
import { cellulesAffichees, estGrille as estGrilleBoite } from '../pdf/grille.js';
import '../../styles/flashcard-tableau.css';

const stop = (e) => e.stopPropagation();
const vide = (n) => Array.from({ length: n }, () => '');

/* (25/10, docs/compte-rendu-boites-tableaux.md §2) CARTE TABLEAU FAITE D'UNE BOÎTE-TABLEAU : `item.grille` est le tableau
   complet de la boîte (pdf/grille.js) — révisé TEL QUEL : couleurs de fond et de texte, gras / italique / taille,
   alignements, fusions, bordures ; la ligne d'en-tête reste visible, chaque autre cellule se révèle au toucher. */
function GrilleRevision({ item, masquable = true, compact = false }) {
  const g = item.grille;
  const [vues, setVues] = useState(() => new Set());
  useEffect(() => { setVues(new Set()); }, [item && item.id]);
  const nl = g.lignes.length, nc = g.cols.length;
  const cellules = cellulesAffichees(g);
  const pleine = (c) => !!String(g.lignes[c.i][c.j] || '').trim();
  const tete = (c) => !!g.entete && c.i === 0;
  const cle = (c) => c.i + ':' + c.j;
  const cachee = (c) => masquable && pleine(c) && !tete(c) && !vues.has(cle(c));
  const reste = cellules.filter(cachee);
  const voir = (...ks) => setVues((s) => { const n = new Set(s); ks.forEach((k) => n.add(k)); return n; });
  const parLigne = g.lignes.map((_, i) => cellules.filter((c) => c.i === i));
  return (
    <div className={'tb-rev tb-rev-grille' + (compact ? ' compact' : '')} onClick={stop} onPointerDown={stop} data-tableau="" data-grille="">
      <div className="tb-defil">
        <table className={'tb-grille' + (g.bordures ? ' bord-perso' : '')} style={{ '--btab-u': compact ? '0.7px' : '0.9px' }}>
          <colgroup>{g.cols.map((c, k) => <col key={k} style={{ width: (c * 100).toFixed(3) + '%' }} />)}</colgroup>
          <tbody>
            {parLigne.map((cs, i) => (
              <tr key={i} className={(g.entete && i === 0 ? 'tb-grille-tete' : '') + (g.alterne && !(g.entete && i === 0) && (i - (g.entete ? 1 : 0)) % 2 === 1 ? ' impaire' : '') || undefined}
                style={Array.isArray(g.hauts) && Number.isFinite(g.hauts[i]) ? { height: `calc(var(--btab-u) * ${g.hauts[i]})` } : undefined}>
                {cs.map((c) => (
                  <td key={c.j} colSpan={c.cs > 1 ? c.cs : undefined} rowSpan={c.rs > 1 ? c.rs : undefined} style={styleCellule(g, c, nl, nc)} data-cellule={cle(c)}
                    className={cachee(c) ? 'cachee' : undefined}>
                    {cachee(c)
                      ? <button type="button" className="tb-masque" aria-label={`Révéler la cellule ligne ${c.i + 1}, colonne ${c.j + 1}`} onClick={() => voir(cle(c))}>Toucher</button>
                      : <span className="tb-valeur">{String(g.lignes[c.i][c.j] || '').split('\n').map((l, k, a) => <span key={k}><Tex>{l}</Tex>{k < a.length - 1 ? <br /> : null}</span>)}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reste.length > 0 && (
        <div className="tb-tout"><button type="button" className="tb-tout-btn" onClick={() => voir(...reste.map(cle))}>Tout révéler <span className="tnum">({reste.length})</span></button></div>
      )}
    </div>
  );
}

/* ---------- révision ---------- */
export function TableauRevision({ item, masquable = true, compact = false }) {
  if (item && estGrilleBoite(item.grille)) return <GrilleRevision item={item} masquable={masquable} compact={compact} />;
  return <TableauSimple item={item} masquable={masquable} compact={compact} />;
}
function TableauSimple({ item, masquable = true, compact = false }) {
  const t = item && item.tableau;
  const [vues, setVues] = useState(() => new Set());
  useEffect(() => { setVues(new Set()); }, [item && item.id]);
  if (!t) return null;
  // (31/10) seules les cases MASQUÉES (tableau.masque ; absent = toutes) sont cachées ; un nom de colonne peut l'être aussi
  const mq = masqueDe(t);
  const cle = (r, c) => `${r}:${c}`;
  const cleNom = (c) => `n:${c}`;
  const pleine = (r, c) => !!(t.lignes[r][c] || '').trim();
  const cachee = (r, c) => masquable && pleine(r, c) && mq.cellules[r][c] && !vues.has(cle(r, c));
  const nomCache = (c) => masquable && !!(t.colonnes[c] || '').trim() && mq.noms[c] && !vues.has(cleNom(c));
  const toutes = [...t.colonnes.map((_, c) => c).filter(nomCache).map(cleNom), ...t.lignes.flatMap((l, r) => l.map((_, c) => cle(r, c)).filter((_, c) => cachee(r, c)))];
  const reste = toutes.length;
  const voir = (...ks) => setVues((s) => { const n = new Set(s); ks.forEach((k) => n.add(k)); return n; });
  const resteLigne = (r) => t.lignes[r].some((_, c) => cachee(r, c));
  const avecLignes = masquable && t.lignes.some((_, r) => resteLigne(r) || t.lignes[r].some((_, c) => pleine(r, c) && mq.cellules[r][c]));
  return (
    <div className={'tb-rev' + (compact ? ' compact' : '')} onClick={stop} onPointerDown={stop} data-tableau="">
      <div className="tb-defil">
        <table className="tb-table">
          <thead>
            <tr>
              {t.colonnes.map((c, k) => (
                <th key={k} scope="col" data-nom={k} className={nomCache(k) ? 'cachee' : undefined}>
                  {nomCache(k)
                    ? <button type="button" className="tb-masque tb-masque-nom" aria-label={`Révéler le nom de la colonne ${k + 1}`} onClick={() => voir(cleNom(k))}>Colonne {k + 1}</button>
                    : <Tex>{c}</Tex>}
                </th>
              ))}
              {avecLignes && <th className="tb-col-act" aria-label="Révéler" />}
            </tr>
          </thead>
          <tbody>
            {t.lignes.map((l, r) => (
              <tr key={r} data-ligne={r}>
                {l.map((v, c) => {
                  const ca = cachee(r, c);
                  return (
                    <td key={c} className={ca ? 'cachee' : ''} data-cellule={cle(r, c)}>
                      {ca
                        ? <button type="button" className="tb-masque" aria-label={`Révéler : ${nomCache(c) ? `colonne ${c + 1}` : t.colonnes[c]}, ligne ${r + 1}`} onClick={() => voir(cle(r, c))}>Toucher</button>
                        : v ? <span className="tb-valeur"><Tex>{v}</Tex></span> : <span className="tb-vide">—</span>}
                    </td>
                  );
                })}
                {avecLignes && (
                  <td className="tb-col-act">
                    {resteLigne(r) && <button type="button" className="tb-ligne-btn" title="Révéler la ligne" aria-label={`Révéler la ligne ${r + 1}`}
                      onClick={() => voir(...l.map((_, c) => cle(r, c)).filter((_, c) => cachee(r, c)))}><Icon name="chevR" size={13} /><span>Ligne</span></button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reste > 0 && (
        <div className="tb-tout"><button type="button" className="tb-tout-btn" onClick={() => voir(...toutes)}>Tout révéler <span className="tnum">({reste})</span></button></div>
      )}
    </div>
  );
}

/* ---------- (31/10) menu « Masquage » du tableau de l'éditeur : tout masquer / afficher, la colonne et la ligne de la
   dernière case touchée. Échap le ferme sans fermer le formulaire. ---------- */
function MenuMasquage({ etatTout, focusCase, colonnes, etatLigne, etatColonne, onTout, onLigne, onColonne }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    window.addEventListener('pointerdown', dehors, true);
    return () => window.removeEventListener('pointerdown', dehors, true);
  }, [ouvert]);
  const faire = (f) => () => { f(); setOuvert(false); };
  const fc = focusCase && focusCase.r != null ? focusCase : null;
  const etC = fc ? etatColonne(fc.c) : null, etL = fc ? etatLigne(fc.r) : null;
  const nomC = fc ? (colonnes[fc.c] || '').trim() || `colonne ${fc.c + 1}` : '';
  return (
    <span className="tb-menu" ref={racine} onKeyDown={(e) => { if (e.key === 'Escape' && ouvert) { e.stopPropagation(); e.preventDefault(); setOuvert(false); } }}>
      <button type="button" className={'btn ghost sm tb-menu-bouton' + (ouvert ? ' actif' : '')} aria-haspopup="menu" aria-expanded={ouvert} data-act="masquage"
        title="Choisir ce qui est masqué en révision" onClick={() => setOuvert((o) => !o)}><Oeil barre size={13} /> Masquage <Icon name="chevD" size={11} /></button>
      {ouvert && (
        <div className="tb-menu-liste" role="menu" aria-label="Masquage du tableau">
          <button type="button" role="menuitem" data-menu="tout-masquer" disabled={etatTout === 'masquee'} onClick={faire(() => onTout(true))}><Oeil barre size={13} /> Tout masquer</button>
          <button type="button" role="menuitem" data-menu="tout-afficher" disabled={etatTout === 'visible'} onClick={faire(() => onTout(false))}><Oeil size={13} /> Tout afficher</button>
          <div className="tb-menu-sep" />
          <button type="button" role="menuitem" data-menu="colonne" disabled={!fc} onClick={faire(() => onColonne(fc.c, etC !== 'masquee'))}>
            <Oeil barre={etC !== 'masquee'} size={13} /><span className="tb-menu-txt">{etC === 'masquee' ? 'Afficher la colonne' : 'Masquer la colonne'}{fc && <span className="hint"> « {nomC} »</span>}</span></button>
          <button type="button" role="menuitem" data-menu="ligne" disabled={!fc} onClick={faire(() => onLigne(fc.r, etL !== 'masquee'))}>
            <Oeil barre={etL !== 'masquee'} size={13} /><span className="tb-menu-txt">{etL === 'masquee' ? 'Afficher la ligne' : 'Masquer la ligne'}{fc && <span className="hint tnum"> {fc.r + 1}</span>}</span></button>
          {!fc && <div className="hint tb-menu-aide">Touche d’abord une case pour viser sa colonne ou sa ligne.</div>}
        </div>
      )}
    </span>
  );
}

/* ---------- formulaire (création et modification) ---------- */
export function FormulaireTableau({ initial = null, themeDefaut = '', onAdd, onCancel, busy, submitLabel = 'Ajouter' }) {
  const [theme, setTheme] = useState(initial ? initial.theme || '' : themeDefaut);
  const themeRetouche = useRef(false);
  useEffect(() => { if (!initial && !themeRetouche.current) setTheme(themeDefaut); }, [themeDefaut]); // eslint-disable-line react-hooks/exhaustive-deps
  const [titre, setTitre] = useState(initial ? initial.recto || '' : '');
  const [colonnes, setColonnes] = useState(() => (initial && initial.tableau ? [...initial.tableau.colonnes] : vide(3)));
  const [lignes, setLignes] = useState(() => (initial && initial.tableau ? initial.tableau.lignes.map((l) => [...l]) : [vide(3), vide(3), vide(3)]));
  const [indice, setIndice] = useState(initial?.indice || '');
  const [aRetenir, setARetenir] = useState(initial?.a_retenir || '');
  // (31/10) ce qui est masqué en révision : une case, une ligne, une colonne, un nom de colonne (lib/carteTableau.js#masqueDe)
  const [masque, setMasque] = useState(() => (initial && initial.tableau ? masqueDe(initial.tableau) : masqueParDefaut(3, 3)));
  const [focusCase, setFocusCase] = useState(null); // { r, c } : la dernière case touchée (cible du menu « Masquage »)
  const [entetes, setEntetes] = useState(true);
  const [tsv, setTsv] = useState('');
  const [message, setMessage] = useState(null); // { ok, texte }
  const titreRef = useRef(null);
  const nc = colonnes.length;

  const appliquerTSV = (texte, avecEntetes = entetes) => {
    const r = lireTSV(texte, { entetes: avecEntetes });
    let cols = r.colonnes || colonnes;
    let ls = r.lignes;
    const largeur = Math.max(cols.length, ...ls.map((l) => l.length), LIMITES.colMin);
    const coupeesC = largeur > LIMITES.colMax, coupeesL = ls.length > LIMITES.ligMax;
    const n = Math.min(LIMITES.colMax, largeur);
    cols = [...cols, ...vide(n)].slice(0, n);
    ls = ls.slice(0, LIMITES.ligMax).map((l) => [...l, ...vide(n)].slice(0, n));
    if (!ls.length) ls = [vide(n)];
    setColonnes(cols); setLignes(ls); setMasque(masqueParDefaut(ls.length, n)); setFocusCase(null);
    setMessage({ ok: !coupeesC && !coupeesL, texte: `Collé : ${n} colonne${n > 1 ? 's' : ''} × ${ls.length} ligne${ls.length > 1 ? 's' : ''}${coupeesC ? ` (au-delà de ${LIMITES.colMax} colonnes : coupé)` : ''}${coupeesL ? ` (au-delà de ${LIMITES.ligMax} lignes : coupé)` : ''} — relis et corrige.` });
  };
  const collerGrille = (e) => {
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!estTSV(t)) return; // simple texte : collé dans la cellule, comme d'habitude
    e.preventDefault();
    appliquerTSV(t);
  };

  // une nouvelle ligne / colonne naît masquée (nom de colonne visible), comme un nouveau tableau
  const ajouterColonne = () => { if (nc >= LIMITES.colMax) return; setColonnes((c) => [...c, '']); setLignes((ls) => ls.map((l) => [...l, ''])); setMasque((m) => ({ cellules: m.cellules.map((l) => [...l, true]), noms: [...m.noms, false] })); };
  const retirerColonne = (k) => { if (nc <= LIMITES.colMin) return; setColonnes((c) => c.filter((_, i) => i !== k)); setLignes((ls) => ls.map((l) => l.filter((_, i) => i !== k))); setMasque((m) => ({ cellules: m.cellules.map((l) => l.filter((_, i) => i !== k)), noms: m.noms.filter((_, i) => i !== k) })); setFocusCase(null); };
  const ajouterLigne = () => { if (lignes.length >= LIMITES.ligMax) return; setLignes((ls) => [...ls, vide(nc)]); setMasque((m) => ({ ...m, cellules: [...m.cellules, Array(nc).fill(true)] })); };
  const retirerLigne = (r) => { if (lignes.length <= LIMITES.ligMin) return; setLignes((ls) => ls.filter((_, i) => i !== r)); setMasque((m) => ({ ...m, cellules: m.cellules.filter((_, i) => i !== r) })); setFocusCase(null); };
  // masquer / afficher : une case, une ligne, une colonne (toutes ses cases), un nom de colonne, tout
  const mCase = (r, c) => !!(masque.cellules[r] && masque.cellules[r][c]);
  const etat = (l) => (l.every(Boolean) ? 'masquee' : l.some(Boolean) ? 'partiel' : 'visible');
  const etatLigne = (r) => etat(colonnes.map((_, c) => mCase(r, c)));
  const etatColonne = (c) => etat(lignes.map((_, r) => mCase(r, c)));
  const etatTout = etat(lignes.flatMap((_, r) => colonnes.map((__, c) => mCase(r, c))));
  const poser = (f) => setMasque((m) => ({ ...m, cellules: m.cellules.map((l, r) => l.map((x, c) => f(r, c, x))) }));
  const basculerCase = (r, c) => poser((i, j, x) => (i === r && j === c ? !x : x));
  const poserLigne = (r, v) => poser((i, j, x) => (i === r ? v : x));
  const poserColonne = (c, v) => poser((i, j, x) => (j === c ? v : x));
  const basculerNom = (c) => setMasque((m) => ({ ...m, noms: m.noms.map((x, k) => (k === c ? !x : x)) }));
  const toutMasquer = (v) => poser(() => v);
  const bulle = (et, quoi, f = 'e') => (et === 'masquee' ? `${quoi} : masqué${f} en révision — clic pour afficher` : et === 'partiel' ? `${quoi} : en partie masqué${f} — clic pour tout masquer` : `${quoi} : visible en révision — clic pour masquer`);
  const cellule = (r, c, v) => setLignes((ls) => ls.map((l, i) => (i === r ? l.map((x, j) => (j === c ? v : x)) : l)));

  const verif = normaliserTableau({ colonnes, lignes, masque });
  const pret = !!titre.trim() && verif.ok;
  const valider = async () => {
    if (!pret || busy) return;
    await onAdd(carteTableau({ titre, colonnes, lignes, masque, theme, indice, aRetenir, difficulte: initial?.difficulte || 'intermediaire' }));
    if (!initial) {
      setTitre(''); setColonnes(vide(3)); setLignes([vide(3), vide(3), vide(3)]); setMasque(masqueParDefaut(3, 3)); setFocusCase(null); setIndice(''); setARetenir(''); setTsv(''); setMessage(null);
      setTheme(themeDefaut); themeRetouche.current = false;
      requestAnimationFrame(() => titreRef.current && titreRef.current.focus());
    }
  };
  const clavier = (e) => {
    if (echapDansFormulaire(e)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); valider(); }
  };

  return (
    <div className="aif-champs tb-form" onKeyDown={clavier} data-formulaire-tableau="">
      <div className="imp-field">
        <label>Thème <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder="ex : Myologie du membre inférieur" value={theme} onChange={(e) => { themeRetouche.current = true; setTheme(e.target.value); }} />
      </div>
      <div className="imp-field">
        <label>Titre du tableau <span className="imp-opt">(recto)</span></label>
        <input ref={titreRef} className="imp-title" data-champ="titre" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="ex : Muscles de la fesse — insertions" />
      </div>

      <details className="tb-coller" open={!initial}>
        <summary>Coller depuis un tableur</summary>
        <textarea className="imp-title tb-coller-zone" rows={3} value={tsv} data-champ="tsv" placeholder="Copie les cellules dans Excel, Numbers ou Sheets, colle ici (⌘V / Ctrl+V)"
          onChange={(e) => setTsv(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData && e.clipboardData.getData('text/plain'); if (estTSV(t)) { e.preventDefault(); setTsv(t); appliquerTSV(t); } }} />
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <CaseACocher className="tb-opt" checked={entetes} onChange={(v) => setEntetes(v)}>1re ligne = noms des colonnes</CaseACocher>
          <button type="button" className="btn ghost sm" disabled={!tsv.trim()} onClick={() => appliquerTSV(tsv)}><Icon name="check" size={12} /> Remplir le tableau</button>
        </div>
      </details>
      {message && <div className={'tb-message' + (message.ok ? ' ok' : '')} role="status">{message.texte}</div>}

      <div className="tb-saisie" onPaste={collerGrille} role="group" aria-label="Tableau">
        <div className="tb-masquage-barre">
          <MenuMasquage etatTout={etatTout} focusCase={focusCase} colonnes={colonnes} etatLigne={etatLigne} etatColonne={etatColonne}
            onTout={toutMasquer} onLigne={poserLigne} onColonne={poserColonne} />
          <span className="hint tb-legende"><span className="tb-legende-hachure" aria-hidden="true" /> hachurée = masquée en révision · <Oeil size={12} /> pour changer</span>
        </div>
        <div className="tb-defil">
          <table className="tb-table tb-edition">
            <thead>
              <tr className="tb-ctrl">
                <th className="tb-col-lig">
                  <button type="button" className={'tb-oeil tb-oeil-tout ' + etatTout} aria-pressed={etatTout === 'masquee'} data-oeil="tout"
                    title={bulle(etatTout, 'Tout le tableau', '')} aria-label={bulle(etatTout, 'Tout le tableau', '')} onClick={() => toutMasquer(etatTout !== 'masquee')}><Oeil barre={etatTout !== 'visible'} size={14} /></button>
                </th>
                {colonnes.map((c, k) => {
                  const et = etatColonne(k);
                  return (
                    <th key={k}>
                      <button type="button" className={'tb-oeil tb-oeil-col ' + et} aria-pressed={et === 'masquee'} data-oeil={`col:${k}`}
                        title={bulle(et, `Colonne ${k + 1}`, 'e')} aria-label={bulle(et, `Colonne ${k + 1}`, 'e')} onClick={() => poserColonne(k, et !== 'masquee')}>
                        <Oeil barre={et !== 'visible'} size={13} /><span>Colonne</span>
                      </button>
                    </th>
                  );
                })}
                <th className="tb-col-act" />
              </tr>
              <tr>
                <th className="tb-col-lig" />
                {colonnes.map((c, k) => (
                  <th key={k} className={masque.noms[k] ? 'masquee' : undefined}>
                    <div className="tb-th">
                      <input className="tb-champ tb-nom-col" value={c} placeholder={`Colonne ${k + 1}`} aria-label={`Nom de la colonne ${k + 1}`} data-col={k}
                        onChange={(e) => setColonnes((cs) => cs.map((x, i) => (i === k ? e.target.value : x)))} />
                      <button type="button" className={'tb-oeil tb-oeil-nom ' + (masque.noms[k] ? 'masquee' : 'visible')} aria-pressed={!!masque.noms[k]} data-oeil={`nom:${k}`}
                        title={bulle(masque.noms[k] ? 'masquee' : 'visible', `Nom de la colonne ${k + 1}`, '')} aria-label={bulle(masque.noms[k] ? 'masquee' : 'visible', `Nom de la colonne ${k + 1}`, '')}
                        onClick={() => basculerNom(k)}><Oeil barre={!!masque.noms[k]} size={13} /></button>
                      <button type="button" className="tb-x" disabled={nc <= LIMITES.colMin} title="Retirer la colonne" aria-label={`Retirer la colonne ${k + 1}`} onClick={() => retirerColonne(k)}><Icon name="x" size={11} /></button>
                    </div>
                  </th>
                ))}
                <th className="tb-col-act" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, r) => {
                const et = etatLigne(r);
                return (
                  <tr key={r}>
                    <td className="tb-col-lig">
                      <button type="button" className={'tb-oeil tb-oeil-lig ' + et} aria-pressed={et === 'masquee'} data-oeil={`lig:${r}`}
                        title={bulle(et, `Ligne ${r + 1}`, 'e')} aria-label={bulle(et, `Ligne ${r + 1}`, 'e')} onClick={() => poserLigne(r, et !== 'masquee')}>
                        <Oeil barre={et !== 'visible'} size={13} /><span className="tnum">{r + 1}</span>
                      </button>
                    </td>
                    {l.map((v, c) => (
                      <td key={c} className={'tb-case' + (mCase(r, c) ? ' masquee' : '')}>
                        <textarea className="tb-champ tb-cellule" rows={1} value={v} placeholder="—" aria-label={`${colonnes[c] || `Colonne ${c + 1}`}, ligne ${r + 1}`} data-cellule={`${r}:${c}`}
                          onFocus={() => setFocusCase({ r, c })} onChange={(e) => cellule(r, c, e.target.value)} />
                        <button type="button" tabIndex={-1} className={'tb-oeil tb-oeil-case ' + (mCase(r, c) ? 'masquee' : 'visible')} aria-pressed={mCase(r, c)} data-oeil={`case:${r}:${c}`}
                          title={bulle(mCase(r, c) ? 'masquee' : 'visible', 'Case')} aria-label={bulle(mCase(r, c) ? 'masquee' : 'visible', `Case ligne ${r + 1}, colonne ${c + 1}`)}
                          onMouseDown={(e) => e.preventDefault()} onClick={() => { setFocusCase({ r, c }); basculerCase(r, c); }}><Oeil barre={mCase(r, c)} size={12} /></button>
                      </td>
                    ))}
                    <td className="tb-col-act"><button type="button" className="tb-x" disabled={lignes.length <= LIMITES.ligMin} title="Retirer la ligne" aria-label={`Retirer la ligne ${r + 1}`} onClick={() => retirerLigne(r)}><Icon name="x" size={11} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost sm" data-act="ligne" disabled={lignes.length >= LIMITES.ligMax} onClick={ajouterLigne}><Icon name="plus" size={12} /> Ligne <span className="tnum hint">{lignes.length}/{LIMITES.ligMax}</span></button>
          <button type="button" className="btn ghost sm" data-act="colonne" disabled={nc >= LIMITES.colMax} onClick={ajouterColonne}><Icon name="plus" size={12} /> Colonne <span className="tnum hint">{nc}/{LIMITES.colMax}</span></button>
        </div>
      </div>

      <div className="imp-field">
        <label>Indice <span className="imp-opt">(optionnel)</span></label>
        <textarea className="imp-title fc-txt-court" rows={1} value={indice} onChange={(e) => setIndice(e.target.value)} />
      </div>
      <div className="imp-field">
        <label>À retenir <span className="imp-opt">(optionnel)</span></label>
        <textarea className="imp-title fc-txt-court" rows={1} value={aRetenir} onChange={(e) => setARetenir(e.target.value)} />
      </div>
      <div className="imp-actions">
        <span className="fc-raccourci">⌘↩ pour enregistrer</span>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>}
        <button type="button" className="btn primary" data-act="ajouter" onClick={valider} disabled={!pret || busy}><Icon name="check" size={15} /> {submitLabel}</button>
      </div>
      {!pret && <div className="hint">{!titre.trim() ? 'Titre du tableau requis.' : verif.raison[0].toUpperCase() + verif.raison.slice(1).replace(/^tableau\.\w+ : /, '') + '.'}</div>}
    </div>
  );
}
