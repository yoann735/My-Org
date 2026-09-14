import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/* Ressources binaires de pdf.js servies par l'app elle-même, sous /pdfjs/…
   (MedRevise, lecteur PDF — voir src/medrevise/pdf/pdfjsSetup.js).

   POURQUOI. pdf.js va chercher à la demande, par URL + nom de fichier FIXE :
   les polices standard (PDF dont une police n'est pas intégrée), les CMaps
   (textes CJK/encodages prédéfinis) et les décodeurs wasm (images JPX/JBIG2).
   Sans URL fournie, ces cas s'affichent faux ou pas du tout. Un import `?url`
   ne convient pas : Vite hache les noms, pdf.js ne les retrouverait pas.

   Copiés depuis node_modules/pdfjs-dist AU BUILD (jamais commités) : toujours
   la version exacte de la librairie installée. Servis en dev par un
   middleware. Rien n'est chargé tant qu'un PDF ne le réclame pas. Vercel sert
   les fichiers statiques avant d'appliquer la réécriture SPA de vercel.json. */
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const PDFJS_ROOT = path.resolve('node_modules/pdfjs-dist');
function pdfjsAssets() {
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const [dir, file, ...rest] = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '').split('/');
        if (!PDFJS_DIRS.includes(dir) || !file || rest.length || file.startsWith('.')) return next();
        const abs = path.join(PDFJS_ROOT, dir, file);
        if (!fs.existsSync(abs)) return next();
        if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
        fs.createReadStream(abs).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of PDFJS_DIRS) {
        for (const file of fs.readdirSync(path.join(PDFJS_ROOT, dir))) {
          this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${file}`, source: fs.readFileSync(path.join(PDFJS_ROOT, dir, file)) });
        }
      }
    },
  };
}

/* Le <link> de la couche visuelle « Motion Lab », posé DANS le HTML au build.

   POURQUOI CE PLUGIN EXISTE. La bascule « Retrouver l'UI d'avant » a d'abord
   créé ce <link> depuis main.jsx. Ça marchait, mais ça sérialisait le chemin
   critique : le navigateur ne découvrait la feuille qu'APRÈS avoir téléchargé
   ET exécuté le bundle, puis sa police APRÈS elle. Trois allers-retours en
   série, chacun payant la latence complète — invisible en local (+160 ms),
   très coûteux sur une vraie connexion. Mesuré, pas supposé.

   Écrit dans le HTML, le <link> redevient visible du scanner de préchargement
   dès la première ligne reçue : il se charge EN PARALLÈLE du bundle, comme
   avant la bascule. Le petit script inline qui suit le retire quand le mode
   classique est demandé — c'est le seul moment où l'on peut le faire sans
   avoir déjà peint la page.

   Deux détails qui comptent :
   - `order: 'post'` : Vite a déjà injecté le <link> du bundle, et `injectTo:
     'head'` ajoute à la FIN. L'ordre « thème en dernier », dont dépend toute
     la cascade, est donc conservé.
   - `apply: 'build'` seulement. En dev, design.css et etudes.css arrivent en
     <style> posés par le JS, donc APRÈS un <link> écrit dans le HTML : le
     thème perdrait la cascade et le dev ne ressemblerait plus à la prod. En
     dev, main.jsx garde donc l'injection par JS (voir le commentaire là-bas). */
function lienTheme() {
  return {
    name: 'ui-theme-link',
    apply: 'build',
    // generateBundle et PAS transformIndexHtml : l'asset CSS d'un import `?url`
    // est émis par vite:css-post APRÈS que vite:build-html a produit le HTML.
    // Au moment de transformIndexHtml il est donc absent du bundle (constaté :
    // le garde-fou ci-dessous levait alors qu'il finissait bien dans dist/).
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const css = Object.keys(bundle).find((f) => /medrevise-theme.*\.css$/.test(f));
        const html = bundle['index.html'];
        if (!css || !html) {
          // Mieux vaut échouer bruyamment que livrer une page sans sa couche
          // visuelle, sans que rien ne le signale.
          throw new Error(`[ui-theme-link] introuvable — css: ${css || 'non'}, html: ${html ? 'oui' : 'non'}`);
        }
        const script = "try{if(JSON.parse(localStorage.getItem('ui.classic'))===true)"
          + "{var l=document.getElementById('ui-theme');l.parentNode.removeChild(l)}}catch(e){}";
        html.source = html.source.replace(
          '</head>',
          `    <link rel="stylesheet" id="ui-theme" href="/${css}">\n`
          + `    <script>${script}</script>\n  </head>`,
        );
      },
    },
  };
}

// Zero-config Vercel deploy: build -> `dist`. No env, no backend.
export default defineConfig({
  plugins: [react(), lienTheme(), pdfjsAssets()],
  // Honor the PORT env var when provided (lets tooling assign a free port);
  // falls back to Vite's default for plain `npm run dev`.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  build: {
    outDir: 'dist',
  },
});
