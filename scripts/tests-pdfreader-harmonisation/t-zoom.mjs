// CONTRÔLES SUR / ENTRE LES PAGES À L'ÉCHELLE DU ZOOM : « Insérer une page ici », badge du transcript, étiquette
// d'une page ajoutée — en unités de page (taille à 160 % × zoom ÷ 160 %), au plus 1,25 ×, jamais sous 18 px de haut ;
// en dessous : la fine ligne « + » (insertion) et la pastille sans texte (badge, « Retirer »). De 25 % à 300 %.
// Usage : node t-zoom.mjs [ipad]
import { banc, FICHE } from './commun.mjs';
const ipad = process.argv[2] === 'ipad';
const b = await banc(1440, 900, { tactile: ipad });
const AJOUT = { id: 'z-page', ficheId: FICHE, kind: 'page', type: 'page', apres: 1, rang: 0, width: 842, height: 595, createdAt: '2026-10-21T12:00:00.000Z', updatedAt: '2026-10-21T12:00:00.000Z' };
await b.preparer([AJOUT]);
const SESSION = { id: 'ts-h-zoom', kind: 'session', courseId: FICHE, startedAt: '2026-10-20T08:00:00.000Z', endedAt: '2026-10-20T08:01:00.000Z', source: 'micro', keyterms: [],
  segments: [1, 2, 3].map((i) => ({ id: 'sg-z' + i, t0: i * 3, t1: i * 3 + 2, text: 'Ligne ' + i + ' du cours.', status: 'final', page: 1 })),
  notes: [], fontSize: 'm', durationS: 60, createdAt: '2026-10-20T08:00:00.000Z', updatedAt: '2026-10-20T08:01:00.000Z' };
await b.S(`for(const r of await S.getAll('transcript_session'))if(r.id==='ts-h-zoom')await S.remove('transcript_session',r.id);await S.put('transcript_session',${JSON.stringify(SESSION)});return 1`);
await b.ouvrirCours({ ipad });
const mesure = (z) => b.ev(`(async()=>{window.__mrZoom(${z});await new Promise(r=>setTimeout(r,1300));
  const z1=document.querySelector('.pdfr-scroll');const dorm=(t)=>new Promise(r=>setTimeout(r,t));
  const voir=async(sel)=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect(),q=z1.getBoundingClientRect();z1.scrollTop+=r.y-(q.y+q.height*0.4);await dorm(700);const e2=document.querySelector(sel);return e2&&e2.getBoundingClientRect()};
  const out={};
  const pg=await voir('.pdfr-page[data-cle="1"]');out.page=pg&&+pg.height.toFixed(1);
  const bd=await voir('.pdfr-page[data-cle="1"] .pdfr-trx-badge');const be=document.querySelector('.pdfr-page[data-cle="1"] .pdfr-trx-badge');
  out.badge=bd&&{h:+bd.height.toFixed(1),texte:be.innerText.trim()};
  const rt=await voir('.pdfr-page[data-cle="z-page"] .pdfr-ajout-retirer');const re=document.querySelector('.pdfr-page[data-cle="z-page"] .pdfr-ajout-retirer');
  out.retirer=rt&&{h:+rt.height.toFixed(1),texte:re.innerText.trim()};
  return out})()`);
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.6, 2, 2.5, 3];
const lignes = [];
const pres = (a, c) => Math.abs(a - c) <= 0.6;
for (const z of ZOOMS) {
  const m = await mesure(z);
  const k = z / 1.6, ec = Math.min(k, 1.25), reduit = 22 * k < 18;
  const attB = Math.max(18, 22 * ec), attR = Math.max(18, 28 * ec);
  const okInter = true; // « Insérer une page » : t-inserer.mjs (22/10)
  const okBadge = m.badge && pres(m.badge.h, attB) && (reduit ? m.badge.texte === '3' : /3\s*lignes/.test(m.badge.texte));
  const okRetirer = m.retirer && pres(m.retirer.h, attR) && (28 * k < 18 ? !m.retirer.texte : /Retirer/.test(m.retirer.texte));
  b.ok(okInter && okBadge && okRetirer, `zoom ${Math.round(z * 100)} % : badge ${attB.toFixed(1)} px, « Retirer » ${attR.toFixed(1)} px${28 * k < 18 ? ' (icône)' : ''}`, JSON.stringify(m));
  lignes.push(`| ${Math.round(z * 100)} % | ${m.page} | ${m.badge ? m.badge.h + ' px « ' + m.badge.texte.replace(/\s+/g, ' ') + ' »' : '—'} | ${m.retirer ? m.retirer.h + ' px' + (m.retirer.texte ? '' : ' (icône)') : '—'} |`);
  if ([0.5, 1.6, 3].includes(z) && !ipad) {
    for (const [nom, sel, l, h] of [['badge', '.pdfr-page[data-cle="1"] .pdfr-trx-badge', 260, 70]]) {
      const r = await b.ev(`(()=>{const z1=document.querySelector('.pdfr-scroll');const e=document.querySelector('${sel}');const r=e.getBoundingClientRect(),q=z1.getBoundingClientRect();z1.scrollTop+=r.y-(q.y+q.height*0.4);const r2=e.getBoundingClientRect();return {x:r2.x,y:r2.y,w:r2.width,h:r2.height}})()`);
      await b.dormir(500);
      const R = nom === 'insertion' ? { x: Math.max(0, r.x + r.w / 2 - 260), y: Math.max(0, r.y - 30), width: 520, height: Math.round(r.h + 60) } : { x: Math.max(0, Math.round(r.x + r.w - l)), y: Math.max(0, Math.round(r.y - 14)), width: l + 14, height: h };
      await b.capture(`zoom-${Math.round(z * 100)}-${nom}`, { x: Math.round(R.x), y: Math.round(R.y), width: Math.round(R.width), height: Math.round(R.height) });
    }
  }
}
console.log(['| Zoom | Hauteur de page | Badge transcript | « Retirer la page » |', '|---|---|---|---|', ...lignes].join('\n'));
await b.S(`await S.remove('transcript_session','ts-h-zoom');return 1`);
b.ok(!b.erreurs.length, 'aucune erreur', b.erreurs.join(' | '));
process.exit(0);
