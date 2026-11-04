/** Small construction guide, not a solved course project or an assessment rubric. */
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const ASSEMBLY_HINT_PYTHON = `from math import isfinite

def ensamblar(n_gdl, elementos):
    # Cada elemento es (codigos, matriz_local).
    # Los codigos del curso empiezan en 1; Python indexa desde 0.
    if type(n_gdl) is not int or n_gdl < 1:
        raise ValueError("n_gdl debe ser un entero positivo")
    K = [[0.0 for _ in range(n_gdl)] for _ in range(n_gdl)]
    for codigos, ke in elementos:
        m = len(codigos)
        if m == 0 or len(ke) != m or any(len(fila) != m for fila in ke):
            raise ValueError("La matriz y los codigos no tienen igual dimension")
        if any(type(g) is not int or not 1 <= g <= n_gdl for g in codigos):
            raise ValueError("Codigo fuera del intervalo 1...n_gdl")
        if len(set(codigos)) != m:
            raise ValueError("Un elemento no debe repetir un GDL en sus codigos")
        valores = [[float(valor) for valor in fila] for fila in ke]
        if not all(isfinite(valor) for fila in valores for valor in fila):
            raise ValueError("Todos los coeficientes deben ser finitos")
        for i_local, i_global in enumerate(codigos):
            for j_local, j_global in enumerate(codigos):
                K[i_global - 1][j_global - 1] += valores[i_local][j_local]
    return K

elementos = [
    ([1, 2], [[600, -600], [-600, 600]]),
    ([2, 3], [[200, -200], [-200, 200]])
]
K = ensamblar(3, elementos)
assert K == [[600, -600, 0], [-600, 800, -200], [0, -200, 200]]
assert K[1][1] == 800   # Se acumulan dos aportes; no se reemplaza el primero.
assert all(sum(fila) == 0 for fila in K)  # Traslacion rigida, antes de apoyos.
`;

export function applyAssemblyHints(chapters, matrix) {
  const chapter=chapters.find(c=>c.id==='ejercicios');
  const contributions=[['a',1,1,1,1,600],['a',1,2,1,2,-600],['a',2,1,2,1,-600],['a',2,2,2,2,600],['b',1,1,2,2,200],['b',1,2,2,3,-200],['b',2,1,3,2,-200],['b',2,2,3,3,200]];
  const table=`<div class="table-wrap"><table class="data-table"><thead><tr>${['Elemento','i local','j local','Fila global','Columna global','Aporte (kN/m)'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${contributions.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const body=`<p>Esta pista explica cómo construir una función de ensamblaje. No define el proyecto, sus entregas ni su evaluación. Utilice primero los dos resortes del ejemplo 11.1; después aplique el mismo procedimiento a más elementos.</p>
  <h3>1. Relacione las posiciones locales con los GDL globales</h3>
  <p>El elemento a usa códigos [1,2]; el elemento b usa [2,3]. El GDL 2 es compartido. Conserve los códigos junto con cada matriz.</p>
  <div class="equation">K<sub>gᵢgⱼ</sub> ← K<sub>gᵢgⱼ</sub> + k<sub>ᵢⱼ</sub><br>Empiece con [K] nula. Recorra cada elemento, cada fila local y cada columna local.</div>
  <p>La operación es <strong>sumar</strong>. Si reemplaza el valor de una casilla, pierde el aporte de los elementos anteriores.</p>
  <h3>2. Construya una tabla de aportes en Excel</h3>
  <p>Escriba estos encabezados en A1:F1 y los ocho aportes en las filas 2 a 9:</p>${table}
  <p>Escriba los rótulos de fila 1,2,3 en I2:I4 y los de columna 1,2,3 en J1:L1. En J2 use la fórmula siguiente y cópiela al bloque J2:L4:</p>
  <pre class="code-example"><code>=SUMAR.SI.CONJUNTO($F$2:$F$9;$D$2:$D$9;$I2;$E$2:$E$9;J$1)</code></pre>
  <p>La fórmula suma aportes cuya fila y columna global coinciden con los rótulos. En Excel en inglés, la función es <code>SUMIFS</code>; el separador depende de la configuración regional. Compruebe K₂₂=600+200=800. Para más elementos, amplíe la tabla y los rangos, no escriba una fórmula estructural particular para cada nudo.</p>
  <h3>3. Reproduzca la acumulación con una función de Python</h3>
  <p>Python es complementario. Esta función utiliza listas y la biblioteca estándar; no necesita un solucionador estructural. Los índices se convierten de 1 a 0 solo al acceder a la matriz.</p>
  <details class="technical"><summary>Ver función mínima y prueba con dos elementos</summary><pre class="code-example"><code>${escape(ASSEMBLY_HINT_PYTHON)}</code></pre></details>
  <h3>4. Compruebe el ensamblaje antes de resolver</h3>
  ${matrix([['600','−600','0'],['−600','800','−200'],['0','−200','200']],'[K] =')}
  <ul class="clean-list"><li>Compare cada casilla con el ensamblaje manual.</li><li>Compruebe simetría y K₁₃=0.</li><li>Compruebe que las filas sumen cero en esta cadena libre de resortes.</li><li>Invierta el orden de los elementos: el resultado debe conservarse.</li><li>Pruebe un código fuera del intervalo y una matriz de tamaño incorrecto: la función debe rechazar ambos.</li></ul>
  <p>Esta [K] completa es singular antes de imponer el apoyo. El ensamblaje no reemplaza la transformación a ejes globales, la partición, las condiciones de apoyo ni la recuperación de fuerzas. Para una cercha o un pórtico, entregue a esta función las matrices ya expresadas en coordenadas generales y sus códigos correctos.</p>
  <p>Para matrices grandes, la lógica de suma se conserva; el almacenamiento disperso es una ampliación posterior. Primero haga pasar la prueba pequeña.</p>
  <p><a href="./calculadora.html#ensamblaje">Introduzca hasta seis matrices y compruebe sus aportes en el ensamblador</a>. La herramienta deja a su cargo las matrices y los códigos; no construye el modelo estructural por usted.</p><a href="#resortes/laboratorio">Compare con el laboratorio de resortes</a>`;
  const section={id:'pistas-ensamblaje',title:'Pistas para el proyecto: construya una función de ensamblaje',lead:'Use el mismo mapa de GDL y la misma suma de aportes en Excel o Python.',tag:'PISTA DE CONSTRUCCIÓN · SIN RÚBRICA',body,showRouteNote:false,kind:'practice',understand:'Explique por qué dos elementos pueden aportar a una misma casilla.',apply:'Pruebe la función con dos elementos antes de ampliar el tamaño.'};
  const existing=chapter.sections.findIndex(s=>s.id===section.id);if(existing<0)chapter.sections.push(section);else chapter.sections[existing]=section;
  for(const route of Object.values(chapter.routes))if(!route.includes(section.id))route.splice(route.indexOf('creditos'),0,section.id);
  const bank=chapter.sections.find(s=>s.id==='banco');
  if(bank&&!bank.body.includes('calculadora.html'))bank.body+='<p><a href="./calculadora.html">Abra la calculadora independiente de matrices y vectores</a> para definir sus propios datos, operar y reutilizar resultados. No contiene un solucionador estructural automático.</p>';
}
