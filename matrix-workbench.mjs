import {WORKBENCH_LIMITS,resizeMatrixDraft,validateName,parseMatrixCells,parseMatrixText,operateMatrices,traceCell,inverseTrace,assembleMatrices,assemblyCellTrace,matrixCSV,springAssemblyExample} from './matrix-workbench-core.mjs';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const matrices=new Map([['A',{values:[[2,1],[-1,3]],unit:'kN/m'}],['B',{values:[[4],[2]],unit:'m'}]]);
let pendingResize=null,resizeUndo=null;
let editor=[['2','1'],['-1','3']],calculation=null,assembly=null;
let elements=springAssemblyExample().map(e=>({name:e.name,codes:e.codes.join(', '),text:e.matrix.map(row=>row.join('\t')).join('\n')}));
function format(value){const precision=Number($('#precision').value);return Number(value.toPrecision(Number.isInteger(precision)&&precision>=4&&precision<=12?precision:8)).toString();}
function message(id,text,error=false){const node=$(id);node.textContent=text;node.className=`feedback ${error?'error':'success'}`;}
function run(id,fn){try{fn();}catch(error){const explanation=error.message==='Sistema singular o mal condicionado. Revise apoyos y rigideces.'?'La matriz es singular o está mal condicionada; no se puede invertir de forma fiable.':error.message;message(id,explanation,true);}}
function invalidateCalculation(){calculation=null;$('#calculation-result').hidden=true;message('#calculation-feedback','Los datos cambiaron. Calcule de nuevo.');}
function invalidateAssembly(){assembly=null;$('#assembly-result').hidden=true;message('#assembly-feedback','Los elementos cambiaron. Ensamble de nuevo.');}
function table(values,{clickable=false,selectedCell=null,headers=true}={}) {
 const header = headers ? '<thead><tr><th scope="col">Fila</th>'+values[0].map((_,j)=>'<th scope="col">'+(j+1)+'</th>').join('')+'</tr></thead>' : '';
 const body = values.map((row,i) => {
   const rowHead = headers ? '<th scope="row">'+(i+1)+'</th>' : '';
   const cells = row.map((value,j) => {
     const shown = esc(format(value));
     if (!clickable) return '<td>'+shown+'</td>';
     const active = selectedCell[0]===i && selectedCell[1]===j;
     return `<td${active?' class="selected"':''}><button data-cell="${i},${j}" tabindex="${active?0:-1}" aria-pressed="${active}" aria-label="Fila ${i+1}, columna ${j+1}, valor ${shown}">${shown}</button></td>`;
   });
   return '<tr>'+rowHead+cells.join('')+'</tr>';
 });
 const coordinate = clickable ? `<p class="matrix-coordinates" role="status">Fila ${selectedCell[0]+1}, columna ${selectedCell[1]+1} · ${esc(format(values[selectedCell[0]][selectedCell[1]]))}</p>` : '';
 return coordinate+'<div class="matrix-scroll"><table class="matrix-table">'+header+'<tbody>'+body.join('')+'</tbody></table></div>';
}
function focusMatrixCell(panel, row, col) {
 const old = panel.querySelector('button[data-cell][tabindex="0"]');
 const next = panel.querySelector(`button[data-cell="${row},${col}"]`);
 if (!next) return;
 if (old && old !== next) {
   old.tabIndex = -1;
   old.setAttribute('aria-pressed','false');
   old.closest('td').classList.remove('selected');
 }
 next.tabIndex = 0;
 next.setAttribute('aria-pressed','true');
 next.closest('td').classList.add('selected');
 panel.querySelector('.matrix-coordinates').textContent = `Fila ${row+1}, columna ${col+1} · ${next.textContent}`;
 next.focus({preventScroll:true});
 const box=next.closest('.matrix-scroll'), area=box.getBoundingClientRect(), cell=next.getBoundingClientRect();
 const top=area.top + (next.closest('table').tHead?.offsetHeight || 0);
 const left=area.left + (next.closest('tr').querySelector('th')?.offsetWidth || 0);
 if(cell.top<top) box.scrollTop+=cell.top-top;
 else if(cell.bottom>area.top+box.clientHeight) box.scrollTop+=cell.bottom-area.top-box.clientHeight;
 if(cell.left<left) box.scrollLeft+=cell.left-left;
 else if(cell.right>area.left+box.clientWidth) box.scrollLeft+=cell.right-area.left-box.clientWidth;
}
function moveMatrixFocus(event) {
 const button=event.target.closest('button[data-cell]');
 if(!button || event.altKey || event.metaKey) return;
 let [row,col]=button.dataset.cell.split(',').map(Number);
 const table=button.closest('table'), rows=table.tBodies[0].rows, lastRow=rows.length-1, lastCol=rows[row].cells.length-2;
 switch(event.key) {
   case 'ArrowLeft': col--; break;
   case 'ArrowRight': col++; break;
   case 'ArrowUp': row--; break;
   case 'ArrowDown': row++; break;
   case 'Home': col=0; if(event.ctrlKey) row=0; break;
   case 'End': col=lastCol; if(event.ctrlKey) row=lastRow; break;
   default: return;
 }
 event.preventDefault();
 row=Math.max(0,Math.min(lastRow,row)); col=Math.max(0,Math.min(lastCol,col));
 const next=table.querySelector(`button[data-cell="${row},${col}"]`);
 if(next && next!==button) next.click();
}
function updateChoices(){
 for(const id of ['#matrix-choice','#operand-a','#operand-b']){const node=$(id),previous=node.value;node.innerHTML=[...matrices].map(([name,data])=>`<option value="${esc(name)}">${esc(name)} · ${data.values.length}×${data.values[0].length}</option>`).join('');if(matrices.has(previous))node.value=previous;}
 if(!$('#operand-b').value)$('#operand-b').value='B';
}
function clearResize(){pendingResize=null;resizeUndo=null;$('#resize-confirmation').hidden=true;$('#undo-resize').hidden=true;}
function applyResize(plan){resizeUndo=editor.map(row=>row.slice());editor=plan.cells.map(row=>row.slice());pendingResize=null;$('#resize-confirmation').hidden=true;$('#undo-resize').hidden=false;renderEditor();message('#editor-feedback','Tamaño ajustado. Las celdas nuevas quedan vacías; las matrices guardadas no han cambiado.');}
function renderEditor(){
 $('#matrix-rows').value=editor.length;$('#matrix-cols').value=editor[0].length;
 $('#matrix-grid').innerHTML=`<table class="matrix-table"><thead><tr><th></th>${editor[0].map((_,j)=>`<th scope="col">${j+1}</th>`).join('')}</tr></thead><tbody>${editor.map((row,i)=>`<tr><th scope="row">${i+1}</th>${row.map((value,j)=>`<td><input data-entry="${i},${j}" value="${esc(value)}" aria-label="Entrada fila ${i+1}, columna ${j+1}" autocomplete="off" spellcheck="false"></td>`).join('')}</tr>`).join('')}</tbody></table>`;
 $('#matrix-text').value=editor.map(row=>row.join('\t')).join('\n');
}
function loadMatrix(name){const data=matrices.get(name);if(!data)return;clearResize();editor=data.values.map(row=>row.map(String));$('#matrix-name').value=name;$('#matrix-unit').value=data.unit;$('#matrix-choice').value=name;renderEditor();message('#editor-feedback',`Matriz ${name} cargada. Guarde después de editar.`);}
function saveMatrix(){const name=validateName($('#matrix-name').value),values=parseMatrixCells(editor),unit=$('#matrix-unit').value.trim();if(!matrices.has(name)&&matrices.size>=WORKBENCH_LIMITS.names)throw new Error('Ya hay 12 matrices. Reutilice un nombre existente.');matrices.set(name,{values,unit});updateChoices();$('#matrix-choice').value=name;invalidateCalculation();message('#editor-feedback',`${name} guardada: ${values.length}×${values[0].length}.`);}
function explanation(trace,aName,bName,i,j){
 if(trace.kind==='products')return `<p>${calculation.op==='dot'?`Empareje las componentes de los vectores ${esc(aName)} y ${esc(bName)} y sume sus productos; la orientación fila o columna no cambia el producto escalar.`:`${traceCellLabel(i,j)} = suma de productos de la fila ${i+1} de <span class="trace-a">${esc(aName)}</span> y la columna ${j+1} de <span class="trace-b">${esc(bName)}</span>.`}</p><div class="equation">${trace.terms.map(term=>`(<span class="trace-a">${esc(format(term.a))}</span>)·(<span class="trace-b">${esc(format(term.b))}</span>)`).join(' + ')} = ${esc(format(trace.value))}</div>`;
 if(trace.kind==='add'||trace.kind==='subtract')return `<p>Combine las entradas que tienen la misma fila y columna.</p><div class="equation">Resultado<sub>${i+1},${j+1}</sub> = ${esc(format(trace.a))} ${trace.kind==='add'?'+':'−'} (${esc(format(trace.b))}) = ${esc(format(trace.value))}</div>`;
 if(trace.kind==='transpose')return `<p>Intercambie fila y columna: Resultado<sub>${i+1},${j+1}</sub> = ${esc(aName)}<sub>${j+1},${i+1}</sub> = ${esc(format(trace.value))}.</p>`;
 return `<p>La inversa satisface A·A⁻¹=I. No se obtiene invirtiendo cada número por separado.</p><p>Producto de comprobación A·A⁻¹:</p>${table(trace.identity)}<p class="small">La comprobación interna exige un residuo máximo de 1e−7; una matriz singular o mal condicionada produce una advertencia.</p>`;
}
function traceCellLabel(i,j){return `Resultado<sub>${i+1},${j+1}</sub>`;}
function showCalculation(selectOnly=false){
 const {a,b,aName,bName,op,result}=calculation;const i=Math.min(calculation.selected[0],result.length-1),j=Math.min(calculation.selected[1],result[0].length-1);calculation.selected=[i,j];
 const symbols={add:'+',subtract:'−',multiply:'×',dot:'·',transpose:'ᵀ',inverse:'⁻¹'};
 const title=['transpose','inverse'].includes(op)?`${esc(aName)}${symbols[op]}`:`${esc(aName)} ${symbols[op]} ${esc(bName)}`;
 const node=$('#calculation-result');node.hidden=false;calculation.resultName??=[...'CDEFGHIJKLMNOPQRSTUVWXYZ'].find(name=>!matrices.has(name))||'Resultado';calculation.resultUnit??='';
 if(selectOnly){
  focusMatrixCell(node,i,j);
  node.querySelector('.trace').innerHTML=explanation(traceCell(a,b,op,i,j),aName,bName,i,j);
  return;
 }
 node.innerHTML=`<h2>3. Examine el resultado</h2><p><strong>Resultado = ${title}</strong> · ${result.length}×${result[0].length}</p><p class="small">${esc(aName)}: ${esc(calculation.aUnit||'unidades sin declarar')}${bName?` · ${esc(bName)}: ${esc(calculation.bUnit||'unidades sin declarar')}`:''}. Declare las unidades del resultado antes de reutilizarlo.</p>${table(result,{clickable:true,selectedCell:calculation.selected})}<p class="small">Seleccione una casilla para ver su cálculo.</p><div class="trace">${explanation(traceCell(a,b,op,i,j),aName,bName,i,j)}</div>${op==='inverse'?`<details><summary>Mostrar la inversión por Gauss–Jordan</summary><p>Transforme [A | I] en [I | A⁻¹]. Las primeras ${a.length} columnas son el bloque izquierdo; las últimas ${a.length}, el derecho.</p>${inverseTrace(a).map((step,index)=>`<div class="inverse-step"><strong>${index+1}. ${esc(step.label)}</strong>${table(step.matrix)}</div>`).join('')}</details>`:''}<div class="result-save"><div class="wb-row"><label>Nombre para reutilizar<input id="result-name" value="${esc(calculation.resultName)}" maxlength="16"></label><label>Unidades del resultado<input id="result-unit" value="${esc(calculation.resultUnit)}" maxlength="100" placeholder="Declare unidades o escriba adimensional"></label><button id="save-result" class="primary">Guardar resultado como matriz</button><button id="export-result" class="secondary">Exportar resultado CSV</button></div><p id="result-feedback" role="status" class="feedback"></p><p class="csv-note">CSV contiene solo valores numéricos, separados por coma y con punto decimal. No es un archivo XLSX y no conserva fórmulas ni unidades.</p></div>`;
}
function compute(){const aName=$('#operand-a').value,bName=$('#operand-b').value,op=$('#operation').value,a=matrices.get(aName)?.values,b=matrices.get(bName)?.values;const precision=Number($('#precision').value);if(!Number.isInteger(precision)||precision<4||precision>12)throw new Error('Muestre entre 4 y 12 cifras significativas.');if(!a||(!b&&!['transpose','inverse'].includes(op)))throw new Error('Seleccione matrices guardadas.');const result=operateMatrices(a,b,op);calculation={a,b,aName,bName:['transpose','inverse'].includes(op)?null:bName,op,result,aUnit:matrices.get(aName).unit,bUnit:matrices.get(bName)?.unit,selected:[0,0]};showCalculation();if(['add','subtract'].includes(op)&&calculation.aUnit!==calculation.bUnit)message('#calculation-feedback','Operación numérica calculada. Las unidades declaradas son diferentes: convierta las entradas a unidades compatibles antes de interpretar la suma o resta.',true);else message('#calculation-feedback','Operación calculada. Revise la casilla seleccionada y sus unidades.');}
function download(values,name){const blob=new Blob([matrixCSV(values)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderElements(){
 $('#elements').innerHTML=elements.map((e,index)=>`<section class="element-card"><div class="element-title"><h3>Elemento ${index+1}</h3><button data-remove="${index}" ${elements.length===1?'disabled':''}>Eliminar</button></div><label>Nombre<input data-element="${index}" data-property="name" value="${esc(e.name)}" maxlength="16"></label><label>Códigos globales, en el orden local<input data-element="${index}" data-property="codes" value="${esc(e.codes)}" placeholder="1, 2"></label><label>Matriz cuadrada del elemento<textarea data-element="${index}" data-property="text" rows="4" spellcheck="false">${esc(e.text)}</textarea></label><p class="small">Una fila por línea; columnas separadas por tabulador o punto y coma. Máximo 6×6.</p></section>`).join('');
 $('#add-element').disabled=elements.length>=6;
}
function showAssembly(selectOnly=false){
 const n=assembly.size;assembly.selected=[Math.min(assembly.selected[0],n-1),Math.min(assembly.selected[1],n-1)];const selected=assembly.selected,trace=assemblyCellTrace(assembly,...selected);
 const node=$('#assembly-result');node.hidden=false;
 const traceHTML = `<h3>3. Siga K<sub>${trace.row},${trace.column}</sub></h3>${trace.terms.length?`<ol class="trace-list">${trace.terms.map(term=>`<li><strong>Elemento ${term.element+1} (${esc(term.name)})</strong>: entrada local (${term.localRow}, ${term.localColumn}) → global (${trace.row}, ${trace.column}).<br>${esc(format(term.previous))} + (${esc(format(term.value))}) = <strong>${esc(format(term.cumulative))}</strong></li>`).join('')}</ol><div class="equation">K<sub>${trace.row},${trace.column}</sub> = ${trace.terms.map(term=>`(${esc(format(term.value))})`).join(' + ')} = ${esc(format(trace.value))}</div>`:'<p>Ningún elemento aporta a esta casilla: su valor permanece en 0.</p>'}<p>Los aportes se <strong>suman</strong>; un elemento nuevo no reemplaza el valor acumulado.</p>`;
 if(selectOnly){
  focusMatrixCell(node,...selected);
  node.querySelector('#trace-row').value=selected[0]+1;
  node.querySelector('#trace-col').value=selected[1]+1;
  node.querySelector('.trace').innerHTML=traceHTML;
  return;
 }
 node.innerHTML=`<h2>2. Revise la matriz global</h2><p>K tiene ${n}×${n} entradas. Unidades declaradas: ${esc($('#assembly-unit').value.trim()||'sin declarar')}.</p><p class="small">La matriz de cada elemento ya debe estar expresada en el sistema de coordenadas que desea ensamblar. Esta herramienta no realiza transformaciones.</p>${assembly.unused.length?`<p class="unit-note">GDL sin aportes: ${assembly.unused.join(', ')}. Sus filas y columnas quedan en cero; no se eliminan automáticamente.</p>`:''}${table(assembly.global,{clickable:true,selectedCell:selected})}<div class="wb-row"><label>Fila global<input id="trace-row" type="number" min="1" max="${n}" value="${selected[0]+1}"></label><label>Columna global<input id="trace-col" type="number" min="1" max="${n}" value="${selected[1]+1}"></label><button id="trace-assembly" class="secondary">Ver esta casilla</button><button id="export-assembly" class="secondary">Exportar K como CSV</button></div><p id="trace-feedback" class="feedback" role="status"></p><div class="trace">${traceHTML}</div><h3>4. Compare los aportes completos</h3>${assembly.contributions.map((c,index)=>`<details><summary>Aporte ${esc(assembly.elements[index].name)} · códigos [${assembly.elements[index].codes.join(', ')}]</summary><p>Cada entrada local se ubica en la fila y columna indicadas por sus códigos. Las demás casillas son cero.</p>${table(c)}</details>`).join('')}<p class="csv-note">La exportación es un CSV numérico, no un XLSX. La matriz global no se invierte ni se resuelve aquí; primero deben definirse correctamente apoyos y cargas.</p>`;
}
function doAssemble(){const prepared=elements.map(e=>({name:validateName(e.name),codes:e.codes,matrix:parseMatrixText(e.text)}));assembly=assembleMatrices(prepared,$('#global-dofs').value||null);assembly.selected=[Math.min(1,assembly.size-1),Math.min(1,assembly.size-1)];showAssembly();message('#assembly-feedback',`${elements.length} elementos ensamblados en ${assembly.size} GDL. Compare la procedencia de cada casilla.`);}
function setTab(tab){for(const id of ['calculator','assembly']){const active=id===tab;$('#panel-'+id).hidden=!active;$('#tab-'+id).setAttribute('aria-selected',String(active));$('#tab-'+id).tabIndex=active?0:-1;}history.replaceState(null,'',tab==='assembly'?'#ensamblaje':'#operaciones');}

$('#matrix-choice').addEventListener('change',e=>loadMatrix(e.target.value));
$('#new-matrix').addEventListener('click',()=>{clearResize();editor=[['']];$('#matrix-name').value='';$('#matrix-unit').value='';renderEditor();message('#editor-feedback','Escriba un nombre nuevo y guarde la matriz.');$('#matrix-name').focus();});
$('#resize-matrix').addEventListener('click',()=>run('#editor-feedback',()=>{const plan=resizeMatrixDraft(editor,Number($('#matrix-rows').value),Number($('#matrix-cols').value));if(plan.discarded.length){pendingResize=plan;$('#resize-confirmation').hidden=false;$('#resize-warning').textContent=`Se quitarán ${plan.discarded.length} casillas con datos: ${plan.discarded.slice(0,6).map(x=>`(${x.row},${x.column})=${x.value}`).join('; ')}. No se cambia nada hasta confirmar.`;return;}applyResize(plan);}));
$('#confirm-resize').addEventListener('click',()=>{if(pendingResize)applyResize(pendingResize);});
$('#cancel-resize').addEventListener('click',()=>{pendingResize=null;$('#resize-confirmation').hidden=true;renderEditor();message('#editor-feedback','Cambio de tamaño cancelado.');});
$('#undo-resize').addEventListener('click',()=>{if(!resizeUndo)return;editor=resizeUndo.map(row=>row.slice());clearResize();renderEditor();message('#editor-feedback','Tamaño y valores anteriores restaurados.');});
$('#matrix-grid').addEventListener('input',e=>{if(!e.target.dataset.entry)return;clearResize();const [i,j]=e.target.dataset.entry.split(',').map(Number);editor[i][j]=e.target.value;$('#matrix-text').value=editor.map(row=>row.join('\t')).join('\n');message('#editor-feedback','Cambios sin guardar. La operación utiliza las matrices guardadas.');});
$('#import-matrix').addEventListener('click',()=>run('#editor-feedback',()=>{const values=parseMatrixText($('#matrix-text').value);clearResize();editor=values.map(row=>row.map(String));renderEditor();message('#editor-feedback','Texto incorporado. Revise la cuadrícula y guarde la matriz.');}));
$('#save-matrix').addEventListener('click',()=>run('#editor-feedback',saveMatrix));
$('#calculate').addEventListener('click',()=>run('#calculation-feedback',()=>{invalidateCalculation();compute();}));
$('#operation').addEventListener('change',()=>{$('#operand-b-label').hidden=['transpose','inverse'].includes($('#operation').value);invalidateCalculation();});
for(const id of ['#operand-a','#operand-b'])$(id).addEventListener('change',invalidateCalculation);
for (const id of ['#calculation-result','#assembly-result']) {
 $(id).addEventListener('keydown',moveMatrixFocus);
}
$('#precision').addEventListener('change',()=>{const n=Number($('#precision').value);if(!Number.isInteger(n)||n<4||n>12){message('#calculation-feedback','Use de 4 a 12 cifras significativas.',true);return;}if(calculation)showCalculation();if(assembly)showAssembly();});
$('#calculation-result').addEventListener('input',e=>{if(!calculation)return;if(e.target.id==='result-name')calculation.resultName=e.target.value;if(e.target.id==='result-unit')calculation.resultUnit=e.target.value;});
$('#calculation-result').addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.cell){calculation.selected=button.dataset.cell.split(',').map(Number);showCalculation(true);return;}if(button.id==='export-result')download(calculation.result,'resultado-matriz.csv');if(button.id==='save-result')run('#result-feedback',()=>{const name=validateName($('#result-name').value),unit=$('#result-unit').value.trim();if(!unit)throw new Error('Declare las unidades del resultado; escriba adimensional si corresponde.');if(!matrices.has(name)&&matrices.size>=12)throw new Error('Ya hay 12 nombres. Reutilice uno existente.');matrices.set(name,{values:calculation.result.map(row=>row.slice()),unit});updateChoices();if(name===calculation.aName||name===calculation.bName){invalidateCalculation();message('#calculation-feedback',`${name} reemplazada por el resultado. Calcule de nuevo para usar su nuevo valor.`);}else message('#result-feedback',`${name} guardada. Ya puede seleccionarla como operando.`);});});
$('#add-element').addEventListener('click',()=>{if(elements.length>=6)return;elements.push({name:`e${elements.length+1}`,codes:'1, 2',text:'1; -1\n-1; 1'});renderElements();invalidateAssembly();});
$('#reset-assembly').addEventListener('click',()=>{elements=springAssemblyExample().map(e=>({name:e.name,codes:e.codes.join(', '),text:e.matrix.map(row=>row.join('\t')).join('\n')}));$('#global-dofs').value='';$('#assembly-unit').value='kN/m';renderElements();invalidateAssembly();message('#assembly-feedback','Ejemplo 11.1 restablecido: kₐ=600 y k_b=200 kN/m. Ensamble para comprobar K₂₂=800.');});
$('#elements').addEventListener('input',e=>{if(e.target.dataset.element===undefined)return;elements[Number(e.target.dataset.element)][e.target.dataset.property]=e.target.value;invalidateAssembly();});
$('#elements').addEventListener('click',e=>{const button=e.target.closest('[data-remove]');if(!button||elements.length===1)return;elements.splice(Number(button.dataset.remove),1);renderElements();invalidateAssembly();});
for(const id of ['#global-dofs','#assembly-unit'])$(id).addEventListener('input',invalidateAssembly);
$('#assemble').addEventListener('click',()=>run('#assembly-feedback',()=>{invalidateAssembly();doAssemble();}));
$('#assembly-result').addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.cell){assembly.selected=button.dataset.cell.split(',').map(Number);showAssembly(true);return;}if(button.id==='trace-assembly')run('#trace-feedback',()=>{const i=Number($('#trace-row').value)-1,j=Number($('#trace-col').value)-1;assemblyCellTrace(assembly,i,j);assembly.selected=[i,j];showAssembly(true);});if(button.id==='export-assembly')download(assembly.global,'matriz-global.csv');});
document.querySelectorAll('[data-tab]').forEach(button=>{button.addEventListener('click',()=>setTab(button.dataset.tab));button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const target=e.key==='Home'?'calculator':e.key==='End'?'assembly':button.dataset.tab==='calculator'?'assembly':'calculator';setTab(target);$('#tab-'+target).focus();});});
updateChoices();$('#operand-a').value='A';$('#operand-b').value='B';loadMatrix('A');renderElements();setTab(location.hash==='#ensamblaje'?'assembly':'calculator');
