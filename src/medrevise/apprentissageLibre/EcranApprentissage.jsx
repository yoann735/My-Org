/* ============================================================
   MedRevise — onglet « APPRENTISSAGE » v2 (25/10/2026, docs/compte-rendu-apprentissage-v2-recherche-tags.md).
   Espace d'entraînement en rafale, TOTALEMENT indépendant de la méthode des J et de FSRS.
   - TOUTES les flashcards y sont, d'office (plus de « Mettre en apprentissage ») ; l'ancienne liste
     `learning_set` ne filtre plus rien — elle ne garde que les NOTES par carte (toujours affichées).
   - Tableau de bord : recherche (recto, verso, thème) ; puces Matières (plusieurs), Cours (plusieurs,
     inclus ou exclus), Nouvelles, À apprendre (26/10 : tag de la carte, avec son compteur), Type ; compteur en direct ; « Réinitialiser ».
   - (26/10) l'étoile « À apprendre » (components/BoutonAApprendre.jsx) sur chaque vignette, dans l'aperçu et en session :
     c'est la seule écriture sur la carte (champ `aApprendre`), sans effet sur les J ni FSRS.
   - Rangement Section → Matière → Cours, groupes repliables avec compteurs ; vignettes recto / verso
     (grille par défaut, ou liste compacte) ; clic = aperçu plein, retournable.
   - « Lancer » : la session en rafale sur les cartes VISIBLES, dans l'ordre affiché (SessionApprentissage).
   - (28/10) SÉLECTION LIBRE : une case sur chaque vignette et sur chaque en-tête de cours / matière (toutes ses cartes,
     même masquées par le filtre ; état partiel). La sélection survit aux filtres, à la recherche et à la vue (mémorisée
     sur l'appareil). Barre collante « N cartes sélectionnées · Vider la sélection · Lancer » : avec une sélection, Lancer
     joue la sélection ; sans, les cartes visibles. COMPTEUR DE PASSAGES : badge « ×3 » (fois où la carte a été sue en
     session), tri optionnel « Moins passées d'abord » (dans chaque cours).
   Téléphone (`mobile`) : recherche en tête, filtres dans une feuille du bas, vignettes pleine largeur.
   Lecture seule : rien n'est écrit, sauf une note qu'on tape (learning_set.notes, jamais la carte) et, en session, le
   compteur de passages (learning_set.passages, jamais la carte).
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { ImageFlashcard } from '../components/FlashcardImage.jsx';
import { imageGeneraleDe } from '../lib/muscle.js';
import { estNouvelle } from '../lib/categoriesFC.js';
import { FaceCarte, BadgePassages } from './FaceCarte.jsx';
import { SessionApprentissage } from './SessionApprentissage.jsx';
import { BoutonAApprendre, EtiquetteAApprendre } from '../components/BoutonAApprendre.jsx';
import { estAApprendre } from '../lib/aApprendre.js';
import { ExportFlashcards } from '../components/ExportFlashcards.jsx';
import { Chiffre, useEnSynchro } from '../components/Chiffre.jsx';
import {
  TYPES, FILTRES_VIDES, filtresActifs, filtresValides, filtrer, grouper, idsAffiches,
  choixFiltres, toutesLesCartes, typeCarte, rectoTexte, versoTexte,
  idsParGroupe, etatSelection, basculerCarte, basculerGroupe, resumeSelection, ordreSelection, passagesDe, trierMoinsPassees,
} from './tableauBord.js';
import '../../styles/apprentissage-libre.css';

const pl = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;
const CLE_FILTRES = 'medrevise.apprentissage.filtres';
const CLE_VUE = 'medrevise.apprentissage.vue';
const CLE_SELECTION = 'medrevise.apprentissage.selection'; // (28/10) sélection libre (ids), mémorisée sur l'appareil
const CLE_TRI = 'medrevise.apprentissage.tri'; // (28/10) 'passages' = « Moins passées d'abord »
const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v == null ? defaut : JSON.parse(v); } catch (e) { return defaut; } };
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };
const LIB_TYPE = Object.fromEntries(TYPES.map((t) => [t.cle, t.libelle]));
// au-delà, les cours s'ouvrent repliés (le tableau de bord reste lisible ; un clic les déplie)
const OUVERTS_JUSQUA = 160;

export function EcranApprentissage({ ctx, mobile = false, onRetour = null }) {
  const db = ctx.db;
  const enSynchro = useEnSynchro(); // (28/10) compteurs et Lancer attendent la fin de la synchro complète
  const [filtres, setFiltresBrut] = useState(() => filtresValides(lire(CLE_FILTRES, FILTRES_VIDES)));
  const setFiltres = (f) => setFiltresBrut((x) => { const n = typeof f === 'function' ? f(x) : f; ecrire(CLE_FILTRES, n); return n; });
  const [vue, setVueBrut] = useState(() => (lire(CLE_VUE, 'grille') === 'liste' ? 'liste' : 'grille'));
  const setVue = (v) => { setVueBrut(v); ecrire(CLE_VUE, v); };
  const [plis, setPlis] = useState({}); // id de groupe → ouvert (true) / replié (false), choisi à la main
  const [menu, setMenu] = useState(null); // puce ouverte (ordinateur) : 'matieres' | 'cours' | 'types'
  const [feuille, setFeuille] = useState(false); // filtres (téléphone)
  const [exportFC, setExportFC] = useState(false); // (26/10) exporter les cartes visibles (components/ExportFlashcards.jsx)
  const [apercu, setApercu] = useState(null); // id de la carte en aperçu
  const [session, setSession] = useState(null);
  const [sel, setSelBrut] = useState(() => { const v = lire(CLE_SELECTION, []); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; });
  const setSel = (f) => setSelBrut((x) => { const n = typeof f === 'function' ? f(x) : f; ecrire(CLE_SELECTION, n); return n; });
  const [tri, setTriBrut] = useState(() => (lire(CLE_TRI, '') === 'passages' ? 'passages' : ''));
  const setTri = (t) => { setTriBrut(t); ecrire(CLE_TRI, t); };

  const total = useMemo(() => toutesLesCartes(db).length, [db]);
  const choix = useMemo(() => choixFiltres(db, ctx.stats), [db, ctx.stats]);
  const visibles = useMemo(() => filtrer(db, filtres), [db, filtres]);
  // compteur de la puce « À apprendre » : les cartes taguées qui passent les AUTRES filtres
  const nbAap = useMemo(() => (filtres.aApprendre ? visibles.length : filtrer(db, { ...filtres, aApprendre: true }).length), [db, filtres, visibles]);
  const passages = db.learningPassages || {};
  const groupesBruts = useMemo(() => grouper(db, visibles, ctx.stats), [db, visibles, ctx.stats]);
  const groupes = useMemo(() => (tri === 'passages' ? trierMoinsPassees(groupesBruts, passages) : groupesBruts), [groupesBruts, tri, passages]);
  const parGroupe = useMemo(() => idsParGroupe(db), [db]);
  const selSet = useMemo(() => new Set(sel), [sel]);
  const resume = useMemo(() => resumeSelection(db, sel, visibles), [db, sel, visibles]);
  const ordre = useMemo(() => idsAffiches(groupes), [groupes]);
  const notes = db.learningNotes || {};
  const actifs = filtresActifs(filtres);
  const ouvertParDefaut = visibles.length <= OUVERTS_JUSQUA;
  const estOuvert = (id, defaut = true) => (plis[id] != null ? plis[id] : defaut);
  const basculerPli = (id, defaut = true) => setPlis((p) => ({ ...p, [id]: !estOuvert(id, defaut) }));
  // un filtre change : les cours repliés automatiquement suivent (ceux choisis à la main restent)
  useEffect(() => { setPlis((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('c:')))); }, [filtres]);

  if (session) return <SessionApprentissage key={session.n} ctx={ctx} ids={session.ids} pleinEcran={mobile} onQuitter={() => setSession(null)} />;

  // avec une sélection : la sélection (ordre de rangement, tri compris) ; sans : les cartes visibles, comme avant
  const idsLancer = resume.n ? ordreSelection(db, resume.ids, ctx.stats, tri === 'passages' ? passages : null) : ordre;
  const lancer = () => idsLancer.length && setSession({ ids: idsLancer, n: Date.now() });
  const vider = () => setSel([]);
  const cocherCarte = (id) => setSel((l) => basculerCarte(l, id));
  const cocherGroupe = (ids) => setSel((l) => basculerGroupe(l, ids));
  const reinitialiser = () => setFiltres(FILTRES_VIDES);
  const nbFiltres = filtres.matieres.length + filtres.coursInclus.length + filtres.coursExclus.length + (filtres.nouvelles ? 1 : 0) + (filtres.aApprendre ? 1 : 0) + filtres.types.length;

  const titre = (
    <div>
      <h1 className="serif">Apprentissage</h1>
      <div className="sub">Toutes tes flashcards, à parcourir en rafale. Hors méthode des J : rien n’est noté, rien n’est planifié.</div>
    </div>
  );

  const recherche = (
    <label className="search alib2-recherche">
      <Icon name="search" size={15} className="ic" />
      <input type="search" value={filtres.q} placeholder="Rechercher (recto, verso, thème)" aria-label="Rechercher une carte"
        onChange={(e) => { const q = e.target.value; setFiltres((f) => ({ ...f, q })); }} />
      {filtres.q && <button type="button" className="alib2-effacer" onClick={() => setFiltres((f) => ({ ...f, q: '' }))} aria-label="Effacer la recherche" title="Effacer la recherche"><Icon name="x" size={13} /></button>}
    </label>
  );
  const compteur = <Chiffre><span className="alib2-compteur tnum" aria-live="polite" data-compteur={visibles.length}>{pl(visibles.length, 'carte')}{actifs && <span className="hint"> sur {total}</span>}</span></Chiffre>;
  const boutonLancer = (
    <button type="button" className="btn primary alib-lancer" disabled={!idsLancer.length || enSynchro} onClick={lancer} data-lancer={resume.n ? 'selection' : 'visibles'}
      title={resume.n ? `Lancer une session sur la sélection (${pl(resume.n, 'carte')})` : ordre.length ? `Lancer une session sur les ${pl(ordre.length, 'carte visible', 'cartes visibles')}` : 'Aucune carte visible'}>
      <Icon name="play" size={14} /> Lancer{enSynchro ? null : idsLancer.length ? <span className="tnum"> ({idsLancer.length})</span> : null}
    </button>
  );
  const boutonExporter = (
    <button type="button" className="icon-btn" data-act="exporter-fc" disabled={!visibles.length} onClick={() => setExportFC(true)}
      title={visibles.length ? `Exporter ${pl(visibles.length, 'carte visible', 'cartes visibles')} (.zip ré-importable)` : 'Aucune carte visible'} aria-label="Exporter les cartes visibles">
      <Icon name="archive" size={16} />
    </button>
  );
  const choixVue = (
    <div className="alib2-vues" role="radiogroup" aria-label="Affichage">
      <button type="button" role="radio" aria-checked={vue === 'grille'} className={'alib2-vue' + (vue === 'grille' ? ' actif' : '')} onClick={() => setVue('grille')} title="Vue grille" aria-label="Vue grille"><Icon name="grid" size={15} /></button>
      <button type="button" role="radio" aria-checked={vue === 'liste'} className={'alib2-vue' + (vue === 'liste' ? ' actif' : '')} onClick={() => setVue('liste')} title="Vue liste compacte" aria-label="Vue liste compacte"><Icon name="list" size={15} /></button>
    </div>
  );

  const contenuFiltre = (cle) => {
    if (cle === 'matieres') return <ChoixMatieres choix={choix} filtres={filtres} setFiltres={setFiltres} />;
    if (cle === 'cours') return <ChoixCours choix={choix} filtres={filtres} setFiltres={setFiltres} />;
    return <ChoixTypes filtres={filtres} setFiltres={setFiltres} />;
  };
  const libMat = filtres.matieres.length ? `Matières · ${filtres.matieres.length}` : 'Matières';
  const libCours = filtres.coursInclus.length || filtres.coursExclus.length
    ? `Cours · ${[filtres.coursInclus.length && `${filtres.coursInclus.length}`, filtres.coursExclus.length && `${filtres.coursExclus.length} exclu${filtres.coursExclus.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}` : 'Cours';
  const libType = filtres.types.length ? `Type · ${filtres.types.map((t) => LIB_TYPE[t]).join(', ')}` : 'Type';
  const puceNouvelles = (
    <button type="button" className={'alib2-puce' + (filtres.nouvelles ? ' actif' : '')} aria-pressed={filtres.nouvelles} data-puce="nouvelles"
      onClick={() => setFiltres((f) => ({ ...f, nouvelles: !f.nouvelles }))} title="Seulement les cartes jamais vues (Nouvelles)">
      {filtres.nouvelles && <Icon name="check" size={12} />} Nouvelles
    </button>
  );
  const puceTri = (
    <button type="button" className={'alib2-puce' + (tri === 'passages' ? ' actif' : '')} aria-pressed={tri === 'passages'} data-puce="tri"
      onClick={() => setTri(tri === 'passages' ? '' : 'passages')} title="Dans chaque cours, les cartes les moins souvent sues en session d’abord">
      {tri === 'passages' && <Icon name="check" size={12} />} Moins passées d’abord
    </button>
  );
  // barre collante de la sélection (bas de l'écran)
  const barreSelection = resume.n > 0 && (
    <div className="alib2-selbarre" role="region" aria-label="Sélection" data-selection={resume.n} data-hors-filtre={resume.horsFiltre}>
      <span className="alib2-seltexte tnum">{resume.n} carte{resume.n > 1 ? 's' : ''} sélectionnée{resume.n > 1 ? 's' : ''}
        {resume.horsFiltre > 0 && <span className="hint"> dont {resume.horsFiltre} hors filtre</span>}</span>
      <button type="button" className="linklike alib2-vider" onClick={vider} data-act="vider-selection">Vider la sélection</button>
      <span style={{ flex: 1 }} />
      <button type="button" className="btn primary sm alib-lancer" onClick={lancer} disabled={enSynchro} data-act="lancer-selection" title={`Lancer une session sur la sélection (${pl(resume.n, 'carte')})`}>
        <Icon name="play" size={13} /> Lancer
      </button>
    </div>
  );
  const puceAApprendre = (
    <button type="button" className={'alib2-puce' + (filtres.aApprendre ? ' actif' : '')} aria-pressed={filtres.aApprendre} data-puce="aap"
      onClick={() => setFiltres((f) => ({ ...f, aApprendre: !f.aApprendre }))} title="Seulement les cartes taguées « À apprendre » (se combine avec les autres filtres)">
      <Icon name="star" size={12} fill={filtres.aApprendre} /> À apprendre <Chiffre><span className="tnum alib2-puce-n">{nbAap}</span></Chiffre>
    </button>
  );

  const vignettes = (cartes) => (
    <ul className={'alib2-cartes ' + vue}>
      {cartes.map((q) => (
        <Vignette key={q.id} ctx={ctx} mobile={mobile} q={q} vue={vue} note={notes[q.id]} onOuvrir={() => setApercu(q.id)}
          coche={selSet.has(q.id)} onCocher={() => cocherCarte(q.id)} passages={passagesDe(passages, q.id)} />
      ))}
    </ul>
  );

  return (
    <div className={(mobile ? 'mrm-app alib-mobile' : 'screen scroll fadein') + ' alib alib2'}>
      {mobile ? (
        <>
          <div className="alib-mtete">
            <button type="button" className="mrm-icon-btn" onClick={onRetour} aria-label="Retour à l’accueil" title="Retour à l’accueil"><Icon name="chevL" size={20} /></button>
            {titre}
          </div>
          <div className="alib2-mbarre">
            {recherche}
            <div className="alib2-mligne">
              <button type="button" className={'alib2-puce' + (nbFiltres ? ' actif' : '')} onClick={() => setFeuille(true)} data-puce="filtres" title="Filtres">
                <Icon name="filter" size={13} /> Filtres{nbFiltres ? <span className="tnum"> · {nbFiltres}</span> : null}
              </button>
              {compteur}
              <span style={{ flex: 1 }} />
              {boutonExporter}
              {boutonLancer}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="topbar">
            {titre}
            <div className="topbar-actions"><EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} /></div>
          </div>
          <div className="alib2-entete">
            <div className="alib2-ligne1">
              {recherche}
              <span style={{ flex: 1 }} />
              {choixVue}
              {boutonExporter}
              {boutonLancer}
            </div>
            <div className="alib2-ligne2">
              {[['matieres', libMat, filtres.matieres.length], ['cours', libCours, filtres.coursInclus.length + filtres.coursExclus.length]].map(([cle, lib, n]) => (
                <PuceMenu key={cle} cle={cle} libelle={lib} actif={n > 0} ouvert={menu === cle} onOuvrir={() => setMenu(menu === cle ? null : cle)} onFermer={() => setMenu(null)}>
                  {contenuFiltre(cle)}
                </PuceMenu>
              ))}
              {puceNouvelles}
              {puceAApprendre}
              {puceTri}
              <PuceMenu cle="types" libelle={libType} actif={filtres.types.length > 0} ouvert={menu === 'types'} onOuvrir={() => setMenu(menu === 'types' ? null : 'types')} onFermer={() => setMenu(null)}>
                {contenuFiltre('types')}
              </PuceMenu>
              <span className="alib2-sep" />
              {compteur}
              {actifs && <button type="button" className="linklike alib2-reinit" onClick={reinitialiser} title="Retirer tous les filtres et la recherche">Réinitialiser</button>}
            </div>
          </div>
        </>
      )}

      {total === 0 ? (
        <div className="rev-empty alib-vide">
          <Icon name="refresh" size={30} />
          <div className="re-title">Aucune flashcard pour l’instant</div>
          <div className="hint" style={{ maxWidth: 460, textAlign: 'center' }}>Crée des cartes dans le panneau Flashcards d’un cours : elles arrivent ici d’elles-mêmes.</div>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rev-empty alib-vide">
          <Icon name="search" size={28} />
          <div className="re-title">Aucune carte ne correspond</div>
          <button type="button" className="btn sm" onClick={reinitialiser}>Réinitialiser les filtres</button>
        </div>
      ) : (
        <div className="alib2-groupes">
          {groupes.map((s) => {
            const sid = 's:' + s.section.id, sOuv = estOuvert(sid);
            return (
              <section key={sid} className="alib2-section" data-section={s.section.id}>
                <button type="button" className="alib2-stete" aria-expanded={sOuv} onClick={() => basculerPli(sid)}>
                  <Icon name={sOuv ? 'chevD' : 'chevR'} size={14} /> <span className="alib2-snom">{s.section.nom}</span> <span className="pill tnum">{s.n}</span>
                </button>
                {sOuv && s.matieres.map((m) => {
                  const mid = 'm:' + s.section.id + ':' + m.matiere.id, mOuv = estOuvert(mid);
                  return (
                    <div key={mid} className="alib2-matiere" data-matiere={m.matiere.id}>
                      <div className="alib2-gtete">
                        <CaseGroupe ids={parGroupe.matieres.get(m.matiere.id) || []} sel={selSet} visibles={m.n} nom={m.matiere.nom} quoi="matière" onCocher={cocherGroupe} />
                        <button type="button" className="alib2-mtete" aria-expanded={mOuv} onClick={() => basculerPli(mid)}>
                          <Icon name={mOuv ? 'chevD' : 'chevR'} size={13} /> <span>{m.matiere.nom}</span> <span className="hint tnum">{pl(m.n, 'carte')}</span>
                        </button>
                      </div>
                      {mOuv && m.cours.map((g) => {
                        const cid = 'c:' + g.fiche.id, cOuv = estOuvert(cid, ouvertParDefaut);
                        return (
                          <div key={cid} className="card alib2-cours" data-cours={g.fiche.id}>
                            <div className="alib2-gtete cours">
                              <CaseGroupe ids={parGroupe.cours.get(g.fiche.id) || []} sel={selSet} visibles={g.cartes.length} nom={g.fiche.titre || 'Sans titre'} quoi="cours" onCocher={cocherGroupe} />
                              <button type="button" className="alib2-ctete" aria-expanded={cOuv} onClick={() => basculerPli(cid, ouvertParDefaut)}>
                                <Icon name={cOuv ? 'chevD' : 'chevR'} size={13} />
                                <span className="alib2-cnom">{g.fiche.titre || 'Sans titre'}</span>
                                <span className="pill alib-n tnum">{g.cartes.length}</span>
                              </button>
                            </div>
                            {cOuv && vignettes(g.cartes)}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {/* barre collante en BAS (après les groupes : elle ne couvre jamais l'en-tête ni ses menus) */}
      {barreSelection}

      {mobile && feuille && createPortal(
        <div className="sn-feuille-fond" onClick={() => setFeuille(false)}>
          <div className="sn-feuille alib2-feuille" role="dialog" aria-label="Filtres" onClick={(e) => e.stopPropagation()}>
            <div className="sn-feuille-poignee" />
            <div className="alib2-ftete">
              <strong>Filtres</strong>
              {actifs && <button type="button" className="linklike" onClick={reinitialiser}>Réinitialiser</button>}
              <button type="button" className="cn-fermer" onClick={() => setFeuille(false)} aria-label="Fermer" title="Fermer"><Icon name="x" size={15} /></button>
            </div>
            <div className="alib2-fcorps">
              <div className="alib2-fsection"><div className="alib2-ftitre">Nouvelles · À apprendre</div><div className="alib2-types">{puceNouvelles}{puceAApprendre}</div></div>
              <div className="alib2-fsection"><div className="alib2-ftitre">Type</div>{contenuFiltre('types')}</div>
              <div className="alib2-fsection"><div className="alib2-ftitre">Matières</div>{contenuFiltre('matieres')}</div>
              <div className="alib2-fsection"><div className="alib2-ftitre">Cours</div>{contenuFiltre('cours')}</div>
              <div className="alib2-fsection"><div className="alib2-ftitre">Affichage</div><div className="alib2-types">{choixVue}{puceTri}</div></div>
            </div>
            <div className="alib2-fpied">
              <button type="button" className="btn primary" onClick={() => setFeuille(false)}>Voir {pl(visibles.length, 'carte')}</button>
            </div>
          </div>
        </div>, document.body)}

      {exportFC && <ExportFlashcards ctx={ctx} cartes={visibles} defautLibelle={actifs ? 'apprentissage' : 'toutes'} onFermer={() => setExportFC(false)} />}
      {apercu && (
        <Apercu ctx={ctx} ordre={ordre} id={apercu} onChanger={setApercu} onFermer={() => setApercu(null)} mobile={mobile} />
      )}
    </div>
  );
}

/* ---- (28/10) CASE d'un cours ou d'une matière : coche / décoche TOUTES ses cartes, même masquées par le filtre ;
   état partiel (indeterminate) quand une partie seulement est cochée ---- */
function CaseGroupe({ ids, sel, visibles, nom, quoi, onCocher }) {
  const ref = useRef(null);
  const etat = etatSelection(ids, sel);
  useEffect(() => { if (ref.current) ref.current.indeterminate = etat === 'partiel'; }, [etat]);
  const masquees = ids.length - visibles;
  const titre = etat === 'tout' ? `Désélectionner les ${pl(ids.length, 'carte')} de ce ${quoi}`
    : `Sélectionner les ${pl(ids.length, 'carte')} de ce ${quoi}${masquees > 0 ? ` (dont ${masquees} masquée${masquees > 1 ? 's' : ''} par le filtre)` : ''}`;
  return (
    <label className={'alib2-case groupe' + (etat !== 'aucun' ? ' ' + etat : '')} title={titre} data-case-groupe={quoi} data-etat={etat} onClick={(e) => e.stopPropagation()}>
      <input ref={ref} type="checkbox" checked={etat === 'tout'} onChange={() => onCocher(ids)} aria-label={`${titre} « ${nom} »`} />
    </label>
  );
}

/* ---- puce à menu déroulant (ordinateur) : se ferme au clic dehors et sur Échap ---- */
function PuceMenu({ cle, libelle, actif, ouvert, onOuvrir, onFermer, children }) {
  const racine = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) onFermer(); };
    const echap = (e) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('pointerdown', dehors); window.addEventListener('keydown', echap);
    return () => { window.removeEventListener('pointerdown', dehors); window.removeEventListener('keydown', echap); };
  }, [ouvert, onFermer]);
  return (
    <div className="alib2-pucemenu" ref={racine}>
      <button type="button" className={'alib2-puce' + (actif ? ' actif' : '') + (ouvert ? ' ouvert' : '')} aria-haspopup="true" aria-expanded={ouvert} data-puce={cle} onClick={onOuvrir}>
        {libelle} <Icon name="chevD" size={12} />
      </button>
      {ouvert && <div className="alib2-pop" role="dialog" aria-label={libelle}>{children}</div>}
    </div>
  );
}

function ChoixMatieres({ choix, filtres, setFiltres }) {
  const sel = new Set(filtres.matieres);
  const basculer = (id) => setFiltres((f) => ({ ...f, matieres: f.matieres.includes(id) ? f.matieres.filter((x) => x !== id) : [...f.matieres, id] }));
  let section = null;
  return (
    <div className="alib2-choix" data-choix="matieres">
      {choix.matieres.map((m) => {
        const titre = m.section !== section ? (section = m.section) : null;
        return (
          <div key={m.id}>
            {titre && <div className="alib2-choix-groupe">{titre}</div>}
            <label className="alib2-option">
              <input type="checkbox" checked={sel.has(m.id)} onChange={() => basculer(m.id)} />
              <span className="alib2-onom">{m.nom}</span><span className="hint tnum">{m.n}</span>
            </label>
          </div>
        );
      })}
      {sel.size > 0 && <button type="button" className="linklike alib2-choix-tout" onClick={() => setFiltres((f) => ({ ...f, matieres: [] }))}>Toutes les matières</button>}
    </div>
  );
}

/* Cours : chaque cours peut être INCLUS (✓ : seulement ceux-là) ou EXCLU (⊘ : tous sauf ceux-là) */
function ChoixCours({ choix, filtres, setFiltres }) {
  const [q, setQ] = useState('');
  const inc = new Set(filtres.coursInclus), exc = new Set(filtres.coursExclus);
  const sansAcc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // matières filtrées : seulement leurs cours
  const mats = new Set(filtres.matieres);
  const liste = choix.cours.filter((c) => (!mats.size || mats.has(c.matiereId)) && (!q || sansAcc(c.nom + ' ' + c.matiere).includes(sansAcc(q))));
  const regler = (id, etat) => setFiltres((f) => {
    let n = { ...f, coursInclus: f.coursInclus.filter((x) => x !== id), coursExclus: f.coursExclus.filter((x) => x !== id) };
    if (etat === 'inclus') n = { ...n, coursInclus: [...n.coursInclus, id] };
    if (etat === 'exclus') n = { ...n, coursExclus: [...n.coursExclus, id] };
    return n;
  });
  let matiere = null;
  return (
    <div className="alib2-choix" data-choix="cours">
      <input className="alib2-choix-cherche" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un cours" aria-label="Chercher un cours" />
      <div className="hint alib2-legende">✓ seulement ces cours · ⊘ exclure un cours</div>
      <div className="alib2-choix-liste">
        {liste.map((c) => {
          const titre = c.matiere !== matiere ? (matiere = c.matiere) : null;
          const etat = inc.has(c.id) ? 'inclus' : exc.has(c.id) ? 'exclus' : null;
          return (
            <div key={c.id}>
              {titre && <div className="alib2-choix-groupe">{titre}</div>}
              <div className={'alib2-option cours' + (etat ? ' ' + etat : '')} data-cours-choix={c.id}>
                <span className="alib2-onom">{c.nom}</span><span className="hint tnum">{c.n}</span>
                <button type="button" className={'alib2-etat' + (etat === 'inclus' ? ' actif' : '')} aria-pressed={etat === 'inclus'} data-etat="inclus"
                  onClick={() => regler(c.id, etat === 'inclus' ? null : 'inclus')} title="Seulement ce cours (et les autres cochés)" aria-label={`Inclure « ${c.nom} »`}><Icon name="check" size={13} /></button>
                <button type="button" className={'alib2-etat exclure' + (etat === 'exclus' ? ' actif' : '')} aria-pressed={etat === 'exclus'} data-etat="exclus"
                  onClick={() => regler(c.id, etat === 'exclus' ? null : 'exclus')} title="Exclure ce cours" aria-label={`Exclure « ${c.nom} »`}><Icon name="x" size={13} /></button>
              </div>
            </div>
          );
        })}
        {!liste.length && <div className="hint" style={{ padding: 8 }}>Aucun cours.</div>}
      </div>
      {(inc.size > 0 || exc.size > 0) && <button type="button" className="linklike alib2-choix-tout" onClick={() => setFiltres((f) => ({ ...f, coursInclus: [], coursExclus: [] }))}>Tous les cours</button>}
    </div>
  );
}

function ChoixTypes({ filtres, setFiltres }) {
  const sel = new Set(filtres.types);
  return (
    <div className="alib2-choix alib2-types" data-choix="types">
      {TYPES.map((t) => (
        <button key={t.cle} type="button" className={'alib2-puce' + (sel.has(t.cle) ? ' actif' : '')} aria-pressed={sel.has(t.cle)} data-type={t.cle}
          onClick={() => setFiltres((f) => ({ ...f, types: f.types.includes(t.cle) ? f.types.filter((x) => x !== t.cle) : [...f.types, t.cle] }))}>
          {sel.has(t.cle) && <Icon name="check" size={12} />} {t.libelle}
        </button>
      ))}
    </div>
  );
}

/* ---- miniature d'image, chargée seulement quand la vignette approche de l'écran ---- */
function MiniatureImage({ imageId }) {
  const ref = useRef(null);
  const [vue, setVue] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || vue) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVue(true); return undefined; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setVue(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [vue]);
  return <div ref={ref} className="alib2-mini">{vue && <ImageFlashcard imageId={imageId} maxH={88} />}</div>;
}

const imageDe = (q) => q.imageId || (q.occlusion && q.occlusion.imageId) || ((imageGeneraleDe(q) || {}).imageId) || null;

/* ---- VIGNETTE : recto en haut, verso en dessous (tronqué, « voir plus »), image, tag « Nouvelle » ---- */
function Vignette({ ctx, mobile, q, vue, note, onOuvrir, coche = false, onCocher, passages = 0 }) {
  const [plus, setPlus] = useState(false);
  const nouvelle = estNouvelle(q);
  const type = typeCarte(q);
  const recto = rectoTexte(q).trim();
  const verso = versoTexte(q).trim();
  const img = imageDe(q);
  const long = verso.length > (vue === 'liste' ? 90 : 160) || verso.split('\n').length > 4;
  return (
    <li className={'alib2-carte' + (nouvelle ? ' nouvelle' : '') + (estAApprendre(q) ? ' aap' : '') + (coche ? ' cochee' : '')} data-carte={q.id} data-type={type}>
      <label className="alib2-case carte" title={coche ? 'Retirer de la sélection' : 'Ajouter à la sélection'} onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={coche} onChange={onCocher} aria-label={(coche ? 'Retirer de la sélection : ' : 'Sélectionner : ') + recto.slice(0, 60)} />
      </label>
      <span className="alib2-aap"><BoutonAApprendre ctx={ctx} carte={q} classe="ac-icone" taille={mobile ? 17 : 14} mobile={mobile} /></span>
      <div role="button" tabIndex={0} className="alib2-vignette" onClick={onOuvrir} title="Ouvrir l’aperçu"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir(); } }}>
        {(nouvelle || type !== 'texte' || estAApprendre(q) || passages > 0) && (
          <div className="alib2-tags">
            {passages > 0 && <BadgePassages n={passages} />}
            <EtiquetteAApprendre carte={q} />
            {nouvelle && <span className="alib2-tag nouvelle">Nouvelle</span>}
            {type !== 'texte' && <span className="alib2-tag">{LIB_TYPE[type]}</span>}
          </div>
        )}
        <div className="alib2-recto"><Tex>{recto || '—'}</Tex></div>
        {img && vue === 'grille' && <MiniatureImage imageId={img} />}
        {verso && (
          <div className={'alib2-verso' + (plus ? ' entier' : '')}><Tex leger={q.versoFormat === 'leger'}>{verso}</Tex></div>
        )}
        {verso && long && (
          <button type="button" className="linklike alib2-plus" onClick={(e) => { e.stopPropagation(); setPlus((p) => !p); }}>{plus ? 'voir moins' : 'voir plus'}</button>
        )}
        {note && note.trim() && <div className="alib2-note" title="Ta note sur cette carte"><Icon name="edit" size={11} /> <span>{note}</span></div>}
      </div>
    </li>
  );
}

/* ---- APERÇU plein : la carte entière, retournable ; ← → entre les cartes visibles ; note modifiable ---- */
function Apercu({ ctx, ordre, id, onChanger, onFermer, mobile }) {
  const [verso, setVerso] = useState(false);
  const [editNote, setEditNote] = useState(false);
  const carte = (ctx.db.questions || []).find((q) => q.id === id);
  const i = ordre.indexOf(id);
  const fiche = carte && (ctx.db.fiches || []).find((f) => f.id === carte.ficheId);
  const note = ((ctx.db.learningNotes || {})[id] || '').trim();
  useEffect(() => { setVerso(false); setEditNote(false); }, [id]);
  useEffect(() => {
    const k = (e) => {
      const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) { if (e.key === 'Escape') t.blur(); return; }
      if (e.key === 'Escape') onFermer();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setVerso((v) => !v); }
      else if (e.key === 'ArrowRight' && i >= 0 && i < ordre.length - 1) onChanger(ordre[i + 1]);
      else if (e.key === 'ArrowLeft' && i > 0) onChanger(ordre[i - 1]);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [i, ordre, onChanger, onFermer]);
  if (!carte) return null;
  return createPortal(
    <div className="alib2-apercu-fond" onClick={onFermer}>
      <div className={'alib2-apercu' + (mobile ? ' mobile' : '')} role="dialog" aria-label="Aperçu de la carte" onClick={(e) => e.stopPropagation()} data-apercu={id}>
        <div className="alib2-atete">
          <span className="alib2-acours">{fiche ? fiche.titre : ''}{estNouvelle(carte) && <span className="alib2-tag nouvelle">Nouvelle</span>}<EtiquetteAApprendre carte={carte} /></span>
          <span className="hint tnum">{i + 1} / {ordre.length}</span>
          <BoutonAApprendre ctx={ctx} carte={carte} classe="ac-icone" taille={mobile ? 17 : 15} mobile={mobile} />
          <button type="button" className="cn-fermer" onClick={onFermer} aria-label="Fermer l’aperçu" title="Fermer (Échap)"><Icon name="x" size={15} /></button>
        </div>
        <button type="button" className="sfc-carte alib2-aface" onClick={() => setVerso((v) => !v)} title={verso ? 'Revenir au recto (Espace)' : 'Voir le verso (Espace)'}>
          <span className="alib2-acote">{verso ? 'Verso' : 'Recto'}</span>
          {verso && <div className="alib2-arecto"><Tex>{rectoTexte(carte)}</Tex></div>}
          <FaceCarte carte={carte} cote={verso ? 'verso' : 'recto'} masquable={false} />
        </button>
        {(note || editNote) && (editNote
          ? <NoteCarte ctx={ctx} cardId={id} initiale={note} />
          : <button type="button" className="alib-note-apercu" onClick={() => setEditNote(true)}>{note}</button>)}
        <div className="alib2-apied">
          <button type="button" className="icon-btn" disabled={i <= 0} onClick={() => onChanger(ordre[i - 1])} aria-label="Carte précédente" title="Carte précédente (←)"><Icon name="chevL" size={17} /></button>
          <button type="button" className="btn" onClick={() => setVerso((v) => !v)}><Icon name="refresh" size={13} /> Retourner</button>
          {!note && !editNote && <button type="button" className="btn" onClick={() => setEditNote(true)}><Icon name="edit" size={13} /> Note</button>}
          <button type="button" className="icon-btn" disabled={i < 0 || i >= ordre.length - 1} onClick={() => onChanger(ordre[i + 1])} aria-label="Carte suivante" title="Carte suivante (→)"><Icon name="chevR" size={17} /></button>
        </div>
      </div>
    </div>, document.body);
}

/* NOTE LIBRE d'une carte (16/10) : plein texte, sauvegarde automatique (0,6 s après la frappe, et à
   la sortie du champ) dans l'enregistrement learning_set — jamais sur la carte. */
function NoteCarte({ ctx, cardId, initiale }) {
  const [texte, setTexte] = useState(initiale);
  const [etat, setEtat] = useState('');
  const minuteur = useRef(null);
  const dernier = useRef(initiale);
  const champ = useRef(null);
  const sauver = async (v) => {
    clearTimeout(minuteur.current); minuteur.current = null;
    if (v === dernier.current) return;
    dernier.current = v; setEtat('…');
    await ctx.setLearningNote(cardId, v); setEtat('Enregistré');
  };
  useEffect(() => { if (champ.current) champ.current.focus(); return () => clearTimeout(minuteur.current); }, []);
  return (
    <div className="alib-note">
      <textarea ref={champ} className="imp-title alib-note-champ" value={texte} placeholder="Ta note sur cette carte (visible en session, sous la réponse)"
        aria-label="Note sur la carte"
        onChange={(e) => { const v = e.target.value; setTexte(v); setEtat(''); clearTimeout(minuteur.current); minuteur.current = setTimeout(() => sauver(v), 600); }}
        onBlur={() => sauver(texte)} />
      <span className="alib-note-etat" aria-live="polite">{etat}</span>
    </div>
  );
}
