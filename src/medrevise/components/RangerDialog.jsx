/* ============================================================
   MedRevise — « Ranger dans la Bibliothèque » : choisir Section › Matière ›
   Dossier pour un document de Prise de notes (juste après l'import, ou plus
   tard depuis sa carte). On peut CRÉER sur place une section, une matière ou
   un dossier (mêmes gestes que la Bibliothèque : ctx.addSource / addMatiere /
   addDossier). Ne range rien lui-même : rend { matiereId, dossierId } à
   l'appelant (voir lib/notes.js#rangerDansBibliotheque — même id, pas de copie).
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from './ui.jsx';
import { trierSections } from './useTreeOpenState.js';

const NOUVEAU = '__nouveau__';

export function RangerDialog({ ctx, titre, actuel = null, labelAnnuler = 'Annuler', onRanger, onClose }) {
  const { db } = ctx;
  const sections = trierSections((db.sources || []).filter((s) => !s.archive), ctx.stats);
  const matActuelle = actuel && (db.matieres || []).find((m) => m.id === actuel.matiereId);

  const [sectionId, setSectionId] = useState((matActuelle && matActuelle.sourceId) || (sections[0] && sections[0].id) || NOUVEAU);
  const [nomSection, setNomSection] = useState('');
  const matieresDe = (sid) => (db.matieres || []).filter((m) => m.sourceId === sid && !m.archive);
  const [matiereId, setMatiereId] = useState(() => (matActuelle ? matActuelle.id : ((matieresDe(sectionId)[0] || {}).id || NOUVEAU)));
  const [nomMatiere, setNomMatiere] = useState('');
  const [dossierId, setDossierId] = useState((actuel && actuel.dossierId) || '');
  const [nomDossier, setNomDossier] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);

  const matieres = sectionId === NOUVEAU ? [] : matieresDe(sectionId);
  // dossiers de la matière, dans l'ordre de l'arbre : dossier, puis ses sous-dossiers
  const dossiers = (() => {
    if (!matiereId || matiereId === NOUVEAU) return [];
    const tous = (db.dossiers || []).filter((d) => d.matiereId === matiereId);
    const ord = (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0);
    return tous.filter((d) => !d.parentId).sort(ord)
      .flatMap((d) => [{ d, niveau: 0 }, ...tous.filter((c) => c.parentId === d.id).sort(ord).map((c) => ({ d: c, niveau: 1 }))]);
  })();

  const choisirSection = (sid) => {
    setSectionId(sid);
    const m = sid === NOUVEAU ? [] : matieresDe(sid);
    setMatiereId((m[0] && m[0].id) || NOUVEAU);
    setDossierId('');
  };
  const choisirMatiere = (mid) => { setMatiereId(mid); setDossierId(''); };

  const nomDe = (liste, id) => ((liste.find((x) => x.id === id) || {}).nom || '');
  const chemin = [
    sectionId === NOUVEAU ? (nomSection.trim() || 'Nouvelle section') : nomDe(sections, sectionId),
    matiereId === NOUVEAU ? (nomMatiere.trim() || 'Nouvelle matière') : nomDe(matieres, matiereId),
    dossierId === NOUVEAU ? (nomDossier.trim() || 'Nouveau dossier') : (dossierId ? nomDe(dossiers.map((x) => x.d), dossierId) : null),
  ].filter(Boolean);

  const manque = (sectionId === NOUVEAU && !nomSection.trim()) || (matiereId === NOUVEAU && !nomMatiere.trim()) || (dossierId === NOUVEAU && !nomDossier.trim());
  const inchange = actuel && matiereId === actuel.matiereId && (dossierId || null) === (actuel.dossierId || null);

  const valider = async () => {
    if (occupe || manque) return;
    setOccupe(true); setErreur(null);
    try {
      // création dans l'ordre section → matière → dossier ; rien n'est créé si
      // l'élément existant a été choisi.
      const sid = sectionId === NOUVEAU ? await ctx.addSource(nomSection) : sectionId;
      const mid = matiereId === NOUVEAU ? await ctx.addMatiere(sid, nomMatiere) : matiereId;
      const did = dossierId === NOUVEAU ? await ctx.addDossier(mid, nomDossier) : (dossierId || null);
      await onRanger({ matiereId: mid, dossierId: did });
    } catch (e) {
      setErreur((e && e.message) || 'Le rangement a échoué.');
      setOccupe(false);
    }
  };

  const champ = { width: '100%', marginTop: 5 };
  return (
    <Modal title={actuel ? 'Modifier le rangement' : 'Ranger dans la Bibliothèque'} onClose={onClose} width="min(500px, 94vw)">
      <div className="ranger-dlg">
        <div className="hint" style={{ fontSize: 13, marginBottom: 14 }}>
          « {titre} » {actuel ? 'sera déplacé' : 'apparaîtra aussi dans la Bibliothèque et dans Réviser'} — <b>le même document</b>, pas une copie : annotations et surlignages sont partagés.
        </div>

        <label className="ranger-champ">
          <span>Section</span>
          <select className="imp-title" style={champ} value={sectionId} onChange={(e) => choisirSection(e.target.value)}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            <option value={NOUVEAU}>+ Nouvelle section…</option>
          </select>
          {sectionId === NOUVEAU && <input className="imp-title" style={champ} autoFocus placeholder="Nom de la section" value={nomSection} onChange={(e) => setNomSection(e.target.value)} />}
        </label>

        <label className="ranger-champ">
          <span>Matière</span>
          <select className="imp-title" style={champ} value={matiereId} onChange={(e) => choisirMatiere(e.target.value)}>
            {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            <option value={NOUVEAU}>+ Nouvelle matière…</option>
          </select>
          {matiereId === NOUVEAU && <input className="imp-title" style={champ} autoFocus={sectionId !== NOUVEAU} placeholder="Nom de la matière" value={nomMatiere} onChange={(e) => setNomMatiere(e.target.value)} />}
        </label>

        <label className="ranger-champ">
          <span>Dossier</span>
          <select className="imp-title" style={champ} value={dossierId} onChange={(e) => setDossierId(e.target.value)}>
            <option value="">Directement dans la matière</option>
            {dossiers.map(({ d, niveau }) => <option key={d.id} value={d.id}>{niveau ? '    ↳ ' : ''}{d.nom}</option>)}
            <option value={NOUVEAU}>+ Nouveau dossier…</option>
          </select>
          {dossierId === NOUVEAU && <input className="imp-title" style={champ} autoFocus placeholder="Nom du dossier" value={nomDossier} onChange={(e) => setNomDossier(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') valider(); }} />}
        </label>

        <div className="ranger-chemin"><Icon name="folder" size={13} /> {chemin.join(' › ')}</div>
        {erreur && <div className="hint" style={{ color: 'var(--danger, #e5484d)', marginTop: 8 }}>{erreur}</div>}

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose} disabled={occupe}>{labelAnnuler}</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={valider} disabled={occupe || manque || inchange}>
            {occupe ? 'Rangement…' : (actuel ? 'Déplacer ici' : 'Ranger ici')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
