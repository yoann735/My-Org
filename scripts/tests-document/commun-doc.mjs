// Outils communs des tests du chantier « nettoyage & document » (08/10)
import { connecter } from './cdp.mjs';
import fs from 'fs';
export async function banc(W = 1440, H = 900) {
  const c = await connecter();
  await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 1200 });
  await c.send('Runtime.enable');
  const erreurs = [];
  c.on((m) => { if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || '').slice(0, 200)); });
  const ok = (cond, msg, det = '') => console.log((cond ? '✅' : '❌') + ' ' + msg + (det ? ' — ' + det : ''));
  const clic = async (p, opts = {}) => { if (!p) throw new Error('cible introuvable'); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: opts.n || 1 }); await c.dormir(opts.att ?? 300); };
  const pos = (js, centre = true) => c.ev(`(()=>{const e=${js};if(!e)return null;${centre ? "e.scrollIntoView({block:'nearest'});" : ''}const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  const bouton = (txt, dans = 'document') => pos(`[...${dans === 'document' ? 'document' : `document.querySelector(${JSON.stringify(dans)})`}.querySelectorAll('button')].find(b=>b.innerText.trim().startsWith(${JSON.stringify(txt)})||(b.title||'').startsWith(${JSON.stringify(txt)})||(b.getAttribute('aria-label')||'')===${JSON.stringify(txt)})`);
  const touche = async (key, { meta = false, shift = false, code = null, vk = null, text = undefined } = {}) => {
    const modifiers = (meta ? 4 : 0) | (shift ? 8 : 0);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || key, windowsVirtualKeyCode: vk || 0, modifiers, text, unmodifiedText: text });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key, windowsVirtualKeyCode: vk || 0, modifiers });
    await c.dormir(50);
  };
  const T = {
    Enter: () => touche('Enter', { vk: 13, code: 'Enter', text: '\r' }), Escape: () => touche('Escape', { vk: 27 }), Tab: () => touche('Tab', { vk: 9 }),
    Bas: () => touche('ArrowDown', { vk: 40 }), Haut: () => touche('ArrowUp', { vk: 38 }), Retour: () => touche('Backspace', { vk: 8 }),
  };
  const ecrire = async (txt) => { for (const ch of txt) { if (ch === '\n') await T.Enter(); else await c.send('Input.dispatchKeyEvent', { type: 'char', text: ch }); } await c.dormir(60); };
  const capture = async (n, clip = null) => { const r = await c.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); fs.writeFileSync(`../cap/${n}.png`, Buffer.from(r.data, 'base64')); };
  const S = (js) => c.ev(`(async()=>{const u=performance.getEntriesByType('resource').map(e=>e.name);const S=await import(u.find(n=>n.includes('/medrevise/lib/storage.js')));${js}})()`);
  const fermerLecteur = async () => { await c.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(b=>(b.title||'')==='Revenir à la liste');r&&r.click();return 1})()`); await c.dormir(700); };
  const allerA = async (nom) => { await c.ev(`(()=>{const b=[...document.querySelectorAll('.sb-item')].find(e=>(e.title||e.innerText||'').startsWith(${JSON.stringify(nom)}));b&&b.click();return 1})()`); await c.dormir(900); };
  return { allerA, c, ev: c.ev, dormir: c.dormir, erreurs, ok, clic, pos, bouton, touche, T, ecrire, capture, S, fermerLecteur };
}
