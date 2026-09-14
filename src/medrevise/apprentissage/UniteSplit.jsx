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

   Étape 2 : exos en LECTURE. L'interactivité (réponses, indices, guide) arrive ensuite.
   ============================================================ */
import { useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop, matiereMeta } from '../components/ui.jsx';
import { Tex } from '../components/Tex.jsx';
import { PdfReader } from '../pdf/PdfReader.jsx';
import { DonneesTable, FormulesBlock } from '../session/Exercice.jsx';
import { cleSurlignages, compteUnite } from '../lib/apprentissage.js';

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
          <button className="btn sm appr-masquer" onClick={basculerCours} title="Raccourci : double-clic sur la poignée">
            <Icon name={prefs.masque ? 'chevL' : 'chevR'} size={13} /> {prefs.masque ? 'Afficher le cours' : 'Masquer le cours'}
          </button>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      <div ref={splitRef} className={'appr-split' + (prefs.masque ? ' masque' : '') + (glisse ? ' glisse' : '')}
        data-vue={vue} style={{ '--appr-gauche': `${prefs.gauche * 100}%` }}>
        <div className="appr-exos" aria-label="Exercices">
          {items.map((it, i) => <ExoLecture key={it.id} item={it} rang={i + 1} total={items.length} />)}
          <div className="hint" style={{ textAlign: 'center', padding: '10px 0 24px' }}>Fin de l'unité · {items.length} exo{items.length > 1 ? 's' : ''}</div>
        </div>

        <div className="appr-handle" role="separator" aria-orientation="vertical" title="Glisser pour régler · double-clic pour masquer/afficher le cours"
          onPointerDown={debutGlisse} onPointerMove={pendantGlisse} onPointerUp={finGlisse} onPointerCancel={finGlisse}
          onDoubleClick={basculerCours} />

        <div className="appr-cours" aria-label="Cours (PDF)" aria-hidden={prefs.masque}>
          <PdfReader ctx={ctx} embedded ajusterLargeur panneauNotionsOuvert={false}
            ficheId={cleSurlignages(unite)} doc={{ titre: unite.titre, pdfId: unite.pdfId, pdfName: unite.pdfName }}
            onClose={() => (window.matchMedia('(max-width: 900px)').matches ? setVue('exos') : maj({ masque: true }))} />
        </div>
      </div>
    </div>
  );
}

const DIFF = { 1: 'Facile', 2: 'Intermédiaire', 3: 'Difficile' };
const TYPE_LABEL = (it) => (it.type === 'qcm' ? (it.multiple ? 'QCM · plusieurs réponses' : 'QCM')
  : it.sous_type === 'numerique' ? 'Exercice · réponse chiffrée' : 'Exercice · réponse rédigée');
const LETTRES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/* Un exo en LECTURE (étape 2) : énoncé, options, données, formules — et ce qui
   l'accompagne (indices, correction en étapes), annoncé sans être révélé. */
function ExoLecture({ item, rang, total }) {
  const nIndices = (item.indices || []).length;
  const nEtapes = ((item.correction && item.correction.etapes) || []).length;
  return (
    <div className="card appr-exo">
      <div className="card-body">
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="appr-rang tnum">{rang}<small>/{total}</small></span>
          <span className="pill" style={{ height: 22 }}>{TYPE_LABEL(item)}</span>
          <span className={'pill appr-diff d' + (item.difficulte || 2)} style={{ height: 22 }}>{DIFF[item.difficulte] || 'Intermédiaire'}</span>
          {item.theme && <span className="hint" style={{ fontSize: 12.5 }}>{item.theme}</span>}
        </div>
        <div className="appr-enonce"><Tex>{item.enonce}</Tex></div>

        {item.type === 'qcm' && (
          <div className="appr-options">
            {(item.options || []).map((o, i) => (
              <div key={o.id} className="appr-option">
                <span className="rc-key" style={item.multiple ? { borderRadius: 6 } : undefined}>{LETTRES[i]}</span>
                <span><Tex>{o.texte}</Tex></span>
              </div>
            ))}
          </div>
        )}
        {item.type === 'exercice' && (item.donnees || []).length > 0 && <DonneesTable donnees={item.donnees} />}
        {item.type === 'exercice' && (item.formules || []).length > 0 && <FormulesBlock formules={item.formules} />}

        <div className="hint appr-meta">
          {nIndices > 0 && <span><Icon name="lightbulb" size={12} /> {nIndices} indice{nIndices > 1 ? 's' : ''}</span>}
          {nEtapes > 0 && <span><Icon name="list" size={12} /> correction en {nEtapes} étape{nEtapes > 1 ? 's' : ''}</span>}
          {item.necessite_calculatrice && <span><Icon name="grad" size={12} /> calculatrice</span>}
        </div>
      </div>
    </div>
  );
}
