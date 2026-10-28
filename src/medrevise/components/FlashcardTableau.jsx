/* ============================================================
   MedRevise — FLASHCARD « TABLEAU » : formulaire et révision (17/10, lib/carteTableau.js,
   docs/compte-rendu-import-tableau-nettete.md).
   - FormulaireTableau : titre, colonnes (2 à 6, nommées), lignes (1 à 12) ; collage depuis un
     tableur (TSV) pour pré-remplir — dans la zone prévue ou directement dans la grille ;
   - TableauRevision : les NOMS DE COLONNES restent visibles ; chaque cellule est masquée puis
     révélée au tap, une ligne d'un coup (« Révéler la ligne ») ou tout (« Tout révéler ») ;
     défilement horizontal interne si le tableau est plus large que la carte.
   Les clics ne remontent jamais à la carte (qui se retourne au clic).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from './Tex.jsx';
import { echapDansFormulaire } from './AddItemForm.jsx';
import { LIMITES, carteTableau, normaliserTableau, lireTSV, estTSV } from '../lib/carteTableau.js';
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
  const cle = (r, c) => `${r}:${c}`;
  const pleine = (r, c) => !!(t.lignes[r][c] || '').trim();
  const cachee = (r, c) => masquable && pleine(r, c) && !vues.has(cle(r, c));
  const toutes = t.lignes.flatMap((l, r) => l.map((_, c) => cle(r, c)).filter((_, c) => pleine(r, c)));
  const reste = masquable ? toutes.filter((k) => !vues.has(k)).length : 0;
  const voir = (...ks) => setVues((s) => { const n = new Set(s); ks.forEach((k) => n.add(k)); return n; });
  const resteLigne = (r) => t.lignes[r].some((_, c) => cachee(r, c));
  return (
    <div className={'tb-rev' + (compact ? ' compact' : '')} onClick={stop} onPointerDown={stop} data-tableau="">
      <div className="tb-defil">
        <table className="tb-table">
          <thead>
            <tr>{t.colonnes.map((c, k) => <th key={k} scope="col"><Tex>{c}</Tex></th>)}{masquable && <th className="tb-col-act" aria-label="Révéler" />}</tr>
          </thead>
          <tbody>
            {t.lignes.map((l, r) => (
              <tr key={r} data-ligne={r}>
                {l.map((v, c) => {
                  const ca = cachee(r, c);
                  return (
                    <td key={c} className={ca ? 'cachee' : ''} data-cellule={cle(r, c)}>
                      {ca
                        ? <button type="button" className="tb-masque" aria-label={`Révéler : ${t.colonnes[c]}, ligne ${r + 1}`} onClick={() => voir(cle(r, c))}>Toucher</button>
                        : v ? <span className="tb-valeur"><Tex>{v}</Tex></span> : <span className="tb-vide">—</span>}
                    </td>
                  );
                })}
                {masquable && (
                  <td className="tb-col-act">
                    {resteLigne(r) && <button type="button" className="tb-ligne-btn" title="Révéler la ligne" aria-label={`Révéler la ligne ${r + 1}`}
                      onClick={() => voir(...l.map((_, c) => cle(r, c)).filter((_, c) => pleine(r, c)))}><Icon name="chevR" size={13} /><span>Ligne</span></button>}
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
    setColonnes(cols); setLignes(ls);
    setMessage({ ok: !coupeesC && !coupeesL, texte: `Collé : ${n} colonne${n > 1 ? 's' : ''} × ${ls.length} ligne${ls.length > 1 ? 's' : ''}${coupeesC ? ` (au-delà de ${LIMITES.colMax} colonnes : coupé)` : ''}${coupeesL ? ` (au-delà de ${LIMITES.ligMax} lignes : coupé)` : ''} — relis et corrige.` });
  };
  const collerGrille = (e) => {
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!estTSV(t)) return; // simple texte : collé dans la cellule, comme d'habitude
    e.preventDefault();
    appliquerTSV(t);
  };

  const ajouterColonne = () => { if (nc >= LIMITES.colMax) return; setColonnes((c) => [...c, '']); setLignes((ls) => ls.map((l) => [...l, ''])); };
  const retirerColonne = (k) => { if (nc <= LIMITES.colMin) return; setColonnes((c) => c.filter((_, i) => i !== k)); setLignes((ls) => ls.map((l) => l.filter((_, i) => i !== k))); };
  const ajouterLigne = () => { if (lignes.length >= LIMITES.ligMax) return; setLignes((ls) => [...ls, vide(nc)]); };
  const retirerLigne = (r) => { if (lignes.length <= LIMITES.ligMin) return; setLignes((ls) => ls.filter((_, i) => i !== r)); };
  const cellule = (r, c, v) => setLignes((ls) => ls.map((l, i) => (i === r ? l.map((x, j) => (j === c ? v : x)) : l)));

  const verif = normaliserTableau({ colonnes, lignes });
  const pret = !!titre.trim() && verif.ok;
  const valider = async () => {
    if (!pret || busy) return;
    await onAdd(carteTableau({ titre, colonnes, lignes, theme, indice, aRetenir, difficulte: initial?.difficulte || 'intermediaire' }));
    if (!initial) {
      setTitre(''); setColonnes(vide(3)); setLignes([vide(3), vide(3), vide(3)]); setIndice(''); setARetenir(''); setTsv(''); setMessage(null);
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
          <label className="tb-opt"><input type="checkbox" checked={entetes} onChange={(e) => setEntetes(e.target.checked)} /> 1re ligne = noms des colonnes</label>
          <button type="button" className="btn ghost sm" disabled={!tsv.trim()} onClick={() => appliquerTSV(tsv)}><Icon name="check" size={12} /> Remplir le tableau</button>
        </div>
      </details>
      {message && <div className={'tb-message' + (message.ok ? ' ok' : '')} role="status">{message.texte}</div>}

      <div className="tb-saisie" onPaste={collerGrille} role="group" aria-label="Tableau">
        <div className="tb-defil">
          <table className="tb-table tb-edition">
            <thead>
              <tr>
                {colonnes.map((c, k) => (
                  <th key={k}>
                    <div className="tb-th">
                      <input className="tb-champ tb-nom-col" value={c} placeholder={`Colonne ${k + 1}`} aria-label={`Nom de la colonne ${k + 1}`} data-col={k}
                        onChange={(e) => setColonnes((cs) => cs.map((x, i) => (i === k ? e.target.value : x)))} />
                      <button type="button" className="tb-x" disabled={nc <= LIMITES.colMin} title="Retirer la colonne" aria-label={`Retirer la colonne ${k + 1}`} onClick={() => retirerColonne(k)}><Icon name="x" size={11} /></button>
                    </div>
                  </th>
                ))}
                <th className="tb-col-act" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, r) => (
                <tr key={r}>
                  {l.map((v, c) => (
                    <td key={c}>
                      <textarea className="tb-champ tb-cellule" rows={1} value={v} placeholder="—" aria-label={`${colonnes[c] || `Colonne ${c + 1}`}, ligne ${r + 1}`} data-cellule={`${r}:${c}`}
                        onChange={(e) => cellule(r, c, e.target.value)} />
                    </td>
                  ))}
                  <td className="tb-col-act"><button type="button" className="tb-x" disabled={lignes.length <= LIMITES.ligMin} title="Retirer la ligne" aria-label={`Retirer la ligne ${r + 1}`} onClick={() => retirerLigne(r)}><Icon name="x" size={11} /></button></td>
                </tr>
              ))}
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
