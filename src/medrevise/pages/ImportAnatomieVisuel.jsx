/* ============================================================
   MedRevise — import ANATOMIE, sous-mode VISUEL (Étape A : coquille).
   Éditeur de schéma annoté DÉDIÉ (canvas/SVG sur une <img>), SANS pdf.js.
   Les annotations (coches + flèches) sont des DONNÉES STRUCTURÉES en
   IndexedDB (jamais aplaties dans l'image), en coordonnées RELATIVES
   (0..1) pour survivre au zoom/redimensionnement. Une fiche créée ici
   est du nouveau type "anat_schema".

   NOTE — Étape A : cette coquille pose seulement le sélecteur de
   destination (Cours → Matière → sous-catégorie → titre) cohérent avec
   le reste de l'app. L'éditeur lui-même (image collée/uploadée, coches,
   flèches, enregistrement, export) arrive à l'ÉTAPE B.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { DestPicker } from '../components/ui.jsx';

const SOUS_CATS = ['Muscles', 'Os', 'Nerfs', 'Ligaments', 'Vaisseaux'];

export function ImportAnatomieVisuel({ ctx }) {
  const { db } = ctx;
  const sources = db.sources.filter((s) => !s.archive);
  const [srcId, setSrcId] = useState(() => (sources[0] || {}).id);
  const matieresFor = (sid) => db.matieres.filter((m) => m.sourceId === sid && !m.archive);
  const [matId, setMatId] = useState(() => (matieresFor((sources[0] || {}).id)[0] || {}).id || null);
  const [titre, setTitre] = useState('');
  const [sousCat, setSousCat] = useState('Muscles');

  return (
    <div className="fadein imp-dest">
      <DestPicker ctx={ctx} srcId={srcId} setSrcId={setSrcId} matId={matId} setMatId={setMatId} />

      <div className="imp-field">
        <label>Sous-catégorie</label>
        <div className="imp-chips">
          {SOUS_CATS.map((s) => <button key={s} className={'imp-chip' + (sousCat === s ? ' on' : '')} onClick={() => setSousCat(s)}>{s}</button>)}
        </div>
      </div>

      <div className="imp-field">
        <label>Titre de la fiche <span className="imp-opt">(optionnel)</span></label>
        <input className="imp-title" placeholder={'ex : Coupe du membre supérieur — ' + sousCat} value={titre} onChange={(e) => setTitre(e.target.value)} />
      </div>

      {/* Placeholder de l'éditeur — remplacé par le vrai canvas annoté à l'ÉTAPE B. */}
      <div className="imp-field">
        <label>Schéma annoté</label>
        <div className="anat-vis-placeholder" style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '28px 18px', textAlign: 'center', background: 'var(--card-2)' }}>
          <div style={{ color: 'var(--text-3)', marginBottom: 8 }}><Icon name="image" size={28} /></div>
          <div style={{ fontWeight: 600 }}>Éditeur de schéma annoté</div>
          <div className="hint" style={{ marginTop: 6 }}>
            Colle (Ctrl/Cmd+V) ou importe une image, puis place des coches et des flèches.
            <br />L'éditeur interactif arrive à l'étape suivante.
          </div>
        </div>
      </div>

      <div className="hint" style={{ marginTop: 8 }}>
        <Icon name="info" size={13} /> Les coches et flèches sont enregistrées comme données (coordonnées relatives), jamais aplaties dans l'image — c'est ce qui rend le quiz possible.
      </div>
    </div>
  );
}
