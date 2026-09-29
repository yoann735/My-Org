/* ============================================================
   MedRevise — écran PRISE DE NOTES : des documents (PDF) qu'on lit et annote,
   SANS fiche, sans méthode des J, sans statistique (voir lib/notes.js).

   Liste des documents (import, renommage, suppression) ; « Ouvrir » → le lecteur
   EXISTANT (pdf/PdfReader.jsx), monté comme dans apprentissage/UniteSplit.jsx :
   la prop `doc` porte le PDF (aucune fiche), et `ficheId` sert de CLÉ DE
   NAMESPACE aux annotations. Rien du lecteur n'est réécrit ici — le surlignage,
   le zoom, la recherche et l'export annoté marchent d'office.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card, EdTop, ConfirmModal } from '../components/ui.jsx';
import { ImportNote } from '../components/ImportNote.jsx';
import { PdfReader } from '../pdf/PdfReader.jsx';
import { deleteNote, renameNote, comptesAnnotations } from '../lib/notes.js';

export function PriseDeNotes({ ctx }) {
  const { db } = ctx;
  const notes = [...(db.notes || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const [creation, setCreation] = useState(false);
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
        ficheId={ouvert.id}
        doc={{ titre: ouvert.titre, pdfId: ouvert.pdfId, pdfName: ouvert.pdfName }}
        outilsNotes
        onClose={() => setOuvertId(null)} />
    );
  }

  return (
    <div className="screen scroll fadein">
      <div className="topbar">
        <div>
          <h1 className="serif">Prise de notes</h1>
          <div className="sub">Tes cours en PDF, lus et annotés — sans planification, sans suivi, sans lien avec tes fiches.</div>
        </div>
        <div className="topbar-actions">
          {!creation && <button className="btn primary" onClick={() => setCreation(true)}><Icon name="plus" size={15} /> Nouveau document</button>}
          <EdTop theme={ctx.theme} onTheme={ctx.toggleTheme} onHub={ctx.goHub} />
        </div>
      </div>

      {creation && (
        <Card style={{ marginBottom: 18 }}>
          <ImportNote ctx={ctx}
            onCancel={() => setCreation(false)}
            onDone={(n) => { setCreation(false); annoncer(`« ${n.titre} » ajouté.`); setOuvertId(n.id); }} />
        </Card>
      )}

      {flash && <div className="err-mini ok" style={{ marginBottom: 14 }}><div className="em-ic"><Icon name="check" size={16} /></div><div className="em-body"><div className="em-title">{flash}</div></div></div>}

      {!notes.length && !creation && (
        <div className="rev-empty" style={{ marginTop: 50 }}>
          <Icon name="edit" size={30} />
          <div className="re-title">Aucun document de notes</div>
          <div className="hint" style={{ maxWidth: 460, textAlign: 'center' }}>
            Dépose un PDF de cours : tu pourras le lire, le surligner et l'annoter ici. Ces documents restent à part — ils n'entrent ni dans tes fiches, ni dans la méthode des J.
          </div>
          <button className="btn primary" onClick={() => setCreation(true)}><Icon name="plus" size={15} /> Ajouter un document</button>
        </div>
      )}

      {notes.length > 0 && (
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

      {aSupprimer && (
        <ConfirmModal danger title={`Supprimer « ${aSupprimer.titre} » ?`}
          body="Le document et ses annotations (surlignages, boîtes de texte) seront supprimés, sur tous tes appareils. Tes fiches, tes cartes et la méthode des J ne sont pas concernées."
          confirmLabel="Supprimer" onConfirm={supprimer} onCancel={() => setASupprimer(null)} />
      )}
    </div>
  );
}
