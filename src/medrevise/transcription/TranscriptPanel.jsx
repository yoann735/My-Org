/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : interface.

   - BoutonTranscrire : le bouton de la barre d'outils du lecteur (devient un
     chrono rouge pendant la session) ;
   - FeuilleDemarrage : source audio + mots-clés + « Démarrer », rien d'autre ;
   - TranscriptPanel : l'onglet « Transcript » du panneau de droite (même
     emplacement que « Notions ») — session en direct, sessions passées en
     lecture, reprise d'une session interrompue.

   Le moteur (engine.js) vit hors de React : démonter ce panneau (changer
   d'onglet, replier, mode focus, quitter le lecteur) n'arrête JAMAIS la session.
   ============================================================ */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared/Icon.jsx';
import { ConfirmModal, ContextMenu, Modal } from '../components/ui.jsx';
import { useNiveauAudio, useTranscription } from './useTranscription.js';
import {
  demarrer, arreter, pause, reprendreApresPause, ajouterNote, modifierNote, supprimerNote,
  changerMotsCles, changerTaille, effacerErreur, sessionActive, lireEtat,
} from './engine.js';
import { listerMicros } from './audio.js';
import {
  decouperTermes, fusionnerTermes, compterMots, proposerTermes, regexTermes, decouperSurlignage,
  MAX_MOTS, SEUIL_CONSEIL, integrerCandidats, selectionner, basculerTerme, toutCocher, toutDecocher,
  ajouterManuels, retirerManuel, termesEnvoyables,
} from './keyterms.js';
import {
  sessionsDuCours, lireSession, cloreSession, supprimerSession, lireMotsClesMemo, ecrireMotsCles,
} from './sessions.js';
import { mmss, dureeLisible, lignesSession, texteSession, markdownSession, telecharger, nomFichier, copierTexte } from './exporter.js';
import { enregistrerLecteur } from './IndicateurGlobal.jsx';
import { synchroTranscripts } from './synchro.js';
import { actualiserCredits, tarifEffectif, fmtUsd } from './credits.js';
import { CarteCredits } from './Credits.jsx';
import '../../styles/transcription.css';

const CLE_MICRO = 'medrevise.transcription.micro';
const CLE_SOURCE = 'medrevise.transcription.source';
const CLE_TAILLE = 'medrevise.transcription.taille';
const TAILLES = [['s', 'A', 'Petit'], ['m', 'A', 'Moyen'], ['l', 'A', 'Grand']];
const lireLS = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage bloqué */ } };

/* ============================================================
   BOUTON DE LA BARRE D'OUTILS
   ============================================================ */
export function BoutonTranscrire({ courseId, onClick }) {
  const e = useTranscription();
  const ici = sessionActive() && e.courseId === courseId;
  const ailleurs = sessionActive() && e.courseId !== courseId;
  useEffect(() => enregistrerLecteur(courseId), [courseId]); // l'indicateur global s'efface
  return (
    <button type="button" className={'btn ghost sm trx-bouton' + (ici ? ' actif' : '') + (e.phase === 'paused' && ici ? ' pause' : '')}
      onClick={onClick}
      title={ici ? 'Transcription en cours — ouvrir le transcript' : ailleurs ? 'Une transcription tourne sur un autre cours' : 'Transcrire le cours en direct (Deepgram, français)'}>
      {ici ? <span className="trx-point" /> : <Icon name="mic" size={14} />}
      <span className="trx-bouton-lbl">{ici ? mmss(e.secondes) : 'Transcrire'}</span>
    </button>
  );
}

/* ============================================================
   FEUILLE DE DÉMARRAGE
   ============================================================ */
export function FeuilleDemarrage({ courseId, pdfDoc, reprendre = null, onClose, onDemarre }) {
  const [source, setSource] = useState(() => lireLS(CLE_SOURCE, 'micro'));
  const [micros, setMicros] = useState([]);
  const [micro, setMicro] = useState(() => lireLS(CLE_MICRO, 'default'));
  /* MOTS-CLÉS (v1.1) : `memo` = { manuels, decoches, connus } mémorisé avec le cours ;
     en reprise, la liste vient de la session reprise (manuels) et n'est pas mémorisée. */
  const [memo, setMemo] = useState(reprendre ? { manuels: reprendre.keyterms || [], decoches: [], connus: [] } : null);
  const [candidats, setCandidats] = useState(null); // null = calcul en cours
  const [saisie, setSaisie] = useState('');
  const [refus, setRefus] = useState(null); // message bref (limite atteinte)
  const [demarrage, setDemarrage] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let vivant = true;
    const memoP = reprendre ? Promise.resolve({ manuels: reprendre.keyterms || [], decoches: [], connus: [] }) : lireMotsClesMemo(courseId);
    const candP = reprendre ? Promise.resolve([]) : proposerTermes(pdfDoc).catch(() => []);
    Promise.all([memoP, candP]).then(([m, c]) => {
      if (!vivant) return;
      setCandidats(c);
      setMemo(reprendre ? m : integrerCandidats(m, c)); // nouveaux proposés : cochés dans la limite
    });
    listerMicros({ demanderAutorisation: true }).then((l) => { if (vivant) setMicros(l); });
    const surChangement = () => listerMicros().then((l) => vivant && setMicros(l));
    navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', surChangement);
    actualiserCredits(); // « avant démarrage » : valeur fraîche si la dernière a plus d'une minute
    return () => { vivant = false; navigator.mediaDevices && navigator.mediaDevices.removeEventListener && navigator.mediaDevices.removeEventListener('devicechange', surChangement); };
  }, [courseId, pdfDoc, reprendre]);

  const sel = useMemo(() => (memo ? selectionner(memo, candidats || []) : { lignes: [], envoyes: [], mots: 0, plein: false }), [memo, candidats]);

  // mémorisé avec le cours à chaque changement (pas en reprise)
  useEffect(() => {
    if (!memo || reprendre || candidats === null) return;
    ecrireMotsCles(courseId, { ...memo, terms: sel.envoyes }).catch(() => {});
  }, [memo, sel.envoyes, courseId, reprendre, candidats]);

  const signaler = (m) => { setRefus(m); setTimeout(() => setRefus(null), 3200); };
  const ajouterSaisie = () => {
    const n = decouperTermes(saisie);
    setSaisie('');
    if (!n.length || !memo) return memo;
    const { memo: m, refuses } = ajouterManuels(memo, candidats || [], n);
    setMemo(m);
    if (refuses.length) signaler(`Limite de ${MAX_MOTS} mots atteinte : « ${refuses.join(' », « ')} » non ajouté${refuses.length > 1 ? 's' : ''}. Décoche des termes pour faire de la place.`);
    return m;
  };
  const basculer = (l) => {
    if (l.manuel) { setMemo((m) => retirerManuel(m, l.terme)); return; }
    // hors limite (voulu mais sans place) : cliquer = vouloir le cocher → refusé, on le dit
    if (l.horsLimite) { signaler(`${MAX_MOTS}/${MAX_MOTS} — décoche un terme pour en ajouter un autre.`); return; }
    const m = basculerTerme(memo, candidats || [], l.terme);
    if (!m) { signaler(`${MAX_MOTS}/${MAX_MOTS} — décoche un terme pour en ajouter un autre.`); return; }
    setMemo(m);
  };

  const lancer = async () => {
    setDemarrage(true); setErreur(null);
    ecrireLS(CLE_SOURCE, source);
    if (source === 'micro') ecrireLS(CLE_MICRO, micro);
    const m = saisie.trim() ? ajouterSaisie() : memo;
    const termes = m ? selectionner(m, candidats || []).envoyes : [];
    const ok = await demarrer({
      courseId, source, deviceId: source === 'micro' ? micro : null, keyterms: termes,
      fontSize: lireLS(CLE_TAILLE, 'm'), reprendre,
    });
    setDemarrage(false);
    if (ok) { onDemarre && onDemarre(); onClose(); }
    else { setErreur(lireEtat().erreur); effacerErreur(); }
  };

  const manuels = sel.lignes.filter((l) => l.manuel);
  const proposes = sel.lignes.filter((l) => !l.manuel);
  const nbCoches = proposes.filter((l) => l.coche).length;

  return (
    <Modal title={reprendre ? 'Reprendre la transcription' : 'Transcrire le cours'} onClose={onClose} width="min(560px, 94vw)">
      <div className="trx-feuille">
        <div className="trx-champ">
          <div className="trx-etiquette">Source audio</div>
          <div className="seg">
            <button type="button" className={'seg-btn' + (source === 'micro' ? ' active' : '')} onClick={() => setSource('micro')}><Icon name="mic" size={13} /> Micro</button>
            <button type="button" className={'seg-btn' + (source === 'onglet' ? ' active' : '')} onClick={() => setSource('onglet')}><Icon name="ext" size={13} /> Onglet Chrome</button>
          </div>
          {source === 'micro' ? (
            <select className="trx-select" value={micros.some((m) => m.deviceId === micro) ? micro : (micros[0] && micros[0].deviceId) || ''} onChange={(e) => setMicro(e.target.value)}>
              {micros.length === 0 && <option value="default">Micro par défaut</option>}
              {micros.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label}</option>)}
            </select>
          ) : (
            <div className="hint trx-aide">Chrome va te demander quel onglet partager : choisis l’onglet du cours (YouTube, Teams web…) et laisse cochée « Partager aussi le son de l’onglet ». Pour Teams/Zoom en application, prends « Micro » avec un périphérique virtuel (BlackHole).</div>
          )}
        </div>

        <div className="trx-champ">
          <div className="trx-etiquette row spread">
            <span>Mots-clés du cours</span>
            <span className={'trx-compteur tnum' + (sel.mots >= MAX_MOTS ? ' alerte' : '')}>{sel.mots}/{MAX_MOTS}</span>
          </div>
          <textarea className="trx-saisie" rows={2} value={saisie} onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ajouterSaisie(); } }}
            placeholder={'Ajouter un terme : un par ligne ou séparés par des virgules (Entrée)\nex. canal de Havers, ostéoclaste'} />
          {sel.plein && <div className="trx-conseil plein"><Icon name="info" size={13} /> {MAX_MOTS}/{MAX_MOTS} — décoche pour en ajouter d’autres.</div>}
          {!sel.plein && sel.envoyes.length > SEUIL_CONSEIL && (
            <div className="trx-conseil"><Icon name="info" size={13} /> Deepgram conseille 20 à 50 termes bien choisis : au-delà, chaque terme pèse moins.</div>
          )}
          {refus && <div className="trx-conseil trop" role="status"><Icon name="alert" size={13} /> {refus}</div>}
          {manuels.length > 0 && (
            <div className="trx-puces">
              {manuels.map((l) => (
                <button key={l.terme} type="button" className={'trx-puce on' + (l.horsLimite ? ' limite' : '')} onClick={() => basculer(l)}
                  title={l.horsLimite ? 'Hors limite : ne sera pas envoyé' : 'Ajouté à la main — cliquer pour retirer'}>{l.terme} <Icon name="x" size={10} /></button>
              ))}
            </div>
          )}
          {candidats === null && pdfDoc && !reprendre && <div className="hint trx-aide">Lecture du PDF pour proposer des termes…</div>}
          {proposes.length > 0 && (
            <>
              <div className="trx-sous-etiquette row spread">
                <span>Proposés d’après le PDF · {nbCoches}/{proposes.length} cochés</span>
                <span className="row" style={{ gap: 4 }}>
                  <button type="button" className="trx-lien" onClick={() => setMemo((m) => toutCocher(m, candidats || []))}>Tout cocher</button>
                  <span className="hint">·</span>
                  <button type="button" className="trx-lien" onClick={() => setMemo((m) => toutDecocher(m, candidats || []))}>Tout décocher</button>
                </span>
              </div>
              <div className="trx-puces">
                {proposes.map((l) => (
                  <button key={l.terme} type="button" aria-pressed={l.coche}
                    className={'trx-puce' + (l.coche ? ' on' : '') + (!l.coche && sel.plein ? ' grise' : '')} onClick={() => basculer(l)}
                    title={l.coche ? 'Coché : envoyé à Deepgram — cliquer pour décocher' : 'Décoché — cliquer pour cocher'}>
                    <Icon name={l.coche ? 'check' : 'plus'} size={10} /> {l.terme}
                  </button>
                ))}
              </div>
            </>
          )}
          {candidats && candidats.length === 0 && pdfDoc && !reprendre && <div className="hint trx-aide">Pas de couche texte exploitable dans ce PDF : saisis les termes à la main.</div>}
        </div>

        {erreur && <div className="trx-erreur"><Icon name="alert" size={14} /> {erreur}</div>}

        <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn ghost sm" onClick={onClose}>Annuler</button>
          <button type="button" className="btn primary" onClick={lancer} disabled={demarrage || !memo}>
            {demarrage ? <span className="gen-spinner" style={{ width: 14, height: 14 }} /> : <Icon name="play" size={13} />} {reprendre ? 'Reprendre' : 'Démarrer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   LIGNES DU TRANSCRIPT
   ============================================================ */
const Ligne = memo(function Ligne({ l, rx, onNote, onSupprNote, focusNoteId, lecture }) {
  if (l.note) return <LigneNote l={l} onNote={onNote} onSuppr={onSupprNote} focus={focusNoteId === l.id} lecture={lecture} />;
  if (l.status === 'gap') return <div className="trx-coupure" data-id={l.id}><span>{mmss(l.t0)} · {l.text}</span></div>;
  const morceaux = decouperSurlignage(l.text, rx);
  return (
    <div className={'trx-ligne ' + l.status} data-id={l.id}>
      <span className="trx-t tnum" aria-hidden="true">{mmss(l.t0)}</span>
      <span className="trx-texte">
        {morceaux.map((m, i) => (m.cle ? <mark key={i} className="trx-cle">{m.t}</mark> : m.t))}
        {l.status === 'uncertain' && <span className="trx-incertain" title="Texte provisoire figé au moment d’une coupure : non validé par Deepgram"> incertain</span>}
      </span>
    </div>
  );
});

function LigneNote({ l, onNote, onSuppr, focus, lecture }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';
  });
  useEffect(() => { if (focus && ref.current) ref.current.focus(); }, [focus]);
  return (
    <div className="trx-note" data-id={l.id}>
      <span className="trx-t tnum" aria-hidden="true">{mmss(l.t0)}</span>
      {lecture ? <div className="trx-note-txt">{l.text || <span className="hint">Note vide</span>}</div> : (
        <textarea ref={ref} rows={1} className="trx-note-txt" value={l.text} placeholder="Ta note…"
          onChange={(e) => onNote(l.id, e.target.value)} />
      )}
      {!lecture && <button type="button" className="cd-ic trx-note-suppr" title="Supprimer la note" onClick={() => onSuppr(l.id)}><Icon name="x" size={11} /></button>}
    </div>
  );
}

/** Liste défilante avec auto-défilement « collé en bas » et reprise. */
function ListeTranscript({ lignes, keyterms, taille, live, onNote, onSupprNote, focusNoteId, plein }) {
  const ref = useRef(null);
  // en direct : collé en bas ; une session passée s'ouvre en haut, pour la relire
  const enBasRef = useRef(live);
  const [enBas, setEnBas] = useState(true);
  const [nouvelles, setNouvelles] = useState(0);
  const dejaVues = useRef(0);
  const rx = useMemo(() => regexTermes(keyterms), [keyterms]);
  const nbValidees = lignes.filter((l) => l.status !== 'interim').length;
  const dernierTexte = lignes.length ? lignes[lignes.length - 1].text : '';

  /* Seul un défilement VERS LE HAUT met l'auto-défilement en pause. Un panneau qui
     rétrécit (éditeur de mots-clés, note, fenêtre) éloigne aussi le bas sans que
     scrollTop ne bouge : ce n'est pas un geste de l'étudiant, on reste collé en bas. */
  const dernierHaut = useRef(0);
  const surDefilement = () => {
    const el = ref.current;
    if (!el) return;
    const bas = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    const monte = el.scrollTop < dernierHaut.current - 2;
    dernierHaut.current = el.scrollTop;
    if (bas) {
      if (!enBasRef.current) { enBasRef.current = true; setEnBas(true); }
      setNouvelles(0); dejaVues.current = nbValidees;
    } else if (monte && enBasRef.current) { enBasRef.current = false; setEnBas(false); }
  };
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { if (enBasRef.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (enBasRef.current) { el.scrollTop = el.scrollHeight; dernierHaut.current = el.scrollTop; dejaVues.current = nbValidees; }
    else setNouvelles(Math.max(0, nbValidees - dejaVues.current));
  }, [nbValidees, dernierTexte, taille, plein]);
  const reprendreDefilement = () => {
    const el = ref.current;
    enBasRef.current = true; setEnBas(true); setNouvelles(0); dejaVues.current = nbValidees;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div className="trx-liste-cadre">
      <div ref={ref} className={'trx-liste taille-' + taille} onScroll={surDefilement}>
        {lignes.length === 0 && (
          <div className="trx-vide">{live ? 'À l’écoute… le texte apparaît ici dès que le prof parle.' : 'Cette session ne contient aucun texte.'}</div>
        )}
        {lignes.map((l) => (
          <Ligne key={l.id} l={l} rx={rx} onNote={onNote} onSupprNote={onSupprNote} focusNoteId={focusNoteId} lecture={!live} />
        ))}
      </div>
      {live && !enBas && (
        <button type="button" className="trx-reprendre" onClick={reprendreDefilement}>
          ↓ Reprendre{nouvelles > 0 ? ` · ${nouvelles} nouvelle${nouvelles > 1 ? 's' : ''} ligne${nouvelles > 1 ? 's' : ''}` : ''}
        </button>
      )}
    </div>
  );
}

/* ============================================================
   ÉLÉMENTS DE LA BARRE DE SESSION
   ============================================================ */
function VuMetre() {
  const { niveau } = useNiveauAudio();
  return <span className="trx-vu" title="Niveau du son capté"><i style={{ transform: `scaleX(${Math.max(0.02, niveau)})` }} /></span>;
}

function Pastille({ e }) {
  const { silencieux } = useNiveauAudio();
  let couleur = 'vert', texte = 'En direct';
  if (e.phase === 'error') { couleur = 'rouge'; texte = 'Erreur'; }
  else if (e.phase === 'starting' || e.conn === 'connecting') { couleur = 'orange'; texte = 'Connexion…'; }
  else if (e.phase === 'stopping') { couleur = 'orange'; texte = 'Finalisation…'; }
  else if (e.conn === 'reconnecting') { couleur = 'orange'; texte = 'Reconnexion…'; }
  else if (e.phase === 'paused') { couleur = 'gris'; texte = 'En pause'; }
  else if (silencieux) { couleur = 'orange'; texte = 'Pas de son ?'; }
  return (
    <span className={'trx-pastille ' + couleur} title={e.erreurReseau || texte}>
      <i /> {texte}
    </span>
  );
}

function MenuCopie({ session, titre }) {
  const [menu, setMenu] = useState(null);
  const [copie, setCopie] = useState(false);
  const copier = async (horodatage) => {
    if (await copierTexte(texteSession(session, { horodatage }))) { setCopie(true); setTimeout(() => setCopie(false), 1600); }
  };
  return (
    <>
      <div className="trx-groupe">
        <button type="button" className="btn sm" onClick={() => copier(true)} title="Copier tout le transcript (texte brut, lignes horodatées)">
          <Icon name={copie ? 'check' : 'copy'} size={13} /> {copie ? 'Copié' : 'Copier tout'}
        </button>
        <button type="button" className="btn sm trx-chevron" title="Autres formats"
          onClick={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setMenu({ x: Math.min(r.left - 160, window.innerWidth - 240), y: r.bottom + 6 }); }}>
          <Icon name="chevD" size={12} />
        </button>
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: 'Copier sans horodatage', icon: 'copy', onClick: () => copier(false) },
          { label: 'Télécharger en .txt', icon: 'upload', onClick: () => telecharger(nomFichier(titre, session, 'txt'), texteSession(session), 'text/plain;charset=utf-8') },
          { label: 'Télécharger en .md', icon: 'upload', onClick: () => telecharger(nomFichier(titre, session, 'md'), markdownSession(session, titre), 'text/markdown;charset=utf-8') },
        ]} />
      )}
    </>
  );
}

function ChoixTaille({ taille, onTaille }) {
  return (
    <div className="trx-tailles" role="group" aria-label="Taille du texte">
      {TAILLES.map(([id, lbl, aide]) => (
        <button key={id} type="button" className={'trx-taille t-' + id + (taille === id ? ' actif' : '')} title={`Texte ${aide.toLowerCase()}`} onClick={() => onTaille(id)}>{lbl}</button>
      ))}
    </div>
  );
}

function EditeurMotsCles({ termes, onChange, onFermer }) {
  const [saisie, setSaisie] = useState('');
  const mots = compterMots(termes);
  const [refus, setRefus] = useState(null);
  const ajouter = () => {
    const n = decouperTermes(saisie);
    if (!n.length) return;
    const fusion = fusionnerTermes(termes, n);
    // jamais au-delà de la limite Deepgram : on n'envoie que ce qui tient, et on le dit
    const tient = termesEnvoyables(fusion);
    if (tient.length < fusion.length) { setRefus(`${MAX_MOTS}/${MAX_MOTS} — retire un terme pour en ajouter un autre.`); setTimeout(() => setRefus(null), 3200); }
    if (tient.length > termes.length) onChange(tient);
    setSaisie('');
  };
  return (
    <div className="trx-mc">
      <div className="row spread" style={{ marginBottom: 6 }}>
        <span className="trx-etiquette">Mots-clés · <span className={'tnum' + (mots > MAX_MOTS ? ' trop' : '')}>{mots}/{MAX_MOTS}</span></span>
        <button type="button" className="cd-ic" onClick={onFermer} title="Fermer"><Icon name="x" size={11} /></button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input className="trx-mc-champ" value={saisie} autoFocus placeholder="Ajouter un terme (Entrée)"
          onChange={(e) => setSaisie(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } if (e.key === 'Escape') onFermer(); }} />
        <button type="button" className="btn sm primary" onClick={ajouter} disabled={!saisie.trim()}><Icon name="plus" size={12} /></button>
      </div>
      {refus && <div className="trx-conseil trop" role="status"><Icon name="alert" size={12} /> {refus}</div>}
      {!refus && termes.length > SEUIL_CONSEIL && <div className="trx-conseil"><Icon name="info" size={12} /> Deepgram conseille 20 à 50 termes.</div>}
      <div className="trx-puces">
        {termes.map((t) => <button key={t} type="button" className="trx-puce on" onClick={() => onChange(termes.filter((x) => x !== t))} title="Retirer">{t} <Icon name="x" size={10} /></button>)}
      </div>
      <div className="hint" style={{ fontSize: 11.5, marginTop: 6 }}>Pris en compte immédiatement, sans couper la transcription.</div>
    </div>
  );
}

/* résumé de session : « Cette session : 1 h 48 ≈ 0,52 $ » (calcul local : durée ×
   tarif effectif connu à la fin de la session — voir engine.js#arreter) */
function ResumeCout({ session }) {
  if (!session || !session.endedAt) return null;
  const cout = session.coutUsd != null ? session.coutUsd : ((session.durationS || 0) / 3600) * tarifEffectif();
  return (
    <div className="trx-resume tnum" title="Durée transcrite × tarif effectif (estimation locale)">
      Cette session : {dureeLisible(session.durationS)} ≈ {fmtUsd(cout)}
    </div>
  );
}

function PiedSession({ session, titre }) {
  const n = session.segments.filter((s) => s.status !== 'gap').length;
  return (
    <div className="trx-pied">
      <MenuCopie session={session} titre={titre} />
      <span className="hint tnum" style={{ fontSize: 11.5 }}>{n} ligne{n > 1 ? 's' : ''}{session.notes.length ? ` · ${session.notes.length} note${session.notes.length > 1 ? 's' : ''}` : ''}</span>
    </div>
  );
}

/* ============================================================
   PANNEAU
   ============================================================ */
export function TranscriptPanel({ courseId, titre, onDemarrer, onReprendre }) {
  const e = useTranscription();
  const ici = e.courseId === courseId && (sessionActive() || e.phase === 'error');
  const [sessions, setSessions] = useState(null);
  const [interrompue, setInterrompue] = useState(null);
  const [lecture, setLecture] = useState(null); // session ouverte en lecture
  const [aSupprimer, setASupprimer] = useState(null);
  const [plein, setPlein] = useState(false);
  const [mcOuvert, setMcOuvert] = useState(false);
  const [focusNote, setFocusNote] = useState(null);
  const [taille, setTailleLocale] = useState(() => lireLS(CLE_TAILLE, 'm'));

  const recharger = useCallback(async () => {
    const l = await sessionsDuCours(courseId);
    setSessions(l);
    setInterrompue(sessionActive() && lireEtat().courseId === courseId ? null : (l.find((s) => !s.endedAt) || null));
  }, [courseId]);
  useEffect(() => { recharger(); }, [recharger, e.phase]);
  useEffect(() => { actualiserCredits(); }, [courseId]); // ouverture du cours (jamais pendant une session : voir credits.js)
  // synchro ciblée à l'ouverture du panneau : les sessions faites sur un autre appareil
  useEffect(() => {
    let vivant = true;
    synchroTranscripts().then((r) => {
      if (!vivant || !r || !(r.recus || r.supprimes)) return;
      recharger();
      // la session ouverte en lecture a pu être modifiée ou supprimée sur un autre appareil
      setLecture((l) => { if (l) lireSession(l.id).then((s) => { if (vivant) setLecture(s || null); }); return l; });
    });
    return () => { vivant = false; };
  }, [recharger]);
  // fin de session : on l'ouvre aussitôt en lecture
  useEffect(() => {
    if (e.phase === 'idle' && e.derniereFinie && e.courseId === courseId) {
      lireSession(e.derniereFinie).then((s) => s && setLecture(s));
    }
  }, [e.phase, e.derniereFinie, e.courseId, courseId]);

  useEffect(() => {
    if (!plein) return undefined;
    const k = (ev) => { if (ev.key === 'Escape') setPlein(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [plein]);

  const choisirTaille = (t) => { setTailleLocale(t); ecrireLS(CLE_TAILLE, t); if (ici) changerTaille(t); };
  const nouvelleNote = () => { const id = ajouterNote(); setFocusNote(id); };

  /* ---- erreur FATALE en cours de session (clé révoquée, crédits épuisés, micro
     débranché…) : le message, le texte acquis, et rien qui laisse croire que ça tourne.
     « Fermer » ramène à l'accueil, où la session est proposée en reprise. ---- */
  if (ici && e.phase === 'error') {
    return (
      <div className="trx-panneau">
        <CarteCredits compact />
        <div className="trx-erreur">
          <Icon name="alert" size={14} /> <span style={{ flex: 1 }}>{e.erreur}</span>
          <button type="button" className="btn sm" onClick={effacerErreur}>Fermer</button>
        </div>
        {e.session && e.session.segments.length > 0 && (
          <>
            <div className="hint" style={{ fontSize: 12, margin: '8px 0 4px' }}>Le texte ci-dessous est enregistré : la session sera proposée en reprise.</div>
            <ListeTranscript lignes={lignesSession(e.session)} keyterms={e.session.keyterms} taille={taille} live={false} plein={false} />
          </>
        )}
      </div>
    );
  }

  /* ---- session EN DIRECT sur CE cours ---- */
  if (ici && e.session) {
    const lignes = lignesSession(e.session, e.interim);
    const corps = (
      <div className={'trx-panneau' + (plein ? ' plein' : '')}>
        <CarteCredits compact />
        <div className="trx-barre">
          <Pastille e={e} />
          <span className="trx-chrono tnum">{mmss(e.secondes)}</span>
          <VuMetre />
          <span style={{ flex: 1 }} />
          {e.phase === 'paused'
            ? <button type="button" className="btn sm primary" onClick={reprendreApresPause}><Icon name="play" size={12} /> Reprendre</button>
            : <button type="button" className="btn sm" onClick={pause} disabled={e.phase !== 'live'} title="Pause : plus rien n’est envoyé, la connexion reste ouverte"><span className="trx-ic-pause" /> Pause</button>}
          <button type="button" className="btn sm trx-stop" onClick={() => arreter()} disabled={e.phase === 'stopping'} title="Arrêter et enregistrer la session"><span className="trx-ic-stop" /> Arrêter</button>
        </div>
        {e.erreurReseau && e.conn === 'reconnecting' && <div className="trx-info"><Icon name="refresh" size={12} /> {e.erreurReseau}</div>}
        <div className="trx-barre secondaire">
          <button type="button" className="btn sm" onClick={nouvelleNote} title="Insérer une note personnelle à l’instant présent"><Icon name="plus" size={12} /> Note</button>
          <button type="button" className={'btn sm' + (mcOuvert ? ' actif' : '')} onClick={() => setMcOuvert((v) => !v)} title="Mots-clés envoyés à Deepgram">
            <Icon name="tag" size={12} /> {e.session.keyterms.length}
          </button>
          <span style={{ flex: 1 }} />
          <ChoixTaille taille={taille} onTaille={choisirTaille} />
          <button type="button" className="icon-btn sm" onClick={() => setPlein((v) => !v)} title={plein ? 'Quitter le plein écran (Échap)' : 'Plein écran (lecture à distance)'}><Icon name={plein ? 'x' : 'maximize'} size={13} /></button>
        </div>
        {mcOuvert && <EditeurMotsCles termes={e.session.keyterms} onChange={changerMotsCles} onFermer={() => setMcOuvert(false)} />}
        <ListeTranscript lignes={lignes} keyterms={e.session.keyterms} taille={taille} live plein={plein}
          onNote={modifierNote} onSupprNote={supprimerNote} focusNoteId={focusNote} />
        <PiedSession session={e.session} titre={titre} />
      </div>
    );
    return plein ? createPortal(corps, document.body) : corps;
  }

  /* ---- ancienne session en LECTURE ---- */
  if (lecture) {
    const corps = (
      <div className={'trx-panneau' + (plein ? ' plein' : '')}>
        <CarteCredits compact />
        <div className="trx-barre">
          <button type="button" className="btn ghost sm" onClick={() => { setLecture(null); setPlein(false); }}><Icon name="chevL" size={13} /> Sessions</button>
          <span className="trx-titre-lecture">{dateCourte(lecture.startedAt)} · {dureeLisible(lecture.durationS)}</span>
          <span style={{ flex: 1 }} />
        </div>
        <div className="trx-barre secondaire">
          <span style={{ flex: 1 }} />
          <ChoixTaille taille={taille} onTaille={choisirTaille} />
          <button type="button" className="icon-btn sm" onClick={() => setPlein((v) => !v)} title={plein ? 'Quitter le plein écran (Échap)' : 'Plein écran'}><Icon name={plein ? 'x' : 'maximize'} size={13} /></button>
        </div>
        <ResumeCout session={lecture} />
        <ListeTranscript lignes={lignesSession(lecture)} keyterms={lecture.keyterms || []} taille={taille} live={false} plein={plein} />
        <PiedSession session={lecture} titre={titre} />
      </div>
    );
    return plein ? createPortal(corps, document.body) : corps;
  }

  /* ---- accueil : démarrer, reprendre, sessions passées ---- */
  const ailleurs = sessionActive() && e.courseId !== courseId;
  return (
    <div className="trx-accueil">
      <CarteCredits />
      {ailleurs ? (
        <div className="trx-info"><Icon name="mic" size={13} /> Une transcription tourne sur un autre cours ({mmss(e.secondes)}).
          <button type="button" className="btn sm" onClick={() => arreter()}>Arrêter</button></div>
      ) : (
        <button type="button" className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onDemarrer}>
          <Icon name="mic" size={14} /> Démarrer une transcription
        </button>
      )}
      {interrompue && !ailleurs && (
        <div className="trx-reprise">
          <div className="trx-reprise-titre"><Icon name="alert" size={13} /> Session interrompue</div>
          <div className="hint">{dateCourte(interrompue.startedAt)} · {interrompue.segments.length} lignes enregistrées, rien n’est perdu.</div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button type="button" className="btn sm primary" onClick={() => onReprendre(interrompue)}><Icon name="play" size={12} /> Reprendre</button>
            <button type="button" className="btn sm" onClick={() => setLecture(interrompue)}>Lire</button>
            <button type="button" className="btn sm ghost" onClick={async () => { await cloreSession(interrompue); recharger(); }}>Terminer</button>
          </div>
        </div>
      )}
      <div className="trx-sous-etiquette" style={{ marginTop: 16 }}>Sessions de ce cours</div>
      {sessions && sessions.filter((s) => s.endedAt).length === 0 && <div className="hint" style={{ padding: '6px 2px' }}>Aucune session pour l’instant.</div>}
      {(sessions || []).filter((s) => s.endedAt).map((s) => (
        <div key={s.id} className="trx-session" role="button" tabIndex={0} onClick={() => setLecture(s)} onKeyDown={(ev) => { if (ev.key === 'Enter') setLecture(s); }}>
          <Icon name="mic" size={13} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="trx-session-date">{dateCourte(s.startedAt)}</div>
            <div className="hint" style={{ fontSize: 11.5 }}>{dureeLisible(s.durationS)} · {s.segments.filter((x) => x.status !== 'gap').length} lignes{s.notes.length ? ` · ${s.notes.length} note${s.notes.length > 1 ? 's' : ''}` : ''}</div>
          </div>
          <button type="button" className="cd-ic" title="Supprimer cette session" onClick={(ev) => { ev.stopPropagation(); setASupprimer(s); }}><Icon name="trash" size={12} /></button>
        </div>
      ))}
      {aSupprimer && (
        <ConfirmModal title="Supprimer cette session ?" danger confirmLabel="Supprimer"
          body={`Transcript du ${dateCourte(aSupprimer.startedAt)} (${dureeLisible(aSupprimer.durationS)}). Une copie de sauvegarde est gardée sur cet appareil.`}
          onConfirm={async () => { await supprimerSession(aSupprimer); setASupprimer(null); recharger(); }}
          onCancel={() => setASupprimer(null)} />
      )}
    </div>
  );
}

function dateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const j = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return j.charAt(0).toUpperCase() + j.slice(1) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
