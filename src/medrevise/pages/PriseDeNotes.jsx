/* ============================================================
   MedRevise — écran PRISE DE NOTES : des documents (PDF) qu'on lit et annote,
   SANS fiche, sans méthode des J, sans statistique (voir lib/notes.js).

   Liste des documents (import, renommage, suppression) ; « Ouvrir » → le lecteur
   EXISTANT (pdf/PdfReader.jsx), monté comme dans apprentissage/UniteSplit.jsx :
   la prop `doc` porte le PDF (aucune fiche), et `ficheId` sert de CLÉ DE
   NAMESPACE aux annotations. Rien du lecteur n'est réécrit ici — le surlignage,
   le zoom, la recherche et l'export annoté marchent d'office.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, ConfirmModal } from '../components/ui.jsx';
import { ImportNote } from '../components/ImportNote.jsx';
import { PdfReader } from '../pdf/PdfReader.jsx';
import { deleteNote, renameNote, comptesAnnotations } from '../lib/notes.js';
import { analyserFichiers, importerNote, demandeConfirmation } from '../lib/noteImport.js';

export function PriseDeNotes({ ctx }) {
  const { db } = ctx;
  const notes = [...(db.notes || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const [confirmation, setConfirmation] = useState(null); // { fichiers, titre } — seul cas : plusieurs images
  const [survol, setSurvol] = useState(false);            // un fichier est au-dessus de la page
  const [occupe, setOccupe] = useState(false);            // import en cours
  const compteurSurvol = useRef(0);                       // dragleave se déclenche aussi en passant sur un enfant
  const [ouvertId, setOuvertId] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const [renommage, setRenommage] = useState(null); // { id, valeur }
  const [flash, setFlash] = useState(null);
  const [comptes, setComptes] = useState({});

  const ouvert = notes.find((n) => n.id === ouvertId) || null;

  // compte d'annotations par document — relu à chaque changement de la liste et
  // au retour du lecteur (on vient peut-être d'y surligner).
  useEffect(() => {
    let vivant = true;
    comptesAnnotations().then((m) => { if (vivant) setComptes(m); });
    return () => { vivant = false; };
  }, [db.notes, ouvertId]);

  const annoncer = (msg) => { setFlash(msg); setTimeout(() => setFlash(null), 4000); };

  /* ZÉRO CLIC : un dépôt valide importe ET ouvre le document. Le seul cas qui
     s'interpose est plusieurs images d'un coup, dont il faut valider l'ordre des
     pages (voir components/ImportNote.jsx). */
  const traiter = async (liste) => {
    if (occupe) return;
    const lu = analyserFichiers(liste);
    if (!lu.ok) { annoncer(lu.erreur); return; }
    if (demandeConfirmation(lu)) { setConfirmation({ fichiers: lu.fichiers, titre: lu.titre }); return; }
    setOccupe(true);
    try {
      const note = await importerNote(lu);
      await ctx.reload();
      setOuvertId(note.id); // ouvert immédiatement : c'est tout l'intérêt du geste
    } catch (e) {
      annoncer((e && e.message) || "L'import a échoué — le fichier n'a pas pu être enregistré.");
    } finally { setOccupe(false); }
  };

  // dragenter/dragleave se déclenchent aussi en traversant les enfants : on compte
  // les entrées/sorties plutôt que de se fier au dernier événement reçu.
  const surDragEnter = (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    compteurSurvol.current += 1; setSurvol(true);
  };
  const surDragLeave = () => { compteurSurvol.current -= 1; if (compteurSurvol.current <= 0) { compteurSurvol.current = 0; setSurvol(false); } };
  const surDrop = (e) => { e.preventDefault(); compteurSurvol.current = 0; setSurvol(false); traiter(e.dataTransfer.files); };

  const supprimer = async () => {
    const n = aSupprimer;
    setASupprimer(null);
    await deleteNote(n);
    await ctx.reload();
    annoncer(`« ${n.titre} » supprimé.`);
  };

  const validerRenommage = async () => {
    if (!renommage) return;
    const n = notes.find((x) => x.id === renommage.id);
    setRenommage(null);
    if (!n) return;
    await renameNote(n, renommage.valeur);
    await ctx.reload();
  };

  // document supprimé ailleurs (autre appareil) pendant qu'il était ouvert :
  // `ouvert` devient null et on retombe simplement sur la liste.
  if (ouvert) {
    return (
      <PdfReader key={ouvert.id} ctx={ctx}
        source={{ id: ouvert.id, titre: ouvert.titre, pdfId: ouvert.pdfId, pdfName: ouvert.pdfName }}
        onClose={() => setOuvertId(null)} />
    );
  }

  return (
    <div className={'screen scroll fadein pdn-screen' + (survol ? ' survol' : '')}
      onDragEnter={surDragEnter} onDragOver={(e) => { e.preventDefault(); }} onDragLeave={surDragLeave} onDrop={surDrop}>
      <div className="topbar">
        <div>
          <h1 className="serif">Prise de notes</h1>
          <div className="sub">Tes cours en PDF, lus et annotés — sans planification, sans suivi, sans lien avec tes fiches.</div>
        </div>
        <div className="topbar-actions">
          {/* SORTIE N°2 du mode focus (les autres : le bandeau du shell et le pied
              de la barre latérale, voir lib/focusMode.js). Le MÊME interrupteur
              active et désactive — jamais un réglage caché ailleurs. */}
          <button className={'btn sm' + (ctx.focusNotes ? '' : ' ghost')} onClick={() => ctx.basculerFocus(!ctx.focusNotes)}
            title={ctx.focusNotes ? 'Revenir à tous les onglets' : 'Ne garder que la Prise de notes, même après un rechargement'}>
            <Icon name={ctx.focusNotes ? 'maximize' : 'target'} size={14} /> {ctx.focusNotes ? 'Quitter le mode focus' : 'Mode focus'}
          </button>
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      {confirmation && (
        <Card style={{ marginBottom: 18 }}>
          <ImportNote ctx={ctx} fichiersInitiaux={confirmation.fichiers} titreInitial={confirmation.titre}
            onCancel={() => setConfirmation(null)}
            onDone={(n) => { setConfirmation(null); setOuvertId(n.id); }} />
        </Card>
      )}

      {flash && <div className="err-mini ok" style={{ marginBottom: 14 }}><div className="em-ic"><Icon name="check" size={16} /></div><div className="em-body"><div className="em-title">{flash}</div></div></div>}

      {!notes.length && !confirmation && (
        <label className="pdn-zone">
          <Icon name="upload" size={40} />
          <div className="pdn-zone-titre">Glisse un PDF ou des images ici</div>
          <div className="pdn-zone-sous">
            {occupe ? 'Import en cours…' : 'Le document s’ouvre aussitôt, prêt à être surligné et annoté. Ces documents restent à part : ni fiches, ni méthode des J, ni statistiques.'}
          </div>
          <span className="pdn-zone-lien">ou clique pour parcourir</span>
          <input type="file" multiple accept="application/pdf,.pdf,image/*" style={{ display: 'none' }}
            onChange={(e) => { traiter(e.target.files); e.target.value = ''; }} />
        </label>
      )}

      {notes.length > 0 && !confirmation && (
        <div className="appr-grid">
          {notes.map((n) => (
            <div className="card appr-card" key={n.id}>
              <div className="card-body">
                <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <Icon name={n.origine === 'image' ? 'image' : 'filePdf'} size={13} />
                  <span className="hint" style={{ fontSize: 12 }}>{n.origine === 'image' ? 'Image convertie en PDF' : 'Document PDF'}</span>
                </div>

                {renommage && renommage.id === n.id ? (
                  <input className="imp-title" autoFocus value={renommage.valeur} style={{ width: '100%' }}
                    onChange={(e) => setRenommage({ id: n.id, valeur: e.target.value })}
                    onBlur={validerRenommage}
                    onKeyDown={(e) => { if (e.key === 'Enter') validerRenommage(); if (e.key === 'Escape') setRenommage(null); }} />
                ) : (
                  <button type="button" className="serif appr-titre linklike" onClick={() => setOuvertId(n.id)}>{n.titre}</button>
                )}

                <div className="hint appr-pdf"><Icon name="filePdf" size={12} /> {n.pdfName || 'Document'}</div>
                <div className="hint" style={{ marginTop: 6 }}>
                  {comptes[n.id] ? `${comptes[n.id]} annotation${comptes[n.id] > 1 ? 's' : ''}` : 'Aucune annotation'}
                </div>

                <div className="row spread" style={{ marginTop: 14, alignItems: 'center' }}>
                  <span className="hint" style={{ fontSize: 11.5 }}>Ajouté le {new Date(n.createdAt).toLocaleDateString('fr-FR')}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn ghost sm" title="Renommer" onClick={() => setRenommage({ id: n.id, valeur: n.titre })}><Icon name="edit" size={13} /></button>
                    <button className="btn ghost sm" title="Supprimer le document" onClick={() => setASupprimer(n)}><Icon name="trash" size={13} /></button>
                    <button className="btn primary sm" onClick={() => setOuvertId(n.id)}><Icon name="book" size={13} /> Ouvrir</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {notes.length > 0 && !confirmation && (
        <label className="pdn-zone mince">
          <Icon name="upload" size={17} />
          <span>{occupe ? 'Import en cours…' : 'Glisse un PDF ou des images n’importe où sur cette page — ou clique ici'}</span>
          <input type="file" multiple accept="application/pdf,.pdf,image/*" style={{ display: 'none' }}
            onChange={(e) => { traiter(e.target.files); e.target.value = ''; }} />
        </label>
      )}

      {/* voile de dépôt : la page ENTIÈRE est une cible, il faut que ça se voie */}
      {survol && (
        <div className="pdn-voile">
          <div className="pdn-voile-carte"><Icon name="upload" size={30} /><div>Déposer ici</div></div>
        </div>
      )}

      {aSupprimer && (
        <ConfirmModal danger title={`Supprimer « ${aSupprimer.titre} » ?`}
          body="Le document et ses annotations (surlignages, boîtes de texte) seront supprimés, sur tous tes appareils. Tes fiches, tes cartes et la méthode des J ne sont pas concernées."
          confirmLabel="Supprimer" onConfirm={supprimer} onCancel={() => setASupprimer(null)} />
      )}
    </div>
  );
}
