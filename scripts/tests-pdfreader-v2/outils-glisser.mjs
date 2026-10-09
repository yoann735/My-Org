export const glisserAvec = (b) => async (a, z, pas = 14) => {
  const c = b.c;
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0], y: a[1] });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'left', clickCount: 1 });
  for (let k = 1; k <= pas; k++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0] + (z[0] - a[0]) * k / pas, y: a[1] + (z[1] - a[1]) * k / pas, button: 'left', buttons: 1 }); await b.dormir(30); }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: z[0], y: z[1], button: 'left', clickCount: 1 });
  await b.dormir(600);
};
export const collerImage = async (b, b64) => {
  await b.c.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'http://localhost:5199' });
  await b.ev(`(async()=>{const bin=atob(${JSON.stringify(b64)});const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);await navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([a],{type:'image/png'})})]);return 1})()`);
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4, commands: ['paste'] });
  await b.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 4 });
  await b.dormir(1500);
};
