// Mode tablette (820×1180, tactile) — tout le scénario dans UNE connexion (l'émulation saute à la déconnexion)
export async function tablette(B) {
  const { c, dormir } = B;
  await c.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await dormir(1200);
  const tap = async (p, att = 500) => {
    if (!p) throw new Error('cible introuvable');
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1] }] });
    await dormir(60);
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await dormir(att);
  };
  // trait au stylet (pointerType pen)
  const stylet = async (p) => {
    const ev = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', pointerType: 'pen', ...extra });
    await ev('mouseMoved', p[0], p[1], { button: 'none' });
    await ev('mousePressed', p[0], p[1], { clickCount: 1, buttons: 1 });
    for (let i = 1; i <= 10; i++) { await ev('mouseMoved', p[0] + (p[2] - p[0]) * i / 10, p[1] + (p[3] - p[1]) * i / 10, { buttons: 1 }); await dormir(30); }
    await ev('mouseReleased', p[2], p[3], { clickCount: 1 });
    await dormir(700);
  };
  return { tap, stylet };
}
