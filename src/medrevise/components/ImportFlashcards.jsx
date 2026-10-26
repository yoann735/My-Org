/* ============================================================
   MedRevise — « IMPORTER » DES FLASHCARDS DEPUIS LE PANNEAU (17/10, lib/importFlashcards.js,
   docs/compte-rendu-import-tableau-nettete.md). Panneau d'une fiche › Exercices › Flashcards,
   à côté de « + Ajouter ».
   - un fichier .json (ou .zip : le JSON + ses images) OU un collage direct ;
   - validation stricte : un message par carte (numéro, ligne du JSON, champ) — rien n'est importé
     tant qu'il reste une erreur ;
   - aperçu : nombre de cartes par type, 3 exemples, doublons (recto identique dans la fiche :
     « Ignorer » / « Importer quand même »), date de départ (défaut : aujourd'hui) ;
   - « Voir le format attendu » : l'exemple complet et commenté (copié d'un clic, réimportable tel
     quel) et le prompt de génération (Réglages › Prompts) complété des types en plus.
   Les cartes importées entrent dans les J exactement comme des cartes créées à la main.
   (26/10) Un .zip de l'export complet (components/ExportFlashcards.jsx) s'importe ici tel quel ; ses cartes portent leur
   progression (bloc « progress ») : ignorée par défaut, reprise avec « Reprendre aussi la progression ».
   ============================================================ */
import { useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Modal } from './ui.jsx';
import { analyserImport, importerCartes, LIBELLES_SORTES, exempleJSON, COMPLEMENT_PROMPT } from '../lib/importFlashcards.js';
import { DEFAULT_PROMPTS } from '../lib/coursePrompts.js';
import { todayISO } from '../lib/sm2.js';
import '../../styles/import-flashcards.css';

const court = (s, n = 90) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

function BoutonCopie({ texte, libelle, data }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn sm" data-copier={data} onClick={async () => {
      try { await navigator.clipboard.writeText(texte); } catch (e) { /* presse-papiers refusé : le texte reste sélectionnable */ }
      setOk(true); setTimeout(() => setOk(false), 1800);
    }}><Icon name={ok ? 'check' : 'copy'} size={13} /> {ok ? 'Copié' : libelle}</button>
  );
}

export function ImportFlashcards({ ctx, ficheId, onFermer }) {
  const [onglet, setOnglet] = useState('coller'); // coller | fichier
  const [texte, setTexte] = useState('');
  const [nomFichier, setNomFichier] = useState(null);
  const [analyse, setAnalyse] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [doublons, setDoublons] = useState('ignorer');
  const [depart, setDepart] = useState(todayISO());
  const [progression, setProgression] = useState(false);
  const [fait, setFait] = useState(null);
  const [format, setFormat] = useState(false);
  const entree = useRef(null);
  const existantes = () => (ctx.db.questions || []).filter((q) => q.ficheId === ficheId);

  const analyser = async (p) => {
    setEnCours(true); setFait(null);
    try { setAnalyse(await analyserImport({ ...p, existantes: existantes() })); } finally { setEnCours(false); }
  };
  const importer = async () => {
    setEnCours(true);
    try {
      const r = await importerCartes({ ficheId, analyse, startDate: depart, doublons, progression });
      await ctx.reload();
      setFait({ ...r, progression: progression && analyse.avecProgression > 0 }); setAnalyse(null); setTexte(''); setNomFichier(null); setProgression(false);
    } catch (e) { setFait({ erreur: e.message }); } finally { setEnCours(false); }
  };
  const prompt = ((ctx.promptOverrides && ctx.promptOverrides.biologie) || DEFAULT_PROMPTS.biologie) + COMPLEMENT_PROMPT;
  const a = analyse;
  const n = a && a.ok ? a.cartes.length - (doublons === 'ignorer' ? a.doublons : 0) : 0;

  return (
    <Modal title="Importer des flashcards" onClose={() => { if (!enCours) onFermer(); }} width="min(680px, 96vw)">
      <div className="ifc" data-import-flashcards="">
        <div className="row spread" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="seg ifc-onglets" role="tablist">
            <button type="button" role="tab" aria-selected={onglet === 'coller'} className={'seg-btn' + (onglet === 'coller' ? ' active' : '')} onClick={() => setOnglet('coller')}>Coller le JSON</button>
            <button type="button" role="tab" aria-selected={onglet === 'fichier'} className={'seg-btn' + (onglet === 'fichier' ? ' active' : '')} onClick={() => setOnglet('fichier')}>Fichier .json / .zip</button>
          </div>
          <button type="button" className="btn ghost sm" data-act="format" aria-expanded={format} onClick={() => setFormat((v) => !v)}><Icon name="info" size={13} /> {format ? 'Masquer le format' : 'Voir le format attendu'}</button>
        </div>

        {format && (
          <div className="ifc-format" data-format="">
            <div className="ifc-format-tete"><b>Exemple complet</b> <span className="hint">— chaque type de carte ; les clés « _… » sont des commentaires. Copié tel quel, il se réimporte sans erreur.</span></div>
            <pre className="ifc-pre" data-exemple="">{exempleJSON()}</pre>
            <div className="row" style={{ gap: 8 }}>
              <BoutonCopie texte={exempleJSON()} libelle="Copier l’exemple" data="exemple" />
              <button type="button" className="btn ghost sm" onClick={() => { setOnglet('coller'); setTexte(exempleJSON()); analyser({ texte: exempleJSON() }); }}>Essayer cet exemple</button>
            </div>
            <div className="ifc-format-tete" style={{ marginTop: 12 }}><b>Prompt de génération</b> <span className="hint">— celui de Réglages › Prompts (biologie), complété des types de cartes ci-dessus. À coller dans un chat IA avec ton cours.</span></div>
            <pre className="ifc-pre ifc-prompt">{prompt}</pre>
            <BoutonCopie texte={prompt} libelle="Copier le prompt" data="prompt" />
          </div>
        )}

        {onglet === 'coller' ? (
          <div className="ifc-entree">
            <textarea className="imp-title ifc-texte" value={texte} rows={7} placeholder={'{ "items": [ { "type": "flashcard", "recto": "…", "verso": "…" } ] }'}
              onChange={(e) => { setTexte(e.target.value); setAnalyse(null); }} data-champ="json" />
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn sm primary" data-act="analyser" disabled={!texte.trim() || enCours} onClick={() => analyser({ texte })}><Icon name="search" size={13} /> Vérifier</button>
            </div>
          </div>
        ) : (
          <div className="ifc-entree ifc-depot"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { setNomFichier(f.name); analyser({ fichier: f }); } }}>
            <input ref={entree} type="file" accept=".json,application/json,.zip,application/zip" style={{ display: 'none' }} data-champ="fichier"
              onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) { setNomFichier(f.name); analyser({ fichier: f }); } }} />
            <Icon name="upload" size={18} />
            <div>{nomFichier ? <b>{nomFichier}</b> : 'Dépose un fichier .json (ou un .zip : le JSON et ses images)'}</div>
            <button type="button" className="btn sm" onClick={() => entree.current && entree.current.click()}>Choisir un fichier…</button>
          </div>
        )}

        {enCours && <div className="hint ifc-etat"><span className="gen-spinner" style={{ width: 16, height: 16 }} /> {a ? 'Import…' : 'Vérification…'}</div>}
        {a && !a.ok && <div className="fj-erreur ifc-erreur-globale" role="alert">{a.erreur}</div>}
        {a && a.ok && (
          <div className="ifc-apercu" data-apercu="">
            {a.erreurs.length > 0 && (
              <div className="ifc-erreurs" role="alert">
                <b>{a.erreurs.length} erreur{a.erreurs.length > 1 ? 's' : ''} — rien n’est importé tant qu’il en reste :</b>
                <ul>{a.erreurs.map((e) => <li key={e.index} data-erreur={e.index}>Carte {e.index}{e.ligne ? ` (ligne ${e.ligne})` : ''} : {e.message}</li>)}</ul>
              </div>
            )}
            {a.autres.length > 0 && (
              <div className="hint ifc-autres">{a.autres.length} item{a.autres.length > 1 ? 's' : ''} d’un autre type ({[...new Set(a.autres.map((x) => x.type))].join(', ')}) laissé{a.autres.length > 1 ? 's' : ''} de côté : ici, seules les flashcards s’importent (les QCM se collent par « ⋯ › Coller du JSON »).</div>
            )}
            <div className="ifc-compte" data-compte="">
              <b className="tnum">{a.cartes.length} carte{a.cartes.length > 1 ? 's' : ''}</b>
              {Object.entries(a.compte).filter(([, v]) => v).map(([k, v]) => <span key={k} className="ifc-puce" data-sorte={k}>{LIBELLES_SORTES[k]} <span className="tnum">{v}</span></span>)}
            </div>
            {a.cartes.length > 0 && (
              <div className="ifc-exemples">
                {a.cartes.slice(0, 3).map((c) => (
                  <div key={c.index} className="ifc-exemple">
                    <span className="ifc-sorte">{LIBELLES_SORTES[c.sorte]}</span>
                    <div className="ifc-recto">{court(c.carte.recto)}</div>
                    <div className="ifc-verso">{court(c.carte.verso, 120)}</div>
                  </div>
                ))}
              </div>
            )}
            {a.doublons > 0 && (
              <div className="ifc-doublons" data-doublons={a.doublons}>
                <div><b>{a.doublons} doublon{a.doublons > 1 ? 's' : ''}</b> : recto identique à une carte de cette fiche — {a.cartes.filter((c) => c.doublon).slice(0, 3).map((c) => `« ${court(c.carte.recto, 50)} »`).join(', ')}{a.doublons > 3 ? '…' : ''}</div>
                <div className="row" style={{ gap: 14 }}>
                  <label><input type="radio" name="ifc-doublons" checked={doublons === 'ignorer'} onChange={() => setDoublons('ignorer')} data-doublons-choix="ignorer" /> Ignorer</label>
                  <label><input type="radio" name="ifc-doublons" checked={doublons === 'importer'} onChange={() => setDoublons('importer')} data-doublons-choix="importer" /> Importer quand même</label>
                </div>
              </div>
            )}
            {a.avecProgression > 0 && (
              <label className="ifc-progression" title="Chaque carte de cet export porte sa progression (catégorie, dates, J, état FSRS, historique). Décoché : les cartes repartent de zéro à la date de départ.">
                <input type="checkbox" checked={progression} onChange={(e) => setProgression(e.target.checked)} data-champ="progression" /> Reprendre aussi la progression <span className="hint tnum">({a.avecProgression} carte{a.avecProgression > 1 ? 's' : ''})</span>
              </label>
            )}
            <div className="row spread ifc-pied" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="ifc-date">Date de départ <input type="date" className="input" value={depart} onChange={(e) => setDepart(e.target.value || todayISO())} data-champ="depart" /></label>
              <button type="button" className="btn primary" data-act="importer" disabled={enCours || a.erreurs.length > 0 || n === 0} onClick={importer}>
                <Icon name="upload" size={14} /> Importer {n} carte{n > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
        {fait && !fait.erreur && <div className="ifc-fait" role="status" data-fait={fait.count}><Icon name="check" size={14} /> {fait.count} carte{fait.count > 1 ? 's' : ''} importée{fait.count > 1 ? 's' : ''} dans cette fiche — {fait.progression ? 'avec leur progression' : <>dans les J à partir du {new Date(depart + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</>}{fait.ignores ? ` (${fait.ignores} doublon${fait.ignores > 1 ? 's' : ''} ignoré${fait.ignores > 1 ? 's' : ''})` : ''}.</div>}
        {fait && fait.erreur && <div className="fj-erreur" role="alert">{fait.erreur}</div>}
      </div>
    </Modal>
  );
}
