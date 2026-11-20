/* ============================================================
   MedRevise — écran Dessin du téléphone (02/10) : le canvas (MobileDessin.jsx)
   + l'EXPORT vers une fiche (docs/mecanique-dessin-mobile.md §4).

   Exporter → une feuille : la fiche cible (par défaut celle ouverte sur l'ordi),
   le fond (transparent par défaut : posé sur le PDF, le dessin ne cache pas le
   cours), puis Envoyer : SVG → PNG (×2, côté le plus long ≤ 2 400 px) → envoi
   ordonné (lib/dessins.js#envoyerDessin : image confirmée au cloud, puis entrée).
   (20/11) « Enregistrer en PNG » dans la même feuille, même fond, MÊME rendu (svgExport →
   svgVersPng, ×3) + les zones de texte peintes dedans (mobile/textesPng.js) ; feuille de
   partage sur iPhone/iPad, téléchargement sur ordinateur. Rien n'est écrit.
   ============================================================ */
import { useMemo, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon.jsx';
import { MobileDessin } from './MobileDessin.jsx';
import { useFicheActiveOrdi } from './CarteDessin.jsx';
import { envoyerDessin, SYNCHRO_ACTIVE } from '../lib/dessins.js';
import { peindreTextes } from './textesPng.js';
import { echellePng, nomFichierPng, partageImagePrefere, remettrePng } from './exportPng.js';

const COTE_MAX = 2400;
/** SVG autonome → PNG (Blob). `echelle` : ×2 plafonné à 2 400 px par défaut (envoi vers un cours) ;
    `peindre(g, k)` : appelé après l'image, avant l'encodage (zones de texte du PNG enregistré). */
export async function svgVersPng(svg, w, h, { echelle = null, peindre = null } = {}) {
  const k = echelle || Math.min(2, COTE_MAX / Math.max(w, h));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('rendu SVG impossible')); img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, cv.width, cv.height);
    if (peindre) peindre(g, cv.width / w);
    const png = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
    if (!png) throw new Error('PNG impossible');
    return { png, largeur: cv.width, hauteur: cv.height };
  } finally { URL.revokeObjectURL(url); }
}

function FeuilleExport({ ctx, active, onFermer, onEnvoyer, envoi, onPng, png, onPartagerPng }) {
  const cibles = useMemo(() => {
    const db = ctx.db || {};
    const fiches = (db.fiches || []).filter((f) => !f.archive && (f.pdfId || f.htmlId)).map((f) => ({ id: f.id, titre: f.titre || 'Fiche sans titre', sous: 'Fiche' }));
    // (11/10) les documents de l'ancienne « Prise de notes » ne sont plus des cibles : plus rien ne les affiche
    return [...fiches].sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  }, [ctx.db]);
  const [choix, setChoix] = useState(() => (active && active.ficheId) || null);
  const [q, setQ] = useState('');
  const [fondExport, setFondExport] = useState('transparent');
  const filtre = q.trim().toLowerCase();
  // la fiche de l'ordi est déjà proposée en tête : pas de doublon dans la liste
  const liste = cibles.filter((c) => (!active || c.id !== active.ficheId) && (!filtre || c.titre.toLowerCase().includes(filtre)));
  const choisie = cibles.find((c) => c.id === choix) || (active && active.ficheId === choix ? { id: choix, titre: active.titre || 'Fiche ouverte sur l’ordi' } : null);

  if (envoi) {
    return (
      <div className="mde-fond"><div className="mde-feuille mde-fin">
        {envoi.etat === 'en-cours' ? <div className="mde-statut"><Icon name="refresh" size={20} className="spin" /> Envoi du dessin…</div> : envoi.etat === 'erreur' ? (
          <><div className="mde-statut erreur"><Icon name="alert" size={20} /> {envoi.message}</div>
            <button type="button" className="md-exporter" onClick={onFermer}>Fermer</button></>
        ) : (
          <>
            <div className="mde-statut ok"><Icon name="check" size={22} /> {envoi.statut === 'envoye' ? 'Envoyé' : envoi.statut === 'attente' ? 'Prêt — en attente de réseau' : 'Enregistré sur ce téléphone'}</div>
            <div className="mde-detail">
              {envoi.statut === 'envoye' ? <>Il arrive dans l’onglet <b>Dessins</b> de « {envoi.titre} » sur l’ordi (quelques secondes).</>
                : envoi.statut === 'attente' ? <>Il partira tout seul au retour du réseau, vers « {envoi.titre} ».</>
                  : <>La synchro n’est pas configurée : le dessin ne peut pas rejoindre l’ordi.</>}
            </div>
            <div className="mde-actions">
              <button type="button" className="mde-sec" onClick={() => onFermer({ vider: true })}>Nouveau dessin</button>
              <button type="button" className="md-exporter" onClick={() => onFermer({ vider: false })}>Continuer</button>
            </div>
          </>
        )}
      </div></div>
    );
  }

  return (
    <div className="mde-fond" onPointerDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="mde-feuille" role="dialog" aria-label="Exporter le dessin">
        <div className="mde-titre">Exporter le dessin</div>
        <div className="mde-sous-titre">Vers une fiche</div>
        {active && active.ficheId && (
          <button type="button" className={'mde-cible mde-ordi' + (choix === active.ficheId ? ' actif' : '')} onClick={() => setChoix(active.ficheId)}>
            <span className="mde-cible-titre">{active.ouverte && <i className="mrm-point-vert" />}{active.titre || 'Fiche ouverte sur l’ordi'}</span>
            <span className="mde-cible-sous">{active.ouverte ? 'Ouverte sur l’ordi' : 'Dernière fiche ouverte sur l’ordi'}</span>
          </button>
        )}
        <input className="mde-recherche" placeholder="Chercher une autre fiche…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mde-liste">
          {liste.map((c) => (
            <button key={c.id} type="button" className={'mde-cible' + (choix === c.id ? ' actif' : '')} onClick={() => setChoix(c.id)}>
              <span className="mde-cible-titre">{c.titre}</span><span className="mde-cible-sous">{c.sous}</span>
            </button>
          ))}
          {!liste.length && <div className="mde-vide">Aucune fiche</div>}
        </div>
        <div className="mde-fond-choix" role="group" aria-label="Fond">
          {[['transparent', 'Transparent'], ['blanc', 'Blanc'], ['noir', 'Noir']].map(([id, l]) => (
            <button key={id} type="button" className={fondExport === id ? 'actif' : ''} onClick={() => setFondExport(id)}>{l}</button>
          ))}
        </div>
        {fondExport !== 'noir' && <div className="mde-detail">Sur la page, le blanc de ton dessin sort en noir (encre lisible sur le papier).</div>}
        {/* (20/11) ENREGISTRER EN PNG : même fond, même rendu que l'envoi ; iPhone/iPad → feuille de partage, ordinateur → téléchargement */}
        <div className="mde-png">
          <button type="button" className="mde-sec mde-png-btn" data-act="png" disabled={png && png.etat === 'en-cours'}
            onClick={() => onPng({ fond: fondExport, titre: choisie ? choisie.titre : '' })}
            title={partageImagePrefere() ? 'Enregistrer l’image (Photos) ou l’envoyer : feuille de partage' : 'Télécharger le dessin en image PNG'}>
            <Icon name={png && png.etat === 'en-cours' ? 'refresh' : 'image'} size={16} className={png && png.etat === 'en-cours' ? 'spin' : undefined} /> Enregistrer en PNG
          </button>
          {png && png.etat === 'geste' && (
            <button type="button" className="md-exporter" data-act="png-partager" onClick={onPartagerPng} title="Ouvrir la feuille de partage">
              <Icon name="upload" size={16} /> Partager l’image
            </button>
          )}
        </div>
        {png && png.etat !== 'en-cours' && png.etat !== 'geste' && (
          <div className={'mde-detail mde-png-statut' + (png.etat === 'erreur' ? ' erreur' : '')} role="status" data-png-statut={png.etat}>
            {png.etat === 'erreur' ? png.message
              : png.etat === 'partage' ? <>Image partagée : <b>{png.nom}</b></>
                : png.etat === 'annule' ? 'Partage annulé.'
                  : <>Téléchargée : <b>{png.nom}</b></>}
          </div>
        )}
        {png && png.etat === 'geste' && <div className="mde-detail">Image prête ({png.nom}) : touche « Partager l’image ».</div>}
        <div className="mde-actions">
          <button type="button" className="mde-sec" onClick={() => onFermer()}>Annuler</button>
          <button type="button" className="md-exporter" disabled={!choisie} onClick={() => onEnvoyer(choisie, { fond: fondExport })}>
            <Icon name="upload" size={16} /> Envoyer
          </button>
        </div>
        {!SYNCHRO_ACTIVE && <div className="mde-detail">Synchro non configurée : le dessin restera sur ce téléphone.</div>}
      </div>
    </div>
  );
}

export function EcranDessin({ ctx, onQuit }) {
  const canvasRef = useRef(null);
  const active = useFicheActiveOrdi();
  const [feuille, setFeuille] = useState(false);
  const [envoi, setEnvoi] = useState(null); // { etat, statut, titre, message }
  const [png, setPng] = useState(null); // { etat: 'en-cours'|'geste'|'partage'|'annule'|'telechargement'|'erreur', nom, message }
  const pngPret = useRef(null); // { blob, nom } : image prête, en attente d'un toucher (activation perdue)

  /* (20/11) ENREGISTRER EN PNG — tout le dessin, cadré sur son contenu (marge de svgExport),
     ×3 ; aucune écriture : ni dessin, ni fiche, ni synchro. */
  const enregistrerPng = async ({ fond, titre }) => {
    const exp = canvasRef.current && canvasRef.current.svgExport({ fond });
    if (!exp) { setPng({ etat: 'erreur', message: 'Le dessin est vide.' }); return; }
    setPng({ etat: 'en-cours' });
    try {
      const { png: blob, largeur, hauteur } = await svgVersPng(exp.svg, exp.w, exp.h, {
        echelle: echellePng(exp.w, exp.h), peindre: (g, k) => peindreTextes(g, exp.mots || [], k),
      });
      const nom = nomFichierPng(titre);
      const voie = await remettrePng(blob, nom);
      if (voie === 'geste') pngPret.current = { blob, nom };
      try { window.__dernierExportPng = { nom, largeur, hauteur, octets: blob.size, voie, echelle: largeur / exp.w, w: exp.w, h: exp.h, mots: (exp.mots || []).length }; } catch (e) { /* ignore */ }
      setPng({ etat: voie, nom });
    } catch (e) {
      setPng({ etat: 'erreur', message: 'PNG impossible : ' + ((e && e.message) || e) });
    }
  };
  const partagerPngPret = async () => {
    const p = pngPret.current; if (!p) return;
    const voie = await remettrePng(p.blob, p.nom);
    if (voie !== 'geste') pngPret.current = null;
    try { if (window.__dernierExportPng) window.__dernierExportPng.voie = voie; } catch (e) { /* ignore */ }
    setPng({ etat: voie, nom: p.nom });
  };

  const envoyer = async (cible, { fond }) => {
    const exp = canvasRef.current && canvasRef.current.svgExport({ fond });
    if (!exp) { setEnvoi({ etat: 'erreur', message: 'Le dessin est vide.' }); return; }
    setEnvoi({ etat: 'en-cours' });
    try {
      const { png, largeur, hauteur } = await svgVersPng(exp.svg, exp.w, exp.h);
      const { statut } = await envoyerDessin(png, { ficheId: cible.id, titre: cible.titre, largeur, hauteur, textes: exp.textes || [] });
      setEnvoi({ etat: 'fini', statut, titre: cible.titre });
    } catch (e) {
      setEnvoi({ etat: 'erreur', message: 'Envoi impossible : ' + ((e && e.message) || e) });
    }
  };

  return (
    <>
      <MobileDessin onQuit={onQuit} canvasRef={canvasRef}
        barreHaut={<button type="button" className="md-exporter" onClick={() => setFeuille(true)} aria-label="Exporter"><Icon name="upload" size={16} /><span className="md-lbl">Exporter</span></button>} />
      {(feuille || envoi) && (
        <FeuilleExport ctx={ctx} active={active} envoi={envoi}
          onEnvoyer={envoyer} onPng={enregistrerPng} png={png} onPartagerPng={partagerPngPret}
          onFermer={(opts) => { if (opts && opts.vider && canvasRef.current) canvasRef.current.vider(); setFeuille(false); setEnvoi(null); setPng(null); pngPret.current = null; }} />
      )}
    </>
  );
}
