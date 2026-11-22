// Régénère docs/prompt-masques-ia.md depuis la source unique (src/medrevise/lib/masquesIA.js#PROMPT_MASQUES_IA).
//   node scripts/tests-masques-ia/doc-prompt.mjs
import fs from 'node:fs';
import { PROMPT_MASQUES_IA } from '../../src/medrevise/lib/masquesIA.js';
const f = new URL('../../docs/prompt-masques-ia.md', import.meta.url);
fs.writeFileSync(f, `# Prompt IA — masques d’une flashcard image

Texte copié par le bouton **« Copier le prompt IA »** de l’éditeur de flashcard image (MedRevise). À coller **avec l’image**
dans n’importe quelle IA (Claude, ChatGPT, Gemini…) ; la réponse (le JSON) se colle ensuite avec **« Coller des masques »**.
Format : [format-masques-ia.md](format-masques-ia.md).

Source unique : \`src/medrevise/lib/masquesIA.js\` (\`PROMPT_MASQUES_IA\`). Ce fichier en est une copie exacte, régénérée par
\`node scripts/tests-masques-ia/doc-prompt.mjs\`.

\`\`\`text
${PROMPT_MASQUES_IA}
\`\`\`
`);
