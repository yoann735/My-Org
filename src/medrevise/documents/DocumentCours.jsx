/* ============================================================
   MedRevise — COURS « DOCUMENT » (sans PDF) — 07/10,
   docs/compte-rendu-position-document-tablette.md.

   « Quand je n'ai pas de diapos » : un cours à part entière, constitué d'un document de
   notes plein écran (documents/NotesEditor.jsx) et du MÊME panneau latéral qu'un cours PDF
   (CourseItemsSidebar : Exercices · Notions · Transcript) :
   - transcription en direct à côté des notes ;
   - une sélection du document → notion (mark + enregistrement `highlights`, source 'doc')
     ou flashcard (mode Exercices, recto pré-rempli) ; un clic dans Notions ramène au passage ;
   - exports : Markdown (.md, images incluses) et impression / PDF (feuille d'impression) ;
   - « Importer un PDF » : le cours devient un cours PDF, ce document en devient l'onglet
     « Notes » (mêmes données, store `notes_doc`) ;
   - position de lecture mémorisée (bloc en haut de la zone visible + décalage 0–1).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { EdTop } from '../components/ui.jsx';
import { CourseItemsSidebar } from '../components/CourseItemsSidebar.jsx';
import { TitreRenommable } from '../components/TitreRenommable.jsx';
import { MenuFichier } from '../pdf/MenuFichier.jsx';
import { FeuilleDemarrage, TranscriptPanel, BadgeTranscript } from '../transcription/TranscriptPanel.jsx';
import { enregistrerLecteur } from '../transcription/IndicateurGlobal.jsx';
import { getBlob, putBlob } from '../lib/storage.js';
import { lirePosition, ecrirePosition } from '../lib/positionLecture.js';
import { NotesEditor } from './NotesEditor.jsx';
import { lireNotesDoc } from './lib/notesDoc.js';
import { docToMarkdown, notesToHTML, hydrateDoc, EMPTY_DOC } from './lib/richtext.js';
import { notionsDuDoc, creerNotionDoc, synchroniserNotionsDoc } from './lib/notionsDoc.js';
import { usePositionDocument } from './positionDocument.js';

const nomFichier = (titre, ext) => ((titre || 'document').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document') + '.' + ext;
const telecharger = (blob, nom) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
const versDataUrl = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(blob); });

/** Export Markdown : images incluses (data URL), titre du cours en tête. */
export async function exporterMarkdown(ficheId, titre) {
  const rec = await lireNotesDoc(ficheId);
  const doc = (rec && rec.content) || EMPTY_DOC;
  const images = new Map();
  const ids = [];
  const w = (n) => { if (!n) return; if (n.type === 'image' && n.attrs && n.attrs.blobId) ids.push(n.attrs.blobId); (n.content || []).forEach(w); };
  w(doc);
  for (const id of ids) { const b = await getBlob(id); if (b) { const u = await versDataUrl(b); if (u) images.set(id, u); } }
  const md = docToMarkdown(doc, { titre, images });
  telecharger(new Blob([md], { type: 'text/markdown;charset=utf-8' }), nomFichier(titre, 'md'));
  return md;
}

/** Impression / PDF : le document seul, mis en page par la feuille d'impression (notes-doc.css). */
export async function imprimerDocument(ficheId, titre) {
  const rec = await lireNotesDoc(ficheId);
  const { doc, urls } = await hydrateDoc((rec && rec.content) || EMPTY_DOC);
  const page = document.createElement('div');
  page.className = 'nd-impression-page';
  page.innerHTML = `<h1>${(titre || 'Document').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</h1>` + notesToHTML(doc);
  document.body.appendChild(page);
  document.body.classList.add('nd-impression');
  const nettoyer = () => { page.remove(); document.body.classList.remove('nd-impression'); urls.forEach((u) => URL.revokeObjectURL(u)); window.removeEventListener('afterprint', nettoyer); };
  window.addEventListener('afterprint', nettoyer);
  // laisser les images se décoder avant d'imprimer
  await Promise.all([...page.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((ok) => { i.onload = ok; i.onerror = ok; }))));
  window.print();
  setTimeout(nettoyer, 60000); // filet : navigateurs sans afterprint
}

export function DocumentCours({ ctx, ficheId, onClose, onConvertir }) {
  const fiche = (ctx.db.fiches || []).find((f) => f.id === ficheId) || null;
  const titre = (fiche && fiche.titre) || 'Document';
  const notesRef = useRef(null);
  const defileRef = useRef(null);
  const [notions, setNotions] = useState([]);
  const [flashcard, setFlashcard] = useState(null); // { texte, n }
  const [ongletDemande, setOngletDemande] = useState(null);
  const [feuilleTrx, setFeuilleTrx] = useState(null);
  const [demandeRenommer, setDemandeRenommer] = useState(0);
  const [panneau, setPanneau] = useState(true);
  const [editeurPret, setEditeurPret] = useState(null);
  const entreePdf = useRef(null);

  const rechargerNotions = async () => setNotions(await notionsDuDoc(ficheId));
  useEffect(() => { rechargerNotions(); }, [ficheId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => (ficheId ? enregistrerLecteur(ficheId) : undefined), [ficheId]);
  // position de lecture du document (bloc visible en haut + décalage)
  const { attente } = usePositionDocument({ ficheId, editeur: editeurPret, conteneurRef: defileRef, lirePosition, ecrirePosition });

  const allerANotion = (h) => {
    if (notesRef.current) notesRef.current.allerANotion(h.docNotionId);
  };
  const ouvrirTranscript = () => { setPanneau(true); setOngletDemande((o) => ({ id: 'transcript', n: (o ? o.n : 0) + 1 })); };
  const importerPdf = async (fichier) => {
    if (!fichier || !/pdf$/i.test(fichier.type || fichier.name)) return;
    if (notesRef.current) notesRef.current.vider();
    const blobId = await putBlob(fichier);
    await ctx.setFichePdf(ficheId, blobId, fichier.name);
    if (onConvertir) onConvertir();
  };

  const listeNotions = (
    <div className="pis-notions">
      {notions.length === 0 ? (
        <div className="pm-vide">
          <Icon name="edit" size={22} />
          <div>Aucune notion dans ce document.</div>
          <div className="hint">Sélectionne un passage du document, puis « Notion » dans la barre flottante. Un clic ici t’y ramène.</div>
        </div>
      ) : notions.map((h) => (
        <div className="hl-entry" key={h.id} role="button" tabIndex={0} onClick={() => allerANotion(h)} onKeyDown={(e) => { if (e.key === 'Enter') allerANotion(h); }}>
          <span className="hl-dot" style={{ background: '#FFE066' }} />
          <div>
            <div className="hl-entry-page">Document</div>
            <div className="hl-entry-txt">« {h.texte.length > 140 ? h.texte.slice(0, 140) + '…' : h.texte} »</div>
          </div>
        </div>
      ))}
    </div>
  );

  if (!fiche) {
    return <div className="hint" style={{ padding: 20 }}>Document introuvable. <button className="btn sm" onClick={onClose}>Retour</button></div>;
  }

  return (
    <div className="ndc fadein">
      <div className="lecteur-entete doc">
        <button type="button" className="btn ghost sm" onClick={onClose} title="Revenir à la liste"><Icon name="chevL" size={14} /> Retour</button>
        <div className="doc-bloc">
          <TitreRenommable titre={titre} demandeEdition={demandeRenommer} onRenommer={(t) => ctx.renameFiche(ficheId, t)} sousTitre="Document" />
          <MenuFichier groupes={[
            { titre: 'Exporter', items: [
              { label: 'Exporter en Markdown (.md)', icon: 'upload', principal: true, onClick: () => exporterMarkdown(ficheId, titre), aide: 'Titres, listes, cases, tableaux, liens et images inclus' },
              { label: 'Imprimer / enregistrer en PDF', icon: 'filePdf', onClick: () => imprimerDocument(ficheId, titre), aide: 'Mise en page d’impression propre' },
            ] },
            { titre: 'Document', items: [
              { label: 'Renommer', icon: 'edit', onClick: () => setDemandeRenommer((n) => n + 1) },
              { label: 'Importer un PDF…', icon: 'upload', onClick: () => entreePdf.current && entreePdf.current.click(), aide: 'Le cours devient un cours PDF ; ce document devient son onglet « Notes »' },
            ] },
          ]} />
        </div>
        <div className="lecteur-entete-droite">
          <button type="button" className={'btn ghost sm' + (panneau ? ' actif' : '')} onClick={() => setPanneau((v) => !v)} title={panneau ? 'Replier le panneau' : 'Afficher le panneau'}>
            <Icon name="panel" size={14} /> Panneau
          </button>
          <div className="topbar-actions"><EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} /></div>
        </div>
        <input ref={entreePdf} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importerPdf(f); }} />
      </div>
      <div className="ndc-corps">
        <div className={'ndc-doc' + (attente ? ' nd-attente' : '')}>
          <NotesEditor ref={notesRef} ficheId={ficheId} conteneurRef={defileRef}
            onPret={(ed) => setEditeurPret(ed)}
            onChange={(contenu) => { synchroniserNotionsDoc(ficheId, contenu).then((ch) => { if (ch) rechargerNotions(); }); }}
            onCreerNotion={async (n) => { await creerNotionDoc(ficheId, n); rechargerNotions(); setPanneau(true); }}
            onCreerFlashcard={(texte) => { setPanneau(true); setFlashcard((f) => ({ texte, n: (f ? f.n : 0) + 1 })); }} />
        </div>
        <CourseItemsSidebar ctx={ctx} ficheId={ficheId} cleMemo={ficheId}
          ongletsEnPlus={[
            { id: 'notions', label: 'Notions', icon: 'edit', n: notions.length, contenu: listeNotions },
            { id: 'transcript', label: 'Transcript', icon: 'mic', plein: true, badge: <BadgeTranscript courseId={ficheId} />,
              contenu: <TranscriptPanel courseId={ficheId} titre={titre} onDemarrer={() => setFeuilleTrx({})} onReprendre={(s) => setFeuilleTrx({ reprendre: s })} /> },
          ]}
          ongletDemande={ongletDemande} flashcardDemandee={flashcard}
          replie={!panneau} onReplier={(v) => setPanneau(!v)} />
      </div>
      {feuilleTrx && (
        <FeuilleDemarrage courseId={ficheId} pdfDoc={null} reprendre={feuilleTrx.reprendre || null}
          onClose={() => setFeuilleTrx(null)} onDemarre={ouvrirTranscript} />
      )}
    </div>
  );
}
