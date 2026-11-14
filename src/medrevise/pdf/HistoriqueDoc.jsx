/* ============================================================
   MedRevise — HISTORIQUE DES VERSIONS d'un document (menu Fichier › Historique…, 14/11/2026,
   docs/compte-rendu-boites-disparues-et-sauvegarde-continue.md). Logique : lib/historiqueDoc.js.
   - liste des versions (date et heure, raison, nombre de boîtes, éléments absents aujourd'hui) ;
   - aperçu d'une page de la version, en LECTURE SEULE (les éléments absents aujourd'hui sont cerclés) ;
   - « Récupérer les boîtes manquantes » (ajoute SEULEMENT les absentes) et « Restaurer cette version »
     (la version actuelle est d'abord gardée dans l'historique) : chaque action crée une version.
   - les copies quotidiennes GitHub et les sauvegardes locales sont ajoutées à la liste (« Retrouvée dans la
     sauvegarde du … »), une fois par ouverture de l'app.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import { lireDocument } from '../lib/storage.js';
import {
  listerVersions, idsDe, compter, recupererManquantes, restaurerVersion, dateLisible,
  importerVersionsLocales, importerVersionsGithub, espaceHistorique,
} from '../lib/historiqueDoc.js';
import { texteDeContenu } from '../lib/textesAnnotations.js';
import '../../styles/enregistrement.css';

const pl = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;
/* une recherche dans les sauvegardes par document et par ouverture de l'app ; la promesse est partagée (une fenêtre
   rouverte, ou montée deux fois, réutilise le même résultat) */
const recherches = new Map();
const chercherDansSauvegardes = (ns) => {
  if (!recherches.has(ns)) {
    recherches.set(ns, (async () => {
      const loc = await importerVersionsLocales(ns).catch(() => 0);
      const gh = await importerVersionsGithub(ns).catch(() => ({ ok: false, ajoutees: 0, message: 'sauvegardes quotidiennes injoignables' }));
      return { loc, gh };
    })());
  }
  return recherches.get(ns);
};
const resume = (c) => [c.boites && pl(c.boites, 'boîte'), c.surlignages && pl(c.surlignages, 'surlignage'), c.traits && pl(c.traits, 'trait'),
  c.formes && pl(c.formes, 'forme'), c.images && pl(c.images, 'image'), c.pages && pl(c.pages, 'page ajoutée', 'pages ajoutées')].filter(Boolean).join(' · ') || 'vide';
const texteDe = (a) => { try { return a.content ? texteDeContenu(a.content) : (a.texte || ''); } catch (e) { return ''; } };
const cleTri = (p) => (typeof p === 'number' ? [0, p] : [1, String(p)]);

/* une page de la version, dessinée à l'échelle (fond PDF si disponible) */
function ApercuPage({ elements, absents, taille, pdfDoc, page }) {
  const canvas = useRef(null);
  const ratio = taille && taille.width ? taille.height / taille.width : 1.414;
  useEffect(() => {
    let vivant = true; let tache = null;
    if (!pdfDoc || typeof page !== 'number' || !canvas.current) return undefined;
    (async () => {
      try {
        const p = await pdfDoc.getPage(page);
        if (!vivant || !canvas.current) return;
        const v0 = p.getViewport({ scale: 1 });
        const vp = p.getViewport({ scale: 560 / v0.width });
        const c = canvas.current; c.width = vp.width; c.height = vp.height;
        tache = p.render({ canvasContext: c.getContext('2d'), viewport: vp });
        await tache.promise;
      } catch (e) { /* aperçu sans fond */ }
    })();
    return () => { vivant = false; try { if (tache) tache.cancel(); } catch (e) { /* ignore */ } };
  }, [pdfDoc, page]);
  return (
    <div className="hv-page" style={{ aspectRatio: `1 / ${ratio}` }} data-apercu-page={String(page)}>
      {pdfDoc && typeof page === 'number' ? <canvas ref={canvas} className="hv-fond" /> : <div className="hv-fond hv-fond-blanc" />}
      <svg className="hv-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {elements.filter((a) => a.kind === 'trait' && Array.isArray(a.points)).map((a) => (
          <polyline key={a.id} points={a.points.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')} fill="none" className={absents.has(a.id) ? 'hv-trait absent' : 'hv-trait'} />
        ))}
        {elements.filter((h) => Array.isArray(h.rects) && h.rects.length).flatMap((h) => h.rects.map((r, i) => (
          <rect key={h.id + i} x={(r.x || 0) * 1000} y={(r.y || 0) * 1000} width={(r.w || r.width || 0) * 1000} height={(r.h || r.height || 0) * 1000} className={absents.has(h.id) ? 'hv-surl absent' : 'hv-surl'} />
        )))}
      </svg>
      {elements.filter((a) => a.kind !== 'trait' && a.kind !== 'page' && Number.isFinite(a.x) && Number.isFinite(a.y)).map((a) => (
        <div key={a.id} className={'hv-boite' + (absents.has(a.id) ? ' absent' : '')} data-hv-id={a.id}
          style={a.largeurFixe || a.kind === 'image' ? { left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${Math.max(0.04, a.width || 0.12) * 100}%`, minHeight: `${Math.max(0.015, a.height || 0.02) * 100}%` }
            /* boîte « un mot » : elle s'élargit avec son texte, jusqu'à 45 % de la page (comme dans le lecteur) */
            : { left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: 'max-content', minWidth: `${Math.max(0.04, a.width || 0.06) * 100}%`, maxWidth: `${Math.min(45, (1 - a.x) * 100)}%`, minHeight: `${Math.max(0.015, a.height || 0.02) * 100}%` }}
          title={absents.has(a.id) ? 'Absente aujourd’hui' : 'Présente aujourd’hui'}>
          <span>{a.kind === 'image' ? '[image]' : a.kind === 'question' ? '?' : texteDe(a) || '…'}</span>
        </div>
      ))}
    </div>
  );
}

export function HistoriqueDoc({ ns, titre, pageSizes = [], pdfDoc = null, onFermer, onApplique, versionInitiale = null }) {
  const [versions, setVersions] = useState(null);
  const [actuel, setActuel] = useState(null);
  const [choisie, setChoisie] = useState(null);
  const [page, setPage] = useState(null);
  const [recherche, setRecherche] = useState(null); // { etat: 'encours'|'fait'|'erreur', texte }
  const [action, setAction] = useState(null); // null | 'confirmer' | 'encours'
  const [message, setMessage] = useState(null);
  const [espace, setEspace] = useState(null);

  const recharger = async (garderChoix = true) => {
    const [vs, a] = await Promise.all([listerVersions(ns), lireDocument(ns)]);
    setVersions(vs); setActuel(a);
    setChoisie((c) => (garderChoix && c && vs.find((v) => v.id === c.id)) || vs.find((v) => v.id === versionInitiale) || vs[0] || null);
    espaceHistorique().then(setEspace).catch(() => {});
  };
  useEffect(() => {
    let vivant = true;
    recharger(false);
    {
      setRecherche({ etat: 'encours', texte: 'Recherche de ce document dans les sauvegardes…' });
      (async () => {
        const { loc, gh } = await chercherDansSauvegardes(ns);
        if (!vivant) return;
        const n = loc + (gh.ajoutees || 0);
        setRecherche(gh.ok ? { etat: 'fait', texte: n ? `${pl(n, 'version retrouvée', 'versions retrouvées')} dans les sauvegardes` : 'Sauvegardes quotidiennes lues : rien de plus ancien que l’historique' }
          : { etat: 'erreur', texte: `Sauvegardes quotidiennes : ${gh.message}${loc ? ` · ${pl(loc, 'version locale retrouvée', 'versions locales retrouvées')}` : ''}` });
        recharger();
      })();
    }
    return () => { vivant = false; };
  }, [ns]); // eslint-disable-line react-hooks/exhaustive-deps

  const presents = useMemo(() => (actuel ? idsDe(actuel) : new Set()), [actuel]);
  const elementsVersion = useMemo(() => (choisie ? [...(choisie.contenu.annotations || []), ...(choisie.contenu.highlights || [])] : []), [choisie]);
  const absents = useMemo(() => new Set(elementsVersion.filter((r) => !presents.has(r.id)).map((r) => r.id)), [elementsVersion, presents]);
  const pages = useMemo(() => {
    const s = new Map();
    for (const r of elementsVersion) if (r.page != null && r.kind !== 'page') s.set(String(r.page), r.page);
    return [...s.values()].sort((a, b) => { const x = cleTri(a), y = cleTri(b); return x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0); });
  }, [elementsVersion]);
  useEffect(() => {
    if (!pages.length) { setPage(null); return; }
    const avecAbsent = pages.find((p) => elementsVersion.some((r) => String(r.page) === String(p) && absents.has(r.id)));
    setPage((p) => (p != null && pages.some((x) => String(x) === String(p)) ? p : (avecAbsent != null ? avecAbsent : pages[0])));
  }, [pages, absents]); // eslint-disable-line react-hooks/exhaustive-deps

  const surPage = elementsVersion.filter((r) => String(r.page) === String(page));
  const taille = pageSizes.find((p) => String(p.cle) === String(page)) || null;
  const nAbsents = absents.size;
  const actuelCompte = actuel ? compter(actuel) : null;

  const recuperer = async () => {
    setAction('encours'); setMessage(null);
    try {
      const r = await recupererManquantes(ns, choisie);
      setMessage({ ok: true, texte: r.ajoutees ? `${pl(r.ajoutees, 'élément récupéré', 'éléments récupérés')}. La version d’avant est gardée dans l’historique.` : 'Rien à récupérer : tout est déjà là.' });
      if (onApplique) await onApplique();
      await recharger();
    } catch (e) { setMessage({ ok: false, texte: 'Récupération impossible : ' + ((e && e.message) || e) }); }
    setAction(null);
  };
  const restaurer = async () => {
    setAction('encours'); setMessage(null);
    try {
      await restaurerVersion(ns, choisie);
      setMessage({ ok: true, texte: `Version du ${dateLisible(choisie.le)} restaurée. La version d’avant est gardée dans l’historique (« Avant restauration »).` });
      if (onApplique) await onApplique();
      await recharger(false);
    } catch (e) { setMessage({ ok: false, texte: 'Restauration impossible : ' + ((e && e.message) || e) }); }
    setAction(null);
  };

  return (
    <Modal title={`Historique — ${titre || 'document'}`} onClose={onFermer} width="min(1080px, 96vw)">
      <div className="hv" data-historique={ns}>
        {recherche && <p className={'hv-recherche ' + recherche.etat} role="status">{recherche.etat === 'encours' && <span className="hv-rond" />}{recherche.texte}</p>}
        <div className="hv-corps">
          <ul className="hv-liste" aria-label="Versions">
            {versions === null && <li className="hint">Chargement…</li>}
            {versions && !versions.length && <li className="hint">Aucune version pour l’instant : une version est gardée à l’ouverture, toutes les 5 min d’édition et à la fermeture.</li>}
            {(versions || []).map((v) => {
              const manque = [...(v.contenu.annotations || []), ...(v.contenu.highlights || [])].filter((r) => !presents.has(r.id)).length;
              return (
                <li key={v.id}>
                  <button type="button" className={'hv-version' + (choisie && choisie.id === v.id ? ' actif' : '')} data-version={v.id} onClick={() => { setChoisie(v); setAction(null); setMessage(null); }}
                    title={v.raison}>
                    <span className="hv-date">{dateLisible(v.le)}</span>
                    <span className="hv-raison">{v.raison}</span>
                    <span className="hv-compte">{resume(v.compte || compter(v.contenu))}</span>
                    {manque > 0 && <span className="hv-manque" data-manque={manque}>{pl(manque, 'absent aujourd’hui', 'absents aujourd’hui')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hv-detail">
            {choisie ? (<>
              <div className="hv-tete">
                <div>
                  <b>{dateLisible(choisie.le)}</b> · {choisie.raison}
                  <div className="hint">{resume(choisie.compte || compter(choisie.contenu))}{actuelCompte ? ` — aujourd’hui : ${resume(actuelCompte)}` : ''}</div>
                </div>
              </div>
              {pages.length > 0 ? (<>
                <div className="hv-pages" role="tablist" aria-label="Pages de la version">
                  {pages.map((p) => {
                    const abs = elementsVersion.some((r) => String(r.page) === String(p) && absents.has(r.id));
                    return (
                      <button key={String(p)} type="button" role="tab" aria-selected={String(p) === String(page)} className={'hv-onglet' + (String(p) === String(page) ? ' actif' : '') + (abs ? ' a-absent' : '')}
                        onClick={() => setPage(p)} title={abs ? 'Cette page a des éléments absents aujourd’hui' : `Page ${typeof p === 'number' ? p : 'ajoutée'}`}>
                        {typeof p === 'number' ? `p. ${p}` : 'p. +'}
                      </button>
                    );
                  })}
                </div>
                <ApercuPage elements={surPage} absents={absents} taille={taille} pdfDoc={pdfDoc} page={page} />
                <p className="hint hv-legende"><span className="hv-pastille absent" /> absent aujourd’hui · <span className="hv-pastille" /> présent aujourd’hui · aperçu en lecture seule</p>
              </>) : <p className="hint">Cette version ne contient aucune annotation.</p>}
              {message && <p className={'hv-message ' + (message.ok ? 'ok' : 'erreur')} role="status">{message.texte}</p>}
              <div className="hv-actions">
                {action === 'confirmer' ? (<>
                  <span className="hint">La version actuelle sera d’abord gardée dans l’historique. Restaurer la version du {dateLisible(choisie.le)} ?</span>
                  <button type="button" className="btn ghost sm" onClick={() => setAction(null)}>Annuler</button>
                  <button type="button" className="btn primary sm" data-action="confirmer-restauration" onClick={restaurer}>Restaurer</button>
                </>) : (<>
                  <button type="button" className="btn primary sm" data-action="recuperer" disabled={!nAbsents || action === 'encours'} onClick={recuperer}
                    title={nAbsents ? 'Ajoute seulement les éléments absents aujourd’hui ; rien d’existant n’est modifié' : 'Tous les éléments de cette version sont déjà là'}>
                    <Icon name="plus" size={13} /> Récupérer les boîtes manquantes{nAbsents ? ` (${nAbsents})` : ''}
                  </button>
                  <button type="button" className="btn ghost sm" data-action="restaurer" disabled={choisie.partielle || action === 'encours'} onClick={() => setAction('confirmer')}
                    title={choisie.partielle ? 'Sauvegarde partielle : seule la récupération des boîtes manquantes est possible' : 'Remet le document tel qu’il était dans cette version (annulable)'}>
                    <Icon name="refresh" size={13} /> Restaurer cette version
                  </button>
                </>)}
              </div>
            </>) : <p className="hint">Choisis une version.</p>}
          </div>
        </div>
        {espace && <p className="hint hv-espace">Historique sur cet appareil : {pl(espace.versions, 'version')} · {(espace.octets / 1048576).toFixed(1)} Mo · conservé 60 jours</p>}
      </div>
    </Modal>
  );
}
