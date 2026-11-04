import { springUnitStates } from './spring-states.mjs';

/** V5 teaching layer. It changes the presentation, never the numerical kernels. */
const eq = value => `<div class="equation">${value}</div>`;
const table = (heads, rows) => `<div class="table-wrap"><table class="data-table"><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const detail = (title,body) => `<details class="technical"><summary>${title}</summary>${body}</details>`;
const lesson = (id,title,lead,body,week='Semana 1') => ({id,title,lead,body,tag:`${week} · PROCEDIMIENTO`,kind:'demonstration',showRouteNote:false,understand:'Relacione cada ecuación con sus grados de libertad, signos y unidades.',apply:'Escriba los datos y compruebe el paso antes de continuar.'});
const titles=['Identifique la estructura','Calcule las matrices de los miembros','Ensamble y reordene [K]','Particione y calcule los desplazamientos','Calcule las reacciones','Calcule las fuerzas internas'];
const method = lines => `<ol class="method-list compact-method">${titles.map((title,i)=>`<li><strong>${title}</strong><p>${lines[i]}</p></li>`).join('')}</ol>`;
const ff = '{F<sup>F</sup>}';
const loadCase = `<p>n identifica los GDL libres y a los restringidos. {F_n} reúne las cargas aplicadas en los GDL libres. {F_a} es la acción nodal neta en los GDL restringidos: incluye la reacción y cualquier carga aplicada directamente allí. Si no hay carga aplicada en un apoyo, {F_a} coincide con su reacción.</p>`;
const simpleSystem = eq('[K_nn]{δ_n}={F_n}<br>{F_a}=[K_an]{δ_n}');
const immobileSystem = eq('[K_nn]{δ_n}={F_n}−{F<sup>F</sup>_n}<br>{F_a}={F<sup>F</sup>_a}+[K_an]{δ_n}');
const convention = `<p>Los subíndices ij indican el extremo i del elemento orientado i→j; ji indica su extremo j. Por ejemplo, {F<sup>F</sup>}_ij=[Y<sup>F</sup>_ij,M<sup>F</sup>_ij,Y<sup>F</sup>_ji,M<sup>F</sup>_ji]ᵀ. El superíndice F identifica fuerzas de empotramiento; no es un exponente numérico.</p>`;

const instructions={
 resortes:[
  'Numere los nudos y escriba {δ}=[δ₁,δ₂,…]ᵀ. Registre k y la conexión i–j de cada resorte. En el ejemplo 11.1, δ₃=0.',
  'Para cada resorte escriba [K]ᵢⱼ=k[[1,−1],[−1,1]], con filas y columnas [δᵢ,δⱼ].',
  'Ubique las cuatro entradas en los códigos [i,j] y sume las casillas compartidas. Separe libres [δ₁,δ₂] y apoyo [δ₃].',
  'Extraiga [K_nn] y {F_n}. Resuelva [K_nn]{δ_n}={F_n} con δ₃=0; no invierta la matriz global libre.',
  'Use la fila del nudo 3: F₃=−200δ₂. En este caso no hay otra carga en el apoyo, por lo que F₃ es su reacción.',
  'Calcule Sᵢⱼ=k(δⱼ−δᵢ). Verifique por separado el equilibrio de cada nudo y el de la cadena.'
 ],
 transformacion:[
  'Fije el sentido i→j y los ejes globales X,Y y locales X̄,Ȳ. Escriba {δ}=[uᵢ,vᵢ,uⱼ,vⱼ]ᵀ.',
  'Calcule Δx, Δy, L, c=Δx/L y s=Δy/L. Forme [T] con los bloques [[c,s],[−s,c]] y calcule [K]=[T]ᵀ[K̄][T].',
  'Si la barra pertenece a una cercha, ubique su matriz 4×4 mediante los códigos [2i−1,2i,2j−1,2j]. Transformar no es ensamblar.',
  'Imponga los apoyos de la estructura antes de resolver. La barra axial aislada no restringe todos los movimientos de sus extremos.',
  'Recupere las fuerzas globales en los apoyos de la estructura; distinga fuerza nodal neta de reacción si allí actúa otra carga.',
  'Calcule {δ̄}=[T]{δ}, Sᵢⱼ=(AE/L)(ūⱼ−ūᵢ) y {F}=[T]ᵀ{F̄}. Compruebe el equilibrio de las dos fuerzas axiales.'
 ],
 axial:[
  'Registre coordenadas, apoyos y cargas. Asigne dos GDL por nudo: u,v. En 11.2, {δ_n}=[u₁,v₁,v₂]ᵀ.',
  'Por barra calcule Δx, Δy, L, c, s y AE/L. Escriba su matriz global 4×4 con c², s² y cs.',
  'Use [2i−1,2i,2j−1,2j] para sumar cada matriz. Aplique la misma permutación a filas, columnas y vector de fuerzas.',
  'Extraiga [K_nn] y {F_n}. En 11.2, v₂ se desacopla; resuelva después el bloque de u₁,v₁.',
  'Calcule {F_a}=[K_an]{δ_n}. Aquí no hay cargas aplicadas en los apoyos: sus componentes son X₂,X₃,Y₃.',
  'Calcule Sᵢⱼ=(AE/L)[−c,−s,c,s]{δ}ᵢⱼ. Descomponga cada S en X,Y y cierre el equilibrio de los tres nudos.'
 ],
 vigas:[
  'Defina v positivo arriba y θ antihorario. Escriba [vᵢ,θᵢ,vⱼ,θⱼ] y los apoyos de cada tramo.',
  'Calcule EI/L³, EI/L² y EI/L. Construya la 4×4; sus columnas corresponden a un movimiento de extremo impuesto cada vez.',
  'Asigne [2i−1,2i,2j−1,2j] y sume los aportes. Distinga cargas nodales y cargas que actúan dentro de un tramo.',
  'Para apoyos inmóviles resuelva [K_nn]{δ_n}={F_n}−{F<sup>F</sup>_n}. Sin cargas intermedias, {F<sup>F</sup>}=0.',
  'Calcule {F_a} y separe las cargas aplicadas en apoyos. En 11.7, F_a=Y_B−20=10 kN, así que Y_B=30 kN.',
  'Recupere {F}ᵢⱼ={F<sup>F</sup>}ᵢⱼ+[K]ᵢⱼ{δ}ᵢⱼ. Con esas acciones y las cargas del tramo, trace V y M y verifique el equilibrio.'
 ],
 cargas:[
  'Conserve el orden [vᵢ,θᵢ,vⱼ,θⱼ]. Registre por tramo w>0 hacia abajo o las cargas puntuales P>0 y sus distancias a,b.',
  'Calcule la matriz de rigidez y el vector de empotramiento {F<sup>F</sup>} de cada tramo. Para varias cargas, sume sus vectores.',
  'Ensamble [K] y {F<sup>F</sup>} por separado. {F_n} contiene únicamente las cargas aplicadas directamente en GDL libres.',
  'Con apoyos inmóviles, resuelva [K_nn]{δ_n}={F_n}−{F<sup>F</sup>_n}. En 242 solo θ₂ es desconocido.',
  'Calcule {F_a}={F<sup>F</sup>_a}+[K_an]{δ_n}. Si actúa una carga en un apoyo, réstela algebraicamente para obtener su reacción.',
  'Recupere las acciones de cada tramo sumando empotramiento y rigidez por desplazamientos. Compruebe fuerzas, momentos y continuidad entre tramos.'
 ],
 porticos:[
  'Fije X,Y, tres GDL por nudo [u,v,θ] y las orientaciones de barras. En 253: columnas 3→1 y 4→2; viga 1→2.',
  'Calcule AE/L y los coeficientes de flexión. Forme [K̄] 6×6 y transforme con [T₆]=diag(R,R), R=[[c,s,0],[−s,c,0],[0,0,1]].',
  'Asigne [3i−2,3i−1,3i,3j−2,3j−1,3j]. Ensamble [K] y las fuerzas de empotramiento transformadas de cada elemento.',
  'Separe los seis GDL libres de los nudos 1,2 y las bases fijas 3,4. Resuelva [K_nn]{δ_n}={F_n}−{F<sup>F</sup>_n}.',
  'Calcule {F_a} en las bases. En 253 no hay cargas nodales en ellas: las componentes son sus reacciones. Compruebe equilibrio y simetría.',
  'Recupere {δ̄}=[T₆]{δ} y {F̄}={F̄<sup>F</sup>}+[K̄]{δ̄}. Trace N,V,M en cada elemento y cierre el equilibrio de los nudos 1 y 2.'
 ]
};

function normalizeNotation(value){
 if(typeof value!=='string')return value;
 return value.replaceAll('{F_aplicada,n}','{F_n}').replaceAll('{F<sub>aplicada,n</sub>}','{F_n}')
  .replaceAll('ᶠ','<sup>F</sup>')
  .replaceAll('Después cambia a θⱼ y explica','Después cambie a θⱼ y explique')
  .replaceAll('Sumamos ambas ecuaciones:200','Sume ambas ecuaciones: 200')
  .replaceAll('una fuerza−20','una fuerza −20').replaceAll('un momento−30','un momento −30')
  .replaceAll('resultado+10','resultado +10');
}

export function applyAuditContent(chapters,matrix,exercises){
 if(chapters.some(c=>c.auditRevision===5))return;
 const get=id=>chapters.find(c=>c.id===id);
 const sec=(id,sid)=>get(id).sections.find(s=>s.id===sid);
 const put=(id,s)=>{const c=get(id),at=c.sections.findIndex(x=>x.id===s.id);if(at<0)c.sections.push(s);else c.sections[at]=s;return s;};

 // Read algebra before solving the first structure; keep old objects for URL aliases.
 for(const id of ['algebra-producto','algebra-transpuesta','algebra-inversa']){
  const copy=structuredClone(sec('transformacion',id));copy.tag='Semana 1 · ÁLGEBRA DEL PROCEDIMIENTO';put('resortes',copy);
 }
 sec('resortes','algebra-transpuesta').body=`${eq('(Aᵀ)ᵢⱼ=Aⱼᵢ &nbsp; · &nbsp; (AB)ᵀ=BᵀAᵀ')}${matrix([['1','2','3'],['4','5','6']],'[A] =')}${matrix([['1','4'],['2','5'],['3','6']],'[A]ᵀ =')}<p>La transpuesta intercambia filas y columnas. No divide entre coeficientes ni resuelve un sistema. Una matriz simétrica cumple [K]ᵀ=[K]. En la transformación de coordenadas se demostrará por qué [T]⁻¹=[T]ᵀ; esa igualdad no vale para cualquier matriz.</p>`;
 put('resortes',lesson('particion-simple','Separe los movimientos libres del apoyo','En el ejemplo 11.1, δ₃=0. Las incógnitas son δ₁, δ₂ y la reacción F₃.',`${matrix([['K_nn','K_na'],['K_an','K_aa']],'[K] =')}${eq('{δ_n}=[δ₁,δ₂]ᵀ; δ₃=0<br>{F_n}=[50,−20]ᵀ; {F_a}=[F₃]')}${simpleSystem}<p>La primera fila de bloques entrega los desplazamientos libres. La segunda recupera la fuerza del apoyo. F₃ es reacción porque no hay otra carga aplicada en ese GDL. La matriz completa sin restricciones es singular; el bloque libre permite resolver.</p><p>Para un apoyo con movimiento prescrito o cargas sobre los elementos, la partición se amplía en <a href="#cargas/particion-general">Cargas y acciones</a>.</p>`));
 put('resortes',lesson('columnas-unitarias','Construya [K] por desplazamientos unitarios','Imponga un movimiento a la vez. Las fuerzas necesarias, divididas por ese movimiento, forman una columna.',`${eq('Columna j de [K] = {F}/Δ cuando δⱼ=Δ y los demás δ=0')}${springUnitStates()}${table(['Estado','[δ₁,δ₂,δ₃]','S₁₂=kₐ(δ₂−δ₁)','S₂₃=k_b(δ₃−δ₂)','[F₁,F₂,F₃]'],[['a','[Δ,0,0]','−600Δ','0','[600,−600,0]Δ'],['b','[0,Δ,0]','600Δ','−200Δ','[−600,800,−200]Δ'],['c','[0,0,Δ]','0','200Δ','[0,−200,200]Δ']])}${eq('F₁=−S₁₂; F₂=S₁₂−S₂₃; F₃=S₂₃')}${matrix([['600','−600','0'],['−600','800','−200'],['0','−200','200']],'[K] (kN/m) =')}<p>Para construir [K] todavía no se impone el apoyo del ejemplo. En cada estado se prescriben los tres movimientos: uno vale Δ y los otros dos se mantienen en cero mediante las fuerzas necesarias. No se está resolviendo una cadena libre bajo cargas.</p><p>«Unitario» significa tomar el coeficiente por unidad de desplazamiento. Δ puede ser pequeño; no exige desplazar físicamente un metro. Después de construir [K], se impone δ₃=0 para resolver el ejemplo 11.1.</p><p>La <a href="#vigas/viga">matriz de viga</a> se construye con la misma idea, ahora con cuatro GDL.</p>`));
 get('resortes').routes.understand=['modelo','local','columnas-unitarias','algebra-producto','algebra-transpuesta','algebra-inversa','particion-simple','ensamble','apoyos','laboratorio','excel','ejercicios'];
 get('transformacion').routes.understand=get('transformacion').routes.understand.filter(id=>!id.startsWith('algebra-'));
 sec('transformacion','ejes').body+=detail('Compruebe la ortogonalidad de la transformación',`${matrix([['c','s'],['−s','c']],'[R] =')}${eq('[R]ᵀ[R]=[[c²+s²,cs−sc],[sc−cs,s²+c²]]=[I]<br>[R]⁻¹=[R]ᵀ')}<p>Los ejes son ortonormales: c²+s²=1 y su producto escalar es cero. Como [T] contiene un bloque [R] por nudo, [T]ᵀ[T]=[I] y [T]⁻¹=[T]ᵀ. Esta igualdad no se aplica a una matriz general ni a la proyección rectangular 2×4.</p>`);
 get('transformacion').number='02';get('axial').number='03';
 const order=['inicio','resortes','transformacion','axial','vigas','cargas','porticos','ejercicios'];
 chapters.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
 for(const c of [get('transformacion'),get('axial')])for(const s of c.sections)s.tag=s.tag.replace(/\b0[23]\./,`${c.number}.`);
 sec('inicio','mapa').body=sec('inicio','mapa').body.replace('Revise vectores, productos de matrices, transpuesta, inversa y partición. Después deduzca la rigidez y la transformación, y contraste con los mismos ejemplos.','Comience con resortes y sus columnas de rigidez. Revise el álgebra antes de ensamblar y resolver. Después estudie vectores y transformación, y aplíquelos a la cercha.').replace('data-route="understand" data-go="transformacion"','data-route="understand" data-go="resortes"');
 sec('inicio','procedimiento').body=`${method(['Numere los nudos, defina los GDL e indique apoyos, cargas y ejes.','Escriba cada matriz en el orden de sus GDL y compruebe sus unidades.','Sume los aportes por números de código y agrupe los GDL libres y restringidos.','Con los apoyos inmóviles y cargas solo en nudos, resuelva [K_nn]{δ_n}={F_n}.','Recupere las fuerzas en los apoyos; si allí hay cargas aplicadas, sepárelas de la reacción.','Recupere las fuerzas de cada elemento y compruebe equilibrio de elementos, nudos y estructura.'])}${simpleSystem}${loadCase}<p>Estas expresiones iniciales corresponden a apoyos inmóviles y sin cargas intermedias. Las fuerzas de empotramiento y los movimientos prescritos se incorporan después, en el capítulo de cargas.</p>`;

 // Six technical headings, applied to the actual element rather than repeated prose.
 for(const id of Object.keys(instructions)){
  const f=sec(id,'formulario');f.body=f.body.replace(/<ol class="method-list compact-method">[\s\S]*?<\/ol>/,method(instructions[id]));
  f.body=f.body.replace(/<p>Con apoyos inmóviles y sin cargas intermedias:[\s\S]*?<\/p>/,`<p>Con apoyos inmóviles y sin cargas intermedias:</p>${simpleSystem}${loadCase}<p>Para cargas en los elementos consulte <a href="#cargas/formulario">el formulario de cargas</a>; para movimientos prescritos, <a href="#cargas/particion-general">la ampliación de la partición</a>.</p>`);
  f.lead='Siga los seis pasos con los GDL, las matrices y las ecuaciones de este elemento.';
 }
 sec('resortes','formulario').body+=`<p>Columna j de [K]: fuerzas necesarias cuando δⱼ=1 y los demás desplazamientos son cero. <a href="#resortes/columnas-unitarias">Construcción de las tres columnas</a>.</p>`;

 const response=sec('axial','respuesta');
 response.body=`<h3>1. Escriba las tres ecuaciones libres</h3>${eq('(E·1 mm)(3u₁/2−v₁/2)=40 kN<br>(E·1 mm)(−u₁/2+v₁/2)=−50 kN<br>(E·1 mm)v₂=0')}<p>E&gt;0. La tercera ecuación está desacoplada: v₂=0.</p><h3>2. Elimine v₁ y sustituya</h3><p>Sume las dos primeras ecuaciones. Los términos de v₁ se anulan:</p>${eq('(E·1 mm)u₁=40−50=−10 kN<br>u₁=−10 kN/(E·1 mm)')}<p>Multiplique la segunda ecuación por 2 y sustituya u₁:</p>${eq('(E·1 mm)(−u₁+v₁)=−100 kN<br>(E·1 mm)v₁=−100−10=−110 kN<br>v₁=−110 kN/(E·1 mm)')}<p>Con el valor numérico de E en kN/mm², la abreviatura del ejemplo es u₁=−10/E mm y v₁=−110/E mm. No se asigna a E un material que la fuente no proporciona.</p><h3>3. Recupere las reacciones</h3>${eq('X₂=(E·1 mm)(−u₁)=+10 kN<br>X₃=(E·1 mm)(−u₁/2+v₁/2)=−50 kN<br>Y₃=(E·1 mm)(u₁/2−v₁/2−v₂)=+50 kN')}<h3>4. Recupere las fuerzas axiales</h3>${eq('Sᵢⱼ=(AE/L)[−c,−s,c,s]{δ}ᵢⱼ<br>S₁₂=(E·1 mm)u₁=−10 kN<br>S₁₃=(E·1 mm)(u₁−v₁)/√2=50√2 kN<br>S₂₃=−(E·1 mm)v₂=0')}<p>S₁₂ es compresión; S₁₃ es tensión. S₂₃ es nula para estas cargas y apoyos.</p><h3>5. Compruebe el equilibrio de cada nudo</h3><p>Las acciones de las barras sobre un nudo tienen el signo opuesto a las acciones aplicadas al elemento. En i actúa Sᵢⱼ[c,s]; en j actúa −Sᵢⱼ[c,s].</p>${table(['Nudo','ΣX (kN)','ΣY (kN)'],[['1','40 + 10 − 50 = 0','−50 + 50 = 0'],['2','10 − 10 = 0','0 + 0 = 0'],['3','−50 + 50 = 0','50 − 50 + 0 = 0']])}<p>El equilibrio global también cierra: 40+10−50=0 y −50+50=0. Respecto al nudo 2: (−50)·2−(−50)·2=0 kN·m.</p>`;

 // Main load notation matches the bank. The fully general case remains available.
 put('cargas',lesson('formulario','Formulario: cargas intermedias y apoyos','Calcule primero el empotramiento de cada tramo; después resuelva los GDL libres.',`${method(instructions.cargas)}${eq('{F}ᵢⱼ={F<sup>F</sup>}ᵢⱼ+[K]ᵢⱼ{δ}ᵢⱼ')}${immobileSystem}${loadCase}${convention}<p>Estas expresiones suponen apoyos inmóviles. Para un asentamiento conocido, conserve los términos adicionales de <a href="#cargas/particion-general">la partición general</a>.</p>`,'Semana 3'));
 sec('cargas','formulario').kind='formula';
 put('cargas',lesson('nodales','Distinga cargas nodales y fuerzas de empotramiento','F_n contiene cargas en GDL libres; F<sup>F</sup> contiene las acciones necesarias para impedir los movimientos bajo cargas del tramo.',`<h3>Cargas en los nudos</h3><p>En el ejemplo 11.1, F₁ y F₂ actúan directamente en los nudos; F₃ es la reacción del apoyo. En el método general, las cargas de los GDL libres forman {F_n}. No incorpore una reacción desconocida como carga conocida.</p><h3>Fuerzas de empotramiento</h3><p>Impida los movimientos de los extremos de un tramo cargado. Las acciones que mantienen ese estado forman ${ff}. No son las fuerzas finales cuando los nudos se desplazan.</p>${eq('{δ}ᵢⱼ=0 → {F}ᵢⱼ={F<sup>F</sup>}ᵢⱼ')}${convention}<h3>Carga uniforme hacia abajo</h3><p>Para w&gt;0 hacia abajo, v positivo arriba y giros antihorarios:</p>${eq('{F<sup>F</sup>}ᵢⱼ=[wL/2,wL²/12,wL/2,−wL²/12]ᵀ')}<p>Si w=25 kN/m y L=6 m: [75 kN,75 kN·m,75 kN,−75 kN·m]ᵀ.</p><h3>Carga puntual hacia abajo</h3><p>Para P&gt;0 a distancia a del extremo i y b=L−a del extremo j:</p>${eq('{F<sup>F</sup>}ᵢⱼ=[Pb²(3a+b)/L³,Pab²/L²,Pa²(a+3b)/L³,−Pa²b/L²]ᵀ')}<p>Para varias cargas, sume sus vectores antes de resolver. Las cargas triangular y parcial requieren sus expresiones particulares; las dos fórmulas anteriores no se aplican sustituyendo solamente la resultante.</p>`,'Semana 3'));
 put('cargas',lesson('recuperacion','Resuelva y recupere las acciones de cada tramo','Conserve el signo de las fuerzas de empotramiento desde la solución hasta la recuperación.',`${immobileSystem}${loadCase}${eq('{δ̄}ᵢⱼ=[T]{δ}ᵢⱼ<br>{F̄}ᵢⱼ={F̄<sup>F</sup>}ᵢⱼ+[K̄]ᵢⱼ{δ̄}ᵢⱼ<br>{F}ᵢⱼ=[T]ᵀ{F̄}ᵢⱼ')}<p>En vigas horizontales con ejes locales y globales coincidentes, [T] es la identidad. En una barra inclinada, transforme antes de sumar acciones de diferentes elementos.</p><h3>Una carga aplicada sobre un apoyo</h3>${eq('Ejemplo 11.7: F_a=Y_B−20=10 kN<br>Y_B=10−(−20)=30 kN')}<p>El valor 10 kN es la fuerza nodal neta. La reacción del rodillo es 30 kN. Para obtener una reacción, reste algebraicamente la carga directamente aplicada en el mismo GDL.</p><p>Compruebe el equilibrio del elemento incluyendo sus cargas intermedias. Si un apoyo tiene un movimiento conocido distinto de cero, utilice <a href="#cargas/particion-general">la partición general</a>.</p>`,'Semana 3'));
 put('cargas',lesson('particion-general','Incorpore movimientos conocidos y cargas en apoyos','Ampliación: las ecuaciones conservan las cargas intermedias y los asentamientos prescritos.',`${matrix([['K_nn','K_na'],['K_an','K_aa']],'[K] =')}${eq('{F_n}={F<sup>F</sup>_n}+[K_nn]{δ_n}+[K_na]{δ_a}<br>{F_a}={F<sup>F</sup>_a}+[K_an]{δ_n}+[K_aa]{δ_a}')}${eq('{δ_n}=[K_nn]⁻¹({F_n}−{F<sup>F</sup>_n}−[K_na]{δ_a})')}${loadCase}<p>{δ_a} es un movimiento conocido; puede ser cero o representar un asentamiento. No se elimina su aporte si es distinto de cero. Tras calcular {F_a}, reste la carga aplicada directamente en cada GDL de apoyo para obtener su reacción.</p>${detail('Relación con cargas nodales equivalentes',`<p>Para una carga w&gt;0 hacia abajo y desplazamiento transversal positivo en +Ȳ, el vector equivalente por trabajo virtual es {p_equiv}=−∫[N]ᵀw dx y ${ff}=−{p_equiv}. Esta equivalencia explica el cambio de signo; no se deben sumar ambos vectores como si fueran cargas distintas.</p>`)}`,'Semana 3'));
 get('cargas').routes.understand=['nodales','ejemplo242','superposicion','particion-general','recuperacion','ejercicios'];
 sec('cargas','superposicion').body=sec('cargas','superposicion').body.replaceAll('#transformacion/algebra-particion','#cargas/particion-general').replaceAll('{p_equiv}=∫[N]ᵀq dx','{p_equiv}=−∫[N]ᵀw dx').replaceAll('donde [N] contiene las funciones de interpolación.','para w&gt;0 hacia abajo, donde [N] contiene las funciones de interpolación del desplazamiento transversal positivo hacia arriba.');
 sec('cargas','ejemplo242').body=sec('cargas','ejemplo242').body.replaceAll('Y₁ᶠ','Y<sup>F</sup>₁₂').replaceAll('M₁ᶠ','M<sup>F</sup>₁₂').replaceAll('Y₂ᶠ','Y<sup>F</sup>₂₁').replaceAll('M₂ᶠ','M<sup>F</sup>₂₁');
 sec('cargas','ejemplo242').body+=convention;
 get('cargas').status='Casos fundamentales';

 sec('vigas','viga').body+=`<h3>Compruebe el equilibrio del tramo sin cargas intermedias</h3>${eq('Yᵢ+Yⱼ=0<br>Mᵢ+Mⱼ+YⱼL=0<br>Yᵢ=−Yⱼ=(Mᵢ+Mⱼ)/L')}<p>Para la columna θᵢ, los momentos por unidad de giro son 4EI/L y 2EI/L. Su suma dividida entre L da Yᵢ=6EI/L²; Yⱼ tiene signo contrario. El mismo cálculo sirve para θⱼ. Para las columnas de traslación, use además la compatibilidad o la deducción de la elástica; el equilibrio por sí solo no determina la rigidez.</p><p>Estas relaciones de dos momentos y dos cortantes se aplican aquí porque no hay cargas sobre el tramo. En una viga cargada, incluya también su resultante y su momento. La construcción de columnas es la misma que en <a href="#resortes/columnas-unitarias">los tres estados de resortes</a>.</p>`;
 sec('vigas','formulario').body+=eq('Tramo sin cargas intermedias: Yᵢ+Yⱼ=0; Mᵢ+Mⱼ+YⱼL=0');

 Object.assign(exercises[1],{title:'Calcule el desplazamiento δ₁',label:'Ejemplo 11.1 · resortes',statement:'Conserve kₐ=600 kN/m, k_b=200 kN/m, F₁=50 kN, F₂=−20 kN y δ₃=0. Resuelva δ₁.'});
 Object.assign(exercises[2],{title:'Calcule la fuerza del primer resorte',label:'Ejemplo 11.1 · signo de compresión'});
 Object.assign(exercises[3],{title:'Exprese el desplazamiento con E simbólico',label:'Ejemplo 11.2 · cercha',statement:'La fuente no fija E. Con el valor numérico de E en kN/mm² y u₁ en mm, ¿qué número resulta de E·u₁ en la notación abreviada del ejemplo?'});
 Object.assign(exercises[4],{title:'Calcule la fuerza de la diagonal',label:'Ejemplo 11.2 · recuperación axial',statement:'Conserve la orientación 1→3 de 135°. ¿Cuál es S₁₃ en el ejemplo original?'});
 Object.assign(exercises[5],{title:'Calcule el giro libre θ_B',label:'Ejemplo 11.7 · viga',statement:'En el orden [θ_B,v_A,θ_A,v_B], la ecuación libre es 6480θ_B=−30. Calcule θ_B.'});
 Object.assign(exercises[6],{title:'Distinga reacción y acción neta',label:'Ejemplo 11.7 · apoyo B',statement:'La cuarta ecuación da Y_B−20=10 kN. ¿Cuál es la reacción del rodillo B?'});

 // Convert only known force symbols; do not rename reactions as total support actions.
 for(const c of chapters){c.auditRevision=5;for(const s of c.sections){for(const key of ['title','lead','body','understand','apply'])s[key]=normalizeNotation(s[key]);}}
 for(const e of Object.values(exercises))for(const key of ['title','statement','question','solution'])e[key]=normalizeNotation(e[key]);
 // The legacy algebra URLs are redirected by routes.mjs, not shown as duplicate lessons.
 for(const c of chapters)for(const route of Object.values(c.routes)){const ids=new Set(c.sections.map(s=>s.id));if(route.some(id=>!ids.has(id))||new Set(route).size!==route.length)throw new Error(`Invalid v5 route ${c.id}`);}
}
