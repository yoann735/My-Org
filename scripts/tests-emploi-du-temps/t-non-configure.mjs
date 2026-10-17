// Sans HELHA_ICAL_URL côté serveur : 503 clair, « Emploi du temps non configuré » dans le
// sélecteur, rien ne casse (Vite lancé SANS la variable pour ce test).
import { ouvrir } from './commun-edt.mjs';

const r = await fetch('http://localhost:5199/api/timetable', { method: 'POST', headers: { Origin: 'http://localhost:5199' }, body: '{}' });
const j = await r.json();
console.log(r.status === 503 && j.code === 'not_configured' ? '✅' : '❌', 'API : 503 not_configured —', r.status, JSON.stringify(j));
for (const [W, H, nom] of [[1440, 900, 'ordinateur'], [390, 844, 'téléphone']]) {
  const b = await ouvrir({ date: '2026-10-19T07:00:00Z', W, H, tactile: W < 761 });
  await b.reinit({ mode: 'j' }); await b.recharger(); await b.accueil();
  await b.attendre(`document.querySelector('.edt-non-config')`, 5000);
  b.ok(await b.ev(`(document.querySelector('.edt-selecteur')||{}).textContent`) === 'Mes JÉcoleEmploi du temps non configuré', `${nom} : « Emploi du temps non configuré » dans le sélecteur`);
  if (W > 760) b.ok(await b.ev(`!!document.querySelector('.wcal-grid:not(.edt-grille)')`), `${nom} : calendrier des J affiché normalement`);
  if (W > 760) await b.png('edt-non-configure', '.edt-tete', 8);
  await b.mode('ecole'); await b.dormir(700);
  const msg = await b.ev(`(document.querySelector('.edt-vide b')||{}).textContent`);
  b.ok(msg === 'Emploi du temps non configuré', `${nom} : École → message propre`, msg);
  b.ok(b.erreurs.length === 0, `${nom} : 0 erreur console`, b.erreurs.join(' | '));
  await b.mode('j'); await b.dormir(300);
  b.c.fermer();
}
