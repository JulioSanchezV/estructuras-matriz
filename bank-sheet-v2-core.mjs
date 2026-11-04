/** Editable student-owned matrix cards. Pure state transformations; no DOM or answers. */
import * as Numeric from './bank-validation.mjs';
import {operateSheet,extractRange,restoreSheetState,storageKey,validateSheetName} from './bank-sheet-core.mjs';
export const V2_LIMITS=Object.freeze({dimension:36,cards:40,history:30,text:100000,cell:512,serialized:2500000});
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=message=>{throw new Error(message);};
const txt=(v,max,label)=>typeof v==='string'&&v.length<=max?v:fail(`${label}: texto no válido o demasiado largo.`);
const dim=n=>Number.isInteger(n)&&n>=1&&n<=36?n:fail('Use dimensiones enteras de 1 a 36.');
const version=n=>Number.isSafeInteger(n)&&n>=1?n:fail('Versión de tarjeta no válida.');
const idValid=id=>typeof id==='string'&&/^m[1-9]\d*$/.test(id);
const originKinds=['manual','paso','enunciado','pegado','resultado','migrado'];
const operations=['add','subtract','multiply','dot','inverse','transpose','solve','scale','extract'];
const unary=op=>['inverse','transpose','scale','extract'].includes(op);
const cellError=text=>typeof Numeric.numericInputError==='function'?Numeric.numericInputError(text):(Numeric.parseVal(text)===null?'Casilla vacía.':Number.isFinite(Numeric.parseVal(text))?'':'Expresión no válida.');
function cellsOf(cells,rows,columns){
 if(!Array.isArray(cells)||cells.length!==rows||cells.some(row=>!Array.isArray(row)||row.length!==columns))fail('Las celdas deben coincidir con las dimensiones declaradas.');
 return cells.map(row=>row.map(value=>txt(value,512,'Casilla')));
}
function cleanOrigin(value={kind:'manual'}){
 if(!value||typeof value!=='object'||Array.isArray(value)||!originKinds.includes(value.kind))fail('Origen de tarjeta no válido.');
 const out={kind:value.kind};
 for(const key of ['source','fieldKey','scalarText','rowSpec','columnSpec'])if(value[key]!==undefined)out[key]=txt(value[key],key==='scalarText'?512:300,key);
 if(value.kind==='resultado'){
  if(!operations.includes(value.op)||!Array.isArray(value.operands)||value.operands.length<1||value.operands.length>2)fail('Dependencias del resultado no válidas.');
  out.op=value.op;out.operands=value.operands.map(o=>{if(!o||!idValid(o.id))fail('Identificador de dependencia no válido.');return {id:o.id,name:validateSheetName(o.name),version:version(o.version)};});
  if(out.operands.length!==(unary(out.op)?1:2))fail('Número de operandos no válido.');
 }
 return out;
}
function cleanCard(card){
 if(!card||!idValid(card.id))fail('Identificador de tarjeta no válido.');
 const rows=dim(card.rows),columns=dim(card.columns);
 return {id:card.id,name:validateSheetName(card.name),rows,columns,cells:cellsOf(card.cells,rows,columns),unit:txt(card.unit??'',100,'Unidades'),version:version(card.version),origin:cleanOrigin(card.origin)};
}
function verifyGraph(cards){
 const byId=new Map(cards.map(c=>[c.id,c])),visiting=new Set(),done=new Set();
 function visit(card){if(visiting.has(card.id))fail('La hoja contiene un ciclo de dependencias.');if(done.has(card.id))return;visiting.add(card.id);for(const dep of card.origin.operands??[]){if(dep.id===card.id)fail('Un resultado no puede depender de sí mismo.');if(byId.has(dep.id))visit(byId.get(dep.id));}visiting.delete(card.id);done.add(card.id);}
 cards.forEach(visit);
}
function cleanHistory(entry){
 if(!entry||typeof entry!=='object')fail('Historial no válido.');
 const rows=dim(entry.rows),columns=dim(entry.columns);
 return {name:validateSheetName(entry.name),label:txt(entry.label??'',300,'Historial'),rows,columns,cells:cellsOf(entry.cells,rows,columns),unit:txt(entry.unit??'',100,'Unidades')};
}
function cleanRecovery(entry){
 if(!entry||typeof entry!=='object')fail('Recuperación no válida.');
 return {name:txt(entry.name??'Borrador',100,'Borrador'),rawText:txt(entry.rawText??'',2500000,'Texto recuperado'),unit:txt(entry.unit??'',100,'Unidades'),reason:txt(entry.reason??'',500,'Aviso')};
}
function cleanState(input){
 if(!input||input.version!==2||!Array.isArray(input.cards)||input.cards.length>40||!Array.isArray(input.history)||input.history.length>30||!Array.isArray(input.recovery)||input.recovery.length>50)fail('La hoja no tiene un formato V2 válido.');
 const cards=input.cards.map(cleanCard);if(new Set(cards.map(c=>c.id)).size!==cards.length||new Set(cards.map(c=>c.name)).size!==cards.length)fail('Hay nombres o identificadores repetidos.');verifyGraph(cards);
 const nextId=version(input.nextId),nextRevision=version(input.nextRevision);
 if(cards.some(c=>Number(c.id.slice(1))>=nextId||c.version>=nextRevision))fail('Los contadores de la hoja no son válidos.');
 let undo=null;if(input.undo!==null&&input.undo!==undefined){const u=input.undo;if(!u||u.kind!=='restore'||!Number.isInteger(u.index)||u.index<0||u.index>40)fail('Registro de deshacer no válido.');undo={kind:'restore',label:txt(u.label,300,'Deshacer'),index:u.index,card:cleanCard(u.card)};}
 let migration=null;if(input.migration!==null&&input.migration!==undefined){migration={raw:txt(input.migration.raw,2500000,'Respaldo anterior'),ui:{}};const old=input.migration.ui;if(old&&typeof old==='object'&&!Array.isArray(old))for(const key of ['selected','name','unit','text','a','b','operation','scalar','resultName','resultUnit','rangeRows','rangeColumns','rangeName','target','sourceField'])if(typeof old[key]==='string')migration.ui[key]=txt(old[key],key==='text'?120000:200,'Estado anterior');}
 return {version:2,cards,history:input.history.map(cleanHistory),recovery:input.recovery.map(cleanRecovery),undo,nextId,nextRevision,migration};
}
export function createStateV2(){return {version:2,cards:[],history:[],recovery:[],undo:null,nextId:1,nextRevision:1,migration:null};}
const get=(state,id)=>state.cards.find(c=>c.id===id)??fail('La tarjeta ya no está disponible.');
const unique=(state,name,exceptId=null)=>{name=validateSheetName(name);if(state.cards.some(c=>c.name===name&&c.id!==exceptId))fail(`Ya existe ${name}. Use otro nombre; no se reemplazan matrices automáticamente.`);return name;};
export function uniqueName(state,base='Matriz'){
 base=String(base).replace(/[^A-Za-z0-9_]/g,'').slice(0,18);if(!/^[A-Za-z]/.test(base))base='Matriz';if(['constructor','prototype'].includes(base.toLowerCase()))base='Matriz';
 let name=base,n=2;while(state.cards.some(c=>c.name===name))name=`${base}_${n++}`;return name;
}
function remember(state,card,label){state.history.push({name:card.name,label:label.slice(0,300),rows:card.rows,columns:card.columns,cells:clone(card.cells),unit:card.unit});state.history=state.history.slice(-30);}
function edited(state,card,label){if(card.origin.kind==='resultado')remember(state,card,`Antes de ${label}`);card.origin={kind:'manual',source:label};card.version=state.nextRevision++;state.undo=null;}
export function createCard(input,options){
 const state=cleanState(input);if(state.cards.length>=40)fail('La hoja ya contiene 40 matrices. Elimine una tarjeta para crear otra.');const rows=dim(options.rows),columns=dim(options.columns),name=unique(state,options.name);
 const card={id:`m${state.nextId++}`,name,rows,columns,cells:options.cells===undefined?Array.from({length:rows},()=>Array(columns).fill('')):cellsOf(options.cells,rows,columns),unit:txt(options.unit??'',100,'Unidades'),version:state.nextRevision++,origin:cleanOrigin(options.origin??{kind:'manual',source:options.source??''})};
 if(card.origin.kind==='resultado')fail('Cree los resultados con Calcular, no con una tarjeta manual.');state.cards.push(card);state.undo=null;return state;
}
export const addCard=createCard;
export function updateCell(input,id,row,column,text){const state=cleanState(input),card=get(state,id);if(!Number.isInteger(row)||!Number.isInteger(column)||row<0||column<0||row>=card.rows||column>=card.columns)fail('Casilla fuera de rango.');text=txt(text,512,'Casilla');if(card.cells[row][column]===text)return state;edited(state,card,'editar una casilla');card.cells[row][column]=text;return state;}
export const editCell=updateCell;
export function renameCard(input,id,name){const state=cleanState(input),card=get(state,id);card.name=unique(state,name,id);state.undo=null;return state;}
export function setCardUnit(input,id,unit){const state=cleanState(input),card=get(state,id);unit=txt(unit,100,'Unidades');if(card.unit!==unit){card.unit=unit;card.version=state.nextRevision++;state.undo=null;}return state;}
export function resizePreview(input,id,rows,columns){const state=cleanState(input),card=get(state,id);dim(rows);dim(columns);const discarded=[];card.cells.forEach((r,i)=>r.forEach((text,j)=>{if((i>=rows||j>=columns)&&text.trim())discarded.push({row:i+1,column:j+1,text});}));return {id,version:card.version,rows,columns,cells:Array.from({length:rows},(_,i)=>Array.from({length:columns},(_,j)=>card.cells[i]?.[j]??'')),discarded,requiresConfirmation:discarded.length>0};}
export function resizeConfirmed(input,id,rows,columns,{confirmDiscard=false}={}){const state=cleanState(input),card=get(state,id),preview=resizePreview(state,id,rows,columns);if(preview.requiresConfirmation&&!confirmDiscard)fail('Confirme las casillas que se quitarán antes de reducir la matriz.');if(card.rows===rows&&card.columns===columns)return state;const before=clone(card);edited(state,card,'redimensionar');card.rows=rows;card.columns=columns;card.cells=preview.cells;state.undo={kind:'restore',label:'Deshacer cambio de tamaño',index:state.cards.indexOf(card),card:before};return state;}
export const resizeCard=resizeConfirmed;

export function staleReason(card,input){
 const state=input??{cards:[]},byId=new Map(state.cards.map(c=>[c.id,c]));
 function walk(c,seen){if(seen.has(c.id))return 'Hay un ciclo de dependencias.';if(c.origin?.kind!=='resultado')return '';const path=new Set(seen);path.add(c.id);for(const dep of c.origin.operands??[]){const current=byId.get(dep.id);if(!current)return `${dep.name} ya no está en la hoja.`;if(current.version!==dep.version)return `${current.name} cambió después del cálculo.`;const ancestor=walk(current,path);if(ancestor)return `${current.name} está desactualizada: ${ancestor}`;}return '';}
 return walk(card,new Set());
}
export function cardStatus(card,state){
 const values=[],errors=[];let empty=0;
 card.cells.forEach((row,r)=>{values[r]=[];row.forEach((text,c)=>{const value=Numeric.parseVal(text);values[r][c]=Number.isFinite(value)?value:null;if(value===null){empty++;errors.push({row:r+1,column:c+1,message:'Casilla vacía. No se convierte en cero.'});}else if(!Number.isFinite(value))errors.push({row:r+1,column:c+1,message:cellError(text)||'Expresión no válida.'});});});
 const complete=errors.length===0,reason=staleReason(card,state),stale=!!reason,status=stale?'stale':errors.length>empty?'invalid':empty?'incomplete':'ready';
 return {status,complete,canOperate:complete&&!stale,values,errors,stale,reason:reason||(errors[0]?.message??'')};
}
export function checkCompatibility(op,a,b,scalarText='1'){
 try{if(!operations.includes(op))fail('Seleccione una operación.');if(!a)fail('Seleccione la matriz A.');dim(a.rows);dim(a.columns);let rows=a.rows,columns=a.columns;
 if(!unary(op)&&!b)fail('Seleccione la matriz B.');
 if(['add','subtract'].includes(op)&&!(a.rows===b.rows&&a.columns===b.columns))fail('Suma y resta requieren las mismas filas y columnas.');
 if(op==='multiply'){if(a.columns!==b.rows)fail(`Columnas de A (${a.columns}) distintas de filas de B (${b.rows}).`);columns=b.columns;}
 if(op==='inverse'&&a.rows!==a.columns)fail('La inversa requiere una matriz cuadrada.');
 if(op==='transpose'){rows=a.columns;columns=a.rows;}
 if(op==='solve'){if(a.rows!==a.columns||a.rows!==b.rows)fail('Resolver A·X=B requiere A cuadrada y el mismo número de filas en A y B.');columns=b.columns;}
 if(op==='dot'){if((a.rows!==1&&a.columns!==1)||(b.rows!==1&&b.columns!==1)||a.rows*a.columns!==b.rows*b.columns)fail('El producto escalar requiere vectores con igual número de componentes.');rows=1;columns=1;}
 if(op==='scale'&&!Number.isFinite(Numeric.parseVal(scalarText)))fail(cellError(scalarText)||'Escriba un escalar válido.');
 return {ok:true,rows,columns,shape:[rows,columns],reason:''};}catch(error){return {ok:false,rows:null,columns:null,shape:null,reason:error.message};}
}
function valuesFor(card,state){const status=cardStatus(card,state);if(!status.canOperate)fail(`${card.name}: ${status.reason}`);return status.values;}
function calculateValues(state,request){
 const op=request.operation??request.op,a=get(state,request.aId),b=unary(op)?null:get(state,request.bId),compat=checkCompatibility(op,a,b,request.scalarText??'1');if(!compat.ok)fail(compat.reason);
 const av=valuesFor(a,state),bv=b?valuesFor(b,state):null;
 const values=op==='extract'?extractRange(av,request.rowSpec??'',request.columnSpec??''):operateSheet(av,op==='scale'?Numeric.parseVal(request.scalarText??'1'):bv,op);
 const origin={kind:'resultado',op,operands:[a,...(b?[b]:[])].map(c=>({id:c.id,name:c.name,version:c.version}))};
 for(const key of ['scalarText','rowSpec','columnSpec'])if(request[key]!==undefined)origin[key]=txt(request[key],key==='scalarText'?512:300,key);
 return {values,origin};
}
export function calculateCard(input,request){
 const state=cleanState(input);if(request.id||request.resultId||request.replaceResultId)fail('Calcular crea una tarjeta nueva. Use Recalcular para actualizar un resultado existente.');if(state.cards.length>=40)fail('La hoja ya contiene 40 matrices.');const name=unique(state,request.name),{values,origin}=calculateValues(state,request);
 const card={id:`m${state.nextId++}`,name,rows:values.length,columns:values[0].length,cells:values.map(row=>row.map(String)),unit:txt(request.unit??'',100,'Unidades'),version:state.nextRevision++,origin};state.cards.push(card);remember(state,card,`${name}: ${origin.op}`);state.undo=null;return state;
}
export const calculate=calculateCard;
export function recalculateCard(input,id){
 const state=cleanState(input),card=get(state,id);if(card.origin.kind!=='resultado')fail('La tarjeta no conserva una operación para recalcular.');const o=card.origin,request={operation:o.op,aId:o.operands[0].id,bId:o.operands[1]?.id,scalarText:o.scalarText,rowSpec:o.rowSpec,columnSpec:o.columnSpec};
 const {values,origin}=calculateValues(state,request);remember(state,card,`Antes de recalcular ${card.name}`);card.rows=values.length;card.columns=values[0].length;card.cells=values.map(row=>row.map(String));card.origin=origin;card.version=state.nextRevision++;state.undo=null;verifyGraph(state.cards);return state;
}
export const recalculate=recalculateCard;
function blockCells(text){
 txt(text,100000,'Bloque');
 // Preserve ambiguous comma lists before the shared parser might split spaces.
 const normalized=text.replace(/\r\n?/g,'\n'),lines=normalized.split('\n');if(lines.length>1&&lines.at(-1)==='')lines.pop();
 const delimited=/[\t;]/.test(normalized);
 if(delimited)return lines.map(line=>line.split(/[\t;]/).map(cell=>cell.trim()));
 return lines.map(line=>{if(Numeric.numericInputError?.(line))return [line.trim()];const grid=Numeric.parsePastedGrid(line);return grid?.[0]??[line.trim()];});
}
export function pastePreview(input,id,text,{row=0,column=0}={}){
 const state=cleanState(input),card=get(state,id);if(!Number.isInteger(row)||!Number.isInteger(column)||row<0||column<0||row>=card.rows||column>=card.columns)fail('El inicio del pegado debe estar dentro de la tarjeta.');
 const cells=blockCells(text),rows=cells.length,columns=Math.max(...cells.map(r=>r.length)),neededRows=Math.max(card.rows,row+rows),neededColumns=Math.max(card.columns,column+columns),errors=[];
 if(rows>36||columns>36||neededRows>36||neededColumns>36)fail('El bloque excede el límite de 36×36.');
 const rectangular=cells.every(r=>r.length===columns);if(!rectangular)errors.push({message:'Las filas tienen longitudes distintas; no se rellenan en silencio.'});
 cells.forEach((r,i)=>r.forEach((value,j)=>{if(value.length>512)errors.push({row:i+1,column:j+1,message:'Expresión demasiado larga.'});else if(value.trim()&&!Number.isFinite(Numeric.parseVal(value)))errors.push({row:i+1,column:j+1,message:cellError(value)||'Expresión no válida.'});}));
 return {id,version:card.version,text,row,column,cells,rows,columns,neededRows,neededColumns,fits:neededRows===card.rows&&neededColumns===card.columns,errors,canApply:rectangular&&cells.every(r=>r.every(c=>c.length<=512))};
}
export function applyPaste(input,id,preview,{resize=false}={}){
 const state=cleanState(input),card=get(state,id);if(preview?.id!==id||preview.version!==card.version)fail('La tarjeta cambió. Revise de nuevo el pegado.');const fresh=pastePreview(state,id,preview.text,{row:preview.row,column:preview.column});if(!fresh.canApply)fail('Corrija la forma del bloque antes de pegar.');if(!fresh.fits&&!resize)fail('Confirme el cambio de tamaño para pegar el bloque completo.');
 const before=clone(card),rows=resize?fresh.neededRows:card.rows,columns=resize?fresh.neededColumns:card.columns,cells=Array.from({length:rows},(_,i)=>Array.from({length:columns},(_,j)=>card.cells[i]?.[j]??''));fresh.cells.forEach((r,i)=>r.forEach((v,j)=>{cells[fresh.row+i][fresh.column+j]=v;}));
 edited(state,card,'pegar un bloque');card.cells=cells;card.rows=rows;card.columns=columns;card.origin={kind:'pegado',source:'Bloque pegado por el estudiante'};state.undo={kind:'restore',label:'Deshacer pegado',index:state.cards.indexOf(card),card:before};return state;
}
export function removeCard(input,id){const state=cleanState(input),index=state.cards.findIndex(c=>c.id===id);if(index<0)fail('La tarjeta ya no está disponible.');const card=state.cards[index];remember(state,card,`Eliminar ${card.name}`);state.cards.splice(index,1);state.undo={kind:'restore',label:'Deshacer eliminación',index,card:clone(card)};return state;}
export function undoLast(input){const state=cleanState(input);if(!state.undo)fail('No hay una acción para deshacer.');const {card,index}=state.undo;const at=state.cards.findIndex(c=>c.id===card.id);if(at<0&&state.cards.length>=40)fail('No hay espacio para restaurar la tarjeta.');unique(state,card.name,card.id);card.version=state.nextRevision++;if(at<0)state.cards.splice(Math.min(index,state.cards.length),0,card);else state.cards[at]=card;state.undo=null;verifyGraph(state.cards);return state;}
export const undo=undoLast;
export function serializeV2(input){const raw=JSON.stringify(cleanState(input));if(raw.length>V2_LIMITS.serialized)fail('La hoja supera 2,5 MB. Exporte un respaldo antes de continuar.');return raw;}
export function restoreV2(raw){if(raw===null||raw===undefined||raw==='')return createStateV2();txt(raw,2500000,'Hoja guardada');let parsed;try{parsed=JSON.parse(raw);}catch{fail('No se pudo leer la hoja V2 guardada. Conserve el respaldo.');}return cleanState(parsed);}
export const serialize=serializeV2;export const restore=restoreV2;
export function storageKeyV2(alias,type,variant){return storageKey(alias,type,variant).replace('rigidez:hoja:v1:','rigidez:hoja:v2:');}
export function migrateV1(raw){
 txt(raw,2500000,'Hoja anterior');let state=createStateV2();state.migration={raw,ui:{}};
 try{
  const payload=JSON.parse(raw);if(!payload||typeof payload.state!=='string')fail('El registro anterior no tiene el contenedor esperado.');
  const old=restoreSheetState(payload.state);if(payload.ui&&typeof payload.ui==='object'&&!Array.isArray(payload.ui))for(const key of ['selected','name','unit','text','a','b','operation','scalar','resultName','resultUnit','rangeRows','rangeColumns','rangeName','target','sourceField'])if(typeof payload.ui[key]==='string')state.migration.ui[key]=txt(payload.ui[key],key==='text'?120000:200,'Estado anterior');
  for(const item of old.matrices)state=createCard(state,{name:item.name,rows:item.values.length,columns:item.values[0].length,cells:item.values.map(row=>row.map(String)),unit:item.unit,origin:{kind:'migrado',source:item.source}});
  state.history=old.history.map(item=>({name:item.name,label:item.label,rows:item.values.length,columns:item.values[0].length,cells:item.values.map(row=>row.map(String)),unit:item.unit}));
  const draft=state.migration.ui.text;if(typeof draft==='string'&&draft.length){let cells;try{cells=blockCells(draft);}catch{}const rectangular=cells&&cells.length<=36&&cells[0]?.length<=36&&cells.every(row=>row.length===cells[0].length&&row.every(c=>c.length<=512));if(rectangular&&state.cards.length<40)state=createCard(state,{name:uniqueName(state,'Borrador'),rows:cells.length,columns:cells[0].length,cells,unit:state.migration.ui.unit??'',origin:{kind:'migrado',source:'Borrador del editor anterior; revise sus expresiones.'}});else state.recovery.push({name:'Borrador anterior',rawText:draft,unit:state.migration.ui.unit??'',reason:state.cards.length>=40?'La hoja tiene 40 tarjetas. Se conserva el borrador aparte.':'El borrador tiene filas desiguales o excede los límites. Se conserva el texto original.'});}
  return cleanState(state);
 }catch(error){const recovered=createStateV2();recovered.migration={raw,ui:{}};recovered.recovery=[{name:'Registro anterior sin migrar',rawText:raw,unit:'',reason:`No se migró el registro: ${error.message} El original se conserva íntegro.`}];return recovered;}
}
