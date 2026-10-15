// Fiche jumelle — REMPLACER la fiche (nouvelle version) : annotations recopiées sur la page
// retrouvée, non replacées LISTÉES, anciennes jamais modifiées ni supprimées.
// fiche-v2 : « Synthèse » (p.6) retirée, « Mnémotechniques » (p.21) avancée en p.16, annexe ajoutée.
import { banc } from './commun.mjs';
const FX = process.argv[2];
const b = await banc();
b.ok(await b.ouvrir('Physiologie rénale (jumelle)', { recharger: true }), 'cours ouvert');
const r0 = JSON.parse(await b.S(`return JSON.stringify(await S.getOne('companion_pdf','cp:f-fj'))`));
b.ok(r0 && r0.version === 1, 'fiche v1 importée', r0 && r0.nsAnnot);
// annotations de test sur la fiche v1 : p.6 (retirée en v2), p.10, p.21 (déplacée), p.30
await b.S(`const doc=(t)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:t}]}]});
for(const [p,t] of [[6,'Note sur la synthèse'],[10,'Note réabsorption'],[21,'Note mnémo'],[30,'Note points clés']])
  await S.put('annotations',{...S.newNoteBox({ficheId:${JSON.stringify(r0.nsAnnot)},page:p,x:0.5,y:0.6,width:0.3,height:0.05,couleur:'sauge',fond:'plein'}),content:doc(t)});
await S.put('annotations',S.newTrait({ficheId:${JSON.stringify(r0.nsAnnot)},page:21,points:[[0.2,0.5],[0.4,0.55],[0.6,0.5]],couleur:'corail',mode:'dessin',epaisseur:0.004,opacite:1}));
return 1`);
const avant = await b.S(`return JSON.stringify([...(await S.getAll('annotations')),...(await S.getAll('highlights'))].filter(a=>a.ficheId===${JSON.stringify(r0.nsAnnot)}).sort((a,b)=>a.id<b.id?-1:1))`);
const nAvant = JSON.parse(avant).length;
console.log('   annotations de la fiche v1 :', nAvant);
const pris = b.fichierSuivant(FX + '/fiche-v2.pdf');
b.ok(await b.menuFichier('Remplacer la fiche'), 'Fichier → « Remplacer la fiche (nouvelle version)… »');
await pris; await b.dormir(3000);
const resume = await b.ev(`document.querySelector('.fj-resume')?.innerText || ''`);
b.ok(/replacées? sur la nouvelle version/.test(resume), 'résumé du remplacement', resume.replace(/\n/g, ' | '));
await b.capt('jumelle-remplacement-resume');
const r1 = JSON.parse(await b.S(`return JSON.stringify(await S.getOne('companion_pdf','cp:f-fj'))`));
b.ok(r1.version === 2 && r1.nsAnnot === 'f-fj::fiche:2' && r1.versions[0].fileId === r0.fileId && r1.fileId !== r0.fileId, 'version 2, nouveau calque, ancienne version gardée dans « versions »');
const copies = JSON.parse(await b.S(`return JSON.stringify([...(await S.getAll('annotations')),...(await S.getAll('highlights'))].filter(a=>a.ficheId==='f-fj::fiche:2').map(a=>({p:a.page,k:a.kind||'surlignage',t:a.texte||(JSON.stringify(a.content||'').match(/"text":"([^"]*)"/)||[])[1]||''})))`));
const ou = (re) => (copies.find((c) => re.test(c.t)) || {}).p;
b.ok(ou(/Boîte de la fiche/) === 1 && ou(/Capsule/) === 1, 'p.1 → p.1 (boîte et surlignage)');
b.ok(ou(/réabsorption/) === 9, 'p.10 → p.9 (la page « Synthèse » a disparu avant elle)', 'p.' + ou(/réabsorption/));
b.ok(ou(/mnémo/) === 16 && copies.some((c) => c.k === 'trait' && c.p === 16), 'p.21 « Mnémotechniques » DÉPLACÉE → p.16 (boîte et trait)', 'p.' + ou(/mnémo/));
b.ok(ou(/points clés/) === 29, 'p.30 → p.29', 'p.' + ou(/points clés/));
b.ok(!copies.some((c) => /synthèse/.test(c.t)), 'la note de la page retirée n’est PAS replacée');
b.ok(r1.nonReplacees.length === 1 && /synthèse/.test(r1.nonReplacees[0].texte) && r1.nonReplacees[0].page === 6, 'elle est LISTÉE (non replacée)', JSON.stringify(r1.nonReplacees));
const apresV1 = await b.S(`return JSON.stringify([...(await S.getAll('annotations')),...(await S.getAll('highlights'))].filter(a=>a.ficheId===${JSON.stringify(r0.nsAnnot)}).sort((a,b)=>a.id<b.id?-1:1))`);
b.ok(apresV1 === avant, `les ${nAvant} annotations de la v1 sont intactes, octet pour octet (rien de modifié ni supprimé)`);
await b.clic(await b.pos(`[...document.querySelectorAll('.fj-resume button')].find(x=>x.innerText.includes('non replacées'))`, false), { att: 600 });
const liste = await b.ev(`document.querySelector('.fjc-table')?.innerText || ''`);
b.ok(/boîte/.test(liste) && /p\.6/.test(liste) && /synthèse/.test(liste), 'liste des non replacées', liste.replace(/\n/g, ' | '));
await b.capt('jumelle-non-replacees');
await b.T.Escape(); await b.dormir(400);
b.ok(await b.menuFichier('Annotations non replacées (1)'), 'aussi dans le menu Fichier « Annotations non replacées (1) »');
await b.T.Escape(); await b.dormir(300);
// la fiche affichée est la v2, avec ses annotations recopiées
if ((await b.ev(`document.querySelector('.pdfr-jumelle-bascule .seg-btn.active')?.innerText`)) !== 'Fiche') { await b.clic(await b.pos(`document.querySelector('.pdfr-scroll')`, false), { att: 100 }); await b.T.Tab(); await b.dormir(1500); }
b.ok((await b.ev(`document.querySelector('.ptb-pages .tnum').innerText`)).endsWith('/ 30') && (await b.ev(`[...document.querySelectorAll('.pdfr-textlayer span')].some(s=>s.textContent.includes('Résumé'))`)), 'la fiche affichée est la nouvelle version (« Résumé · … »)');
b.ok(!b.erreurs.length, '0 erreur JS', b.erreurs.join(' | '));
b.c.fermer();
