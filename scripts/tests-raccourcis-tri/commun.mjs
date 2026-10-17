// Banc du 17/10 (raccourcis ⌘1–9, tri de la Bibliothèque) : Vite :5199 SANS Supabase + Chrome headless 9333.
export { ouvrir } from '../tests-emploi-du-temps/commun-edt.mjs';
/** touches avec ⌘ (Meta) : vraies séquences clavier CDP */
export function clavier(b) {
  const send = (p) => b.c.send('Input.dispatchKeyEvent', p);
  return {
    metaBas: () => send({ type: 'rawKeyDown', key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91, modifiers: 4 }),
    metaHaut: () => send({ type: 'keyUp', key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91, modifiers: 0 }),
    chiffre: async (n, { meta = true } = {}) => {
      const p = { key: String(n), code: 'Digit' + n, windowsVirtualKeyCode: 48 + n, modifiers: meta ? 4 : 0 };
      await send({ type: 'rawKeyDown', ...p }); await send({ type: 'keyUp', ...p }); await b.dormir(250);
    },
    cmd: async (n) => { await send({ type: 'rawKeyDown', key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91, modifiers: 4 }); const p = { key: String(n), code: 'Digit' + n, windowsVirtualKeyCode: 48 + n, modifiers: 4 }; await send({ type: 'rawKeyDown', ...p }); await send({ type: 'keyUp', ...p }); await send({ type: 'keyUp', key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91, modifiers: 0 }); await b.dormir(250); },
  };
}
/** sonde : chaque keydown Digit avec ⌘ est noté (defaultPrevented vu en fin de propagation) */
export const sonde = (b) => b.ev(`(()=>{window.__k=[];if(!window.__sonde){window.__sonde=1;window.addEventListener('keydown',e=>{if(/^Digit/.test(e.code)&&e.metaKey)window.__k.push({code:e.code,prevented:e.defaultPrevented,cible:(document.activeElement&&(document.activeElement.tagName+'.'+String(document.activeElement.className).slice(0,30)))||''})});}return 1})()`);
export const dernierePression = (b) => b.ev(`window.__k[window.__k.length-1]||null`);
export const outilActif = (b) => b.ev(`(()=>{const e=document.querySelector('.pdfr-barre .ptb-outil.actif, .pdfr-barre .tab-outil.actif');return e?(e.getAttribute('aria-label')||e.title.split(' · ')[0]):null})()`);
