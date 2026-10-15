/* ============================================================
   MedRevise — ÉDITEUR DE CORRESPONDANCE de la fiche jumelle (15/10,
   docs/compte-rendu-fiche-jumelle.md). Menu Fichier → « Correspondance des pages… ».

   Deux colonnes : à gauche les diapositives ORIGINALES, chacune avec la page de fiche qui
   lui correspond ; à droite toutes les pages de la FICHE. On GLISSE une page de fiche sur
   une diapositive pour les associer (souris, doigt ou stylet : glisser au pointeur, pas le
   glisser-déposer HTML qui ne marche pas au doigt) ; on la glisse hors de la liste, ou on
   choisit « — », pour la dissocier. Deux diapositives peuvent viser la même page (fusion).
   Une page de fiche visée par aucune diapositive = « ajoutée dans la fiche ».
   « Enregistrer » écrit la correspondance (synchronisée) ; « Automatique » recalcule.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import { getBlob } from '../lib/storage.js';
import { openPdf } from './pdfjsSetup.js';
import { textesPages, correspondance, enregistrerCorrespondance } from '../lib/ficheJumelle.js';

async function titres(pdfId, docCache) {
  let doc = docCache && docCache.get(pdfId) && docCache.get(pdfId).doc;
  if (!doc) { const b = await getBlob(pdfId); if (!b) return null; doc = await openPdf(await b.arrayBuffer()); }
  return textesPages(doc, pdfId);
}
const court = (t, n = 60) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s || 'Sans titre'; };

/* `pagesDoc` (cours DOCUMENT, 15/10 soir) : les pages ACTUELLES du document [{ titre, texte, ancre }]
   et `versFicheDoc` la correspondance actuelle (recalculée depuis les ancres) — à la place du PDF original */
export function EditeurCorrespondance({ rec, pdfIdOrig, docCache, onClose, pagesDoc = null, versFicheDoc = null }) {
  const [pages, setPages] = useState(null); // { o: [...], f: [...] } textes et titres
  const depart = versFicheDoc || rec.pageMap.versFiche;
  const [versFiche, setVersFiche] = useState(() => [...depart]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    let vivant = true;
    Promise.all([pagesDoc ? Promise.resolve(pagesDoc) : titres(pdfIdOrig, docCache), titres(rec.fileId, docCache)])
      .then(([o, f]) => { if (vivant) { if (!o || !f) setErreur('Un des deux PDF n’est pas encore sur cet appareil.'); else setPages({ o, f }); } })
      .catch(() => { if (vivant) setErreur('PDF illisible.'); });
    return () => { vivant = false; };
  }, [rec.fileId, pdfIdOrig]); // eslint-disable-line react-hooks/exhaustive-deps
  const nbF = rec.nbPagesFiche;
  const associees = new Set(versFiche.filter((x) => x != null));
  const change = JSON.stringify(versFiche) !== JSON.stringify(depart);
  const associer = (o, f) => setVersFiche((v) => v.map((x, i) => (i === o - 1 ? f : x)));
  const dissocier = (f) => setVersFiche((v) => v.map((x) => (x === f ? null : x)));

  /* GLISSER AU POINTEUR : une étiquette suit le pointeur ; au relâchement, la ligne
     d'original sous le pointeur reçoit la page ; hors de la liste = dissocier */
  const [glisse, setGlisse] = useState(null); // { f, depuis: o | null, x, y }
  const glisseRef = useRef(null); glisseRef.current = glisse;
  const debut = (f, depuis) => (e) => {
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    let parti = false;
    const bouge = (ev) => {
      if (!parti && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      parti = true;
      setGlisse({ f, depuis, x: ev.clientX, y: ev.clientY });
      const sous = document.elementFromPoint(ev.clientX, ev.clientY);
      document.querySelectorAll('.fjc-ligne.survol').forEach((n) => n.classList.remove('survol'));
      const l = sous && sous.closest && sous.closest('.fjc-ligne'); if (l) l.classList.add('survol');
    };
    const fin = (ev) => {
      window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin);
      document.querySelectorAll('.fjc-ligne.survol').forEach((n) => n.classList.remove('survol'));
      setGlisse(null);
      if (!parti) return;
      const sous = document.elementFromPoint(ev.clientX, ev.clientY);
      const ligne = sous && sous.closest && sous.closest('.fjc-ligne');
      if (ligne) { const o = Number(ligne.dataset.orig); if (depuis && depuis !== o) setVersFiche((v) => v.map((x, i) => (i === depuis - 1 ? null : i === o - 1 ? f : x))); else associer(o, f); }
      else if (depuis) setVersFiche((v) => v.map((x, i) => (i === depuis - 1 ? null : x)));
    };
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);
  };
  const etiquette = (f, depuis = null) => (
    <span className="fjc-etiquette" onPointerDown={debut(f, depuis)} title="Glisser sur une diapositive pour l’associer — hors de la liste pour la dissocier" data-fiche={f}>
      <Icon name="filePdf" size={11} /> Fiche p.{f}<span className="fjc-titre">{pages ? court(pages.f[f - 1].titre, 34) : ''}</span>
    </span>
  );
  const automatique = () => { if (pages) setVersFiche(correspondance(pages.o, pages.f).versB); };
  const enregistrer = async () => {
    setEnCours(true);
    try { await enregistrerCorrespondance(rec, versFiche, pagesDoc); onClose(); } catch (e) { setErreur('Enregistrement impossible.'); setEnCours(false); }
  };

  return (
    <Modal title="Correspondance des pages" onClose={onClose} width="min(900px, 96vw)">
      <div className="fjc">
        <p className="fjc-aide">{pagesDoc
          ? <>Glisse une page de la fiche sur une page du document pour les associer ; deux pages peuvent viser la même page de fiche. Une page de fiche visée par aucune page est une <b>page ajoutée dans la fiche</b>. La correspondance suit le texte : elle tient quand la pagination du document bouge.</>
          : <>Glisse une page de la fiche sur une diapositive pour les associer ; deux diapositives peuvent viser la même page (fusion). Une page de fiche qui n’est visée par aucune diapositive est une <b>page ajoutée dans la fiche</b>.</>}</p>
        {erreur && <div className="fj-erreur">{erreur}</div>}
        {!pages && !erreur && <div className="gen-spinner" style={{ width: 28, height: 28, margin: '24px auto' }} />}
        {pages && (
          <div className="fjc-colonnes">
            <div className="fjc-col">
              <div className="fjc-entete">{pagesDoc ? `Document · ${pages.o.length} pages` : `Original · ${rec.nbPagesOrig} diapositives`}</div>
              {pages.o.map((p, i) => {
                const o = i + 1, f = versFiche[i];
                const fusion = f != null && versFiche.indexOf(f) !== i;
                return (
                  <div key={o} className={'fjc-ligne' + (f == null ? ' sans' : '')} data-orig={o}>
                    <span className="fjc-num">p.{o}</span>
                    <span className="fjc-otitre" title={p.titre}>{court(p.titre, 40)}</span>
                    <span className="fjc-cible">
                      {f != null ? etiquette(f, o) : <span className="fjc-vide">sans équivalent</span>}
                      {fusion && <span className="fjc-badge" title="Même page de fiche que la diapositive précédente">fusion</span>}
                    </span>
                    <select className="fjc-choix" aria-label={`Page de fiche pour la diapositive ${o}`} value={f ?? ''} onChange={(e) => associer(o, e.target.value === '' ? null : Number(e.target.value))}>
                      <option value="">—</option>
                      {Array.from({ length: nbF }, (_, k) => <option key={k} value={k + 1}>p.{k + 1}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="fjc-col fjc-fiche">
              <div className="fjc-entete">Fiche · {nbF} pages</div>
              {pages.f.map((p, j) => {
                const f = j + 1, ajoutee = !associees.has(f);
                return (
                  <div key={f} className={'fjc-page' + (ajoutee ? ' ajoutee' : '')}>
                    {etiquette(f)}
                    {ajoutee ? <span className="fjc-badge ajout">ajoutée dans la fiche</span>
                      : <button type="button" className="cd-ic" title="Dissocier (devient « ajoutée dans la fiche »)" onClick={() => dissocier(f)}><Icon name="x" size={11} /></button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="fjc-actions">
          <button type="button" className="btn ghost sm" onClick={automatique} disabled={!pages} title="Recalculer la correspondance par similarité de texte">Automatique</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost sm" onClick={onClose}>Annuler</button>
          <button type="button" className="btn primary sm" onClick={enregistrer} disabled={!change || enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
      {glisse && createPortal(<div className="fjc-fantome" style={{ left: glisse.x + 12, top: glisse.y + 8 }}>Fiche p.{glisse.f}</div>, document.body)}
    </Modal>
  );
}

/** les annotations qu'un remplacement de la fiche n'a pas pu replacer — listées, jamais supprimées */
export function ListeNonReplacees({ rec, onClose }) {
  const liste = rec.nonReplacees || [];
  const ancienne = (rec.versions || [])[rec.versions.length - 1];
  return (
    <Modal title={`Annotations non replacées (${liste.length})`} onClose={onClose} width="min(620px, 94vw)">
      <p className="fjc-aide">Leur page n’a pas été retrouvée dans la nouvelle version de la fiche{ancienne ? ` (« ${ancienne.fileName} » → « ${rec.fileName} »)` : ''}. Elles restent intactes dans la version précédente : rien n’a été supprimé.</p>
      <table className="fjc-table">
        <thead><tr><th>Type</th><th>Ancienne page</th><th>Contenu</th></tr></thead>
        <tbody>
          {liste.map((a) => (
            <tr key={a.id}><td>{a.type}</td><td>{a.page === 'ajoutée' ? 'page ajoutée' : 'p.' + a.page}</td><td>{a.texte ? `« ${a.texte} »` : '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
