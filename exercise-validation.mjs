import { parseVal, judge, numericInputError } from './bank-validation.mjs';

/** The fixed examples use the same arithmetic grammar and cell checker as the
 * bank. Their published absolute rounding allowance remains explicit. */
export function checkFixedExercise(raw, exercise) {
  const value = parseVal(raw);
  if (value === null || !Number.isFinite(value)) return {
    ok:false, status:'invalid',
    msg:numericInputError(raw)||'Escriba un número o una expresión, por ejemplo −30/6480. Use coma o punto decimal y no incluya la unidad.'
  };
  const field = { ans:[[exercise.answer]], unit:exercise.unit, tolAbs:exercise.tolerance, tolRel:0 };
  const result = judge(value, field, 0, 0);
  return {
    ...result, value, status:result.status || (result.ok ? 'correct' : 'incorrect'),
    msg:result.ok
      ? 'El resultado coincide dentro del redondeo indicado. Compruebe también el procedimiento y el equilibrio.'
      : result.msg || 'El resultado no coincide. Revise las unidades, los signos y el orden de los grados de libertad. Compare cada paso con el desarrollo.'
  };
}
