// Banc « suivi automatique des diapos » (24/11/2026, docs/compte-rendu-suivi-auto-diapos.md). DONNÉES DE TEST UNIQUEMENT.
//   Vite :5304 (config « medrevise-banc-diapos » de .claude/launch.json : SANS cloud, faux Deepgram :54410) ;
//   faux Deepgram :54410 (« faux-deepgram-diapos », seuil de parole très bas) ; faux Teams :54411 (« faux-teams »).
//   Chrome FENÊTRÉ hors de l'écran (la capture d'onglet ne marche pas en headless), profil neuf, port 9402, choix de
//   l'onglet partagé AUTOMATIQUE (--auto-select-tab-capture-source-by-title=Faux Teams) : c'est le vrai partage
//   d'onglet de Chrome, avec sa vraie piste vidéo et son vrai son.
//   SILENCE : le son du faux Teams est très faible (≈ −50 dB) ET n'est jamais joué localement — le banc ajoute
//   `suppressLocalAudioPlayback` à la demande de partage de la page (dans le banc seulement, l'app n'est pas modifiée)
//   et le faux Teams ne lance son son qu'APRÈS le début de la capture.
// Le PDF d'histologie (PDF_HISTO, ou celui généré par gen-histo.mjs) reste hors du dépôt ($TRAVAIL).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TRAVAIL = process.env.TRAVAIL || path.join(os.tmpdir(), 'banc-suivi-diapos');
export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const BASE = process.env.BASE || 'http://localhost:5304';
export const TEAMS = process.env.TEAMS || 'http://localhost:54411';
export const DEEPGRAM = process.env.DEEPGRAM || 'http://localhost:54410';
export const PORT_CHROME = Number(process.env.PORT_CHROME || 9402);
export const DOSSIER_IMG = fileURLToPath(new URL('../../docs/img/suivi-auto-diapos/', import.meta.url));
/* (26/11) PARTAGE D'ONGLET DU BANC, SILENCIEUX : Chrome est lancé avec --mute-audio (jamais de son sur le Mac), ce qui coupe
   aussi le son capturé. La page de l'app remplace donc la piste AUDIO du partage par une « voix » synthétique (bruit filtré
   par phrases de 2,6 s, ≈ −50 dB) produite dans la page et JAMAIS reliée aux haut-parleurs (MediaStreamDestination seule).
   La piste VIDÉO reste celle du vrai partage d'onglet de Chrome. Compte les demandes de partage. Banc seulement. */
export const INJECTION_PARTAGE = `(() => { const gdm = navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
  if (!gdm) return; navigator.mediaDevices.getDisplayMedia = async function (c) { c = c || {};
    if (c.audio) c.audio = Object.assign({}, typeof c.audio === 'object' ? c.audio : {}, { suppressLocalAudioPlayback: true });
    window.__partageDemandes = (window.__partageDemandes || 0) + 1;
    const flux = await gdm.call(this, c);
    if (!c.audio) return flux;
    const ac = new AudioContext(); try { await ac.resume(); } catch (e) {}
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = buf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { b = 0.9 * b + 0.1 * (Math.random() * 2 - 1); d[i] = b * 3; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ac.createGain(); g.gain.value = 0; const dest = ac.createMediaStreamDestination();
    src.connect(g); g.connect(dest); src.start(); // JAMAIS ac.destination
    let t = ac.currentTime + 0.1; const plan = () => { while (t < ac.currentTime + 10) { g.gain.setValueAtTime(0.004, t); t += 2.6; g.gain.setValueAtTime(0, t); t += 0.7; } };
    plan(); setInterval(plan, 4000); window.__voixBanc = ac;
    flux.getAudioTracks().forEach((p) => { flux.removeTrack(p); p.stop(); });
    flux.addTrack(dest.stream.getAudioTracks()[0]);
    return flux; }; })();`;
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(TRAVAIL, { recursive: true });

/** client CDP minimal sur la page `cible` (ou une nouvelle page) */
export async function cdp(port, { url = null, cible = null } = {}) {
  let t = cible;
  if (!t) {
    const l = (await (await fetch(`http://localhost:${port}/json`)).json()).filter((x) => x.type === 'page');
    t = url ? await (await fetch(`http://localhost:${port}/json/new?${url}`, { method: 'PUT' })).json() : l[0];
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let n = 0; const att = new Map(); const ecouteurs = new Set();
  const b = { id: t.id, erreurs: [], console: [] };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && att.has(m.id)) { att.get(m.id)(m); att.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') b.erreurs.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled') { const txt = m.params.args.map((a) => a.value ?? a.description ?? '').join(' '); b.console.push(m.params.type + ' ' + txt); if (m.params.type === 'error') b.erreurs.push(txt); }
    ecouteurs.forEach((f) => f(m));
  });
  b.send = (method, params = {}) => new Promise((res) => { const id = ++n; att.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  b.on = (f) => ecouteurs.add(f);
  b.ev = async (expression) => {
    const r = await b.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('ev: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 700));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  b.attendre = async (expr, ms = 15000, pas = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await b.ev(expr)) return true; } catch (e) { /* chargement */ } await dormir(pas); } return false; };
  b.point = async (x, y) => { for (const ty of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type: ty, x, y, button: 'left', clickCount: 1 }); };
  b.clic = async (js, att = 300) => {
    const r = await b.ev(`(() => { const e = ${js}; if (!e) return null; e.scrollIntoView && e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
    if (!r) return false; await b.point(r.x, r.y); await dormir(att); return true;
  };
  b.capture = async (fichier, clip = null) => { const s = await b.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); fs.writeFileSync(fichier, Buffer.from(s.result.data, 'base64')); return fichier; };
  b.S = (corps) => b.ev(`(async () => { const S = await import('/src/medrevise/lib/storage.js'); ${corps} })()`);
  b.fermer = () => { try { ws.close(); } catch (e) { /* ignore */ } };
  await b.send('Runtime.enable'); await b.send('Page.enable');
  return b;
}

/** Chrome du banc : fenêtré HORS de l'écran (jamais devant toi), profil neuf, partage d'onglet automatique */
export async function lancerChrome({ profil = process.env.PROFIL || 'chrome-banc', autoriser = false, garder = false } = {}) {
  const dir = path.join(TRAVAIL, profil);
  if (!garder) fs.rmSync(dir, { recursive: true, force: true });
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT_CHROME}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--window-position=-3000,0', '--window-size=1440,900', '--auto-select-tab-capture-source-by-title=Faux Teams',
    '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', // micro FACTICE : jamais le vrai micro du Mac
    // (26/11) AUCUN drapeau qui désactive le ralentissement des onglets en arrière-plan : le banc subit les mêmes
    // règles que le Chrome de l'étudiant (minuteries ralenties, onglet caché, fenêtre réduite).
    '--mute-audio', // jamais de son pendant un banc (la capture d'onglet reçoit quand même le son)
    ...(autoriser ? ['--use-fake-ui-for-media-stream'] : []), // accepte la demande de micro (factice) sans fenêtre
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT_CHROME}/json/version`); break; } catch (e) { await dormir(250); } }
  // micro (factice) autorisé d'avance pour l'app : aucune fenêtre d'autorisation
  try {
    const v = await (await fetch(`http://localhost:${PORT_CHROME}/json/version`)).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
    await new Promise((r) => { ws.addEventListener('message', r, { once: true }); ws.send(JSON.stringify({ id: 1, method: 'Browser.grantPermissions', params: { origin: BASE, permissions: ['audioCapture'] } })); });
    ws.close();
  } catch (e) { /* sans autorisation : la feuille le dira */ }
  return { process: p, arreter: () => { try { p.kill('SIGKILL'); } catch (e) { /* déjà arrêté */ } } };
}

/** CPU cumulé (s) de tous les processus du Chrome du banc (CDP SystemInfo.getProcessInfo, cible « navigateur ») */
export async function cpuChrome() {
  const v = await (await fetch(`http://localhost:${PORT_CHROME}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const rep = await new Promise((r) => { ws.addEventListener('message', (e) => r(JSON.parse(e.data))); ws.send(JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' })); });
  ws.close();
  const l = (rep.result && rep.result.processInfo) || [];
  return { total: l.reduce((s, p) => s + (p.cpuTime || 0), 0), parType: l.reduce((o, p) => { o[p.type] = (o[p.type] || 0) + (p.cpuTime || 0); return o; }, {}) };
}

export const ok = (() => { const r = []; const f = (c, m, d = '') => { const l = (c ? '✅' : '❌') + ' ' + m + (d ? ' — ' + d : ''); console.log(l); r.push({ ok: !!c, m, d }); return c; }; f.resultats = r; return f; })();

/** (26/11) banc commun « cours Teams + app » : le faux Teams, l'app (partage silencieux), le cours d'histologie et un autre
 *  cours ; rend { teams, nb, app, ouvrir(titre), demarrerOnglet() → mots Deepgram avant le départ }.
 *  `emulation` : { width, height, mobile, touch } (tablette / téléphone) appliqué à l'onglet de l'app. */
export async function ouvrirBanc({ emulation = null } = {}) {
  const COURS = 'f-diapos-histo', AUTRE_COURS = 'f-diapos-autre';
  const teams = await cdp(PORT_CHROME, { url: TEAMS + '/' + (process.env.TEAMS_VIDEO ? '?video=1' : '') });
  ok(await teams.attendre('window.pret === true', 60000), 'faux Teams prêt');
  const nb = await teams.ev('window.nbDiapos');
  const app = await cdp(PORT_CHROME, { url: 'about:blank' });
  await app.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECTION_PARTAGE });
  await app.send('Page.navigate', { url: BASE + '/medrevise' });
  await app.attendre(`document.readyState === 'complete'`, 30000);
  await app.ev(`(localStorage.setItem('app.current', '"medrevise"'), 1)`);
  await app.send('Page.reload'); await app.attendre(`document.readyState === 'complete'`, 30000); await dormir(3000);
  const pdf = fs.readFileSync(process.env.PDF_HISTO || path.join(TRAVAIL, 'histo-banc.pdf')).toString('base64');
  const autre = fs.readFileSync(path.join(TRAVAIL, 'autre.pdf')).toString('base64');
  await app.S(`const bin=(b)=>{const s=atob(b);const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new Blob([a],{type:'application/pdf'})};
  await S.put('sources',{id:'src-diapos',nom:'Banc diapos',couleur:'#2dd4bf'});await S.put('matieres',{id:'mat-diapos',nom:'Histologie (banc)',sourceId:'src-diapos'});
  const p1=await S.putBlob(bin(${JSON.stringify(pdf)}));const p2=await S.putBlob(bin(${JSON.stringify(autre)}));
  await S.put('fiches',{id:'${COURS}',matiereId:'mat-diapos',dossierId:null,titre:'Histologie générale (banc)',type:'standard',pdfId:p1,pdfName:'histo.pdf',dateImport:'2026-11-24'});
  await S.put('fiches',{id:'${AUTRE_COURS}',matiereId:'mat-diapos',dossierId:null,titre:'Autre cours (banc)',type:'standard',pdfId:p2,pdfName:'autre.pdf',dateImport:'2026-11-24'});return 1`);
  await app.send('Page.reload'); await app.attendre(`document.readyState === 'complete'`, 30000); await dormir(3500);
  const ouvrir = async (titre) => {
    await app.ev(`(()=>{const x=[...document.querySelectorAll('.hub-card')].find(e=>/MedRevise/.test(e.innerText||''));x&&x.click();return 1})()`); await dormir(1200);
    await app.ev(`(()=>{const b=[...document.querySelectorAll('.sb-item, .sidebar [role=button], .sidebar button, .sidebar a')].find(e=>/Biblioth/.test(e.innerText||e.title||''));b&&b.click();return 1})()`); await dormir(1000);
    await app.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(b=>(b.title||'')==='Revenir à la liste'||b.getAttribute('aria-label')==='Retour');r&&r.click();return 1})()`); await dormir(700);
    for (let k = 0; k < 4; k++) {
      await app.ev(`(([...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(titre)}))||{querySelector:()=>null}).querySelector('.lt-rangee')||{click(){}}).click(),1`);
      if (await app.attendre(`!!document.querySelector('.pdfr-scroll')`, 5000)) return true;
      await dormir(800);
    }
    return false;
  };
  const demarrerOnglet = async () => {
    await app.send('Page.bringToFront');
    await app.ev(`([...document.querySelectorAll('.pm-seg-btn')].find(x=>x.innerText.trim().startsWith('Transcript'))||{click(){}}).click(),1`); await dormir(900);
    let avant = 0;
    for (let essai = 0; essai < 4 && !(await app.ev(`window.__transcription && window.__transcription.lireEtat().phase==='live'`)); essai++) {
      if (!(await app.ev(`!!document.querySelector('.trx-feuille select')`))) { await app.ev(`([...document.querySelectorAll('.trx-accueil button')].find(x=>/Transcrire le cours/.test(x.innerText))||{click(){}}).click(),1`); await dormir(1500); }
      // séances liées à l'agenda (26/11) : la fenêtre « Lier à un cours » peut s'ouvrir — « Passer »
      await app.ev(`([...document.querySelectorAll('button')].find(x=>/^Passer$/.test(x.innerText.trim()))||{click(){}}).click(),1`);
      if (!(await app.attendre(`!!document.querySelector('.trx-feuille select')`, 6000))) continue;
      await app.ev(`(()=>{const s=document.querySelector('.trx-feuille select');const o=[...s.options].find(o=>o.value==='onglet');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
      await dormir(500);
      avant = (await (await fetch(DEEPGRAM + '/__mots')).json()).total;
      await app.attendre(`(()=>{const x=[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop();return !!x&&!x.disabled})()`, 10000);
      await app.send('Page.bringToFront');
      await app.clic(`[...document.querySelectorAll('.trx-feuille button')].filter(x=>/Démarrer/.test(x.innerText)).pop()`, 500);
      await app.attendre(`window.__transcription.lireEtat().phase==='live'`, 12000);
    }
    return avant;
  };
  return { teams, nb, app, ouvrir, demarrerOnglet, COURS, AUTRE_COURS };
}
