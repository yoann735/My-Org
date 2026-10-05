// OUTIL DE TEST (05/10, docs/compte-rendu-transcription-directe.md) — jamais chargé par l'app.
// Faux Deepgram local pour tester la transcription en direct SANS clé ni crédit :
//   node scripts/faux-deepgram.mjs            (port 54400)
//   DEEPGRAM_API_KEY=cle-de-test DEEPGRAM_API_URL=http://localhost:54400 \
//   DEEPGRAM_LISTEN_URL=ws://localhost:54400/v1/listen npx vite --port 5199
//
// Ce qu'il imite (d'après developers.deepgram.com) :
//  - POST /v1/auth/grant (Authorization: Token <clé>) → { access_token, expires_in } ;
//  - WebSocket /v1/listen, jeton par sous-protocole ["bearer", jeton] ; query keyterm=… répétée ;
//  - messages Results { is_final, speech_final, from_finalize, start, duration,
//    channel.alternatives[0].{transcript, words[]} } — interim toutes les ~0,5 s de parole,
//    final toutes les ~3 s de parole ou à la fin d'une phrase ;
//  - KeepAlive ; fermeture 1011 « NET-0001 » après 10 s sans audio ni KeepAlive ;
//  - Configure { keyterms } (remplace la liste) ; Finalize ; CloseStream.
// Ce n'est PAS de la reconnaissance vocale : le texte vient d'un script de cours d'anatomie,
// un mot par ~0,4 s de PAROLE détectée (énergie du signal). Le mot « ostéoclastes » sort
// « ostéo classe » tant que le mot-clé « ostéoclaste » n'est pas actif — de quoi vérifier
// qu'un Configure envoyé en pleine session est bien pris en compte.
//
// Pannes injectables : POST /__couper?refus=20 (coupe net toutes les connexions et refuse
// les nouvelles 20 s), POST /__geler?s=20 (connexion qui ne répond plus, sans fermer — le
// « wifi coupé » vu du navigateur), POST /__credits?zero=1 (grant → 402).
// État et journal : GET /__etat (secondes d'audio reçues = consommation simulée).
import http from 'http';
import crypto from 'crypto';

const PORT = Number(process.env.PORT || 54400);
const CLE = process.env.CLE || 'cle-de-test';
const jetons = new Map(); // jeton → expiration
const journal = [];
const connexions = new Set();
let refusJusqua = 0;
let creditsZero = false;
let secondesTotales = 0;
let motGlobal = 0;
const compte = { heures: '0.2', depense: '0.08', solde: '199.92', soldes: '200', facturation: '200', panne: '0', latence: '0' }; // le « cours » continue d'une connexion à l'autre : un trou ou un doublon se voit à la lecture
const log = (m) => { journal.push({ t: new Date().toISOString(), m }); if (journal.length > 500) journal.shift(); };

const SCRIPT = ("L'os est un tissu conjonctif spécialisé. Le tissu osseux compact est organisé en ostéons. "
  + "Chaque ostéon est centré sur un canal de Havers qui contient des vaisseaux et des nerfs. "
  + "Les canaux de Volkmann relient les canaux de Havers entre eux et avec le périoste. "
  + "Les ostéoblastes synthétisent la matrice osseuse, les ostéocytes l'entretiennent, "
  + "et les ostéoclastes résorbent l'os. Le remodelage osseux suit la loi de Wolff. "
  + "L'os spongieux est formé de travées entre lesquelles se trouve la moelle hématopoïétique. "
  + "Le périoste recouvre la surface externe de l'os, l'endoste tapisse la cavité médullaire. "
  + "La diaphyse est la partie moyenne d'un os long, les épiphyses en sont les extrémités. ").split(/\s+/).filter(Boolean);

/* ---------------- WebSocket minimal (RFC 6455, côté serveur) ---------------- */
function trame(op, payload) {
  const len = payload.length;
  let tete;
  if (len < 126) tete = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { tete = Buffer.alloc(4); tete[0] = 0x80 | op; tete[1] = 126; tete.writeUInt16BE(len, 2); }
  else { tete = Buffer.alloc(10); tete[0] = 0x80 | op; tete[1] = 127; tete.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([tete, payload]);
}
function lecteurTrames(onTrame) {
  let buf = Buffer.alloc(0);
  return (morceau) => {
    buf = Buffer.concat([buf, morceau]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 0x0f, masque = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const total = off + (masque ? 4 : 0) + len;
      if (buf.length < total) return;
      let data = buf.subarray(off + (masque ? 4 : 0), total);
      if (masque) { const m = buf.subarray(off, off + 4); data = Buffer.from(data.map((b, i) => b ^ m[i % 4])); }
      buf = buf.subarray(total);
      onTrame(op, data);
    }
  };
}

/* ---------------- une session de « transcription » ---------------- */
function session(socket, query) {
  const etat = {
    keyterms: query.getAll('keyterm'), echantillons: 0, parole: 0,
    enCours: [], // mots pas encore validés [{ word, start, end }]
    dernierInterim: 0, derniereActivite: Date.now(), gele: false, ferme: false, silence: 0, dernierFinalVide: 0,
  };
  connexions.add(etat);
  log(`ouverture — keyterms=${JSON.stringify(etat.keyterms)}`);
  const envoyer = (obj) => { if (!etat.ferme && !etat.gele) socket.write(trame(1, Buffer.from(JSON.stringify(obj)))); };
  const fermer = (code, raison) => {
    if (etat.ferme) return;
    const p = Buffer.alloc(2 + Buffer.byteLength(raison)); p.writeUInt16BE(code, 0); p.write(raison, 2);
    try { socket.write(trame(8, p)); } catch (e) { /* déjà coupé */ }
    etat.ferme = true; connexions.delete(etat);
    setTimeout(() => socket.destroy(), 100);
    log(`fermeture ${code} ${raison}`);
  };
  // Coupure : les mots jamais livrés (ni en interim ni en final) n'ont pas été « entendus »
  // par le client ; leur audio lui sera rejoué à la reconnexion, on les rend donc au script.
  const rendre = () => { const k = etat.enCours.find((m) => !m.livre); if (k) motGlobal = Math.min(motGlobal, k.idx); etat.enCours = []; };
  etat.couper = () => { rendre(); etat.ferme = true; connexions.delete(etat); socket.destroy(); log('coupure brutale'); };
  etat.geler = () => { rendre(); etat.gele = true; log('gel'); };
  const t = () => etat.echantillons / 16000;
  const resultat = (mots, isFinal, extra = {}) => {
    mots.forEach((m) => { m.livre = true; });
    const start = mots.length ? mots[0].start : Math.max(0, t() - 1);
    const end = mots.length ? mots[mots.length - 1].end : t();
    envoyer({
      type: 'Results', channel_index: [0, 1], duration: +(end - start).toFixed(3), start: +start.toFixed(3),
      is_final: isFinal, speech_final: !!extra.speech_final, from_finalize: !!extra.from_finalize,
      channel: { alternatives: [{ transcript: mots.map((m) => m.word).join(' '), confidence: 0.97, words: mots.map((m) => ({ word: m.word.toLowerCase().replace(/[.,]/g, ''), punctuated_word: m.word, start: +m.start.toFixed(3), end: +m.end.toFixed(3), confidence: 0.97 })) }] },
      metadata: { request_id: 'faux', model_info: { name: 'nova-3' } },
    });
  };
  const valider = (extra = {}) => {
    if (etat.enCours.length) resultat(etat.enCours, true, extra);
    else if (extra.from_finalize) resultat([], true, extra);
    etat.enCours = [];
  };
  const motSuivant = () => {
    let w = SCRIPT[motGlobal % SCRIPT.length]; motGlobal++;
    const avecCle = etat.keyterms.some((k) => /ostéoclaste/i.test(k));
    if (/^ostéoclastes/i.test(w) && !avecCle) w = w.replace(/^ostéoclastes/i, 'ostéo classe');
    return w;
  };
  const surAudio = (data) => {
    etat.derniereActivite = Date.now();
    const n = data.length / 2;
    let sq = 0;
    for (let i = 0; i + 1 < data.length; i += 2) { const v = data.readInt16LE(i) / 32768; sq += v * v; }
    const rms = Math.sqrt(sq / Math.max(1, n));
    const debut = t();
    etat.echantillons += n; secondesTotales += n / 16000;
    if (rms > 0.01) {
      etat.silence = 0;
      etat.parole += n / 16000;
      while (etat.parole >= 0.4) {
        etat.parole -= 0.4;
        const idx = motGlobal;
        const w = motSuivant();
        etat.enCours.push({ word: w, idx, start: debut, end: Math.min(t(), debut + 0.38) });
      }
    } else etat.silence += n / 16000;
    const dernier = etat.enCours[etat.enCours.length - 1];
    const finPhrase = dernier && /[.]$/.test(dernier.word);
    const duree = etat.enCours.length ? t() - etat.enCours[0].start : 0;
    if (etat.enCours.length && (duree >= 3 || finPhrase || etat.silence > 0.8)) valider({ speech_final: finPhrase || etat.silence > 0.8 });
    else if (etat.enCours.length && t() - etat.dernierInterim >= 0.5) { etat.dernierInterim = t(); resultat(etat.enCours, false); }
    else if (!etat.enCours.length && etat.silence > 0 && t() - etat.dernierFinalVide >= 3) { etat.dernierFinalVide = t(); resultat([], true); }
  };
  const surTexte = (txt) => {
    let msg; try { msg = JSON.parse(txt); } catch (e) { return; }
    etat.derniereActivite = Date.now();
    if (msg.type === 'KeepAlive') { log('KeepAlive'); return; }
    if (msg.type === 'Configure') { etat.keyterms = msg.keyterms || []; log(`Configure keyterms=${JSON.stringify(etat.keyterms)}`); return; }
    if (msg.type === 'Finalize') { log('Finalize'); valider({ from_finalize: true }); return; }
    if (msg.type === 'CloseStream') { log('CloseStream'); valider(); envoyer({ type: 'Metadata', duration: t() }); fermer(1000, ''); }
  };
  const lire = lecteurTrames((op, data) => {
    if (etat.gele || etat.ferme) return;
    if (op === 2) surAudio(data);
    else if (op === 1) surTexte(data.toString());
    else if (op === 8) fermer(1000, '');
    else if (op === 9) socket.write(trame(10, data));
  });
  socket.on('data', lire);
  socket.on('error', () => {});
  socket.on('close', () => { if (!etat.ferme) rendre(); etat.ferme = true; connexions.delete(etat); });
  const minuteur = setInterval(() => {
    if (etat.ferme) { clearInterval(minuteur); return; }
    if (!etat.gele && Date.now() - etat.derniereActivite > 10000) {
      clearInterval(minuteur);
      fermer(1011, 'Deepgram did not receive audio data or a text message within the timeout window. See https://dpgr.am/net0001');
    }
  }, 500);
}

/* ---------------- HTTP + upgrade ---------------- */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const serveur = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const out = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); };
  if (u.pathname === '/__etat') return out(200, { connexions: connexions.size, secondesAudio: +secondesTotales.toFixed(1), keyterms: [...connexions].map((c) => c.keyterms), journal: journal.slice(-120) });
  if (u.pathname === '/__couper') { refusJusqua = Date.now() + Number(u.searchParams.get('refus') || 0) * 1000; [...connexions].forEach((c) => c.couper()); return out(200, { ok: true }); }
  if (u.pathname === '/__geler') { refusJusqua = Date.now() + Number(u.searchParams.get('s') || 20) * 1000; [...connexions].forEach((c) => c.geler()); return out(200, { ok: true }); }
  if (u.pathname === '/__credits') { creditsZero = u.searchParams.get('zero') === '1'; return out(200, { creditsZero }); }
  // API de gestion (crédits, 05/10 v1.1) — réglable : POST /__compte?heures=0.2&depense=0.08&solde=199.92&soldes=403&facturation=403&panne=1
  if (u.pathname === '/__compte') { for (const [k, v] of u.searchParams) compte[k] = v; return out(200, compte); }
  if (u.pathname.startsWith('/v1/projects')) {
    log('gestion ' + u.pathname + u.search);
    if (compte.panne === '1') { req.socket.destroy(); return undefined; }
    if (+compte.latence > 0) await new Promise((r) => setTimeout(r, +compte.latence)); // ?latence=ms (voir la rotation d'« Actualiser »)
    if (req.headers.authorization !== 'Token ' + CLE) return out(401, { err_code: 'INVALID_AUTH' });
    if (u.pathname === '/v1/projects') return out(200, { projects: [{ project_id: 'proj-faux-1', name: 'Projet de test' }] });
    if (u.pathname === '/v1/projects/proj-faux-1/balances') return compte.soldes === '403' ? out(403, { err_code: 'FORBIDDEN' }) : out(200, { balances: [{ balance_id: 'b1', amount: +compte.solde, units: 'usd' }] });
    if (u.pathname === '/v1/projects/proj-faux-1/usage/breakdown') return out(200, { start: u.searchParams.get('start'), end: u.searchParams.get('end'), resolution: { units: 'day', amount: 1 }, results: [{ hours: +compte.heures * 0.6, total_hours: +compte.heures * 0.6, requests: 3 }, { hours: +compte.heures * 0.4, total_hours: +compte.heures * 0.4, requests: 2 }] });
    if (u.pathname === '/v1/projects/proj-faux-1/billing/breakdown') return compte.facturation === '403' ? out(403, { err_code: 'FORBIDDEN' }) : out(200, { results: [{ dollars: +compte.depense }] });
    return out(404, {});
  }
  if (u.pathname === '/v1/auth/grant' && req.method === 'POST') {
    if (Date.now() < refusJusqua) { req.socket.destroy(); return undefined; }
    if (req.headers.authorization !== 'Token ' + CLE) { log('grant 401'); return out(401, { err_code: 'INVALID_AUTH', err_msg: 'Invalid credentials.' }); }
    if (creditsZero) { log('grant 402'); return out(402, { err_code: 'INSUFFICIENT_CREDITS' }); }
    const jeton = 'faux.' + crypto.randomBytes(12).toString('hex');
    jetons.set(jeton, Date.now() + 300000);
    log('grant ok');
    return out(200, { access_token: jeton, expires_in: 300 });
  }
  return out(404, { err: 'not found' });
});
serveur.on('upgrade', (req, socket) => {
  const u = new URL(req.url, 'http://x');
  const protos = String(req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim());
  const jeton = protos[0] === 'bearer' ? protos[1] : null;
  if (Date.now() < refusJusqua) { socket.destroy(); log('connexion refusée (panne simulée)'); return; }
  if (u.pathname !== '/v1/listen' || !jeton || !(jetons.get(jeton) > Date.now())) {
    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); log('upgrade 401'); return;
  }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: bearer\r\n\r\n`);
  session(socket, u.searchParams);
});
serveur.listen(PORT, () => console.log(`faux Deepgram sur http://localhost:${PORT}`));
