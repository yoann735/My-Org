import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react(), lienTheme()],
  // Honor the PORT env var when provided (lets tooling assign a free port);
  // falls back to Vite's default for plain `npm run dev`.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  build: {
    outDir: 'dist',
  },
});
