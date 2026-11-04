/** Download descriptions stay separate from numerical kernels and original data. */
export function applyLearningDownloads(chapters) {
  const spring=chapters.find(c=>c.id==='resortes').sections.find(s=>s.id==='excel');
  spring.title='Construya y compruebe el sistema en Excel';
  spring.lead='Utilice el archivo XLSX para conservar las fórmulas. Compare cada bloque con el cálculo manual.';
  spring.body=`<p>Conserve los datos del ejemplo 11.1: kₐ=600 kN/m, k_b=200 kN/m, F₁=50 kN, F₂=−20 kN y δ₃=0.</p>
  <ol class="clean-list"><li>Edite las entradas B5:B8.</li><li>Compruebe [K_nn] en B11:C12 y {F_n} en E11:E12.</li><li>Revise la inversa en G11:H12. Cada celda utiliza <code>INDEX(MINVERSE(...),fila,columna)</code>.</li><li>Calcule {δ_n} como producto fila por columna de la inversa por {F_n}; B15:B16 muestran los dos desplazamientos.</li><li>Recupere F₃, S₁₂ y S₂₃ y compruebe los residuos y el equilibrio.</li></ol>
  <div class="equation">[K_nn]{δ_n}={F_n}<br>δ₁=0.2333333333 m; δ₂=0.15 m<br>F₃=−30 kN; S₁₂=−50 kN; S₂₃=−30 kN</div>
  <p>La hoja no utiliza una fórmula particular de la cadena para obtener los desplazamientos. El producto se muestra por casillas y no depende de que una fórmula se expanda sobre otras celdas. Los nombres de funciones visibles dependen del idioma de Excel.</p>
  <a class="primary" href="./assets/plantilla-resortes.xlsx" download>Descargar XLSX de resortes</a>
  <p>Después cambie una entrada, prediga el efecto y compare con el <a href="#resortes/laboratorio">laboratorio de resortes</a>. No redondee los desplazamientos antes de recuperar las fuerzas.</p>
  <details class="technical"><summary>CSV anterior e importación</summary><p>Se conserva por compatibilidad. Requiere UTF-8, separador punto y coma y confirmar la fórmula matricial según su versión de Excel. No es la descarga principal.</p><a href="./assets/plantilla-resortes.csv" download>Descargar CSV anterior</a></details>
  <p class="small">El XLSX fue recalculado y sus resultados se comprobaron. No se ha probado directamente esta versión en Microsoft Excel en español.</p>`;
  for(const [id,kind,label] of [['axial','cercha','Cercha 11.2'],['vigas','viga','Viga 11.7'],['porticos','portico','Pórtico 253']]){
    const s=chapters.find(c=>c.id===id).sections.find(s=>s.id==='herramientas');
    s.body=s.body.replace('· Python complementario</h3>','· Python resuelto de referencia</h3>');
    s.body+=`<h3>Complete el laboratorio por pasos</h3><p>El notebook de trabajo no contiene todas las operaciones resueltas. Complete los espacios indicados, ejecute cada etapa y lea la comprobación antes de continuar. Python sigue siendo complementario; puede realizar la actividad con cálculo manual y Excel.</p>
    <div class="download-cards"><div><h3>${label} · Trabajo</h3><p>Defina matrices, ensamble, particione y recupere fuerzas. La geometría y los apoyos corresponden al ejemplo indicado.</p><a class="primary" href="./assets/downloads/${kind}_trabajo.ipynb" download>Descargar laboratorio IPYNB</a></div><div><h3>Consulte después de intentar</h3><p>Compare una etapa concreta con su solución y explique la diferencia antes de sustituir su cálculo.</p><a class="secondary" href="./assets/downloads/soluciones_laboratorios.md" download>Descargar soluciones de los laboratorios</a></div></div>
    <p>Para abrir el laboratorio, descargue el IPYNB y utilice <b>Archivo → Subir notebook</b> en Colab. No requiere que el archivo esté previamente en Drive. Los archivos resueltos anteriores se conservan como referencia; los de trabajo se detienen con una instrucción si queda una operación por completar.</p>
    <p>En los ejemplos con carga uniforme, conserve w positivo hacia −Ȳ. {F_n} contiene cargas aplicadas en GDL libres; {F_a} es la fuerza nodal neta del apoyo. Si hay una carga aplicada directamente en el apoyo, réstela de {F_a} para obtener la reacción. Las plantillas conservan también los términos de asentamientos prescritos.</p>
    <p><a href="#ejercicios/pistas-ensamblaje">Revise la pista para construir una función de ensamblaje</a>. Estas descargas tienen topología fija; no son un editor genérico de estructuras.</p>
    <p class="small">Las referencias y los laboratorios completados se ejecutaron localmente. No se afirma una prueba en Colab en la nube ni en Microsoft Excel en español.</p>`;
  }
}
