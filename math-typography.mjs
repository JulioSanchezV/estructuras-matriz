/** Presentation only for the static lesson catalogue.
 * Explicit mathematical symbols and matrices are formatted in HTML text nodes.
 * Code, controls, SVG, attributes and runtime/user-entered values are never rewritten.
 */
const sub = value => `<sub class="math-subscript">${value}</sub>`;
const symbols = [
  'F_aplicada,n', 'F_aplicada,a', 'F_aplicada',
  'K_nn', 'K_na', 'K_an', 'K_aa', 'K_b', 'k_b',
  'F_n', 'F_a', 'δ_n', 'δ_a', 'R_n', 'R_a',
  'θ_A', 'θ_B', 'v_A', 'v_B', 'Y_A', 'Y_B', 'M_A', 'p_equiv'
];
const symbolPattern = new RegExp(`(?<![\\p{L}_])(${symbols.join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
const matrices = [
  [['a','b'],['c','d']],
  [['d','−b'],['−c','a']],
  [['800','600'],['600','600']],
  [['c²+s²','cs−sc'],['sc−cs','s²+c²']],
  [['c²+s²','0'],['0','c²+s²']],
  [['1','−1'],['−1','1']],
  [['c','s'],['−s','c']]
];
const escapeHTML = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inlineMatrix = rows => `<span class="inline-matrix" role="table" aria-label="Matriz de 2 filas y 2 columnas"><span class="inline-matrix-rows" role="rowgroup">${rows.map(row => `<span class="inline-matrix-row" role="row">${row.map(value => `<span class="inline-matrix-cell" role="cell">${escapeHTML(value)}</span>`).join('')}</span>`).join('')}</span></span>`;
const matrixMarkup = matrices.map(rows => [`[[${rows.map(row => row.join(',')).join('],[')}]]`, inlineMatrix(rows)]);
const protectedTags = new Set(['pre','code','samp','kbd','textarea','input','select','option','button','script','style','svg','math']);
const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function formatText(text, precedingHTML) {
  let formatted = text.replace(symbolPattern, symbol => {
    const split = symbol.indexOf('_');
    return symbol.slice(0,split) + sub(symbol.slice(split+1));
  });
  // Preserve the existing order F^F_n, and the element indices after a brace.
  // These suffixes are recognized only next to the exact existing notation.
  if (/(?:F|Y|M)<sup>F<\/sup>\}?$/.test(precedingHTML)) {
    formatted = formatted.replace(/^(\}?)_(ij|ji|n|a)(?![\p{L}\p{N}_])/u, (_, brace, suffix) => brace + sub(suffix));
  }
  formatted = formatted.replace(/(\{δ\})_elemento(?![\p{L}\p{N}_])/gu, (_, base) => base + sub('elemento'));
  for (const [literal, markup] of matrixMarkup) formatted = formatted.split(literal).join(markup);
  return formatted;
}

/** Formats trusted static lesson HTML only, never a live DOM or an editable value. */
export function formatStaticMath(html) {
  if (typeof html !== 'string') return html;
  const stack = [];
  let cursor = 0, output = '';
  // Attribute values are consumed as part of a complete tag, including quoted >.
  const tags = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  for (const match of html.matchAll(tags)) {
    const text = html.slice(cursor, match.index);
    output += stack.some(tag => protectedTags.has(tag)) ? text : formatText(text, html.slice(0,cursor));
    const token = match[0];
    output += token;
    const tag = token.match(/^<(\/)?([A-Za-z][\w:-]*)/);
    if (tag) {
      const name = tag[2].toLowerCase();
      if (tag[1]) {
        const at = stack.lastIndexOf(name);
        if (at !== -1) stack.splice(at);
      } else if (!voidTags.has(name) && !/\/>$/.test(token)) stack.push(name);
    }
    cursor = match.index + token.length;
  }
  const trailing = html.slice(cursor);
  output += stack.some(tag => protectedTags.has(tag)) ? trailing : formatText(trailing, html.slice(0,cursor));
  return output;
}

export function applyMathTypography(chapters, exercises) {
  for (const chapter of chapters) for (const section of chapter.sections) {
    for (const key of ['title','lead','body','understand','apply']) section[key] = formatStaticMath(section[key]);
  }
  for (const exercise of Object.values(exercises)) {
    for (const key of ['title','statement','question','solution']) exercise[key] = formatStaticMath(exercise[key]);
  }
}
