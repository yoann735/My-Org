// glisser HTML5 réel par CDP : appui + mouvement sur la source (glisser intercepté), puis dragEnter/Over/drop sur la cible
export function outilsGlisse(b) {
  const glisserVers = async (src, cible, { pendant = null } = {}) => {
    await b.c.send('Input.setInterceptDrags', { enabled: true });
    let data = null;
    const attente = new Promise((ok) => b.c.on((m) => { if (m.method === 'Input.dragIntercepted') { data = m.params.data; ok(); } }));
    await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: src[0], y: src[1] });
    await b.c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: src[0], y: src[1], button: 'left', clickCount: 1 });
    for (let k = 1; k <= 6; k++) { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: src[0] + k * 6, y: src[1] + k * 3, button: 'left', buttons: 1 }); await b.dormir(30); }
    await Promise.race([attente, b.dormir(2000)]);
    if (!data) { await b.c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: src[0], y: src[1], button: 'left' }); return { ok: false }; }
    await b.c.send('Input.dispatchDragEvent', { type: 'dragEnter', x: cible[0], y: cible[1], data });
    await b.c.send('Input.dispatchDragEvent', { type: 'dragOver', x: cible[0], y: cible[1], data });
    await b.dormir(150);
    const pendantVal = pendant ? await pendant() : null;
    await b.c.send('Input.dispatchDragEvent', { type: 'drop', x: cible[0], y: cible[1], data });
    await b.c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cible[0], y: cible[1], button: 'left' });
    await b.c.send('Input.setInterceptDrags', { enabled: false });
    await b.dormir(700);
    return { ok: true, data, pendant: pendantVal };
  };
  const onglet = () => b.pos(`document.querySelector('.sb-appr')`, false);
  const liste = () => b.S(`const r=await S.getOne('learning_set','learning_set');return JSON.stringify(r||{})`).then(JSON.parse);
  return { glisserVers, onglet, liste };
}
