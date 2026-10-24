// (24/10) Images collées : gestes communs aux 4 contextes (lecteur, fiche jumelle, document, tableau) —
// vrais événements souris CDP (Maj = modificateur 8), cadre de rognage commun (lib/rognageImage.js, .rgn).
export function outilsImages(b, { tactile = false } = {}) {
  const souris = (type, x, y, opts = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...opts });
  // glisser de (x, y) de (dx, dy) en 12 pas ; `maj` : touche Maj enfoncée pendant le geste
  const glisser = async ([x, y], dx, dy, { maj = false } = {}) => {
    if (tactile) { // doigt : appui, 12 pas, relâché (≥ 50 ms après le dernier pas)
      await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let k = 1; k <= 12; k++) { await b.c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * k) / 12, y: y + (dy * k) / 12 }] }); await b.dormir(25); }
      await b.dormir(60);
      await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await b.dormir(500);
      return;
    }
    const modifiers = maj ? 8 : 0;
    await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
    await souris('mousePressed', x, y, { modifiers });
    for (let k = 1; k <= 12; k++) { await souris('mouseMoved', x + (dx * k) / 12, y + (dy * k) / 12, { modifiers }); await b.dormir(25); }
    await souris('mouseReleased', x + dx, y + dy, { modifiers });
    await b.dormir(500);
  };
  const coin = async (racine, c) => { await b.ev(`(() => { const e = ${racine}; if (e) { const r = e.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 60) e.scrollIntoView({ block: 'center' }); } return 1; })()`); await b.dormir(350); return coinBrut(racine, c); };
  const coinBrut = (racine, c) => b.ev(`(() => { const e = ${racine}; const k = e && e.querySelector('.sel-coin.sel-${c}, .pti-poignee.${{ nw: 'hg', ne: 'hd', sw: 'bg', se: 'bd' }[c]}'); if (!k) return null; const r = k.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  const rect = (sel) => b.ev(`(() => { const e = ${sel}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; })()`);
  const rgnOuvert = () => b.ev(`!!document.querySelector('.rgn')`);
  const rgnCoin = (c) => b.ev(`(() => { const k = document.querySelector('.rgn .rgn-${c}'); if (!k) return null; const r = k.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  const entree = () => b.touche('Enter', { vk: 13, code: 'Enter', text: '\r' });
  const echap = () => b.touche('Escape', { vk: 27, code: 'Escape' });
  const annulerZ = async () => { await b.touche('z', { meta: true, code: 'KeyZ', vk: 90 }); await b.dormir(500); };
  // une image PNG (dégradé + damier, 400 × 260) collée par un vrai événement « paste » sur l'élément actif
  const collerImage = (cible = 'document.activeElement') => b.ev(`(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 260; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 400, 260); g.addColorStop(0, '#7c5cff'); g.addColorStop(1, '#ffb020'); x.fillStyle = g; x.fillRect(0, 0, 400, 260);
    x.fillStyle = '#fff'; for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) if ((i + j) % 2) x.fillRect(i * 50, j * 52, 50, 52);
    x.fillStyle = '#000'; x.font = 'bold 40px sans-serif'; x.fillText('MedRevise', 90, 145);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'test.png', { type: 'image/png' }));
    const el = ${cible} || document.body; el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`);
  const tap = async ([x, y], att = 500) => { await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await b.dormir(60); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(att); };
  return { tap, glisser, coin, rect, rgnOuvert, rgnCoin, entree, echap, annulerZ, collerImage };
}
