/** Bounded validation of free-sheet backups. No DOM, storage or side effects. */
import {validatePayload,parseRange} from './free-sheet-core.mjs';
import {validateMatrix} from './matrix-workbench-core.mjs';
export const FREE_RECORD_MAX=2500000, FREE_BACKUP_MAX=10000000;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const safeKey=key=>typeof key==='string'&&key.length<=160&&!['__proto__','constructor','prototype'].includes(key);
export function normalizeFreeContext(context){
 if(!plain(context)||typeof context.type!=='string'||!context.type||context.type.length>80||!Number.isSafeInteger(context.variant)||context.variant<1)throw Error('El contexto del respaldo no es válido.');
 if(context.alias!==undefined&&typeof context.alias!=='string')throw Error('El alias del respaldo no es válido.');
 const alias=(String(context.alias??'').trim()||'EJEMPLO').toUpperCase();if(alias.length>64)throw Error('El alias del respaldo es demasiado largo.');
 return {alias,type:context.type,variant:context.variant};
}
export function validateFreeRecord(value){
 if(!plain(value)||value.version!==1||!Object.hasOwn(value,'payload'))throw Error('Formato de hoja no reconocido.');
 if(JSON.stringify(value).length>FREE_RECORD_MAX)throw Error('La hoja supera el límite de tamaño permitido.');
 const payload=value.payload===null?null:validatePayload(value.payload);
 if(typeof value.target!=='string'||!safeKey(value.target))throw Error('El destino guardado no es válido.');
 const imports={},sent={};
 for(const [name,source] of [['imports',value.imports],['sent',value.sent]]){
  if(!plain(source)||Object.keys(source).length>200)throw Error('El registro de transferencias no es válido.');
  for(const [key,item] of Object.entries(source)){
   if(!safeKey(key))throw Error('Identificador de transferencia no válido.');
   if(name==='imports'){if(typeof item!=='string')throw Error('Rango importado no válido.');imports[key]=parseRange(item).address;}
   else{if(!plain(item)||typeof item.range!=='string')throw Error('Copia enviada no válida.');const range=parseRange(item.range),values=validateMatrix(item.values,36);if(values.length!==range.rows||values[0].length!==range.cols)throw Error('La copia enviada no coincide con su rango.');sent[key]={range:range.address,values:values.map(row=>row.slice()),at:Number.isFinite(item.at)?item.at:0};}
  }
 }
 return {version:1,payload,target:value.target,imports,sent,width:Number.isFinite(value.width)?Math.max(320,Math.min(780,value.width)):460,tall:value.tall===true};
}
export function parseFreeBackup(text,expectedContext){
 if(typeof text!=='string'||text.length>FREE_BACKUP_MAX)throw Error('El respaldo debe ser un archivo JSON de hasta 10 MB.');
 let data;try{data=JSON.parse(text);}catch{throw Error('No se pudo leer el JSON del respaldo.');}
 if(!plain(data)||data.format!=='rigidez-hoja-libre-respaldo-1')throw Error('Este archivo no es un respaldo de la hoja libre.');
 const context=normalizeFreeContext(data.context),expected=normalizeFreeContext(expectedContext);
 if(context.alias!==expected.alias||context.type!==expected.type||context.variant!==expected.variant)throw Error(`El respaldo pertenece a ${context.alias} · ${context.type} · variante ${context.variant}. Abra ese contexto antes de restaurarlo.`);
 return {context,current:validateFreeRecord(data.current)};
}
export function sameFreeData(a,b){
 if(!plain(a)||!plain(b)||a.version!==1||b.version!==1)return false;
 const project=x=>({sheet:x.payload?.sheet??null,draft:x.payload?.draft??null,imports:x.imports??{},sent:x.sent??{}});
 return JSON.stringify(project(a))===JSON.stringify(project(b));
}
export function freeBackupName(context,date=new Date()){
 const c=normalizeFreeContext(context),clean=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,64)||'EJEMPLO';
 return `respaldo-rigidez-${clean(c.alias)}-${clean(c.type)}-v${c.variant}-${date.toISOString().slice(0,10)}.json`;
}
