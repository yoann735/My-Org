/* ============================================================
   MedRevise — évaluateur d'expressions pour la calculatrice intégrée.
   Parseur récursif SÛR (pas d'eval / new Function) : + - * / ^,
   parenthèses, moins unaire, notation scientifique (1.2e-3),
   fonctions sqrt/log(=log10)/ln/exp/abs, constantes pi/e.
   100 % local, aucun réseau. Lève une Error si l'expression est invalide.
   ============================================================ */

const FUNCS = {
  sqrt: Math.sqrt,
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  exp: Math.exp,
  abs: Math.abs,
};
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const s = String(src).replace(/,/g, '.'); // virgule décimale → point
  const tokens = [];
  let i = 0;
  const isDigit = (c) => c >= '0' && c <= '9';
  const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      let j = i + 1;
      while (j < s.length && (isDigit(s[j]) || s[j] === '.')) j++;
      // notation scientifique : e/E suivi d'un exposant signé
      if (s[j] === 'e' || s[j] === 'E') {
        let k = j + 1;
        if (s[k] === '+' || s[k] === '-') k++;
        if (isDigit(s[k])) { j = k + 1; while (j < s.length && isDigit(s[j])) j++; }
      }
      tokens.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
      i = j; continue;
    }
    if (isAlpha(c)) {
      let j = i + 1;
      while (j < s.length && isAlpha(s[j])) j++;
      tokens.push({ t: 'name', v: s.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    if ('+-*/^()'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('Caractère invalide : ' + c);
  }
  return tokens;
}

/** évalue une expression et renvoie un nombre fini (sinon lève une Error) */
export function evalExpr(src) {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const eat = (v) => { const t = tk[p]; if (!t || (v && t.v !== v)) throw new Error('Expression incomplète'); p++; return t; };

  function parseExpr() {
    let left = parseTerm();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = eat().v; const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseTerm() {
    let left = parsePower();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = eat().v; const right = parsePower();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  function parsePower() {
    const left = parseUnary();
    if (peek() && peek().t === 'op' && peek().v === '^') {
      eat('^'); const right = parsePower(); // ^ associatif à droite
      return Math.pow(left, right);
    }
    return left;
  }
  function parseUnary() {
    if (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = eat().v; const val = parseUnary();
      return op === '-' ? -val : val;
    }
    return parseAtom();
  }
  function parseAtom() {
    const t = peek();
    if (!t) throw new Error('Expression incomplète');
    if (t.t === 'num') { eat(); return t.v; }
    if (t.t === 'op' && t.v === '(') { eat('('); const v = parseExpr(); eat(')'); return v; }
    if (t.t === 'name') {
      eat();
      if (CONSTS[t.v] != null) return CONSTS[t.v];
      const fn = FUNCS[t.v];
      if (fn) { eat('('); const arg = parseExpr(); eat(')'); return fn(arg); }
      throw new Error('Inconnu : ' + t.v);
    }
    throw new Error('Expression invalide');
  }

  const result = parseExpr();
  if (p !== tk.length) throw new Error('Expression invalide');
  if (!Number.isFinite(result)) throw new Error('Résultat non défini');
  return result;
}
