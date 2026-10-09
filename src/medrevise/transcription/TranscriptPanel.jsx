/* ============================================================
   MedRevise — TRANSCRIPTION EN DIRECT : interface.

   - BadgeTranscript : point rouge pulsant (v1.3 : sans chrono) sur le segment « Transcript » du
     panneau pendant une session (le bouton « Transcrire » a quitté la barre du
     PDF le 05/10 : il vit en tête du mode Transcript) ;
   - FeuilleDemarrage : source audio + mots-clés + « Démarrer », rien d'autre ;
   - TranscriptPanel : l'onglet « Transcript » du panneau de droite (même
     emplacement que « Notions ») — session en direct, sessions passées en
     lecture, reprise d'une session interrompue.

   Le moteur (engine.js) vit hors de React : démonter ce panneau (changer
   d'onglet, replier, mode focus, quitter le lecteur) n'arrête JAMAIS la session.
   ============================================================ */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDejaVisible } from '../components/modeVisible.js';
import { Icon } from '../../shared/Icon.jsx';
import { ConfirmModal, ContextMenu, Modal } from '../components/ui.jsx';
import { useNiveauAudio, useTranscription } from './useTranscription.js';
import {
  demarrer, arreter, pause, reprendreApresPause, ajouterNote, modifierNote, supprimerNote,
  changerMotsCles, changerTaille, effacerErreur, sessionActive, lireEtat, changerSource, renommerIntervenantDirect,
} from './engine.js';
import { listerMicros, choisirAutomatique, estVirtuel, sonderNiveau, memoriserMicroValide } from './audio.js';
import {
  decouperTermes, fusionnerTermes, compterMots, proposerTermes, regexTermes, decouperSurlignage,
  MAX_MOTS, SEUIL_CONSEIL, integrerCandidats, selectionner, basculerTerme, toutCocher, toutDecocher,
  ajouterManuels, retirerManuel, termesEnvoyables,
} from './keyterms.js';
import {
  sessionsDuCours, lireSession, cloreSession, supprimerSession, lireMotsClesMemo, ecrireMotsCles, ecrireSession,
} from './sessions.js';
import {
  mmss, dureeLisible, lignesSession, texteSession, markdownSession, telecharger, nomFichier, copierTexte,
  avecIntervenants, nomIntervenant, intervenantsDe, passeFiltre,
} from './exporter.js';
import { synchroTranscripts } from './synchro.js';
import { actualiserCredits, tarifEffectif, fmtUsd, SURCOUT_DIARISATION_H } from './credits.js';
import { CarteCredits } from './Credits.jsx';
import '../../styles/transcription.css';

const CLE_CHOIX = 'medrevise.transcription.source.choix'; // 'auto' | 'onglet' | deviceId (05/10)
const RAISONS = {
  bouclage: 'périphérique de bouclage détecté',
  dernier: 'dernière entrée utilisée avec du son',
  defaut: 'entrée par défaut du système',
  absent: 'débranchée',
};
const CLE_SOURCE = 'medrevise.transcription.source';
const CLE_TAILLE = 'medrevise.transcription.taille';
const TAILLES = [['s', 'A', 'Petit'], ['m', 'A', 'Moyen'], ['l', 'A', 'Grand']];
const lireLS = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage bloqué */ } };

/* ============================================================
   BOUTON DE LA BARRE D'OUTILS
   ============================================================ */
/** Badge du segment « Transcript » du panneau : point rouge pulsant pendant une
 *  session de CE cours (gris fixe en pause). Rien sinon. */
export function BadgeTranscript({ courseId }) {
  const e = useTranscription();
  if (!(sessionActive() && e.courseId === courseId)) return null;
  /* v1.3 : point seul, sans chiffre — le chrono n'est affiché qu'une fois, dans la ligne
     « En direct » du mode Transcript. Rouge pulsant en direct, gris fixe en pause. */
  const pause = e.phase === 'paused';
  return <span className={'pm-live' + (pause ? ' pause' : '')} role="img" aria-label={pause ? 'Transcription en pause' : 'Transcription en cours'} title={pause ? 'Transcription en pause' : 'Transcription en cours'}><i /></span>;
}

/** Nombre de lignes validées de la session en cours sur CE cours (null hors session). */
export function useLignesDirect(courseId) {
  const e = useTranscription();
  if (!(sessionActive() && e.courseId === courseId && e.session)) return null;
  return e.session.segments.filter((x) => x.status !== 'gap').length;
}

/** TABLETTE (07/10) : poignée du panneau replié — point rouge de session.
 *  09/10 (docs/compte-rendu-pdfreader-v2.md) : plus de compteur « +N » ; à côté du point, les
 *  3 derniers mots VALIDÉS (segments « final »), en gris discret, tronqués à ~24 caractères par
 *  la gauche, qui glissent quand de nouveaux mots arrivent. */
export const derniersMots = (segments, n = 3, max = 24) => {
  const fin = [...(segments || [])].reverse().find((x) => x.status === 'final' && x.text && x.text.trim());
  if (!fin) return '';
  const t = fin.text.trim().split(/\s+/).slice(-n).join(' ');
  return t.length > max ? '…' + t.slice(t.length - max + 1).replace(/^\S*\s/, '') : t;
};
export function ResumeReplie({ courseId }) {
  const e = useTranscription();
  const n = useLignesDirect(courseId);
  if (n == null) return null;
  const mots = derniersMots(e.session && e.session.segments);
  return (
    <span className="tab-resume" aria-live="off">
      <span className={'pm-live' + (e.phase === 'paused' ? ' pause' : '')} aria-hidden="true"><i /></span>
      {mots && <span className="tab-resume-mots" title="Derniers mots transcrits"><span key={mots}>{mots}</span></span>}
    </span>
  );
}

/* ============================================================
   FEUILLE DE DÉMARRAGE
   ============================================================ */
export function FeuilleDemarrage({ courseId, pdfDoc, ocrPages = null, texteEnPlus = '', reprendre = null, onClose, onDemarre }) {
  /* SOURCE (05/10) : 'auto' (défaut) | 'onglet' | deviceId — mémorisée par appareil.
     Reprise de l'ancien réglage (source + micro) au premier passage. */
  const [choix, setChoixBrut] = useState(() => {
    const c = lireLS(CLE_CHOIX, null);
    if (c) return c;
    return lireLS(CLE_SOURCE, 'micro') === 'onglet' ? 'onglet' : 'auto';
  });
  const setChoix = (c) => { setChoixBrut(c); ecrireLS(CLE_CHOIX, c); };
  const [micros, setMicros] = useState([]);
  const [guide, setGuide] = useState(false);
  const selectRef = useRef(null);
  const source = choix === 'onglet' ? 'onglet' : 'micro';
  const retenu = choix === 'onglet' ? null
    : choix === 'auto' ? choisirAutomatique(micros)
    : (micros.find((m) => m.deviceId === choix) || { deviceId: choix, label: 'Entrée débranchée', raison: 'absent' });
  const sonde = useSonde(source === 'micro' && micros.length ? retenu : null);
  /* MOTS-CLÉS (v1.1) : `memo` = { manuels, decoches, connus } mémorisé avec le cours ;
     en reprise, la liste vient de la session reprise (manuels) et n'est pas mémorisée. */
  const [memo, setMemo] = useState(reprendre ? { manuels: reprendre.keyterms || [], decoches: [], connus: [] } : null);
  const [candidats, setCandidats] = useState(null); // null = calcul en cours
  const [saisie, setSaisie] = useState('');
  const [refus, setRefus] = useState(null); // message bref (limite atteinte)
  const [demarrage, setDemarrage] = useState(false);
  const [erreur, setErreur] = useState(null);
  // DIARISATION (08/10) : option payante de Deepgram, OFF par défaut (jamais mémorisée)
  const [diarize, setDiarize] = useState(() => !!(reprendre && reprendre.diarize));

  useEffect(() => {
    let vivant = true;
    const memoP = reprendre ? Promise.resolve({ manuels: reprendre.keyterms || [], decoches: [], connus: [] }) : lireMotsClesMemo(courseId);
    const candP = reprendre ? Promise.resolve([]) : proposerTermes(pdfDoc, { ocrPages, texteEnPlus }).catch(() => []);
    Promise.all([memoP, candP]).then(([m, c]) => {
      if (!vivant) return;
      setCandidats(c);
      setMemo(reprendre ? m : integrerCandidats(m, c)); // nouveaux proposés : cochés dans la limite
    });
    listerMicros({ demanderAutorisation: true }).then((l) => { if (vivant) setMicros(l.length ? l : [{ deviceId: 'default', label: 'Micro par défaut' }]); });
    const surChangement = () => listerMicros().then((l) => vivant && setMicros(l));
    navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', surChangement);
    actualiserCredits(); // « avant démarrage » : valeur fraîche si la dernière a plus d'une minute
    return () => { vivant = false; navigator.mediaDevices && navigator.mediaDevices.removeEventListener && navigator.mediaDevices.removeEventListener('devicechange', surChangement); };
  }, [courseId, pdfDoc, reprendre, texteEnPlus]);

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
    const deviceId = retenu ? retenu.deviceId : null;
    const avecSon = sonde.verdict === 'son';
    sonde.arreter(); // libère l'entrée avant que le moteur ne l'ouvre
    const m = saisie.trim() ? ajouterSaisie() : memo;
    const termes = m ? selectionner(m, candidats || []).envoyes : [];
    const ok = await demarrer({
      courseId, source, deviceId: source === 'micro' ? deviceId : null, keyterms: termes,
      fontSize: lireLS(CLE_TAILLE, 'm'), reprendre, diarize,
    });
    setDemarrage(false);
    if (ok) { if (source === 'micro' && avecSon) memoriserMicroValide(deviceId); onDemarre && onDemarre(); onClose(); }
    else { setErreur(lireEtat().erreur); effacerErreur(); }
  };

  const manuels = sel.lignes.filter((l) => l.manuel);
  const proposes = sel.lignes.filter((l) => !l.manuel);
  const nbCoches = proposes.filter((l) => l.coche).length;

  return (
    <Modal title={reprendre ? 'Reprendre la transcription' : 'Transcrire le cours'} onClose={onClose} width="min(560px, 94vw)">
      <div className="trx-feuille">
        {guide ? <GuideAudio onFermer={() => setGuide(false)} /> : (
        <div className="trx-champ">
          <div className="trx-etiquette">Source audio</div>
          <select ref={selectRef} className="trx-select" value={choix} onChange={(e) => setChoix(e.target.value)} aria-label="Source audio">
            <option value="auto">Automatique{choix === 'auto' && retenu ? ` — ${retenu.label}` : ''}</option>
            <optgroup label="Entrées audio">
              {micros.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label}{estVirtuel(m.label) ? ' (bouclage)' : ''}</option>)}
              {choix !== 'auto' && choix !== 'onglet' && !micros.some((m) => m.deviceId === choix) && <option value={choix}>Entrée débranchée</option>}
            </optgroup>
            <optgroup label="Navigateur">
              <option value="onglet">Onglet Chrome (Teams, Zoom ou YouTube dans Chrome)</option>
            </optgroup>
          </select>
          {choix === 'auto' && retenu && (
            <div className="trx-retenue">
              <span>Retenue : <b>{retenu.label}</b> · {RAISONS[retenu.raison]}</span>
              <button type="button" className="trx-lien" onClick={() => selectRef.current && (selectRef.current.focus(), selectRef.current.showPicker && selectRef.current.showPicker())}>Changer</button>
            </div>
          )}
          {source === 'micro' ? (
            <div className="trx-sonde">
              <span className="trx-vu large" aria-label="Niveau du son"><i style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, sonde.niveau * 6))})` }} /></span>
              <span className="trx-sonde-etat">{sonde.verdict === 'ecoute' ? 'Écoute… (3 s)' : sonde.verdict === 'son' ? 'Son détecté ✓' : sonde.verdict === 'muet' ? 'Aucun son' : sonde.verdict === 'erreur' ? 'Entrée inaccessible' : ''}</span>
            </div>
          ) : (
            <div className="hint trx-aide">Chrome va te demander quel onglet partager : choisis l’onglet du cours et laisse cochée « Partager aussi le son de l’onglet ».</div>
          )}
          {source === 'micro' && (sonde.verdict === 'muet' || sonde.verdict === 'erreur') && (
            <div className="trx-alerte-son">
              <div><Icon name="alert" size={13} /> {sonde.verdict === 'erreur' ? `Impossible d’écouter ${retenu ? retenu.label : 'cette entrée'} : ${sonde.message}` : <>Aucun son détecté sur <b>{retenu ? retenu.label : 'cette entrée'}</b>. Tu écoutes le cours en AirPods/casque ? Le micro ne peut pas entendre ce qui joue dans tes oreilles.</>}</div>
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <button type="button" className="btn sm" onClick={() => setGuide(true)}><Icon name="info" size={12} /> Ouvrir le guide</button>
                <button type="button" className="btn sm" onClick={() => selectRef.current && (selectRef.current.focus(), selectRef.current.showPicker && selectRef.current.showPicker())}>Choisir une autre source</button>
              </div>
            </div>
          )}
          {source === 'micro' && sonde.verdict !== 'muet' && sonde.verdict !== 'erreur' && (
            <button type="button" className="trx-lien" style={{ alignSelf: 'flex-start' }} onClick={() => setGuide(true)}>Cours en AirPods, Teams ou Zoom ? Le guide</button>
          )}
        </div>
        )}

        {!guide && (<>
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
          {candidats === null && (pdfDoc || texteEnPlus) && !reprendre && <div className="hint trx-aide">Lecture du PDF pour proposer des termes…</div>}
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

        <label className="trx-interrupteur" title={`Option payante de Deepgram (diarisation) : +${SURCOUT_DIARISATION_H.toFixed(2).replace('.', ',')} $/h, soit +0,0020 $/min (≈ +42 % sur le tarif Nova-3 de 0,29 $/h). Utile pour une visio Teams / Zoom à plusieurs voix.`}>
          <input type="checkbox" role="switch" checked={diarize} disabled={!!reprendre} onChange={(e) => setDiarize(e.target.checked)} />
          <span className="trx-interrupteur-piste" aria-hidden="true"><i /></span>
          <span className="trx-interrupteur-texte">
            <b>Distinguer les intervenants</b>
            <span className="hint">Prof, étudiants… chaque ligne porte sa voix — +{SURCOUT_DIARISATION_H.toFixed(2).replace('.', ',')} $/h (≈ +42 %)</span>
          </span>
        </label>
        </>)}
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

/* SONDE AVANT DÉMARRAGE : écoute l'entrée retenue tant que la feuille est ouverte ;
   verdict après 3 s (« son » / « muet »). Relancée si l'entrée change. */
function useSonde(entree) {
  const [niveau, setNiveau] = useState(0);
  const [verdict, setVerdict] = useState(null); // null | ecoute | son | muet | erreur
  const [message, setMessage] = useState('');
  const sondeRef = useRef(null);
  const id = entree ? entree.deviceId : null;
  const label = entree ? entree.label : '';
  useEffect(() => {
    if (!id) { setVerdict(null); return undefined; }
    let vivant = true, max = 0, dernierAffichage = 0;
    setVerdict('ecoute'); setNiveau(0);
    sonderNiveau({ deviceId: id, label, onNiveau: (rms) => {
      if (!vivant) return;
      max = Math.max(max, rms);
      const now = Date.now();
      if (now - dernierAffichage > 80) { dernierAffichage = now; setNiveau(rms); }
    } }).then((s) => {
      if (!vivant) { s.arreter(); return; }
      sondeRef.current = s;
      setTimeout(() => { if (vivant) setVerdict((v) => (v === 'ecoute' ? (max > 0.006 ? 'son' : 'muet') : v)); }, 3000);
    }).catch((e) => { if (vivant) { setVerdict('erreur'); setMessage((e && e.message) || 'accès refusé'); } });
    return () => { vivant = false; if (sondeRef.current) { sondeRef.current.arreter(); sondeRef.current = null; } };
  }, [id, label]);
  // une entrée muette qui se met à capter du son (casque retiré…) repasse au vert
  useEffect(() => { if (verdict === 'muet' && niveau > 0.006) setVerdict('son'); }, [niveau, verdict]);
  return { niveau, verdict, message, arreter: () => { if (sondeRef.current) { sondeRef.current.arreter(); sondeRef.current = null; } } };
}

/* GUIDE (petite feuille dans la feuille) : 3 façons de faire entendre le cours. */
function GuideAudio({ onFermer }) {
  return (
    <div className="trx-guide">
      <button type="button" className="trx-lien" onClick={onFermer}><Icon name="chevL" size={11} /> Retour</button>
      <div className="trx-guide-titre">Faire entendre le cours à MedRevise</div>
      <ol className="trx-guide-liste">
        <li>
          <b>Teams ou Zoom dans Chrome</b> — le plus simple. Ouvre la réunion dans un onglet Chrome
          (pas l’application), puis choisis la source <b>« Onglet Chrome »</b> et coche « Partager
          aussi le son de l’onglet ». Tu peux garder tes AirPods.
        </li>
        <li>
          <b>Haut-parleurs + micro du Mac</b> — retire le casque, laisse le son sortir des
          haut-parleurs : le micro du Mac l’entend. Source : <b>Automatique</b> ou « Micro MacBook ».
        </li>
        <li>
          <b>BlackHole</b> — pour l’application Teams/Zoom avec AirPods :
          <ol>
            <li>installe BlackHole 2ch (gratuit, existential.audio) ;</li>
            <li>ouvre <i>Configuration audio et MIDI</i> › « + » › <i>Créer un périphérique à sorties multiples</i>, coche tes AirPods <b>et</b> BlackHole ;</li>
            <li>dans Teams/Zoom, choisis ce périphérique multi-sortie comme <b>haut-parleur</b> ;</li>
            <li>MedRevise détecte BlackHole tout seul en source <b>Automatique</b>.</li>
          </ol>
        </li>
      </ol>
    </div>
  );
}

/* ============================================================
   LIGNES DU TRANSCRIPT
   ============================================================ */
/* couleur d'un intervenant : 6 teintes qui tournent, lisibles en clair comme en sombre */
const TEINTES_INTERVENANTS = [262, 199, 152, 32, 338, 88];
export const couleurIntervenant = (n) => `hsl(${TEINTES_INTERVENANTS[Number(n) % TEINTES_INTERVENANTS.length]} 70% 58%)`;
function PastilleIntervenant({ n, nom, onRenommer }) {
  return (
    <button type="button" className="trx-qui" style={{ '--qui': couleurIntervenant(n) }} title={`${nom} — taper pour renommer`}
      onClick={onRenommer ? (e) => { const r = e.currentTarget.getBoundingClientRect(); onRenommer(n, r); } : undefined}>
      <i aria-hidden="true" /><span>{nom}</span>
    </button>
  );
}

const Ligne = memo(function Ligne({ l, rx, onNote, onSupprNote, focusNoteId, lecture, nom, onRenommer }) {
  if (l.note) return <LigneNote l={l} onNote={onNote} onSuppr={onSupprNote} focus={focusNoteId === l.id} lecture={lecture} />;
  if (l.status === 'gap') return <div className="trx-coupure" data-id={l.id}><span>{mmss(l.t0)} · {l.text}</span></div>;
  const morceaux = decouperSurlignage(l.text, rx);
  return (
    <div className={'trx-ligne ' + l.status} data-id={l.id}>
      <span className="trx-t tnum" aria-hidden="true">{mmss(l.t0)}</span>
      <span className="trx-texte">
        {nom && l.speaker != null && <PastilleIntervenant n={l.speaker} nom={nom} onRenommer={onRenommer} />}
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
const VIRTUEL_DES = 150; // lignes
const MARGE_VIRTUELLE = 800; // px rendus au-dessus et au-dessous de la zone visible
function ListeTranscript({ lignes, keyterms, taille, live, onNote, onSupprNote, focusNoteId, plein, noms = null, onRenommer = null }) {
  const ref = useRef(null);
  // en direct : collé en bas ; une session passée s'ouvre en haut, pour la relire
  const enBasRef = useRef(live);
  const [enBas, setEnBas] = useState(true);
  const [nouvelles, setNouvelles] = useState(0);
  const dejaVues = useRef(0);
  const rx = useMemo(() => regexTermes(keyterms), [keyterms]);
  const nbValidees = lignes.filter((l) => l.status !== 'interim').length;
  const dernierTexte = lignes.length ? lignes[lignes.length - 1].text : '';

  /* VIRTUALISATION (v1.4, 07/10) : au-delà de 150 lignes, seules celles autour de la zone
     visible (± 800 px) sont rendues ; deux cales gardent la hauteur totale. Hauteurs
     MESURÉES après rendu (cache par ligne), estimées sinon. Collé en bas : la fenêtre suit
     la fin. Une session de 500 lignes ne rend plus que ~40 lignes à chaque publication. */
  const virtuel = lignes.length > VIRTUEL_DES;
  const hauteurs = useRef(new Map());
  const [, setVersion] = useState(0);
  const [vue, setVue] = useState({ haut: 0, h: 700 });
  const vueRef = useRef(vue); vueRef.current = vue;
  const est = taille === 's' ? 46 : taille === 'l' ? 80 : 60;
  let debut = 0, fin = lignes.length, cale1 = 0, cale2 = 0;
  if (virtuel) {
    const H = lignes.map((l) => hauteurs.current.get(l.id) || est);
    const total = H.reduce((a, b) => a + b, 0);
    const st = enBasRef.current ? Math.max(0, total - vue.h) : vue.haut;
    let acc = 0, i = 0;
    while (i < H.length && acc + H[i] < st - MARGE_VIRTUELLE) { acc += H[i]; i += 1; }
    debut = i; cale1 = acc;
    while (i < H.length && acc < st + vue.h + MARGE_VIRTUELLE) { acc += H[i]; i += 1; }
    fin = i; cale2 = total - acc;
    // la note en cours d'écriture reste toujours rendue
    const k = focusNoteId ? lignes.findIndex((l) => l.id === focusNoteId) : -1;
    if (k >= 0 && k < debut) { for (let j = k; j < debut; j += 1) cale1 -= H[j]; debut = k; }
    if (k >= fin) { for (let j = fin; j <= k; j += 1) cale2 -= H[j]; fin = k + 1; }
  }
  const visibles = virtuel ? lignes.slice(debut, fin) : lignes;
  // mesure des lignes rendues → cache ; un écart relance UN rendu (cales justes)
  useLayoutEffect(() => {
    if (!virtuel || !ref.current) return;
    let change = false;
    for (const el of ref.current.children) {
      const id = el.dataset && el.dataset.id;
      if (!id) continue;
      const h = el.offsetHeight;
      if (h && Math.abs((hauteurs.current.get(id) || 0) - h) > 1) { hauteurs.current.set(id, h); change = true; }
    }
    if (change) setVersion((v) => v + 1);
  });
  const rafVue = useRef(null);
  const suivreVue = () => {
    if (!virtuel || rafVue.current) return;
    rafVue.current = requestAnimationFrame(() => {
      rafVue.current = null;
      const el = ref.current;
      if (!el) return;
      const v = vueRef.current;
      if (Math.abs(el.scrollTop - v.haut) > MARGE_VIRTUELLE / 3 || Math.abs(el.clientHeight - v.h) > 4) setVue({ haut: el.scrollTop, h: el.clientHeight });
    });
  };
  useEffect(() => () => { if (rafVue.current) cancelAnimationFrame(rafVue.current); }, []);

  /* Seul un défilement VERS LE HAUT met l'auto-défilement en pause. Un panneau qui
     rétrécit (éditeur de mots-clés, note, fenêtre) éloigne aussi le bas sans que
     scrollTop ne bouge : ce n'est pas un geste de l'étudiant, on reste collé en bas. */
  const dernierHaut = useRef(0);
  const surDefilement = () => {
    const el = ref.current;
    if (!el) return;
    suivreVue();
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
    const ro = new ResizeObserver(() => {
      if (enBasRef.current) el.scrollTop = el.scrollHeight;
      if (Math.abs(el.clientHeight - vueRef.current.h) > 4) setVue({ haut: el.scrollTop, h: el.clientHeight });
    });
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
        {cale1 > 0 && <div className="trx-cale" style={{ height: cale1 }} aria-hidden="true" />}
        {visibles.map((l) => (
          <Ligne key={l.id} l={l} rx={rx} onNote={onNote} onSupprNote={onSupprNote} focusNoteId={focusNoteId} lecture={!live}
            nom={noms && l.speaker != null ? noms(l.speaker) : null} onRenommer={onRenommer} />
        ))}
        {cale2 > 0 && <div className="trx-cale" style={{ height: cale2 }} aria-hidden="true" />}
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

function MenuCopie({ session, titre, filtre = null }) {
  const [menu, setMenu] = useState(null);
  const [choixCopie, setChoixCopie] = useState(null); // filtre actif : « tous » ou « filtrés » ?
  const [copie, setCopie] = useState(false);
  const copier = async (horodatage, f = null) => {
    if (await copierTexte(texteSession(session, { horodatage, filtre: f }))) { setCopie(true); setTimeout(() => setCopie(false), 1600); }
  };
  const nomsFiltre = filtre ? [...filtre].sort((a, b) => a - b).map((n) => nomIntervenant(session, n)).join(', ') : '';
  return (
    <>
      <div className="trx-groupe">
        <button type="button" className="btn sm" title="Copier tout le transcript (texte brut, lignes horodatées)"
          onClick={(ev) => { if (!filtre) { copier(true); return; } const r = ev.currentTarget.getBoundingClientRect(); setChoixCopie({ x: Math.min(r.left, window.innerWidth - 280), y: r.bottom + 6 }); }}>
          <Icon name={copie ? 'check' : 'copy'} size={13} /> {copie ? 'Copié' : 'Copier tout'}
        </button>
        <button type="button" className="btn sm trx-chevron" title="Autres formats"
          onClick={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setMenu({ x: Math.min(r.left - 160, window.innerWidth - 240), y: r.bottom + 6 }); }}>
          <Icon name="chevD" size={12} />
        </button>
      </div>
      {choixCopie && (
        <ContextMenu fermerAuDefilement={false} x={choixCopie.x} y={choixCopie.y} onClose={() => setChoixCopie(null)} items={[
          { label: 'Tous les intervenants', icon: 'copy', onClick: () => copier(true) },
          { label: `Filtrés : ${nomsFiltre}`, icon: 'copy', onClick: () => copier(true, filtre) },
        ]} />
      )}
      {menu && (
        <ContextMenu fermerAuDefilement={false} x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: 'Copier sans horodatage', icon: 'copy', onClick: () => copier(false) },
          { label: 'Télécharger en .txt', icon: 'upload', onClick: () => telecharger(nomFichier(titre, session, 'txt'), texteSession(session), 'text/plain;charset=utf-8') },
          { label: 'Télécharger en .md', icon: 'upload', onClick: () => telecharger(nomFichier(titre, session, 'md'), markdownSession(session, titre), 'text/markdown;charset=utf-8') },
          filtre && { label: `Copier les filtrés sans horodatage`, icon: 'copy', onClick: () => copier(false, filtre) },
        ].filter(Boolean)} />
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

function PiedSession({ session, titre, filtre = null }) {
  const n = session.segments.filter((s) => s.status !== 'gap').length;
  return (
    <div className="trx-pied">
      <MenuCopie session={session} titre={titre} filtre={filtre} />
      <span className="hint tnum" style={{ fontSize: 11.5 }}>{n} ligne{n > 1 ? 's' : ''}{session.notes.length ? ` · ${session.notes.length} note${session.notes.length > 1 ? 's' : ''}` : ''}</span>
    </div>
  );
}

/* FILTRE PAR INTERVENANT (diarisation, 08/10) : puces en haut du transcript ; « Tous » ou
   une sélection multiple. N'affecte que l'AFFICHAGE (et la copie « filtrés ») : rien n'est
   retiré de la session. */
function FiltreIntervenants({ session, filtre, setFiltre, onRenommer }) {
  const liste = intervenantsDe(session);
  if (!liste.length) return null;
  // depuis « Tous », taper une puce n'affiche QUE cet intervenant ; ensuite on ajoute / retire
  const basculer = (n) => {
    if (!filtre) { setFiltre(liste.length > 1 ? new Set([n]) : null); return; }
    const f = new Set(filtre);
    if (f.has(n)) f.delete(n); else f.add(n);
    setFiltre(!f.size || f.size === liste.length ? null : f);
  };
  return (
    <div className="trx-filtre" role="group" aria-label="Filtrer par intervenant">
      <button type="button" className={'trx-filtre-puce' + (!filtre ? ' on' : '')} aria-pressed={!filtre} onClick={() => setFiltre(null)}>Tous</button>
      {liste.map(({ speaker, lignes }) => {
        const on = !!filtre && filtre.has(speaker);
        return (
          <button key={speaker} type="button" className={'trx-filtre-puce' + (on ? ' on' : '')} aria-pressed={on} style={{ '--qui': couleurIntervenant(speaker) }}
            onClick={() => basculer(speaker)} onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onRenommer(speaker, r); }}
            title={`${nomIntervenant(session, speaker)} — ${lignes} ligne${lignes > 1 ? 's' : ''} · double-clic pour renommer`}>
            <i aria-hidden="true" />{nomIntervenant(session, speaker)} <span className="tnum">{lignes}</span>
          </button>
        );
      })}
    </div>
  );
}
/* renommer un intervenant : petite bulle sous la pastille tapée (mémorisé dans la session) */
function BulleRenommer({ n, rect, nom, onValider, onFermer }) {
  const [v, setV] = useState(nom);
  return createPortal(
    <div className="trx-renommer" style={{ left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), top: Math.min(rect.bottom + 6, window.innerHeight - 120) }}
      onPointerDown={(e) => e.stopPropagation()}>
      <span className="trx-qui-point" style={{ '--qui': couleurIntervenant(n) }} aria-hidden="true" />
      <input autoFocus value={v} placeholder={`Intervenant ${n + 1} (ex. Prof)`} maxLength={30}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onValider(v); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onFermer(); } }} />
      <button type="button" className="btn sm primary" onClick={() => onValider(v)}>OK</button>
      <button type="button" className="icon-btn sm" onClick={onFermer} title="Annuler" aria-label="Annuler"><Icon name="x" size={12} /></button>
    </div>,
    document.body,
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
  const [menuSource, setMenuSource] = useState(null);
  const [infoSource, setInfoSource] = useState(null);
  const [focusNote, setFocusNote] = useState(null);
  const [taille, setTailleLocale] = useState(() => lireLS(CLE_TAILLE, 'm'));
  // intervenants (diarisation) : filtre d'affichage (Set | null = tous), bulle de renommage
  const [filtre, setFiltre] = useState(null);
  const [renommage, setRenommage] = useState(null); // { n, rect, sessionId }
  const idVue = ici && e.session ? e.session.id : lecture ? lecture.id : null;
  useEffect(() => { setFiltre(null); setRenommage(null); }, [idVue]);
  const ouvrirRenommage = useCallback((n, rect) => setRenommage({ n, rect }), []);
  const sessionVue = ici && e.session ? e.session : lecture;
  const validerRenommage = async (nom) => {
    const r = renommage; setRenommage(null);
    if (!r || !sessionVue) return;
    if (ici && e.session && e.session.id === sessionVue.id) { renommerIntervenantDirect(r.n, nom); return; }
    const s2 = { ...sessionVue, intervenants: { ...(sessionVue.intervenants || {}), [r.n]: (nom || '').trim() } };
    setLecture(s2);
    await ecrireSession(s2);
  };
  const bulleRenommer = renommage && sessionVue ? (
    <BulleRenommer n={renommage.n} rect={renommage.rect} nom={(sessionVue.intervenants && sessionVue.intervenants[renommage.n]) || ''}
      onValider={validerRenommage} onFermer={() => setRenommage(null)} />
  ) : null;


  const recharger = useCallback(async () => {
    const l = await sessionsDuCours(courseId);
    setSessions(l);
    setInterrompue(sessionActive() && lireEtat().courseId === courseId ? null : (l.find((s) => !s.endedAt) || null));
  }, [courseId]);
  useEffect(() => { recharger(); }, [recharger, e.phase]);
  /* v1.2 : le panneau reste monté même quand le mode Transcript n'est pas affiché
     (glissement physique). La lecture locale et le direct continuent ; les REQUÊTES
     réseau (crédits, synchro ciblée) attendent la première apparition du mode. */
  const dejaVisible = useDejaVisible();
  useEffect(() => { if (dejaVisible) actualiserCredits(); }, [courseId, dejaVisible]); // ouverture du mode (jamais pendant une session : voir credits.js)
  // synchro ciblée à l'ouverture du panneau : les sessions faites sur un autre appareil
  useEffect(() => {
    if (!dejaVisible) return undefined;
    let vivant = true;
    synchroTranscripts().then((r) => {
      if (!vivant || !r || !(r.recus || r.supprimes)) return;
      recharger();
      // la session ouverte en lecture a pu être modifiée ou supprimée sur un autre appareil
      setLecture((l) => { if (l) lireSession(l.id).then((s) => { if (vivant) setLecture(s || null); }); return l; });
    });
    return () => { vivant = false; };
  }, [recharger, dejaVisible]);
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
        <CarteCredits />
      </div>
    );
  }

  /* ---- session EN DIRECT sur CE cours ---- */
  if (ici && e.session) {
    const diar = !!e.session.diarize;
    const lignes = lignesSession(e.session, e.interim).filter((l) => passeFiltre(l, filtre));
    const nomsDirect = diar ? (n) => nomIntervenant(e.session, n) : null;
    const corps = (
      <div className={'trx-panneau' + (plein ? ' plein' : '')}>
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
          <button type="button" className="btn sm" title={`Source : ${e.sourceLibelle || '—'} — changer sans arrêter`}
            onClick={async (ev) => {
              const r = ev.currentTarget.getBoundingClientRect();
              const l = await listerMicros();
              setMenuSource({ x: Math.min(r.left, window.innerWidth - 280), y: r.bottom + 6, micros: l });
            }}>
            <Icon name="mic" size={12} />
          </button>
          <span style={{ flex: 1 }} />
          {/* tablette comprise : tout reste visible (la rangée passe à la ligne si besoin) */}
          <ChoixTaille taille={taille} onTaille={choisirTaille} />
          <button type="button" className="icon-btn sm" onClick={() => setPlein((v) => !v)} title={plein ? 'Quitter le plein écran (Échap)' : 'Plein écran (lecture à distance)'}><Icon name={plein ? 'x' : 'maximize'} size={13} /></button>
        </div>
        {menuSource && <ContextMenu fermerAuDefilement={false} x={menuSource.x} y={menuSource.y} onClose={() => setMenuSource(null)} items={[
          ...menuSource.micros.map((m) => ({ label: (m.label === e.sourceLibelle ? '✓ ' : '') + m.label, icon: 'mic', onClick: async () => { const r = await changerSource({ source: 'micro', deviceId: m.deviceId }); if (!r.ok) setInfoSource(r.message); } })),
          { label: 'Onglet Chrome…', icon: 'ext', onClick: async () => { const r = await changerSource({ source: 'onglet' }); if (!r.ok) setInfoSource(r.message); } },
        ]} />}
        {infoSource && <div className="trx-info"><Icon name="alert" size={12} /> {infoSource} <button type="button" className="cd-ic" onClick={() => setInfoSource(null)}><Icon name="x" size={10} /></button></div>}
        {mcOuvert && <EditeurMotsCles termes={e.session.keyterms} onChange={changerMotsCles} onFermer={() => setMcOuvert(false)} />}
        {diar && <FiltreIntervenants session={e.session} filtre={filtre} setFiltre={setFiltre} onRenommer={ouvrirRenommage} />}
        <ListeTranscript lignes={lignes} keyterms={e.session.keyterms} taille={taille} live plein={plein}
          onNote={modifierNote} onSupprNote={supprimerNote} focusNoteId={focusNote} noms={nomsDirect} onRenommer={diar ? ouvrirRenommage : null} />
        <PiedSession session={e.session} titre={titre} filtre={filtre} />
        {!plein && <CarteCredits />}
        {bulleRenommer}
      </div>
    );
    return plein ? createPortal(corps, document.body) : corps;
  }

  /* ---- ancienne session en LECTURE ---- */
  if (lecture) {
    const corps = (
      <div className={'trx-panneau' + (plein ? ' plein' : '')}>
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
        {avecIntervenants(lecture) && <FiltreIntervenants session={lecture} filtre={filtre} setFiltre={setFiltre} onRenommer={ouvrirRenommage} />}
        <ListeTranscript lignes={lignesSession(lecture).filter((l) => passeFiltre(l, filtre))} keyterms={lecture.keyterms || []} taille={taille} live={false} plein={plein}
          noms={avecIntervenants(lecture) ? (n) => nomIntervenant(lecture, n) : null} onRenommer={avecIntervenants(lecture) ? ouvrirRenommage : null} />
        <PiedSession session={lecture} titre={titre} filtre={filtre} />
        {!plein && <CarteCredits />}
        {bulleRenommer}
      </div>
    );
    return plein ? createPortal(corps, document.body) : corps;
  }

  /* ---- accueil : démarrer, reprendre, sessions passées ---- */
  const ailleurs = sessionActive() && e.courseId !== courseId;
  return (
    <div className="trx-accueil">
      <div className="trx-accueil-defile">
      {ailleurs ? (
        <div className="trx-info"><Icon name="mic" size={13} /> Une transcription tourne sur un autre cours ({mmss(e.secondes)}).
          <button type="button" className="btn sm" onClick={() => arreter()}>Arrêter</button></div>
      ) : (
        <button type="button" className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onDemarrer}>
          <Icon name="mic" size={14} /> Transcrire le cours
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
      <CarteCredits />
    </div>
  );
}

function dateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const j = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return j.charAt(0).toUpperCase() + j.slice(1) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
