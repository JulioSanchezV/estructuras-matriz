/** Student-owned matrix scratch sheet. Pure functions; no DOM, network or answers. */
import {parseVal,parsePastedGrid,numericInputError} from './bank-validation.mjs';
import {validateMatrix,operateMatrices} from './matrix-workbench-core.mjs';
import {solveLinear,transpose} from './math.mjs';

export const SHEET_LIMITS=Object.freeze({dimension:36,names:40,history:30,text:100000,serialized:2500000});
const validate=a=>validateMatrix(a,SHEET_LIMITS.dimension);
const safeString=(value,max,label)=>{
  if(typeof value!=='string'||value.length>max)throw new Error(`${label}: use un texto de hasta ${max} caracteres.`);
  return value;
};
export function validateSheetName(value){
  if(typeof value!=='string')throw new Error('Escriba un nombre para la matriz.');
  const name=value.trim();
  if(!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(name)||['constructor','prototype','__proto__'].includes(name.toLowerCase()))throw new Error('Use de 1 a 24 caracteres: letra inicial, letras, números o guion bajo.');
  return name;
}

/** A preview never fills a blank with zero. Invalid cells have value null.
 * Rectangularity and every cell must be valid before values can be operated on. */
export function parseSheetText(text){
  if(typeof text!=='string'||text.length>SHEET_LIMITS.text)throw new Error('El bloque es demasiado largo. Use como máximo 36 filas y 36 columnas.');
 const ambiguity=numericInputError(text);if(ambiguity)return {cells:[[text]],values:[[null]],rows:1,columns:1,valid:false,errors:[{row:1,column:1,message:ambiguity}]};
  const cells=(parsePastedGrid(text)??[[text.trim()]]).map(row=>row.map(cell=>String(cell)));
  const rows=cells.length,columns=Math.max(...cells.map(row=>row.length));
  if(rows<1||rows>36||columns<1||columns>36)throw new Error('Use entre 1 y 36 filas y columnas.');
  const errors=[];
  const values=cells.map((row,r)=>{
    if(row.length!==columns)errors.push({row:r+1,column:row.length+1,message:'La fila tiene un número diferente de columnas.'});
    return row.map((cell,c)=>{
      const value=parseVal(cell);
      if(value===null){errors.push({row:r+1,column:c+1,message:'Casilla vacía. Escriba cero si ese es su valor.'});return null;}
      if(!Number.isFinite(value)){errors.push({row:r+1,column:c+1,message:'Expresión numérica no válida.'});return null;}
      return value;
    });
  });
  return {cells,values,rows,columns,valid:errors.length===0,errors};
}

function solverMessage(error){
  if(/singular|condicionad/i.test(error.message))throw new Error('La matriz es singular o está mal condicionada. Revise sus coeficientes antes de invertir o resolver.');
  throw error;
}
/** No implicit broadcasting, unit conversion or extraction of an answer. */
export function operateSheet(first,second,operation){
  const a=validate(first);
  try {
    if(operation==='scale'){
      const scalar=typeof second==='number'?second:validate(second)[0]?.[0];
      if(typeof second!=='number'&&(second.length!==1||second[0].length!==1))throw new Error('El factor debe ser un escalar o una matriz 1×1.');
      validate([[scalar]]);
      return validate(a.map(row=>row.map(value=>{
        const product=value*scalar;
        if(value!==0&&scalar!==0&&product===0)throw new Error('El producto queda fuera del rango numérico. Cambie la escala.');
        return product;
      })));
    }
    if(operation==='solve'){
      const b=validate(second),n=a.length;
      if(a[0].length!==n||b.length!==n)throw new Error('Para resolver A·X=B, A debe ser cuadrada y B debe tener el mismo número de filas.');
      const x=validate(transpose(transpose(b).map(rhs=>solveLinear(a,rhs))));
      // Componentwise backward residual; each equation is compared in its own unit.
      for(let i=0;i<n;i++)for(let j=0;j<b[0].length;j++){
        const terms=a[i].map((v,k)=>v*x[k][j]);
        if(terms.some(v=>!Number.isFinite(v)))throw new Error('El cálculo excede el rango numérico. Cambie la escala.');
        const residual=Math.abs(terms.reduce((sum,v)=>sum+v,0)-b[i][j]);
        const scale=Math.abs(b[i][j])+terms.reduce((sum,v)=>sum+Math.abs(v),0);
        if(residual>1e-9*Math.max(scale,Number.MIN_VALUE))throw new Error('No se pudo verificar el residuo del sistema con esta precisión.');
      }
      return x;
    }
    return operateMatrices(a,second,operation,36);
  }catch(error){solverMessage(error);}
}

/** One-based ranges: blank or * means all; 2:4,6 means 2,3,4,6. */
export function parseRange(spec,size){
  if(!Number.isInteger(size)||size<1||size>36)throw new Error('Dimensión de rango no válida.');
  if(spec===undefined||spec===null||spec==='*'||(typeof spec==='string'&&!spec.trim()))return Array.from({length:size},(_,i)=>i+1);
  if(typeof spec!=='string'||spec.length>200)throw new Error('Escriba índices enteros o rangos, por ejemplo 1,3 o 2:4.');
  const normalized=spec.trim();
  if(!/^\d+(?:\s*:\s*\d+)?(?:\s*[,;]\s*\d+(?:\s*:\s*\d+)?)*$/.test(normalized))throw new Error('Use índices separados por coma y rangos como 2:4, sin casillas vacías.');
  const indices=[];
  for(const part of normalized.split(/[,;]/)){
    const [start,end=start]=part.split(':').map(s=>Number(s.trim()));
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>size||end<start)throw new Error(`Los índices deben estar entre 1 y ${size}; los rangos deben ser ascendentes.`);
    for(let n=start;n<=end;n++)indices.push(n);
  }
  if(new Set(indices).size!==indices.length)throw new Error('No repita índices en el rango.');
  return indices;
}
export function validateRange(matrix,rowSpec,columnSpec){
  const a=validate(matrix);
  return {rows:parseRange(rowSpec,a.length),columns:parseRange(columnSpec,a[0].length)};
}
export function extractRange(matrix,rowSpec,columnSpec){
  const a=validate(matrix),range=validateRange(a,rowSpec,columnSpec);
  return range.rows.map(r=>range.columns.map(c=>a[r-1][c-1]));
}
export function matrixTSV(matrix){return validate(matrix).map(row=>row.map(v=>String(v)).join('\t')).join('\n');}

export function createSheetState(){return {version:1,matrices:[],history:[]};}
function cleanEntry(entry){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error('La entrada de la hoja no es válida.');
  return {name:validateSheetName(entry.name),values:validate(entry.values),unit:safeString(entry.unit??'',100,'Unidades'),source:safeString(entry.source??'',300,'Origen')};
}
function cleanHistory(entry){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error('El registro de cálculo no es válido.');
  return {...cleanEntry(entry),label:safeString(entry.label??entry.source??'',300,'Operación')};
}
function cleanState(state){
  if(!state||state.version!==1||!Array.isArray(state.matrices)||!Array.isArray(state.history)||state.matrices.length>40||state.history.length>30)throw new Error('La hoja guardada no tiene un formato válido.');
  const matrices=state.matrices.map(cleanEntry),history=state.history.map(cleanHistory);
  if(new Set(matrices.map(m=>m.name)).size!==matrices.length)throw new Error('La hoja guardada contiene nombres repetidos.');
  return {version:1,matrices,history};
}
/** Functional update: previous values/history remain independent snapshots. */
export function storeNamedMatrix(state,name,values,options={}){
  const next=cleanState(state),entry=cleanEntry({name,values,unit:options.unit??'',source:options.source??''});
  const index=next.matrices.findIndex(m=>m.name===entry.name);
  if(index<0){if(next.matrices.length>=40)throw new Error('Ya hay 40 matrices guardadas. Reutilice un nombre o elimine una matriz.');next.matrices.push(entry);}
  else next.matrices[index]=entry;
  next.history.push({...entry,values:entry.values.map(row=>row.slice()),label:entry.source||`Guardar ${entry.name}`});
  next.history=next.history.slice(-30);
  return next;
}
export function recordHistory(state,entry){
  const next=cleanState(state);next.history.push(cleanHistory(entry));next.history=next.history.slice(-30);return next;
}
export function removeNamedMatrix(state,name){
  const next=cleanState(state),validName=validateSheetName(name);next.matrices=next.matrices.filter(m=>m.name!==validName);return next;
}
export function serializeSheetState(state){
  const json=JSON.stringify(cleanState(state));
  if(json.length>SHEET_LIMITS.serialized)throw new Error('La hoja ocupa demasiado espacio para guardarse. Reduzca las matrices o el historial.');
  return json;
}
export function restoreSheetState(raw){
  if(raw===null||raw===undefined||raw==='')return createSheetState();
  if(typeof raw!=='string'||raw.length>SHEET_LIMITS.serialized)throw new Error('La hoja guardada es demasiado grande o no es texto válido.');
  let data;try{data=JSON.parse(raw);}catch{throw new Error('No se pudo leer la hoja guardada.');}
  return cleanState(data);
}
export function storageKey(alias,type,variant){
  if(typeof alias!=='string'||alias.length>64||typeof type!=='string'||!/^[a-z0-9-]{1,64}$/.test(type)||!Number.isSafeInteger(variant)||variant<1)throw new Error('El código, tipo o variante de la hoja no es válido.');
  const canonical=(alias.trim()||'ejemplo').toUpperCase();
  return `rigidez:hoja:v1:${encodeURIComponent(canonical)}:${type}:${variant}`;
}
