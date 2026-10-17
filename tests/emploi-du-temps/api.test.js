// /api/timetable (api/timetable.js) : 503 sans HELHA_ICAL_URL, origine, cache, force limité,
// et le lien iCal n'apparaît JAMAIS dans une réponse (même en erreur).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';

const ICS = fs.readFileSync(new URL('./semaine-1bkine12.ics', import.meta.url), 'utf8');
const LIEN = 'https://planning.example.invalid/hp/Telechargements/ical/Edt_1BKINE12.ics?version=2024&icalsecurise=SECRET123';
function appel(handler, url = '/api/timetable', headers = { origin: 'https://my-org.vercel.app', host: 'my-org.vercel.app' }) {
  return new Promise((ok) => {
    const res = { code: 200, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, corps: o, brut: JSON.stringify(o) }); return this; } };
    handler({ method: 'POST', url, headers, socket: { remoteAddress: '1.2.3.' + Math.floor(Math.random() * 200) } }, res);
  });
}
async function charger() { vi.resetModules(); return (await import('../../api/timetable.js')).default; }

describe('/api/timetable', () => {
  beforeEach(() => { delete process.env.HELHA_ICAL_URL; vi.unstubAllGlobals(); });
  it('sans variable : 503 not_configured', async () => {
    const r = await appel(await charger());
    expect(r.code).toBe(503);
    expect(r.corps).toMatchObject({ ok: false, code: 'not_configured', message: 'Emploi du temps non configuré' });
  });
  it('origine étrangère refusée', async () => {
    process.env.HELHA_ICAL_URL = LIEN;
    const r = await appel(await charger(), '/api/timetable', { origin: 'https://ailleurs.example', host: 'my-org.vercel.app' });
    expect(r.code).toBe(403);
  });
  it('cache 60 min, force 1/min, lien jamais renvoyé', async () => {
    process.env.HELHA_ICAL_URL = LIEN;
    const f = vi.fn(async () => new Response(ICS, { status: 200 }));
    vi.stubGlobal('fetch', f);
    const h = await charger();
    const a = await appel(h);
    expect(a.code).toBe(200);
    expect(a.corps.events.length).toBeGreaterThan(5);
    await appel(h);
    expect(f).toHaveBeenCalledTimes(1); // servi par le cache
    await appel(h, '/api/timetable?force=1');
    expect(f).toHaveBeenCalledTimes(2);
    const limite = await appel(h, '/api/timetable?force=1');
    expect(f).toHaveBeenCalledTimes(2);
    expect(limite.corps.forceLimite).toBe(true);
    for (const r of [a, limite]) { expect(r.brut).not.toContain('SECRET123'); expect(r.brut).not.toContain('planning.example'); }
  });
  it('panne sans cache : message lisible, sans le lien', async () => {
    process.env.HELHA_ICAL_URL = LIEN;
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed ' + LIEN); }));
    const r = await appel(await charger());
    expect(r.code).toBe(502);
    expect(r.brut).not.toContain('SECRET123');
    expect(r.corps.message).toMatch(/Hyperplanning/);
  });
});
