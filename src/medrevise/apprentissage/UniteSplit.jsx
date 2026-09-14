/* ============================================================
   MedRevise — MODE APPRENTISSAGE : écran splitté d'une unité.
   GAUCHE : les exos à la file, dans l'ordre du JSON (= ordre d'apprentissage).
   DROITE : le PDF du cours, dans le lecteur existant (PdfReader embarqué, chemin
   « document générique » `doc`), ses surlignages rangés sous cleSurlignages(unite).

   - Deux panneaux, chacun avec SON défilement : le cours ne bouge pas quand on
     descend dans les exos, et inversement.
   - Poignée entre les deux : glisser pour régler la répartition (25 % → 75 %),
     double-clic pour masquer/afficher le cours. « Masquer le cours » fait pareil.
   - Masqué, le lecteur reste MONTÉ (replié à largeur nulle, pas démonté) : on retrouve
     sa page, son zoom et ses surlignages en le rouvrant.
   - Fenêtre étroite (≤ 900 px) : plus de côte à côte, bascule « Exos | Cours ».
   Répartition et état masqué : préférence de CET appareil (localStorage), rien de synchronisé.

   Les exos se FONT dans apprentissage/ExoApprentissage.jsx (réponses, indices, guide pas à
   pas) — sans aucun suivi. « Ajouter des exos » complète l'unité (lib/apprentissage.js).
   ============================================================ */
import { useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, Modal, matiereMeta } from '../components/ui.jsx';
import { ImportJsonField } from '../components/ImportFlow.jsx';
import { PdfReader } from '../pdf/PdfReader.jsx';
import { ExoApprentissage } from './ExoApprentissage.jsx';
import { cleSurlignages, compteUnite, parseApprentissageJson, appendExosToUnite, doublonsDansUnite } from '../lib/apprentissage.js';

const CLE_PREFS = 'medrevise.apprentissage.split';
const lirePrefs = () => {
  try { return { gauche: 0.55, masque: false, ...JSON.parse(localStorage.getItem(CLE_PREFS) || '{}') }; }
  catch (e) { return { gauche: 0.55, masque: false }; }
};
const ecrirePrefs = (p) => { try { localStorage.setItem(CLE_PREFS, JSON.stringify(p)); } catch (e) { /* mode privé */ } };

export function UniteSplit({ ctx, unite, onRetour }) {
  const [prefs, setPrefs] = useState(lirePrefs);
  const [vue, setVue] = useState('exos'); // fenêtre étroite : exos | cours
  const [glisse, setGlisse] = useState(false);
  const splitRef = useRef(null);

  const maj = (patch) => setPrefs((p) => { const n = { ...p, ...patch }; ecrirePrefs(n); return n; });
  const basculerCours = () => maj({ masque: !prefs.masque });
  const [ajout, setAjout] = useState(false);

  // « Voir le cours » d'un exo : fenêtre étroite → bascule sur Cours ; cours masqué →
  // on le déplie ; déjà visible → bref halo sur le panneau pour y attirer l'œil.
  const [halo, setHalo] = useState(false);
  const voirCours = () => {
    if (window.matchMedia('(max-width: 900px)').matches) { setVue('cours'); return; }
    if (prefs.masque) { maj({ masque: false }); return; }
    setHalo(true);
    setTimeout(() => setHalo(false), 900);
  };

  // poignée : suivi du pointeur sur toute la fenêtre pendant le glisser (capture), pour
  // ne pas « lâcher » la poignée quand le curseur passe au-dessus du canvas du PDF.
  const debutGlisse = (e) => {
    if (prefs.masque) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setGlisse(true);
  };
  const pendantGlisse = (e) => {
    if (!glisse || !splitRef.current) return;
    const r = splitRef.current.getBoundingClientRect();
    const ratio = Math.max(0.25, Math.min(0.75, (e.clientX - r.left) / r.width));
    setPrefs((p) => ({ ...p, gauche: +ratio.toFixed(3) }));
  };
  const finGlisse = () => { if (!glisse) return; setGlisse(false); setPrefs((p) => { ecrirePrefs(p); return p; }); };

  const m = ctx.db.matieres.find((x) => x.id === unite.matiereId);
  const mm = matiereMeta(m || null);
  const c = compteUnite(unite);
  const items = unite.items || [];

  return (
    <div className="screen noscroll fadein appr-screen">
      <div className="appr-head">
        <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
          <button className="btn ghost sm" onClick={onRetour}><Icon name="chevL" size={14} /> Unités</button>
          <div style={{ minWidth: 0 }}>
            <div className="serif appr-head-titre">{unite.titre}</div>
            <div className="hint" style={{ fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: m ? mm.tint : 'var(--border)', display: 'inline-block', marginRight: 6 }} />
              {m ? mm.label : 'Sans matière'} · {[c.qcm && `${c.qcm} QCM`, c.exercice && `${c.exercice} exercice${c.exercice > 1 ? 's' : ''}`].filter(Boolean).join(' · ')} · sans suivi
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <div className="seg appr-toggle">
            <button type="button" className={'seg-btn' + (vue === 'exos' ? ' active' : '')} onClick={() => setVue('exos')}><Icon name="list" size={13} /> Exos</button>
            <button type="button" className={'seg-btn' + (vue === 'cours' ? ' active' : '')} onClick={() => setVue('cours')}><Icon name="filePdf" size={13} /> Cours</button>
          </div>
          <button className="btn ghost sm" onClick={() => setAjout(true)} title="Coller d'autres exos (JSON) à la suite de cette unité"><Icon name="plus" size={13} /> Ajouter des exos</button>
          <button className="btn sm appr-masquer" onClick={basculerCours} title="Raccourci : double-clic sur la poignée">
            <Icon name={prefs.masque ? 'chevL' : 'chevR'} size={13} /> {prefs.masque ? 'Afficher le cours' : 'Masquer le cours'}
          </button>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      <div ref={splitRef} className={'appr-split' + (prefs.masque ? ' masque' : '') + (glisse ? ' glisse' : '')}
        data-vue={vue} style={{ '--appr-gauche': `${prefs.gauche * 100}%` }}>
        <div className="appr-exos" aria-label="Exercices">
          {items.map((it, i) => <ExoApprentissage key={it.id} item={it} rang={i + 1} total={items.length} onVoirCours={voirCours} />)}
          <div className="hint" style={{ textAlign: 'center', padding: '10px 0 24px' }}>Fin de l'unité · {items.length} exo{items.length > 1 ? 's' : ''}</div>
        </div>

        <div className="appr-handle" role="separator" aria-orientation="vertical" title="Glisser pour régler · double-clic pour masquer/afficher le cours"
          onPointerDown={debutGlisse} onPointerMove={pendantGlisse} onPointerUp={finGlisse} onPointerCancel={finGlisse}
          onDoubleClick={basculerCours} />

        <div className={'appr-cours' + (halo ? ' halo' : '')} aria-label="Cours (PDF)" aria-hidden={prefs.masque}>
          <PdfReader ctx={ctx} embedded ajusterLargeur panneauNotionsOuvert={false}
            ficheId={cleSurlignages(unite)} doc={{ titre: unite.titre, pdfId: unite.pdfId, pdfName: unite.pdfName }}
            onClose={() => (window.matchMedia('(max-width: 900px)').matches ? setVue('exos') : maj({ masque: true }))} />
        </div>
      </div>

      {ajout && <AjoutExos ctx={ctx} unite={unite} onClose={() => setAjout(false)} />}
    </div>
  );
}

/* ---- « Ajouter des exos » : même lecture du JSON que la création d'unité, exos
   ajoutés À LA FIN, doublons (même id d'origine) ignorés et annoncés avant confirmation. ---- */
function AjoutExos({ ctx, unite, onClose }) {
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState(null);
  const [lu, setLu] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(null);

  const lire = () => {
    const res = parseApprentissageJson(texte);
    if (!res.ok) { setErreur(res.error); return; }
    setErreur(null); setLu({ ...res, doublons: doublonsDansUnite(unite, res.items) });
  };
  const confirmer = async () => {
    setBusy(true);
    try {
      const r = await appendExosToUnite(unite, lu.items);
      await ctx.reload();
      setFait(r);
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Ajouter des exos à l'unité" onClose={onClose} width="min(640px, 94vw)">
      {fait ? (
        <div className="fadein" style={{ textAlign: 'center', padding: '8px 0' }}>
          <div className="serif" style={{ fontSize: 19 }}>{fait.ajoutes} exo{fait.ajoutes > 1 ? 's' : ''} ajouté{fait.ajoutes > 1 ? 's' : ''}</div>
          <div className="hint" style={{ marginTop: 6 }}>
            À la suite de l'unité{fait.doublons ? ` · ${fait.doublons} doublon${fait.doublons > 1 ? 's' : ''} ignoré${fait.doublons > 1 ? 's' : ''}` : ''}.
          </div>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={onClose}>Fermer</button>
        </div>
      ) : !lu ? (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>Colle le JSON d'autres exos (qcm + exercice) : ils s'ajoutent à la fin, dans leur ordre. Un exo déjà présent (même id) est ignoré.</div>
          <ImportJsonField label="EXOS À AJOUTER (JSON)" placeholder="Colle ici la réponse JSON du prompt d'apprentissage." value={texte} onChange={(v) => { setTexte(v); setErreur(null); }} error={erreur} />
          <div className="imp-actions">
            <button className="btn ghost" onClick={onClose}>Annuler</button>
            <button className="btn primary" onClick={lire} disabled={!texte.trim()}><Icon name="check" size={15} /> Vérifier</button>
          </div>
        </>
      ) : (
        <>
          <div className="err-mini ok" style={{ marginBottom: 12 }}>
            <div className="em-ic"><Icon name="check" size={16} /></div>
            <div className="em-body">
              <div className="em-title">{lu.counts.qcm} QCM · {lu.counts.exercice} exercice{lu.counts.exercice > 1 ? 's' : ''} lus</div>
              <div className="hint" style={{ marginTop: 3 }}>
                {lu.items.length - lu.doublons} à ajouter à la suite des {(unite.items || []).length} exos actuels
                {lu.doublons ? ` · ${lu.doublons} doublon${lu.doublons > 1 ? 's' : ''} ignoré${lu.doublons > 1 ? 's' : ''}` : ''}.
              </div>
              {lu.errors.length > 0 && (
                <ul className="hint" style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--accent-2)' }}>
                  {lu.errors.map((e, i) => <li key={i}>Item {e.index} ({e.type}) : {e.reason}</li>)}
                </ul>
              )}
            </div>
          </div>
          <div className="imp-actions">
            <button className="btn ghost" onClick={() => setLu(null)}>Retour</button>
            <button className="btn primary" onClick={confirmer} disabled={busy || lu.items.length === lu.doublons}><Icon name="plus" size={15} /> Ajouter</button>
          </div>
        </>
      )}
    </Modal>
  );
}
