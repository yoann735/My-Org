// Jeu de test « révision → carnet / apprentissage » (17/10) — base LOCALE du banc seulement.
// Matière « Neurologie (test 17/10) », cours « Nerfs crâniens (test) » (id f-000-rv : premier des
// fiches, donc sélectionné d'office dans Réviser), 7 flashcards dues aujourd'hui (+ 1 QCM).
// Remet à zéro : champs du carnet de ces cartes, leur présence dans learning_set, leur historique.
import { banc } from './commun.mjs';
const b = await banc(1440, 900);
console.log(await b.S(`
  const sm2=await import(u.find(n=>n.includes('/medrevise/lib/sm2.js'))||'/src/medrevise/lib/sm2.js');
  const today=sm2.todayISO();
  const j=(n)=>{const d=new Date(today+'T12:00:00');d.setDate(d.getDate()+n);return d.toLocaleDateString('fr-CA')};
  await S.put('sources',{id:'src-rv',nom:'HELHa (test 17/10)',rappelsJ:true});
  await S.put('matieres',{id:'mat-rv',sourceId:'src-rv',nom:'Neurologie (test 17/10)',couleur:'violet'});
  await S.put('fiches',{id:'f-000-rv',matiereId:'mat-rv',dossierId:null,ordre:0,titre:'Nerfs crâniens (test)',type:'standard',dateImport:j(-10)});
  const H=[{date:j(-9),qualite:3},{date:j(-3),qualite:3}];
  const fc=(id,recto,verso)=>({id,type:'flashcard',ficheId:'f-000-rv',theme:'Nerfs crâniens',recto,verso,learnState:'review',intervalDays:6,dueDate:today,capped:false,termine:false,historique:H});
  const cartes=[
    fc('q-rv1','Quel nerf crânien innerve le muscle oblique supérieur ?','Le nerf trochléaire (IV).'),
    fc('q-rv2','Quel nerf crânien innerve le muscle droit latéral ?','Le nerf abducens (VI).'),
    fc('q-rv3','Par quel foramen sort le nerf facial ?','Le foramen stylo-mastoïdien.'),
    fc('q-rv4','Quel nerf assure la sensibilité de la cornée ?','Le nerf ophtalmique (V1), branche du trijumeau.'),
    fc('q-rv5','Quel nerf innerve le muscle trapèze ?','Le nerf accessoire (XI).'),
    fc('q-rv6','Quel nerf innerve la langue (motricité) ?','Le nerf hypoglosse (XII).\\n\\n'+Array.from({length:14},(_,i)=>'Repère '+(i+1)+' : il sort par le canal du nerf hypoglosse, croise l’artère carotide externe, puis gagne la langue sous le muscle mylo-hyoïdien.').join('\\n\\n')),
    fc('q-rv7','Quel nerf porte le goût des 2/3 antérieurs de la langue ?','Le nerf facial (VII), par la corde du tympan.'),
  ];
  await S.putMany('questions',cartes);
  const ls=await S.getOne('learning_set','learning_set');
  if(ls) await S.put('learning_set',{...ls,cardIds:(ls.cardIds||[]).filter(x=>!String(x).startsWith('q-rv'))});
  // séance du jour déjà commencée aujourd'hui : on la laisse se remettre d'accord (rien à effacer)
  return 'seed révision ok · '+cartes.length+' cartes dues le '+today;`));
process.exit(0);
