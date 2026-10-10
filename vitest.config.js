// Tests automatiques (vitest) — étape 2 FSRS. Séparé de vite.config.js (build inchangé).
// Lancer : npm test (fuseau forcé à Europe/Brussels, fuzz FSRS désactivé — scheduler/config.js).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // idb-keyval ouvre ses bases dès l'import : IndexedDB simulé en mémoire pour les tests
    setupFiles: ['fake-indexeddb/auto'],
    testTimeout: 60000,
  },
});
