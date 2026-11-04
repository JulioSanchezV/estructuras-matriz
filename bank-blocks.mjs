/** Student response blocks: never receives an answer key. */
import {parseVal,parsePastedGrid,numericInputError} from './bank-validation.mjs';
export const escapeBlockHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function blankResponse(rows,columns){return Array.from({length:rows},()=>Array(columns).fill(''));}
export function responseTSV(cells){return cells.map(row=>row.map(value=>value===null?'':String(value)).join('\t')).join('\n');}
export function parseResponseBlock(text,rows,columns){
 if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||columns<1||rows>36||columns>36)throw new Error('Dimensiones de respuesta fuera de rango.');
 if(typeof text!=='string'||text.length>100000)return {ok:false,message:'El bloque es demasiado largo.'};
 const ambiguity=numericInputError(text);if(ambiguity)return {ok:false,ambiguous:true,message:ambiguity};
 const cells=text.trim()===''?blankResponse(rows,columns):(parsePastedGrid(text)??[[text.trim()]]);
 if(cells.length!==rows||cells.some(row=>row.length!==columns))return {ok:false,message:`Se requiere un bloque de ${rows}×${columns}. Recibido: ${cells.length} filas, con ${cells.map(row=>row.length).join(', ')} columnas. No se recortó ni rellenó el bloque.`};
 const values=cells.map(row=>row.map(parseVal));const invalid=[];let empty=0;
 values.forEach((row,r)=>row.forEach((value,c)=>{if(value===null)empty++;else if(!Number.isFinite(value))invalid.push([r+1,c+1]);}));
 if(invalid.length)return {ok:false,cells,values,message:`Revise las expresiones de las posiciones ${invalid.slice(0,8).map(([r,c])=>`(${r},${c})`).join(', ')}. No escriba unidades dentro del bloque.`};
 return {ok:true,cells,values,complete:empty===0,empty,message:empty?`${rows}×${columns}: ${empty} casillas vacías; no se sustituyen por cero.`:`${rows}×${columns}. Bloque completo.`};
}
/** Numeric columns from a visible data table, not arbitrary expressions or hidden solutions. */
export function numericTableColumns(headers,rows){
 const literal=/^[+−-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+−-]?\d+)?$/i;
 if(!rows.length)return null;const columns=headers.map((_,c)=>c).filter(c=>rows.every(row=>literal.test(String(row[c]??'').trim())&&Number.isFinite(parseVal(row[c]))));
 if(!columns.length)return null;
 const cells=rows.map(row=>columns.map(c=>String(row[c]).trim()));
 return {columns:columns.map(c=>c+1),headers:columns.map(c=>headers[c]),cells,text:responseTSV(cells)};
}
