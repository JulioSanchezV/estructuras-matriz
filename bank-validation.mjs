/** Pure answer validation for the exercise bank. No DOM, dynamic code or network. */
export const PARSER_LIMITS = Object.freeze({ length: 512, tokens: 256, depth: 64, operations: 128, magnitude: 1e100, minimum: 1e-100 });

/** A comma is decimal, never a list separator. Inspect the original block
 * before splitting whitespace so 50, -20 cannot silently become two cells. */
export function numericInputError(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return '';
  return /\d,(?!\d)/u.test(String(input))
    ? 'La coma es decimal y debe ir seguida de cifras. Para dos valores use punto y coma, tabulador o una línea por valor; por ejemplo, 50 y −20 en líneas separadas para un vector 2×1.'
    : '';
}

/** Return null for an empty answer, NaN for invalid input, otherwise a finite number.
 * Grammar: sum -> product -> unary -> power -> primary.
 * Power is right associative, and binds more tightly than a leading minus.
 * Spaces separate tokens; they never join two numbers or names.
 */
export function parseVal(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return NaN;
  const source = String(input).trim();
  if (!source) return null;
  if (numericInputError(source)) return NaN;
  if (source.length > PARSER_LIMITS.length) return NaN;
  const s = source.replace(/[−–]/g, '-').replace(/×/g, '*');
  const tokens = []; let i = 0;
  try {
    const checked = value => {
      if (!Number.isFinite(value) || Math.abs(value) > PARSER_LIMITS.magnitude || (value !== 0 && Math.abs(value) < PARSER_LIMITS.minimum)) throw new Error('range');
      return value;
    };
    while (i < s.length) {
      if (/\s/u.test(s[i])) { i++; continue; }
      const rest = s.slice(i);
      const number = rest.match(/^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?/);
      if (number) {
        const value = checked(Number(number[0].replace(',', '.')));
        // Do not let an underflowing literal become a spurious zero.
        if (value === 0 && /[1-9]/.test(number[0].split(/[eE]/)[0])) throw new Error('underflow');
        tokens.push({ kind: 'number', value }); i += number[0].length;
      } else if (rest.startsWith('**')) { tokens.push({ kind: '^' }); i += 2; }
      else if ('+-*/^()'.includes(s[i])) { tokens.push({ kind: s[i++] }); }
      else if (s[i] === '√') { tokens.push({ kind: 'sqrt' }); i++; }
      else {
        const name = rest.match(/^[A-Za-z]+/);
        if (!name || !['sqrt', 'pi'].includes(name[0])) throw new Error('token');
        tokens.push({ kind: name[0] }); i += name[0].length;
      }
      if (tokens.length > PARSER_LIMITS.tokens) throw new Error('tokens');
    }
    let at = 0, depth = 0, operations = 0;
    const peek = kind => tokens[at]?.kind === kind;
    const take = kind => { if (!peek(kind)) throw new Error('syntax'); return tokens[at++]; };
    const nested = fn => { if (++depth > PARSER_LIMITS.depth) throw new Error('depth'); try { return fn(); } finally { depth--; } };
    const operation = (value, nonzero = false) => {
      if (++operations > PARSER_LIMITS.operations || (nonzero && value === 0)) throw new Error('operations/range');
      return checked(value);
    };
    function primary() {
      if (peek('number')) return take('number').value;
      if (peek('pi')) { take('pi'); return Math.PI; }
      if (peek('(')) { take('('); const value = nested(sum); take(')'); return value; }
      if (peek('sqrt')) { take('sqrt'); take('('); const value = nested(sum); take(')'); return operation(Math.sqrt(value)); }
      throw new Error('primary');
    }
    function power() {
      const base = primary();
      if (!peek('^')) return base;
      take('^'); const exponent = nested(unary);
      return operation(base ** exponent, base !== 0);
    }
    function unary() {
      if (peek('+')) { take('+'); return nested(unary); }
      if (peek('-')) { take('-'); return operation(-nested(unary)); }
      return power();
    }
    function product() {
      let value = unary();
      while (peek('*') || peek('/')) {
        const op = tokens[at++].kind, right = unary();
        value = operation(op === '*' ? value * right : value / right, value !== 0 && right !== 0);
      }
      return value;
    }
    function sum() {
      let value = product();
      while (peek('+') || peek('-')) { const op = tokens[at++].kind, right = product(); value = operation(op === '+' ? value + right : value - right); }
      return value;
    }
    const value = sum();
    if (at !== tokens.length) return NaN;
    return checked(value);
  } catch { return NaN; }
}

// Absolute floors represent numerical noise in the *current cell's unit*, never
// a percentage of the largest entry in a matrix or mixed force/moment vector.
const ZERO_FLOORS = Object.freeze({
  '': 1e-9, grados: 1e-9, rad: 1e-10, mm: 1e-8, m: 1e-11,
  'mm²': 1e-8, 'mm⁴': 1e-8, 'm²': 1e-12, 'm⁴': 1e-14,
  kN: 1e-8, 'kN·m': 1e-8, 'kN/m': 1e-8, 'kN/mm': 1e-9
});

export function cellTolerance(field, row, column) {
  const answer = field.ans[row][column];
  const unit = field.cellUnits?.[row]?.[column] ?? field.rowUnits?.[row] ?? field.colUnits?.[column] ?? field.unit ?? '';
  const zeroThreshold = ZERO_FLOORS[unit] ?? 1e-9;
  const relative = Number.isFinite(field.tolRel) && field.tolRel >= 0 ? Math.min(field.tolRel, 0.05) : 0.01;
  let requested = typeof field.tolAbs === 'function' ? field.tolAbs(row, column) : field.tolAbs;
  if (!Number.isFinite(requested) || requested < 0) requested = 0;
  const numericalZero = Math.abs(answer) <= zeroThreshold;
  // Retain explicit rounding allowances, but cap legacy field-wide tolerances
  // at 0.5% of this entry. A large neighbour cannot mask a small wrong answer.
  const absolute = numericalZero ? zeroThreshold : Math.min(Math.max(zeroThreshold, requested), 0.005 * Math.abs(answer));
  const tolerance = numericalZero ? zeroThreshold : Math.max(absolute, relative * Math.abs(answer));
  return { absolute, relative, tolerance, zeroThreshold, unit, numericalZero };
}

function strictJudge(value, field, row, column) {
  const answer = field?.ans?.[row]?.[column];
  if (!Number.isFinite(value) || !Number.isFinite(answer)) return { ok: false, msg: 'Escriba un valor numérico finito.' };
  if (field.int) return value === answer ? { ok: true } : { ok: false, msg: 'Revise la numeración: u_k → 2k − 1 y v_k → 2k.' };
  const { tolerance, relative, numericalZero } = cellTolerance(field, row, column);
  if (numericalZero ? Math.abs(value) <= tolerance : value !== 0 && Math.abs(value - answer) <= tolerance) return { ok: true };
  for (const alternative of (field.alts ? field.alts(row, column) : [])) {
    if (Number.isFinite(alternative.v) && Math.abs(alternative.v - answer) > tolerance && Math.abs(value - alternative.v) <= Math.max(tolerance, relative * Math.abs(alternative.v))) return { ok: false, msg: alternative.msg };
  }
  if (!numericalZero && Math.abs(value + answer) <= tolerance) return { ok: false, msg: 'La magnitud es correcta pero el signo está invertido. Revise la convención de signos.' };
  if (!numericalZero) for (const scale of [1000, 0.001]) if (Math.abs(value - answer * scale) <= tolerance * scale) return { ok: false, msg: 'Parece un error de unidades (factor 1000). Revise m y mm, o kN/m y kN/mm.' };
  if (!numericalZero && Math.abs(value - answer) <= 0.05 * Math.abs(answer)) return { ok: false, msg: 'Está cerca pero fuera de la tolerancia. Conserve al menos cuatro cifras significativas en los cálculos intermedios.' };
  return { ok: false, msg: null };
}

/** Three outcomes. Only a strict match has ok=true; rounding is a diagnostic,
 * never a proof of correctness or an automatic completed step. */
export function judge(value, field, row, column) {
  const strict = strictJudge(value, field, row, column);
  if (strict.ok) return { ...strict, status: 'correct' };
  const failed = { ...strict, status: 'incorrect' };
  const answer = field?.ans?.[row]?.[column];
  if (field?.int || !Number.isFinite(value) || !Number.isFinite(answer)) return failed;
  const { tolerance, relative, numericalZero } = cellTolerance(field, row, column);
  const diagnostic = field.rounding?.[row]?.[column];
  if (!diagnostic?.certified || !Number.isFinite(diagnostic.bound) || diagnostic.bound <= tolerance) return failed;
  // No wider band can turn a significant zero, reversed sign or doubled
  // answer into a rounding-compatible result. Large uncertainty calls for
  // more precision, not indiscriminate acceptance.
  if (!numericalZero && (value === 0 || Math.sign(value) !== Math.sign(answer) || Math.abs(value-answer) >= 0.25*Math.abs(answer))) return failed;
  // Preserve specific diagnoses of a missing element contribution, omitted
  // fixed-end force or a wrong transformation, even inside a wide bound.
  for (const alternative of (field.alts ? field.alts(row, column) : [])) {
    if (Number.isFinite(alternative.v) && Math.abs(alternative.v-answer)>tolerance && Math.abs(value-alternative.v)<=Math.max(tolerance,relative*Math.abs(alternative.v))) return failed;
  }
  if (Math.abs(value-answer) > diagnostic.bound) return failed;
  const evidence = diagnostic.samples?.find(sample => Number.isFinite(sample.value) && Math.abs(value-sample.value) <= Math.max(tolerance, 1.01*sample.radius));
  if (!evidence) return failed;
  return { ok: false, status: 'rounding', digits: evidence.digits, bound: diagnostic.bound, workflow: evidence.stage,
    msg: numericalZero
      ? `La referencia es cero: un recálculo con ${evidence.digits} cifras reproduce un residuo cercano al suyo. Compruebe el equilibrio y escriba 0; no lo interprete como una fuerza o movimiento real.`
      : `Un recálculo con ${evidence.digits} cifras reproduce un valor cercano al suyo: compatible con redondeo en una operación sensible o con cancelación. No se marca como correcto pleno; conserve más cifras antes de recuperar este resultado. La referencia no es cero.` };
}

/** Preserve blank cells and interior rows from a spreadsheet paste. A single
 * arithmetic expression is left to the browser's ordinary text paste. */
export function parsePastedGrid(input) {
  const text = String(input).replace(/\r\n?/g, '\n');
  if (text.length > 100000) return null;
  // Leave the original invalid text intact for the caller's diagnostic.
  if (numericInputError(text)) return null;
  const lines = text.split('\n');
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  const delimited = /[\t;]/.test(text);
  const rows = lines.map(line => {
    if (delimited) return line.split(/[\t;]/).map(cell => cell.trim());
    const cells = line.trim().split(/ +/);
    return cells.length > 1 && cells.every(cell => Number.isFinite(parseVal(cell))) ? cells : [line.trim()];
  });
  return rows.length > 1 || rows[0]?.length > 1 ? rows : null;
}
