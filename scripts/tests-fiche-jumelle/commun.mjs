// Banc du chantier « fiche jumelle » (15/10) : reprend commun-doc.mjs du lecteur v2 + quelques outils.
import { banc as bancBase } from '../tests-pdfreader-v2/commun-doc.mjs';
export async function banc(W = 1440, H = 900, opts = {}) {
  const b = await bancBase(W, H);
  if (opts.tactile) await b.c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const souris = (type, x, y, extra = {}) => b.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  // glisser à la souris, pas à pas (30 ms : sinon un glisser CDP trop rapide ne fait rien)
  b.glisser = async (de, a, pas = 10) => {
    await souris('mouseMoved', de[0], de[1]); await souris('mousePressed', de[0], de[1]);
    for (let k = 1; k <= pas; k++) { await souris('mouseMoved', de[0] + (a[0] - de[0]) * k / pas, de[1] + (a[1] - de[1]) * k / pas, { buttons: 1 }); await b.dormir(30); }
    await souris('mouseReleased', a[0], a[1]); await b.dormir(150);
  };
  // glisser au DOIGT (événements tactiles de confiance)
  b.doigt = async (de, a, pas = 10) => {
    const t = (type, x, y) => b.c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 8, radiusY: 8 }] });
    await t('touchStart', de[0], de[1]);
    for (let k = 1; k <= pas; k++) { await t('touchMove', de[0] + (a[0] - de[0]) * k / pas, de[1] + (a[1] - de[1]) * k / pas); await b.dormir(30); }
    await t('touchEnd'); await b.dormir(200);
  };
  b.tape = async (p) => { await b.c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1], id: 1 }] }); await b.dormir(60); await b.c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.dormir(350); };
  b.rect = (js) => b.ev(`(()=>{const e=${js};if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,b:r.bottom,r:r.right}})()`);
  b.dans = (js, fx, fy) => b.ev(`(()=>{const e=${js};const r=e.getBoundingClientRect();return [r.x+r.width*${fx},r.y+r.height*${fy}]})()`);
  b.fond = (sel) => b.ev(`getComputedStyle(${sel}).backgroundColor`);
  b.capt = async (nom, clip) => { await b.capture(nom, clip); };
  // base LOCALE du banc seulement : retire les annotations / surlignages d'un cours de test
  b.nettoyer = (ficheIds) => b.S(`const ids=${JSON.stringify(ficheIds)};let n=0;for(const st of ['annotations','highlights']){for(const a of await S.getAll(st)){if(ids.includes(a.ficheId)||ids.some(i=>String(a.ficheId).startsWith(i+'::fiche'))){await S.remove(st,a.id);n++;}}}
for(const r of await S.getAll('companion_pdf')){if(ids.includes(r.courseId)){await S.remove('companion_pdf',r.id);n++;}}
for(const r of await S.getAll('reading_position')){if(ids.some(i=>r.id==='rp:'+i||String(r.id).startsWith('rp:'+i+'::fiche'))){await S.remove('reading_position',r.id);n++;}}return n;`);
  // sélecteur de fichier intercepté : le prochain <input type=file> ouvert reçoit `chemin`
  b.fichierSuivant = async (chemin) => {
    await b.c.send('Page.enable'); await b.c.send('DOM.enable');
    await b.c.send('Page.setInterceptFileChooserDialog', { enabled: true });
    return new Promise((ok) => {
      b.c.on(async (m) => {
        if (m.method !== 'Page.fileChooserOpened' || b.__fichierPris) return;
        b.__fichierPris = true;
        await b.c.send('DOM.setFileInputFiles', { files: [chemin], backendNodeId: m.params.backendNodeId });
        ok(true);
      });
      b.__fichierPris = false;
    });
  };
  // menu Fichier → entrée dont le libellé commence par `libelle`. (15/10) Menu Fichier UNIQUE
  // (pdf/MenuFichier.jsx) : la correspondance des pages est la pastille « Pages » de l'entrée
  // « fiche jumelle », les annotations non replacées s'ouvrent depuis l'éditeur de correspondance.
  // (17/10) menu Fichier EN SECTIONS (Cours · Diapo originale · Fiche — pdf/MenuFichier.jsx) :
  // importer / remplacer la fiche et la correspondance des pages sont des entrées de la section « Fiche » ;
  // une autre entrée est cherchée par son libellé dans la section du document AFFICHÉ, puis partout.
  b.menuFichier = async (libelle) => {
    await b.clic(await b.pos(`document.querySelector('.mf-bouton')`, false), { att: 400 });
    let js;
    if (/^Importer la fiche jumelle/.test(libelle)) js = `document.querySelector('.mf-section[data-section=fiche] [data-entree=importer]:not([aria-disabled])')`;
    else if (/^Remplacer la fiche/.test(libelle)) js = `document.querySelector('.mf-section[data-section=fiche] [data-entree=remplacer]:not([aria-disabled])')`;
    else if (/^(Correspondance des pages|Annotations non replacées)/.test(libelle)) js = `document.querySelector('.mf-section[data-section=fiche] [data-entree=correspondance]')`;
    else js = `(()=>{const l=[...document.querySelectorAll('.mf-doc.affiche .mf-item, .mf-item')];return l.find(x=>(x.querySelector('.mf-label')||x).innerText.startsWith(${JSON.stringify(libelle)}))})()`;
    const p = await b.pos(js, false);
    if (!p) { await b.T.Escape(); return false; }
    await b.clic(p, { att: 400 });
    if (/^Annotations non replacées/.test(libelle)) {
      await b.dormir(800);
      const q = await b.pos(`[...document.querySelectorAll('.fjc-actions button')].find(x=>x.innerText.startsWith('Non replacées'))`, false);
      if (!q) return false;
      await b.clic(q, { att: 400 });
    }
    return true;
  };
  // ouvre un cours par son titre (recharge d'abord si demandé) — même logique qu'ouvrir-cours.mjs
  b.ouvrir = async (titre, { recharger = false } = {}) => {
    const c = b.c;
    if (recharger) { await c.send('Page.reload', { ignoreCache: true }); await c.dormir(4500); }
    const app = await c.ev(`document.body.innerText.includes('Choisis ton espace') ? 'hub' : document.body.innerText.includes('PLANNING REPAS') ? 'mealweek' : 'medrevise'`);
    if (app === 'mealweek') { await c.ev(`[...document.querySelectorAll('button')].find(b=>/Retour à l.accueil|Changer d.app/.test(b.title||b.getAttribute('aria-label')||''))?.click();1`); await c.dormir(1200); }
    if (await c.ev(`document.body.innerText.includes('Choisis ton espace')`)) { await c.ev(`[...document.querySelectorAll('.hub-card')].find(b=>/^\\s*MedRevise/i.test(b.innerText))?.click();1`); await c.dormir(1500); }
    await c.ev(`(()=>{const b=[...document.querySelectorAll('.sb-item, .sidebar [role=button], .sidebar button, .sidebar a')].find(e=>/Biblioth/.test(e.innerText||e.title||''));b&&b.click();return 1})()`); await c.dormir(1200);
    await c.ev(`(()=>{const r=[...document.querySelectorAll('button')].find(b=>(b.title||'')==='Revenir à la liste'||b.getAttribute('aria-label')==='Retour');r&&r.click();return 1})()`); await c.dormir(800);
    const pos = await c.ev(`(()=>{const l=[...document.querySelectorAll('.lt-fiche')].find(e=>e.innerText.trim().startsWith(${JSON.stringify(titre)}));if(!l)return null;l.scrollIntoView({block:'center'});const r=l.getBoundingClientRect();return [r.x+Math.min(60,r.width/3),r.y+r.height/2]})()`);
    if (pos) for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: pos[0], y: pos[1], button: 'left', clickCount: 1 });
    await c.dormir(2500);
    return !!(await c.ev(`!!document.querySelector('.pdfr-scroll')`));
  };
  return b;
}
export const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`; };
