// Banc « mode file d'attente » : le faux Supabase (../faux-supabase.mjs, inchangé) sur le port 54409, pour ne pas
// partager l'état des autres bancs (:54399). Données de test uniquement.
import http from 'node:http';
const ecouter = http.Server.prototype.listen;
http.Server.prototype.listen = function (port, ...r) { return ecouter.call(this, port === 54399 ? 54409 : port, ...r); };
await import('../faux-supabase.mjs');
