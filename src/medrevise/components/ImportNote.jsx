/* ============================================================
   MedRevise — IMPORT d'un DOCUMENT DE NOTES (onglet Prise de notes).

   Le fichier n'est rattaché à AUCUNE fiche : il devient un enregistrement du
   store `notes` (lib/notes.js) et son contenu part dans le store `blobs` par
   `putBlob`, exactement comme le PDF d'une unité d'apprentissage
   (ImportApprentissage.jsx) — même canal, même outbox, même synchro.

   DEUX ENTRÉES, UN SEUL RÉSULTAT — toujours un PDF :
   - un PDF, stocké tel quel ;
   - une ou plusieurs IMAGES, converties en PDF (une page par image) par
     lib/imageToPdf.js. C'est ce qui permet de réutiliser le lecteur existant
     au lieu d'écrire une seconde visionneuse : surlignage, zoom, recherche,
     export annoté marchent d'office sur une photo de cours.

   REFUSÉS EXPLICITEMENT : .docx / .pptx / .odt / .pages / .key — aucun de ces
   formats ne se convertit proprement hors ligne dans un navigateur. On le dit
   avec le nom du fichier et la marche à suivre, plutôt que d'échouer à moitié.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { putBlob } from '../lib/storage.js';
import { titreFromFilename } from '../lib/fileTitre.js';
import { createNote } from '../lib/notes.js';
import { estImage, ordonnerImages, imagesToPdf } from '../lib/imageToPdf.js';

const estPdf = (f) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
const estBureautique = (f) => /\.(docx?|pptx?|odt|odp|pages|key)$/i.test((f && f.name) || '');

export function ImportNote({ ctx, onDone, onCancel }) {
  const [kind, setKind] = useState(null);     // 'pdf' | 'images'
  const [fichiers, setFichiers] = useState([]); // [File] — 1 si pdf, 1..N si images
  const [titre, setTitre] = useState('');
  const [over, setOver] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [busy, setBusy] = useState(false);

  const ajouter = (fileList) => {
    const recus = [...(fileList || [])].filter(Boolean);
    if (!recus.length) return;

    const bureau = recus.find(estBureautique);
    if (bureau) {
      setErreur(`« ${bureau.name} » n'est pas lisible ici : ce format ne se convertit pas proprement hors ligne. Exporte-le en PDF (Fichier → Exporter au format PDF), puis dépose le PDF.`);
      return;
    }
    const inconnu = recus.find((f) => !estPdf(f) && !estImage(f));
    if (inconnu) {
      setErreur(`« ${inconnu.name} » n'est pas accepté. Formats : PDF, ou images (PNG, JPEG, WebP…).`);
      return;
    }
    const pdfs = recus.filter(estPdf);
    const images = recus.filter((f) => !estPdf(f));
    if (pdfs.length && images.length) {
      setErreur('Dépose soit un PDF, soit des images — pas les deux à la fois.');
      return;
    }

    if (pdfs.length) {
      if (pdfs.length > 1) { setErreur('Un seul PDF à la fois.'); return; }
      setErreur(null);
      setKind('pdf');
      setFichiers([pdfs[0]]);
      if (!titre.trim()) setTitre(titreFromFilename(pdfs[0].name));
      return;
    }

    // images : on CUMULE les dépôts successifs (plusieurs photos d'un même cours
    // peuvent arriver en deux fois), puis on trie par nom.
    setErreur(null);
    setKind('images');
    const suivantes = ordonnerImages([...(kind === 'images' ? fichiers : []), ...images]);
    setFichiers(suivantes);
    if (!titre.trim()) setTitre(titreFromFilename(suivantes[0].name));
  };

  const retirer = (i) => {
    const reste = fichiers.filter((_, k) => k !== i);
    setFichiers(reste);
    if (!reste.length) setKind(null);
  };
  const toutRetirer = () => { setFichiers([]); setKind(null); setErreur(null); };

  const importer = async () => {
    if (!fichiers.length || busy) return;
    setBusy(true);
    setErreur(null);
    try {
      let pdfId, pdfName, origine;
      if (kind === 'pdf') {
        pdfId = await putBlob(fichiers[0]);
        pdfName = fichiers[0].name;
        origine = 'pdf';
      } else {
        const blob = await imagesToPdf(fichiers);           // peut lever (image non décodable)
        pdfId = await putBlob(blob);
        pdfName = `${(titre || 'document').trim()}.pdf`;
        origine = 'image';
      }
      const note = await createNote({ titre, pdfId, pdfName, origine });
      await ctx.reload();
      onDone && onDone(note);
    } catch (e) {
      setErreur((e && e.message) || "L'import a échoué — le fichier n'a pas pu être enregistré.");
    } finally {
      setBusy(false);
    }
  };

  const nbPages = kind === 'images' ? fichiers.length : 0;

  return (
    <div className="imp-form">
      <div className="imp-field">
        <label>Document</label>

        {fichiers.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
            {fichiers.map((f, i) => (
              <div key={f.name + i} className="row spread" style={{ gap: 10, padding: '9px 12px', border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--bg-2)' }}>
                <div className="row" style={{ gap: 8, minWidth: 0, alignItems: 'center' }}>
                  <Icon name={kind === 'images' ? 'image' : 'filePdf'} size={16} />
                  {kind === 'images' && <span className="hint tnum" style={{ fontSize: 11.5 }}>p.{i + 1}</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                </div>
                <button type="button" className="btn ghost sm" onClick={() => retirer(i)} title="Retirer"><Icon name="x" size={13} /></button>
              </div>
            ))}
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              {kind === 'images' && <span className="hint" style={{ fontSize: 11.5 }}>{nbPages} image{nbPages > 1 ? 's' : ''} → {nbPages} page{nbPages > 1 ? 's' : ''}, dans cet ordre (tri par nom de fichier).</span>}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn ghost sm" onClick={toutRetirer}>Tout retirer</button>
            </div>
          </div>
        )}

        <label className={'imp-drop' + (over ? ' over' : '')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: fichiers.length ? '12px' : '22px 12px', border: '1.5px dashed var(--border)', borderRadius: 10, cursor: 'pointer', background: over ? 'var(--accent-soft)' : 'transparent' }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); ajouter(e.dataTransfer.files); }}>
          <Icon name="upload" size={15} />
          {fichiers.length ? (kind === 'images' ? 'Ajouter d’autres images' : 'Remplacer le PDF') : 'Glisse un PDF ou des images ici, ou clique pour choisir'}
          <input type="file" multiple accept="application/pdf,.pdf,image/*" style={{ display: 'none' }}
            onChange={(e) => { ajouter(e.target.files); e.target.value = ''; }} />
        </label>

        <div className="hint" style={{ marginTop: 6 }}>
          PDF, ou images (PNG, JPEG, WebP…) converties en PDF — une page par image. Stocké sur cet appareil et envoyé au cloud comme les autres PDF. Aucun lien avec tes fiches : ce document n'entre ni dans la méthode des J, ni dans les statistiques.
        </div>
      </div>

      <div className="imp-field">
        <label>Titre</label>
        <input className="imp-title" value={titre} onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre du document" style={{ width: '100%' }} />
      </div>

      {erreur && (
        <div className="err-mini" style={{ marginTop: 4 }}>
          <div className="em-ic crit"><Icon name="alert" size={16} /></div>
          <div className="em-body"><div className="em-title">{erreur}</div></div>
        </div>
      )}

      <div className="imp-actions">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        <button className="btn primary" onClick={importer} disabled={!fichiers.length || busy}>
          <Icon name="check" size={15} /> {busy ? (kind === 'images' ? 'Conversion…' : 'Import…') : 'Ajouter le document'}
        </button>
      </div>
    </div>
  );
}
