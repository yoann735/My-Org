// Mini client CDP sans dépendance (WebSocket global de Node).
export async function connecter(filtre = process.env.CDP_FILTRE || '5199') {
  const port = process.env.CDP_PORT || 9333;
  const liste = await (await fetch('http://localhost:' + port + '/json')).json();
  let t = liste.find((x) => x.type === 'page' && x.url.includes(filtre)) || liste.find((x) => x.type === 'page');
  await fetch('http://localhost:' + port + '/json/activate/' + t.id);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const att = new Map(); const ecouteurs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && att.has(m.id)) { const { ok, ko } = att.get(m.id); att.delete(m.id); m.error ? ko(new Error(JSON.stringify(m.error))) : ok(m.result); }
    else if (m.method) ecouteurs.forEach((f) => f(m));
  });
  const send = (method, params = {}) => new Promise((ok, ko) => { const i = ++id; att.set(i, { ok, ko }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
  };
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  return { ws, send, ev, dormir, on: (f) => ecouteurs.push(f), fermer: () => ws.close() };
}
