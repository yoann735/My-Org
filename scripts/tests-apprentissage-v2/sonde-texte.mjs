// sonde : lignes du texte des pages 1-4 du cours ouvert (pour choisir des phrases de test)
import { banc } from '../tests-fiche-jumelle/commun.mjs';
const b = await banc(1440, 900);
console.log(await b.ouvrir(process.argv[2] || 'Physiologie rénale (jumelle)', { recharger: true }));
await b.dormir(2500);
console.log(await b.ev(`(()=>{const out=[];for(const p of [...document.querySelectorAll('.pdfr-page[data-cle]')].slice(0,3)){const sp=[...p.querySelectorAll('.pdfr-textlayer span')];out.push('--- page '+p.dataset.cle+' : '+sp.length+' spans');let y=null,l='';for(const s of sp){const t=Math.round(parseFloat(s.style.top));if(y!==null&&Math.abs(t-y)>3){out.push(l);l='';}y=t;l+=s.textContent+'|';}out.push(l);}return out.join('\\n')})()`));
b.c.fermer ? b.c.fermer() : 0; process.exit(0);
