// Banc « Enregistrer un dessin en PNG · retour au cours depuis la barre de transcription » (20/11/2026,
// docs/compte-rendu-export-png-et-retour-transcription.md). DONNÉES DE TEST UNIQUEMENT, jamais le vrai cloud.
//   Vite :5330 = code du chantier, SANS cloud (VITE_SUPABASE_URL=), avec DEEPGRAM_API_KEY=cle-de-test
//     DEEPGRAM_API_URL=http://localhost:54400 DEEPGRAM_LISTEN_URL=ws://localhost:54400/v1/listen ;
//   faux Deepgram :54400 (node scripts/faux-deepgram.mjs) ; Vite :5331 = code d'avant (git archive HEAD, cacheDir séparé) ;
//   Chrome headless aux profils NEUFS, micro simulé (--use-fake-device-for-media-stream
//   — des bips, détectés comme parole par le faux Deepgram) : 9345 ordinateur, 9346 téléphone, 9347 tablette. Outils CDP du
//   banc du mode file d'attente (../tests-file-attente/commun.mjs).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appareil as appareilFA, dormir } from '../tests-file-attente/commun.mjs';

export { dormir };
export const BASE = process.env.BASE || 'http://localhost:5330';
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/export-png-retour/', import.meta.url));
fs.mkdirSync(DOSSIER_IMG, { recursive: true });

const UA = {
  iphone: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', platform: 'iPhone' },
  ipad: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', platform: 'MacIntel' },
  mac: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', platform: 'MacIntel' },
};

/** `profil` : 'tel' (iPhone 390×844), 'ipad' (iPad mini portrait 744×1133 tactile : shell du téléphone, où vit
    l'écran Dessin), 'ordi-etroit' (Mac, fenêtre de 700 px : shell du téléphone à la souris), 'ordi' (1440×900),
    'tablette' (iPad 820×1180 tactile : shell d'ordinateur). */
export async function appareil(profil) {
  const port = { tel: 'tel', ipad: 'tablette', 'ordi-etroit': 'ordi', ordi: 'ordi', tablette: 'tablette' }[profil];
  const b = await appareilFA(port, BASE);
  b.nom = { tel: 'téléphone', ipad: 'iPad mini', 'ordi-etroit': 'ordinateur (fenêtre étroite)', ordi: 'ordinateur', tablette: 'iPad' }[profil];
  const ua = profil === 'tel' ? UA.iphone : profil === 'ipad' || profil === 'tablette' ? UA.ipad : UA.mac;
  await b.send('Emulation.setUserAgentOverride', ua);
  if (profil === 'ipad') { b.W = 744; b.H = 1133; await b.send('Emulation.setDeviceMetricsOverride', { width: 744, height: 1133, deviceScaleFactor: 2, mobile: true }); }
  if (profil === 'ordi-etroit') { b.W = 700; b.H = 900; await b.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 2, mobile: false }); }
  b.profil = profil;
  b.capture = async (nom) => { await b.send('Page.bringToFront'); const s = await b.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(DOSSIER_IMG + nom + '-' + profil + '.png', Buffer.from(s.result.data, 'base64')); };
  const pointFA = b.point;
  b.point = async (x, y, att) => { await b.send('Page.bringToFront'); return pointFA(x, y, att); };
  /** clic sans défilement (éléments fixes) */
  b.clicFixe = async (js, att = 300) => { await dormir(120); const r = await b.ev('(() => { const e = ' + js + '; if (!e) return null; const r = e.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()'); if (!r) return false; await b.point(r.cx, r.cy, att); return true; };
  /** glisser (doigt ou souris) le long de points d'écran */
  b.glisser = async (pts) => {
    if (b.tactile) {
      await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1], id: 1 }] });
      for (const [x, y] of pts.slice(1)) { await dormir(16); await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }); }
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1] });
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
      for (const [x, y] of pts.slice(1)) { await dormir(16); await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }); }
      const [x, y] = pts[pts.length - 1];
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    await dormir(400);
  };
  b.S = (corps) => b.ev(`(async () => { const S = await __imp('/src/medrevise/lib/storage.js'); ${corps} })()`);
  /** empreinte de TOUTES les données locales (IndexedDB de l'app + localStorage) : rien ne doit bouger à l'export */
  b.empreinte = () => b.S(`const stores = ['fiches', 'annotations', 'dessins', 'transcript_session', 'reading_position', 'questions', 'highlights'];
    const out = {}; for (const s of stores) { try { out[s] = JSON.stringify(await S.getAll(s)); } catch (e) { out[s] = 'absent'; } }
    const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^__|mr\\.dernier|infobulle/i.test(k)) ls[k] = localStorage.getItem(k); }
    out.localStorage = JSON.stringify(Object.keys(ls).sort().map((k) => [k, ls[k]])); return out;`);
  return b;
}

/** sème une section, une matière et des fiches (PDF en base64 éventuels) par le module de stockage de l'app */
export async function semer(b, fiches) {
  return b.S(`const blob = (b64) => { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: 'application/pdf' }); };
    await S.put('sources', { id: 'pr-src', nom: 'Section test', rappelsJ: true });
    await S.put('matieres', { id: 'pr-mat', nom: 'Matière test', sourceId: 'pr-src' });
    for (const f of ${JSON.stringify(fiches)}) { const r = { ...f }; if (r.pdf64) { r.pdfId = await S.putBlob(blob(r.pdf64)); delete r.pdf64; } await S.put('fiches', r); }
    return 1;`);
}
