/** Bounded, deterministic matrix operations. No DOM, network or dynamic code. */
import {multiply,transpose,solveLinear} from './math.mjs';
import {parseVal,parsePastedGrid,numericInputError} from './bank-validation.mjs';
export const WORKBENCH_LIMITS=Object.freeze({dimension:6,elements:6,globalDofs:36,names:12,magnitude:1e100,minimum:1e-100});
/** Editing shape is not a numerical operation: preserve expressions and blanks. */
export function resizeMatrixDraft(cells,rows,columns,max=6){
 if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||columns<1||rows>max||columns>max)throw new Error(`Filas y columnas deben ser enteros entre 1 y ${max}.`);
 if(!Array.isArray(cells)||cells.some(row=>!Array.isArray(row)))throw new Error('El borrador no es una matriz.');
 const discarded=[];cells.forEach((row,r)=>row.forEach((value,c)=>{if((r>=rows||c>=columns)&&String(value??'').trim()!=='')discarded.push({row:r+1,column:c+1,value:String(value)});}));
 return {cells:Array.from({length:rows},(_,r)=>Array.from({length:columns},(_,c)=>String(cells[r]?.[c]??''))),discarded};
}
export function validateName(value){const name=String(value).trim();if(!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(name))throw new Error('Use un nombre de 1 a 16 caracteres: letra inicial, letras, números o guion bajo.');return name;}
export function validateMatrix(value,max=6){
 if(!Number.isInteger(max)||max<1||max>36)throw new Error('El límite de dimensión debe estar entre 1 y 36.');
 if(!Array.isArray(value)||value.length<1||value.length>max||!Array.isArray(value[0])||value[0].length<1||value[0].length>max)throw new Error(`Use entre 1 y ${max} filas y columnas.`);
 const columns=value[0].length;
 if(value.some(row=>!Array.isArray(row)||row.length!==columns))throw new Error('Todas las filas deben tener el mismo número de columnas.');
 if(value.flat().some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>WORKBENCH_LIMITS.magnitude||(n!==0&&Math.abs(n)<WORKBENCH_LIMITS.minimum)))throw new Error('Use valores finitos: cero o una magnitud entre 1e−100 y 1e100. Cambie la escala si el resultado queda fuera de ese rango.');
 return value.map(row=>row.slice());
}
export function parseMatrixCells(cells,maxDimension=6){
 if(!Array.isArray(cells))throw new Error('La matriz no es válida.');
 return validateMatrix(cells.map((row,i)=>{
  if(!Array.isArray(row))throw new Error('La fila no es válida.');
  return row.map((s,j)=>{const value=parseVal(s);if(value===null||!Number.isFinite(value))throw new Error(numericInputError(s)||`Complete la casilla (${i+1}, ${j+1}) con un número o una expresión válida.`);return value;});
 }),maxDimension);
}
export function parseMatrixText(text,maxDimension=6){
 if(typeof text!=='string'||text.length>20000)throw new Error('El texto de la matriz es demasiado largo.');
 const ambiguity=numericInputError(text);if(ambiguity)throw new Error(ambiguity);
 return parseMatrixCells(parsePastedGrid(text)??[[text.trim()]],maxDimension);
}
const finiteResult=(a,maxDimension=6)=>validateMatrix(a,maxDimension);
function checkedProduct(a,b){const value=a*b;if(!Number.isFinite(value)||(a!==0&&b!==0&&value===0))throw new Error('Un producto excede el rango numérico; cambie la escala de las entradas.');return value;}
export function inverseMatrix(input,maxDimension=6){
 const a=validateMatrix(input,maxDimension),n=a.length;if(a[0].length!==n)throw new Error('La inversa requiere una matriz cuadrada.');
 const columns=Array.from({length:n},(_,j)=>solveLinear(a,Array.from({length:n},(_,i)=>i===j?1:0)));
 const result=finiteResult(transpose(columns),maxDimension);
 const residual=multiply(a,result);
 if(residual.some((row,i)=>row.some((v,j)=>Math.abs(v-(i===j?1:0))>1e-7)))throw new Error('La matriz está mal condicionada; no se puede verificar la inversa con esta precisión.');
 return result;
}
function vector(a){if(a.length===1)return a[0].slice();if(a[0].length===1)return a.map(row=>row[0]);throw new Error('El producto escalar requiere dos vectores: una sola fila o una sola columna.');}
export function operateMatrices(first,second,operation,maxDimension=6){
 const a=validateMatrix(first,maxDimension),b=['transpose','inverse'].includes(operation)?null:validateMatrix(second,maxDimension);
 let result;
 if(operation==='add'||operation==='subtract'){
  if(a.length!==b.length||a[0].length!==b[0].length)throw new Error('Suma y resta requieren las mismas dimensiones.');
  result=a.map((row,i)=>row.map((value,j)=>value+(operation==='add'?1:-1)*b[i][j]));
 }else if(operation==='multiply'){
  if(a[0].length!==b.length)throw new Error(`Producto no definido: ${a[0].length} columnas de A no coinciden con ${b.length} filas de B.`);
  a.forEach(row=>row.forEach((value,k)=>b[k].forEach(v=>checkedProduct(value,v))));
  result=multiply(a,b);
 }else if(operation==='dot'){
  const av=vector(a),bv=vector(b);if(av.length!==bv.length)throw new Error('Los vectores deben tener el mismo número de componentes.');
  result=[[av.reduce((sum,value,i)=>sum+checkedProduct(value,bv[i]),0)]];
 }else if(operation==='transpose')result=transpose(a);
 else if(operation==='inverse')result=inverseMatrix(a,maxDimension);
 else throw new Error('Operación no reconocida.');
 return finiteResult(result,maxDimension);
}
export function traceCell(a,b,operation,row,column,maxDimension=6){
 const result=operateMatrices(a,b,operation,maxDimension);
 if(!Number.isInteger(row)||!Number.isInteger(column)||row<0||column<0||row>=result.length||column>=result[0].length)throw new Error('Seleccione una casilla del resultado.');
 if(operation==='multiply')return {kind:'products',terms:a[row].map((value,k)=>({a:value,b:b[k][column],product:value*b[k][column],aCell:[row,k],bCell:[k,column]})),value:result[row][column]};
 if(operation==='dot'){const av=vector(a),bv=vector(b);return {kind:'products',terms:av.map((value,k)=>({a:value,b:bv[k],product:value*bv[k]})),value:result[0][0]};}
 if(operation==='add'||operation==='subtract')return {kind:operation,a:a[row][column],b:b[row][column],value:result[row][column]};
 if(operation==='transpose')return {kind:'transpose',source:[column,row],value:result[row][column]};
 return {kind:'inverse',value:result[row][column],identity:operateMatrices(a,result,'multiply',maxDimension)};
}
/** Gauss–Jordan trace with partial pivoting; displayed alongside checked inverse. */
export function inverseTrace(input,maxDimension=6){
 const a=validateMatrix(input,maxDimension);inverseMatrix(a,maxDimension);const n=a.length;
 const aug=a.map((row,i)=>[...row,...Array.from({length:n},(_,j)=>i===j?1:0)]),steps=[];
 const push=label=>steps.push({label,matrix:aug.map(row=>row.slice())});push('Escriba [A | I].');
 for(let p=0;p<n;p++){
  let pivot=p;for(let i=p+1;i<n;i++)if(Math.abs(aug[i][p])>Math.abs(aug[pivot][p]))pivot=i;
  if(pivot!==p){[aug[p],aug[pivot]]=[aug[pivot],aug[p]];push(`Intercambie las filas ${p+1} y ${pivot+1}.`);}
  const divisor=aug[p][p];for(let j=0;j<2*n;j++)aug[p][j]/=divisor;push(`Divida la fila ${p+1} por ${divisor}.`);
  for(let i=0;i<n;i++)if(i!==p){const factor=aug[i][p];if(factor===0)continue;for(let j=0;j<2*n;j++)aug[i][j]-=factor*aug[p][j];push(`Fila ${i+1} ← fila ${i+1} − (${factor})·fila ${p+1}.`);}
 }
 if(steps.some(step=>step.matrix.flat().some(n=>!Number.isFinite(n))))throw new Error('La traza de inversión excede la precisión disponible.');
 return steps;
}
export function parseCodes(input){
 const parts=Array.isArray(input)?input:String(input).trim().split(/[\s,;]+/);
 if(parts.length<1||parts.length>6||parts.some(p=>!/^\d+$/.test(String(p))))throw new Error('Escriba de 1 a 6 códigos enteros positivos, separados por coma o espacio.');
 const codes=parts.map(Number);
 if(codes.some(n=>!Number.isInteger(n)||n<1||n>36))throw new Error('Los códigos deben estar entre 1 y 36.');
 if(new Set(codes).size!==codes.length)throw new Error('Un elemento no puede repetir un código de GDL.');
 return codes;
}
export function assembleMatrices(input,totalDofs=null){
 if(!Array.isArray(input)||input.length<1||input.length>6)throw new Error('Ensamble entre 1 y 6 elementos.');
 const elements=input.map((element,index)=>{const matrix=validateMatrix(element.matrix),codes=parseCodes(element.codes);if(matrix.length!==matrix[0].length||codes.length!==matrix.length)throw new Error(`Elemento ${index+1}: use una matriz cuadrada y un código por fila/columna.`);return {name:String(element.name||`e${index+1}`),matrix,codes};});
 const highest=Math.max(...elements.flatMap(e=>e.codes));
 if(totalDofs!==null&&totalDofs!==''&&typeof totalDofs!=='number'&&!(typeof totalDofs==='string'&&/^\d+$/.test(totalDofs.trim())))throw new Error('El total de GDL debe ser un número entero decimal.');
 const size=totalDofs===null||totalDofs===''?highest:Number(totalDofs);
 if(!Number.isInteger(size)||size<highest||size>36)throw new Error(`El total global debe ser un entero entre ${highest} y 36.`);
 const global=Array.from({length:size},()=>Array(size).fill(0));
 const provenance=Array.from({length:size},()=>Array.from({length:size},()=>[]));
 const contributions=elements.map((e,index)=>{
  const contribution=Array.from({length:size},()=>Array(size).fill(0));
  e.matrix.forEach((row,i)=>row.forEach((value,j)=>{const r=e.codes[i]-1,c=e.codes[j]-1;global[r][c]+=value;contribution[r][c]=value;provenance[r][c].push({element:index,name:e.name,localRow:i+1,localColumn:j+1,value});}));
  return contribution;
 });
 validateMatrix(global,36);
 return {global,contributions,provenance,elements,size,unused:Array.from({length:size},(_,i)=>i+1).filter(code=>!elements.some(e=>e.codes.includes(code)))};
}
export function assemblyCellTrace(assembly,row,column){
 if(!Number.isInteger(row)||!Number.isInteger(column)||row<0||column<0||row>=assembly.size||column>=assembly.size)throw new Error('Casilla global fuera de rango.');
 let sum=0;const terms=assembly.provenance[row][column].map(term=>({...term,previous:sum,cumulative:(sum+=term.value)}));
 return {row:row+1,column:column+1,terms,value:assembly.global[row][column]};
}
export function matrixCSV(input){const a=validateMatrix(input,36);return a.map(row=>row.map(n=>String(n)).join(',')).join('\r\n')+'\r\n';}
export function springAssemblyExample(){return [{name:'a',codes:[1,2],matrix:[[600,-600],[-600,600]]},{name:'b',codes:[2,3],matrix:[[200,-200],[-200,200]]}];}
