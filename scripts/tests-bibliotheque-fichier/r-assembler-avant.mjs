import { banc } from './commun.mjs';
const b = await banc(1440, 900);
await b.assembler(['mf-avant-pdf', 'mf-avant-document', 'mf-avant-jumelle', 'mf-avant-notes'], 'mf-avant-4-pages', ['Cours PDF (avant)', 'Document (avant)', 'Fiche jumelle (avant)', 'Onglet Notes (avant)']);
process.exit(0);
