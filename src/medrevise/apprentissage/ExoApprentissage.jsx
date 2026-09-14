/* ============================================================
   MedRevise — MODE APPRENTISSAGE : un exo que l'on FAIT, pour comprendre.

   AUCUN SUIVI : rien ici n'appelle recordExerciceAttempt, saveQuestion, saveStats ni
   StatutChooser. Réponses, indices révélés et étapes du guide vivent en mémoire, le
   temps de l'unité ouverte. Seul le brouillon (bloc-notes) est gardé, comme dans le
   mode exercice : c'est un brouillon, pas un résultat.

   Réutilisé TEL QUEL de session/Exercice.jsx : NumericAnswer (saisie + vérification
   locale), OpenAnswer (rédaction + correction modèle + grille), CorrectionSteps,
   Pieges, DonneesTable, FormulesBlock, Calculator, Notepad.
   Neuf : le QCM sans notation (QcmApprentissage), les indices un par un, et le
   GUIDE PAS À PAS — la correction dévoilée une étape à la fois.
   ============================================================ */
import { useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { Tex } from '../components/Tex.jsx';
import {
  DonneesTable, FormulesBlock, Notepad, Calculator, NumericAnswer, OpenAnswer, CorrectionSteps, Pieges,
} from '../session/Exercice.jsx';

const DIFF = { 1: 'Facile', 2: 'Intermédiaire', 3: 'Difficile' };
const TYPE_LABEL = (it) => (it.type === 'qcm' ? (it.multiple ? 'QCM · plusieurs réponses' : 'QCM')
  : it.sous_type === 'numerique' ? 'Exercice · réponse chiffrée' : 'Exercice · réponse rédigée');
const LETTRES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** étapes du guide d'un item : correction.etapes ; à défaut (QCM sans étapes),
    l'explication devient une étape unique — jamais un guide vide. */
function etapesDuGuide(item) {
  const c = item.correction || {};
  const etapes = (c.etapes || []).filter((e) => e && (e.titre || e.detail || e.calcul));
  if (etapes.length) return { etapes, conclusion: c.conclusion || '' };
  if (item.type === 'qcm' && item.explication) return { etapes: [{ n: 1, titre: 'Explication', detail: item.explication }], conclusion: '' };
  if (c.conclusion) return { etapes: [{ n: 1, titre: 'Conclusion', detail: c.conclusion }], conclusion: '' };
  return { etapes: [], conclusion: '' };
}

export function ExoApprentissage({ item, rang, total, onVoirCours }) {
  const numeric = item.sous_type === 'numerique';
  const indices = item.indices || [];
  const [indicesVus, setIndicesVus] = useState(0);
  const [essai, setEssai] = useState(0); // « Réessayer » : remonte la zone de réponse à neuf
  const [valide, setValide] = useState(false); // numérique : réponse vérifiée
  const [corrigeOuvert, setCorrigeOuvert] = useState(false); // ouvert : correction modèle affichée
  const [brouillon, setBrouillon] = useState(false);
  const [calcul, setCalcul] = useState(false);
  const guide = etapesDuGuide(item);

  const reessayer = () => { setEssai((k) => k + 1); setValide(false); setCorrigeOuvert(false); };

  return (
    <div className="card appr-exo">
      <div className="card-body">
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="appr-rang tnum">{rang}<small>/{total}</small></span>
          <span className="pill" style={{ height: 22 }}>{TYPE_LABEL(item)}</span>
          <span className={'pill appr-diff d' + (item.difficulte || 2)} style={{ height: 22 }}>{DIFF[item.difficulte] || 'Intermédiaire'}</span>
          {item.theme && <span className="hint" style={{ fontSize: 12.5 }}>{item.theme}</span>}
        </div>
        <div className="appr-enonce"><Tex>{item.enonce}</Tex></div>
        {item.type === 'exercice' && (item.donnees || []).length > 0 && <DonneesTable donnees={item.donnees} />}
        {item.type === 'exercice' && (item.formules || []).length > 0 && <FormulesBlock formules={item.formules} />}

        {/* ---- réponse ---- */}
        <div className="appr-reponse">
          {item.type === 'qcm' && <QcmApprentissage key={essai} item={item} onReessayer={reessayer} />}
          {item.type === 'exercice' && numeric && (
            <>
              <NumericAnswer key={essai} item={item} validated={valide} onValidate={() => setValide(true)} />
              {valide && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={reessayer}><Icon name="refresh" size={13} /> Réessayer</button>}
            </>
          )}
          {item.type === 'exercice' && !numeric && (
            <OpenAnswer key={essai} item={item} revealed={corrigeOuvert} onReveal={() => setCorrigeOuvert(true)} onAutoVerdict={() => {}} />
          )}
        </div>

        {/* ---- aides : indices, cours, guide, outils ---- */}
        <div className="appr-actions">
          {indices.length > 0 && indicesVus < indices.length && (
            <button className="btn sm" onClick={() => setIndicesVus((n) => n + 1)}>
              <Icon name="lightbulb" size={13} /> Indice {indicesVus + 1}/{indices.length}
            </button>
          )}
          <button className="btn sm" onClick={onVoirCours} title="Afficher le PDF du cours à côté"><Icon name="filePdf" size={13} /> Voir le cours</button>
          <button className={'btn ghost sm' + (brouillon ? ' active' : '')} onClick={() => setBrouillon((v) => !v)}><Icon name="edit" size={13} /> Brouillon</button>
          {item.type === 'exercice' && (
            <button className={'btn ghost sm' + (calcul ? ' active' : '')} onClick={() => setCalcul((v) => !v)}><Icon name="grad" size={13} /> Calculatrice</button>
          )}
        </div>

        {indicesVus > 0 && (
          <div className="appr-indices">
            {indices.slice(0, indicesVus).map((ind, i) => (
              <div key={i} className="appr-indice fadein">
                <strong>Indice {i + 1}</strong>
                <span><Tex>{ind.texte}</Tex></span>
              </div>
            ))}
          </div>
        )}

        {(brouillon || calcul) && (
          <div className="appr-outils">
            {brouillon && <Notepad itemId={item.id} />}
            {calcul && <Calculator />}
          </div>
        )}

        {/* la correction modèle d'un exo rédigé, une fois validé, affiche déjà TOUT
            (OpenAnswer) : le guide n'a alors plus rien à dévoiler. */}
        {!(item.type === 'exercice' && !numeric && corrigeOuvert) && guide.etapes.length > 0 && (
          <GuidePasAPas etapes={guide.etapes} conclusion={guide.conclusion} pieges={item.type === 'exercice' ? item.pieges : null} />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   GUIDE PAS À PAS — la correction dévoilée UNE étape à la fois.
   « Guide-moi pas à pas » → étape 1 ; « Étape suivante (2/3) » → étape 2… ; après la
   dernière : conclusion + pièges. « Tout afficher » saute à la fin, « Replier »
   referme. Affichage = CorrectionSteps de l'écran exercice, alimenté avec les seules
   étapes déjà dévoilées (même rendu, pas un second composant de correction).
   État en mémoire uniquement : rien n'est enregistré.
   ============================================================ */
function GuidePasAPas({ etapes, conclusion, pieges }) {
  const [vues, setVues] = useState(0);
  const total = etapes.length;
  const fini = vues >= total;

  if (vues === 0) {
    return (
      <div className="appr-guide appr-guide-ferme">
        <button className="btn primary sm" onClick={() => setVues(1)}>
          <Icon name="sparkle" size={13} /> Guide-moi pas à pas
        </button>
        <span className="hint" style={{ fontSize: 12 }}>La correction, une étape à la fois ({total} étape{total > 1 ? 's' : ''}).</span>
      </div>
    );
  }

  return (
    <div className="appr-guide fadein">
      <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
        <div className="appr-guide-titre"><Icon name="sparkle" size={14} /> Guide pas à pas</div>
        <div className="appr-guide-progres" aria-label={`${Math.min(vues, total)} étape(s) sur ${total}`}>
          {etapes.map((e, i) => <i key={i} className={i < vues ? 'on' : ''} />)}
        </div>
      </div>

      <div key={vues} className="appr-guide-etapes">
        <CorrectionSteps correction={{ etapes: etapes.slice(0, vues), conclusion: fini ? conclusion : '' }} />
      </div>
      {fini && pieges && pieges.length > 0 && <Pieges pieges={pieges} />}

      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {!fini && (
          <button className="btn primary sm" onClick={() => setVues((n) => n + 1)}>
            Étape suivante ({vues + 1}/{total}) <Icon name="chevR" size={13} />
          </button>
        )}
        {!fini && total - vues > 1 && <button className="btn ghost sm" onClick={() => setVues(total)}>Tout afficher</button>}
        {fini && <span className="hint appr-guide-fin"><Icon name="check" size={13} /> Correction complète</span>}
        <button className="btn ghost sm" onClick={() => setVues(0)}>Replier</button>
      </div>
    </div>
  );
}

/* ============================================================
   QCM D'APPRENTISSAGE : cliquable, vérifié localement, SANS boutons de notation
   (méthode des J) — mêmes classes visuelles que le QCM de session (rev-choice…).
   Options dans l'ordre du JSON (une explication peut citer « A », « B »…).
   ============================================================ */
function QcmApprentissage({ item, onReessayer }) {
  const multiple = !!item.multiple;
  const correct = new Set(item.reponses_correctes || []);
  const [sel, setSel] = useState([]);
  const [valide, setValide] = useState(false);
  const ok = valide && sel.length === correct.size && sel.every((id) => correct.has(id));
  const toggle = (id) => {
    if (valide) return;
    setSel((cur) => (multiple ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  };
  const options = item.options || [];
  const libelle = (id) => { const i = options.findIndex((o) => o.id === id); return i >= 0 ? `${LETTRES[i]}` : id; };
  const distracteurs = (item.explication_distracteurs || []).filter((d) => d && d.pourquoi_faux);

  return (
    <div>
      {multiple && !valide && <div className="hint" style={{ margin: '0 0 8px', fontSize: 12.5 }}><Icon name="check" size={12} /> Plusieurs réponses possibles</div>}
      <div className="rev-choices appr-choices">
        {options.map((o, i) => {
          const choisi = sel.includes(o.id);
          let cls = 'rev-choice';
          if (!valide && choisi) cls += ' sel';
          if (valide) { cls += ' locked'; if (correct.has(o.id)) cls += ' correct'; else if (choisi) cls += ' wrong'; }
          return (
            <button key={o.id} className={cls} onClick={() => toggle(o.id)}>
              <span className="rc-key" style={multiple ? { borderRadius: 6 } : undefined}>
                {valide ? (correct.has(o.id) ? <Icon name="check" size={14} stroke={3} /> : (choisi ? <Icon name="x" size={14} stroke={3} /> : LETTRES[i]))
                  : (multiple ? (choisi ? <Icon name="check" size={13} stroke={3} /> : LETTRES[i]) : LETTRES[i])}
              </span>
              <span><Tex>{o.texte}</Tex></span>
            </button>
          );
        })}
      </div>
      {!valide ? (
        <button className="btn primary sm" style={{ marginTop: 10 }} disabled={!sel.length} onClick={() => setValide(true)}>Vérifier</button>
      ) : (
        <div className="fadein" style={{ marginTop: 10 }}>
          <div className={'err-mini' + (ok ? ' ok' : '')} style={{ alignItems: 'center' }}>
            <div className={'em-ic' + (ok ? '' : ' crit')}><Icon name={ok ? 'check' : 'x'} size={16} stroke={2.5} /></div>
            <div className="em-body">
              <div className="em-title">{ok ? 'Bonne réponse' : `Pas tout à fait — réponse : ${[...correct].map(libelle).join(', ')}`}</div>
              {item.explication && <div className="hint" style={{ marginTop: 2 }}><Tex>{item.explication}</Tex></div>}
            </div>
          </div>
          {distracteurs.length > 0 && (
            <div className="appr-distracteurs">
              {distracteurs.map((d, i) => (
                <div key={i} className={'hint' + (sel.includes(d.option_id) ? ' choisi' : '')}>
                  <strong>{libelle(d.option_id)}</strong> — <Tex>{d.pourquoi_faux}</Tex>
                </div>
              ))}
            </div>
          )}
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={onReessayer}><Icon name="refresh" size={13} /> Réessayer</button>
        </div>
      )}
    </div>
  );
}
