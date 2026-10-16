/* ============================================================
   MedRevise — RÉGLAGES › ARCHIVES (11/10, docs/compte-rendu-finitions-boites-sidebar.md).
   L'écran « Prise de notes » est supprimé. Ses documents NON rangés (store `notes`) restent en
   base et se lisent ici : liste simple, lecture des textes (surlignages, boîtes, textes libres),
   export .md, téléchargement du PDF. Les documents déjà rangés dans la Bibliothèque sont des
   fiches ordinaires : ils y restent, rien ne change pour eux.
   LECTURE SEULE : aucune écriture, aucune suppression.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Card } from './ui.jsx';
import { getAll, getBlob } from '../lib/storage.js';
import { texteDeContenu } from '../lib/textesAnnotations.js';
import { deliverFile } from '../lib/backupExport.js';
import { fichiersHorsModele } from '../lib/fichiersCours.js';

const date = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR'); } catch (e) { return ''; } };
const nomFichier = (s) => String(s || 'notes').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'notes';
const parPage = (a, b) => (a.page || 0) - (b.page || 0) || (a.y || 0) - (b.y || 0);

/** contenu lisible d'un document : surlignages, puis boîtes et textes libres, page par page */
export function lireDocument(note, highlights, annotations) {
  const surl = highlights.filter((h) => h.ficheId === note.id && (h.texte || '').trim()).sort(parPage)
    .map((h) => ({ page: h.page, texte: h.texte.trim(), note: (h.note || '').trim() }));
  const textes = annotations.filter((a) => a.ficheId === note.id && (a.kind === 'libre' || a.kind === 'texte' || !a.kind) && a.content)
    .sort(parPage).map((a) => ({ page: a.page, texte: texteDeContenu(a.content).trim() })).filter((t) => t.texte);
  const autres = annotations.filter((a) => a.ficheId === note.id).length - textes.length;
  return { surl, textes, autres: Math.max(0, autres) };
}

export function versMarkdown(note, lu) {
  const l = [`# ${note.titre || 'Document sans titre'}`, '', `- Créé le ${date(note.createdAt)}`, `- Fichier : ${note.pdfName || '—'}`, '- Origine : Prise de notes (MedRevise), archivée le 11/10/2026', ''];
  if (lu.surl.length) { l.push('## Surlignages', ''); lu.surl.forEach((s) => { l.push(`- (p. ${s.page}) « ${s.texte} »`); if (s.note) l.push(`  - note : ${s.note}`); }); l.push(''); }
  if (lu.textes.length) { l.push('## Boîtes et textes', ''); lu.textes.forEach((t) => l.push(`- (p. ${t.page}) ${t.texte.replace(/\n+/g, ' ')}`)); l.push(''); }
  if (!lu.surl.length && !lu.textes.length) l.push('_Aucun texte écrit sur ce document._', '');
  if (lu.autres) l.push(`_${lu.autres} autre(s) annotation(s) (traits, formes, images…) : visibles seulement sur le PDF._`, '');
  return l.join('\n');
}

export function CarteArchives() {
  const [etat, setEtat] = useState(null); // { notes, highlights, annotations, rangees }
  const [ouvert, setOuvert] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let vivant = true;
    (async () => {
      const [notes, highlights, annotations, fiches] = await Promise.all([getAll('notes'), getAll('highlights'), getAll('annotations'), getAll('fiches')]);
      const idsFiches = new Set((fiches || []).map((f) => f.id));
      if (vivant) setEtat({
        notes: (notes || []).filter((n) => !idsFiches.has(n.id)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
        highlights: highlights || [], annotations: annotations || [],
        rangees: (fiches || []).filter((f) => f.priseDeNotes && !f.archive).length,
      });
    })();
    return () => { vivant = false; };
  }, []);
  const exporter = async (note) => {
    const md = versMarkdown(note, lireDocument(note, etat.highlights, etat.annotations));
    await deliverFile(new Blob([md], { type: 'text/markdown;charset=utf-8' }), nomFichier(note.titre) + '.md');
    setMessage(`« ${note.titre} » exporté en .md.`);
  };
  const pdf = async (note) => {
    const b = note.pdfId ? await getBlob(note.pdfId) : null;
    if (!b) { setMessage('PDF introuvable sur cet appareil.'); return; }
    await deliverFile(b, note.pdfName || nomFichier(note.titre) + '.pdf');
  };
  return (
    <Card title="Archives — Prise de notes" icon="archive" style={{ maxWidth: 820, marginBottom: 16 }}>
      <div id="reglages-archives" className="hint" style={{ marginBottom: 12 }}>
        L’écran « Prise de notes » a été retiré. Les documents qui n’avaient pas été rangés dans la Bibliothèque restent ici, en lecture : textes, export .md, PDF d’origine. Rien n’est supprimé.
      </div>
      {!etat && <div className="hint">Lecture…</div>}
      {etat && !etat.notes.length && (
        <div className="arch-vide">Aucun document de Prise de notes à archiver{etat.rangees ? ` — ${etat.rangees} document${etat.rangees > 1 ? 's' : ''} déjà rangé${etat.rangees > 1 ? 's' : ''} dans la Bibliothèque (toujours là)` : ''}.</div>
      )}
      {etat && etat.notes.length > 0 && (
        <ul className="arch-liste">
          {etat.notes.map((n) => {
            const lu = lireDocument(n, etat.highlights, etat.annotations);
            const vu = ouvert === n.id;
            return (
              <li key={n.id} className="arch-doc" data-note={n.id}>
                <div className="arch-ligne">
                  <Icon name="edit" size={14} />
                  <div className="arch-titre"><strong>{n.titre || 'Document sans titre'}</strong><span className="hint">{date(n.createdAt)} · {lu.surl.length} surlignage{lu.surl.length > 1 ? 's' : ''} · {lu.textes.length} texte{lu.textes.length > 1 ? 's' : ''}</span></div>
                  <button type="button" className="btn sm ghost" onClick={() => setOuvert(vu ? null : n.id)}>{vu ? 'Fermer' : 'Lire'}</button>
                  <button type="button" className="btn sm" onClick={() => exporter(n)}><Icon name="upload" size={12} /> .md</button>
                  {n.pdfId && <button type="button" className="btn sm ghost" onClick={() => pdf(n)} title="Télécharger le PDF d’origine"><Icon name="filePdf" size={12} /> PDF</button>}
                </div>
                {vu && <pre className="arch-lecture">{versMarkdown(n, lu)}</pre>}
              </li>
            );
          })}
        </ul>
      )}
      {etat && etat.rangees > 0 && etat.notes.length > 0 && <div className="hint" style={{ marginTop: 10 }}>{etat.rangees} autre{etat.rangees > 1 ? 's' : ''} document{etat.rangees > 1 ? 's' : ''}, déjà rangé{etat.rangees > 1 ? 's' : ''} dans la Bibliothèque, y reste{etat.rangees > 1 ? 'nt' : ''}.</div>}
      {message && <div className="hint" style={{ marginTop: 10 }}>{message}</div>}
    </Card>
  );
}

/* ============================================================
   (16/10, lib/fichiersCours.js) FICHIERS DE COURS HORS MODÈLE — en LECTURE.
   Un cours = un document principal + au plus une fiche jumelle. Ce qui en sort n'est jamais
   effacé : fiche HTML EN PLUS d'un PDF, principal remplacé, fiche jumelle supprimée, anciennes
   versions de fiche jumelle. Ouvrir (nouvel onglet) ou télécharger ; rien ne s'écrit.
   ============================================================ */
export function CarteFichiersHorsModele() {
  const [liste, setListe] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let vivant = true;
    getAll('fiches').then((f) => fichiersHorsModele((f || []).filter((x) => !x.archive))).then((l) => { if (vivant) setListe(l); }).catch(() => vivant && setListe([]));
    return () => { vivant = false; };
  }, []);
  const ouvrir = async (x) => {
    const b = await getBlob(x.fileId);
    if (!b) { setMessage(`« ${x.nom} » n’est pas sur cet appareil.`); return; }
    const url = URL.createObjectURL(x.html ? new Blob([b], { type: 'text/html' }) : b);
    window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const telecharger = async (x) => {
    const b = await getBlob(x.fileId);
    if (!b) { setMessage(`« ${x.nom} » n’est pas sur cet appareil.`); return; }
    await deliverFile(b, x.nom || 'fichier');
  };
  return (
    <Card title="Archives — fichiers de cours" icon="archive" style={{ maxWidth: 820, marginBottom: 16 }}>
      <div id="reglages-archives-fichiers" className="hint" style={{ marginBottom: 12 }}>
        Un cours a un document principal et au plus une fiche jumelle. Les fichiers qui sortent de ce modèle (fiche HTML en plus d’un PDF, document principal remplacé, fiche jumelle supprimée, anciennes versions) restent ici, en lecture. Rien n’est effacé.
      </div>
      {!liste && <div className="hint">Lecture…</div>}
      {liste && !liste.length && <div className="arch-vide">Aucun fichier hors modèle.</div>}
      {liste && liste.length > 0 && (
        <ul className="arch-liste">
          {liste.map((x, i) => (
            <li key={x.fileId + ':' + i} className="arch-doc" data-fichier={x.fileId}>
              <div className="arch-ligne">
                <Icon name={x.html ? 'fileHtml' : 'filePdf'} size={14} />
                <div className="arch-titre"><strong>{x.nom}</strong><span className="hint">{x.quoi} · {x.cours}{x.le ? ` · ${new Date(x.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span></div>
                <button type="button" className="btn sm ghost" onClick={() => ouvrir(x)}><Icon name="ext" size={12} /> Ouvrir</button>
                <button type="button" className="btn sm" onClick={() => telecharger(x)}><Icon name="upload" size={12} /> Télécharger</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {message && <div className="hint" style={{ marginTop: 8 }}>{message}</div>}
    </Card>
  );
}
