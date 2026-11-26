// Banc « Faire défiler jusqu'à la diapo détectée » + indication « vérifiée il y a N s » (26/11/2026,
// docs/compte-rendu-suivi-diapos-continu-et-defilement.md). Chrome NON headless, vrai partage d'onglet, faux Teams.
// APPAREIL=ordinateur | tablette | telephone   (tablette/téléphone : écran et tactile émulés sur l'onglet de l'app)
// Prérequis : faux-deepgram-diapos (:54410), faux-teams (:54411), medrevise-banc-diapos (:5304) — .claude/launch.json.
import fs from 'node:fs';
import path from 'node:path';
import { cdp, lancerChrome, dormir, ok, PORT_CHROME, TRAVAIL, DOSSIER_IMG, ouvrirBanc } from './commun.mjs';

const APPAREIL = process.env.APPAREIL || 'ordinateur';
const EMU = { tablette: { width: 1024, height: 1366, mobile: true, touch: true }, telephone: { width: 390, height: 844, mobile: true, touch: true } }[APPAREIL] || null;
const IMG = path.join(DOSSIER_IMG, '..', 'suivi-diapos-continu');
fs.mkdirSync(IMG, { recursive: true });

async function principal() {
  const chrome = await lancerChrome();
  const res = { appareil: APPAREIL };
  try {
    const { teams, app, ouvrir, demarrerOnglet } = await ouvrirBanc({ emulation: EMU });
    const lecteurPresent = await ouvrir('Histologie générale (banc)');
    if (APPAREIL !== 'telephone') ok(lecteurPresent, `${APPAREIL} : cours ouvert dans le lecteur`);
    await demarrerOnglet();
    ok(await app.attendre(`window.__transcription && window.__transcription.lireEtat().phase==='live'`, 20000), `${APPAREIL} : transcription en direct depuis l’onglet`);
    await teams.ev('window.demarrerSon()');
    ok(await app.attendre(`window.__transcription.lireSuivi().statut==='suivi'`, 60000), `${APPAREIL} : suivi prêt`);
    await teams.ev('window.montrer(1); 1');
    await app.attendre(`window.__transcription.lireSuivi().page===1`, 15000);
    await dormir(2500);
    const ind = () => app.ev(`(document.querySelector('.trx-suivi-ind')||{}).innerText||''`);
    const i1 = await ind();
    ok(/^Diapo 1 · auto · vérifiée il y a \d s$/.test(i1.trim()), `${APPAREIL} : indication « ${i1.trim()} »`);
    ok(await app.ev(`!!document.querySelector('.trx-suivi-defil .switch') && /Faire défiler/.test(document.querySelector('.trx-suivi-defil').innerText)`), `${APPAREIL} : interrupteur « Faire défiler jusqu’à la diapo détectée » présent`);
    ok(await app.ev(`[...document.querySelectorAll('.trx-suivi .switch, .trx-suivi-lib, .trx-suivi-ind')].every(e=>(e.getAttribute('title')||e.getAttribute('aria-label')||'').length>10)`), `${APPAREIL} : infobulle sur chaque élément de la ligne`);
    ok(await app.ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`), `${APPAREIL} : aucune barre de défilement horizontale`);
    const clipPanneau = () => app.ev(`(()=>{const p=document.querySelector('.trx-suivi');if(!p)return null;const r=p.getBoundingClientRect();return {x:Math.max(0,Math.round(r.x)-8),y:Math.max(0,Math.round(r.y)-50),width:Math.min(window.innerWidth,Math.round(r.width)+16),height:120}})()`);
    await app.capture(path.join(IMG, `${APPAREIL}-01-indication.png`), await clipPanneau());

    if (lecteurPresent && APPAREIL !== 'telephone') {
      const L = () => app.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');const t=(document.querySelector('.ptb-pages .tnum')||document.querySelector('.tab-pages')||{}).innerText||'';return {page:parseInt(t),top:Math.round(el.scrollTop),left:Math.round(el.scrollLeft),zoom:(document.querySelector('[data-zoom-libelle]')||{}).innerText}})()`);
      const enregistrerDefil = () => app.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');window.__defil=[];el.addEventListener('scroll',()=>window.__defil.push(performance.now()),{passive:true});return 1})()`);
      // durée du DERNIER mouvement continu (événements de défilement espacés de moins de 80 ms)
      const dureeDefil = () => app.ev(`(()=>{const d=window.__defil||[];window.__defil=[];if(d.length<2)return 0;let i=d.length-1;while(i>0&&d[i]-d[i-1]<80)i--;return Math.round(d[d.length-1]-d[i])})()`);
      const montrer = async (p) => { await teams.ev(`window.montrer(${p}); 1`); return app.attendre(`window.__transcription.lireSuivi().page===${p}`, 8000); };
      await app.send('Page.bringToFront');
      // zoom et position horizontale de l'élève : un cran de zoom, puis un peu à droite si la page déborde
      await app.ev(`([...document.querySelectorAll('.ptb-zoom button, button')].find(b=>/Zoom avant|Agrandir/i.test(b.title||b.getAttribute('aria-label')||''))||{click(){}}).click(),1`);
      await dormir(800);
      await app.ev(`(()=>{const el=document.querySelector('.pdfr-scroll');el.scrollLeft=Math.min(60,el.scrollWidth-el.clientWidth);return 1})()`);
      await dormir(1500); await enregistrerDefil();
      const a0 = await L();
      /* 1. cours à l'écran : la page suit */
      await montrer(5); await dormir(1200);
      const a1 = await L(); const d1 = await dureeDefil();
      ok(a1.page === 5, `${APPAREIL} : cours à l’écran → le document défile jusqu’à la diapo 5 (page ${a0.page} → ${a1.page})`);
      ok(d1 >= 120 && d1 <= 400, `${APPAREIL} : défilement doux en ${d1} ms (≈ 200 ms)`);
      ok(a1.zoom === a0.zoom && a1.left === a0.left, `${APPAREIL} : zoom (${a0.zoom} → ${a1.zoom}) et position horizontale (${a0.left} → ${a1.left}) gardés`);
      res.suit = { avant: a0, apres: a1, dureeMs: d1 };
      /* 2. défilement libre entre deux changements : pas ramené */
      for (let k = 0; k < 14; k++) { await app.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 500, y: 500, deltaX: 0, deltaY: 400 }); await dormir(60); }
      await dormir(800);
      const libre = await L();
      await dormir(15000);
      const libre2 = await L();
      ok(libre.page > 5 && libre2.top === libre.top, `${APPAREIL} : défilement libre jusqu’à la page ${libre.page}, 15 s sans changement → pas ramené (page ${libre2.page})`);
      /* 3. écriture dans une boîte : pas de défilement pendant ; dès la fin */
      await app.ev(`(document.querySelector('[data-outil="ecrire"]')||{click(){}}).click(),1`); await dormir(500);
      const pt = await app.ev(`(()=>{const r=document.querySelector('.pdfr-scroll').getBoundingClientRect();return {x:Math.round(r.x+r.width*0.45),y:Math.round(r.y+r.height*0.5)}})()`);
      await app.point(pt.x, pt.y); await dormir(900);
      const ecrit = await app.ev(`(()=>{const a=document.activeElement;return !!a&&(a.isContentEditable||/TEXTAREA|INPUT/.test(a.tagName))&&document.querySelector('.pdfr-scroll').contains(a)})()`);
      if (ecrit) { await app.send('Input.insertText', { text: 'Note du banc' }); }
      const b0 = await L();
      await montrer(8); await dormir(2500);
      const b1 = await L();
      ok(ecrit && b1.top === b0.top, `${APPAREIL} : écriture dans une boîte en cours → aucun défilement (page ${b1.page})`, ecrit ? '' : 'boîte non créée');
      await app.ev(`(document.activeElement&&document.activeElement.blur&&document.activeElement.blur(),1)`);
      await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await dormir(1200);
      const b2 = await L();
      ok(b2.page === 8, `${APPAREIL} : boîte terminée → le document défile jusqu’à la diapo 8 (page ${b2.page})`);
      /* 4. dessin en cours (bouton maintenu) */
      await app.ev(`(document.querySelector('[data-outil="dessin"]')||{click(){}}).click(),1`); await dormir(500);
      await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
      await app.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      for (let k = 0; k < 6; k++) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x + k * 12, y: pt.y + k * 6, button: 'left', buttons: 1 }); await dormir(80); }
      const c0 = await L();
      await montrer(10); await dormir(2500);
      for (let k = 6; k < 10; k++) { await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x + k * 12, y: pt.y + k * 6, button: 'left', buttons: 1 }); await dormir(80); }
      const c1 = await L();
      ok(c1.top === c0.top, `${APPAREIL} : dessin en cours → trait jamais interrompu, aucun défilement (page ${c1.page})`);
      await app.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x + 120, y: pt.y + 60, button: 'left', clickCount: 1 });
      await dormir(1200);
      const c2 = await L();
      ok(c2.page === 10, `${APPAREIL} : trait fini → le document défile jusqu’à la diapo 10 (page ${c2.page})`);
      await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await app.ev(`(document.querySelector('[data-outil="main"]')||{click(){}}).click(),1`); await dormir(400);
      /* 5. sélection de texte en cours */
      const sel = await app.ev(`(()=>{const sp=[...document.querySelectorAll('.pdfr-scroll .textLayer span, .pdfr-scroll [class*=text] span')].find(s=>s.textContent.trim().length>3&&s.getBoundingClientRect().height>0);if(!sp)return false;const r=document.createRange();r.selectNodeContents(sp);const s=getSelection();s.removeAllRanges();s.addRange(r);return !getSelection().isCollapsed})()`);
      const s0 = await L();
      await montrer(11); await dormir(2500);
      const s1 = await L();
      ok(sel && s1.top === s0.top, `${APPAREIL} : sélection de texte en cours → aucun défilement`, sel ? '' : 'pas de texte sélectionnable');
      await app.ev(`(getSelection().removeAllRanges(),1)`); await dormir(1200);
      ok((await L()).page === 11, `${APPAREIL} : sélection terminée → diapo 11`);
      /* 6. autre document pendant 3 changements : rien ne bouge ; retour → la bonne diapo */
      await ouvrir('Autre cours (banc)'); await dormir(1500);
      const o0 = await L();
      for (const p of [13, 14, 15]) { await montrer(p); await dormir(3000); }
      const o1 = await L();
      ok(o1.top === o0.top && o1.page === o0.page, `${APPAREIL} : autre document pendant 3 changements → rien ne bouge (page ${o0.page} → ${o1.page})`);
      await ouvrir('Histologie générale (banc)');
      await app.attendre(`!document.querySelector('.pdfr-attente')`, 6000); await dormir(600);
      const o2 = await L();
      ok(o2.page === 15, `${APPAREIL} : retour sur le cours → ouvert directement à la diapo 15 (page ${o2.page})`);
      /* 7. autre onglet : rien ne bouge ; retour → la bonne diapo */
      const autre = await cdp(PORT_CHROME, { url: 'data:text/html,<title>Autre onglet</title>Autre onglet' });
      await autre.send('Page.bringToFront'); await dormir(800);
      const g0 = await L();
      await montrer(17); await dormir(2500);
      const g1 = await L();
      ok(g1.top === g0.top, `${APPAREIL} : autre onglet devant → rien ne bouge (page ${g1.page})`);
      await app.send('Page.bringToFront'); await dormir(1500);
      ok((await L()).page === 17, `${APPAREIL} : retour sur l’onglet → diapo 17`);
      await autre.send('Page.close').catch(() => {});
      /* 8. option coupée : comportement d'avant (le lecteur ne bouge jamais) ; état retenu */
      await app.clic(`document.querySelector('.trx-suivi-defil .switch')`, 500);
      ok(await app.ev(`localStorage.getItem('medrevise.transcription.defilerDiapos')==='0'`), `${APPAREIL} : option coupée et retenue sur l’appareil`);
      const h0 = await L();
      await montrer(20); await dormir(2500);
      const h1 = await L();
      ok(h1.top === h0.top, `${APPAREIL} : option coupée → le lecteur ne bouge pas (page ${h0.page} → ${h1.page}), comme avant`);
      await app.capture(path.join(IMG, `${APPAREIL}-02-option-coupee.png`), await clipPanneau());
      await app.clic(`document.querySelector('.trx-suivi-defil .switch')`, 500);
      res.lecteur = { libre, libre2, b0, b1, b2, c0, c1, c2, s0, s1, o0, o1, o2, g0, g1, h0, h1 };
    } else {
      // téléphone : affichage seul — la ligne de suivi et l'indication suivent quand même
      await teams.ev('window.montrer(4); 1');
      ok(await app.attendre(`window.__transcription.lireSuivi().page===4`, 10000), `${APPAREIL} : diapo 4 reconnue pendant la transcription`);
      await dormir(1500);
      const i2 = await ind();
      ok(/^Diapo 4 · auto · vérifiée il y a \d s$/.test(i2.trim()), `${APPAREIL} : indication « ${i2.trim()} »`);
    }
    await app.ev(`(document.querySelector('.trx-stop')||{click(){}}).click(),1`);
    await app.attendre(`window.__transcription.lireEtat().phase==='idle'`, 15000);
    res.erreurs = app.erreurs.filter((x) => !/GoTrueClient/.test(x));
    ok(res.erreurs.length === 0, `${APPAREIL} : console sans erreur`, res.erreurs.slice(0, 3).join(' | '));
    fs.writeFileSync(path.join(TRAVAIL, `defilement-${APPAREIL}.json`), JSON.stringify(res, null, 1));
    teams.ev('window.arreterSon(); 1').catch(() => {});
  } finally { chrome.arreter(); }
  const ko = ok.resultats.filter((x) => !x.ok).length;
  console.log(ko ? `${ko} échec(s)` : 'TOUT VERT');
  process.exit(ko ? 1 : 0);
}
principal().catch((e) => { console.error(e); process.exit(2); });
