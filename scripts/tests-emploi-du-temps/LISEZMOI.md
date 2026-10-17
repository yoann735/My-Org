# Tests du 17/10 — emploi du temps HELHa dans le calendrier de l'Accueil
(docs/compte-rendu-emploi-du-temps.md)

Outils de test, jamais chargés par l'app. Jamais le vrai cloud ni le vrai Hyperplanning :
- `node faux-hyperplanning.mjs` (:54410) sert `tests/emploi-du-temps/semaine-1bkine12.ics`
  (`/__version?v=2` : horaire, salle et annulation changés ; `/__panne?on=1` ; `/__etat`) ;
- Vite `:5199` SANS Supabase, avec `HELHA_ICAL_URL=http://localhost:54410/edt.ics`
  (`t-non-configure.mjs` : Vite relancé SANS la variable) ;
- Chrome headless 9333 (CDP). Horloge simulée par script injecté (`ouvrir({ date })`), fuseau de
  l'appareil par `Emulation.setTimezoneOverride`.

`./tout.sh` rejoue tout (sauf `t-non-configure.mjs`, qui demande de relancer Vite).
Tests unitaires : `npm test` (tests/emploi-du-temps : lecture iCal, couleurs, changements, API).
Le cache local et le réglage `edtReglages` de la base LOCALE du banc sont remis à zéro au début
de chaque scénario (`b.reinit()`). Aucune fiche, carte ni matière n'est écrite.
