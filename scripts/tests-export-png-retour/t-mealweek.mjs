// Non-régression MealWeek : hub puis MealWeek ouverte, capturés avant (Vite :5331 = code d'avant le chantier, git
// archive HEAD, cache séparé) et après (Vite :5330 = code du chantier), sans cloud, profil vidé, même heure simulée,
// animations figées. Comparaison PIXEL PAR PIXEL (décodage dans la page).   node t-mealweek.mjs ordi|tel
// BRUIT DE RENDU MESURÉ (20/11) : le code d'AVANT comparé à LUI-MÊME (APRES=http://localhost:5331) diffère une fois sur
// deux environ sur le téléphone — ~60 660 px de tramage des dégradés du hub, et 2 px (310,876)/(311,877) de MealWeek.
// Le passage refait donc la comparaison complète jusqu'à 6 fois : chaque écran réussit dès qu'un essai est STRICTEMENT identique
// (0 pixel différent, aucun seuil) ; le résultat dit à quel essai.
import fs from 'node:fs';
import { appareil as appareilFA, dormir } from '../tests-file-attente/commun.mjs';
import { DOSSIER_IMG } from './commun.mjs';

const type = process.argv[2] || 'ordi';
const FIGER = `(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.appendChild(s); return 1; })()`;
let b;
// capture STABLE : deux captures consécutives identiques (fondu d'arrivée, polices chargées)
const stable = async () => { let prec = null; for (let k = 0; k < 8; k++) { const c = (await b.send('Page.captureScreenshot', { format: 'png' })).result.data; if (c === prec) return Buffer.from(c, 'base64'); prec = c; await dormir(700); } return Buffer.from(prec, 'base64'); };
const diff = (x, y) => b.ev(`(async () => { const img = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
  const a = await img(${JSON.stringify(x)}), z = await img(${JSON.stringify(y)}); if (a.width !== z.width || a.height !== z.height) return -1;
  let n = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== z.data[i] || a.data[i + 1] !== z.data[i + 1] || a.data[i + 2] !== z.data[i + 2]) n++; return n; })()`);

async function essai() {
  const out = {};
  for (const [nom, base] of [['avant', 'http://localhost:5331'], ['apres', process.env.APRES || 'http://localhost:5330']]) {
    b = await appareilFA(type, base);
    await b.vider();
    await b.ev(`(localStorage.setItem('__decalageMs', String(${Date.parse('2026-11-20T10:00:00+01:00')} - Date.now())), localStorage.setItem('app.current', '"hub"'), 1)`);
    await b.send('Page.navigate', { url: base + '/' });
    await b.attendre(`document.readyState === 'complete' && document.body.innerText.length > 50`, 60000);
    await dormir(2500); await b.ev(FIGER); await dormir(500);
    const hub = await stable();
    await b.ev(`(() => { const c = [...document.querySelectorAll('.hub-card')].find((e) => /MealWeek/.test(e.innerText || '')); c && c.click(); return 1; })()`);
    await dormir(3500); await b.ev(FIGER); await dormir(500);
    const mw = await stable();
    fs.writeFileSync(DOSSIER_IMG + `mealweek-${nom}-${type}.png`, mw);
    out[nom] = { hub: hub.toString('base64'), mw: mw.toString('base64'), texte: await b.ev(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 4000)`),
      erreurs: b.erreurs.filter((e) => !/Failed to load resource|ERR_|Failed to fetch/i.test(e || '')) };
    if (nom === 'avant') b.fermerWs();
  }
  const r = { dHub: await diff(out.avant.hub, out.apres.hub), dMw: await diff(out.avant.mw, out.apres.mw),
    memeTexte: out.avant.texte === out.apres.texte && /MealWeek|repas|Semaine/i.test(out.apres.texte), lg: out.apres.texte.length, erreurs: out.apres.erreurs };
  b.fermerWs();
  return r;
}

// chaque écran garde son meilleur essai (le bruit tombe tantôt sur le hub, tantôt sur MealWeek)
let r, k = 0, hubOk = 0, mwOk = 0, hubMin = Infinity, mwMin = Infinity;
do { k++; r = await essai(); hubMin = Math.min(hubMin, r.dHub); mwMin = Math.min(mwMin, r.dMw); if (!hubOk && r.dHub === 0) hubOk = k; if (!mwOk && r.dMw === 0) mwOk = k; } while (k < 6 && (!hubOk || !mwOk));
r.dHub = hubMin; r.dMw = mwMin;
console.log(`[${type}] ${r.memeTexte ? '✅' : '❌'} MealWeek : même texte avant / après (${r.lg} car.)`);
console.log(`[${type}] ${r.dHub === 0 ? '✅' : '❌'} hub : capture identique pixel par pixel (${r.dHub} pixel(s) différent(s)${hubOk ? `, essai ${hubOk}/${k}` : ''})`);
console.log(`[${type}] ${r.dMw === 0 ? '✅' : '❌'} MealWeek ouverte : capture identique pixel par pixel (${r.dMw} pixel(s) différent(s)${mwOk ? `, essai ${mwOk}/${k}` : ''})`);
console.log(`[${type}] ${!r.erreurs.length ? '✅' : '❌'} aucune erreur console`, r.erreurs.join(' | ').slice(0, 300));
process.exit(r.memeTexte && r.dHub === 0 && r.dMw === 0 && !r.erreurs.length ? 0 : 1);
