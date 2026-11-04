import {createSheet,setCells,evaluateSheet,readRange,copyRange,moveFormula,parseAddress,formatAddress,parseRange} from './free-sheet-core.mjs';
import {parseVal,numericInputError} from './bank-validation.mjs';

const $=id=>document.getElementById(id), STORE='rigidez:hoja-prototipo:1', CW=104,RH=30,LEFT=48,TOP=28;
const grid=$('grid'),formula=$('formula'),editor=$('cell-editor');
let sheet=createSheet(), result, selection={r1:0,c1:0,r2:0,c2:0}, active={row:0,col:0}, endpoint={row:0,col:0}, edit=null, drag=null, raf=0;
let past=[],future=[],revision=0,internalClip=null,blockedStorage=false,rawBackup=null,saveNotice='',pendingConfirm=false;
let answers={dn:'',Fa:''}, sent={},checks={dn:'Sin revisar',Fa:'Sin revisar'};
const example={A1:'900',B1:'-900',C1:'0',D1:'0',A2:'-900',B2:'1450',C2:'-550',D2:'0',A3:'0',B3:'-550',C3:'1400',D3:'-850',A4:'0',B4:'0',C4:'-850',D4:'850',A6:'K (kN/m)',F1:'45',F2:'-15',F4:'Fn (kN)',A7:'Knn⁻¹ (m/kN)',D7:'δn (m)',F7:'Fa (kN)'};
const fieldName={dn:'δₙ',Fa:'Fₐ'};
const own=(a,k)=>Object.prototype.hasOwnProperty.call(a,k);
const address=()=>formatAddress(active.row,active.col);
const rangeText=s=>formatAddress(s.r1,s.c1)+(s.r1===s.r2&&s.c1===s.c2?'':':'+formatAddress(s.r2,s.c2));
const normalize=(a,b)=>({r1:Math.min(a.row,b.row),c1:Math.min(a.col,b.col),r2:Math.max(a.row,b.row),c2:Math.max(a.col,b.col)});
const inRange=(r,c,s=selection)=>r>=s.r1&&r<=s.r2&&c>=s.c1&&c<=s.c2;
const clone=x=>JSON.parse(JSON.stringify(x));
function tell(message,kind=''){const n=$('notice');n.textContent=message;n.className=kind;}
function checkedRange(text){const s=parseRange(text);if(s.r1<0||s.c1<0||s.r2>=sheet.rows||s.c2>=sheet.cols)throw Error('El rango está fuera del área de la hoja. Use «Ampliar área» si necesita más espacio.');return s;}
function outputText(value){if(value===null||value===undefined)return '';if(typeof value==='number'){if(Object.is(value,-0))return '0';return Number(value.toPrecision(7)).toString();}return String(value);}
function snapshot(){return clone(sheet);}
function save(){
 const payload={version:1,sheet,selection,active,answers,sent,checks,draft:edit?{address:edit.address,text:edit.text}:null};
 if(blockedStorage){$('save-state').textContent=saveNotice||'Registro anterior protegido; trabajo solo en memoria';return;}
 try{const text=JSON.stringify(payload);if(text.length>2500000)throw Error('size');localStorage.setItem(STORE,text);$('save-state').textContent='Guardado en este navegador · solo prototipo';}
 catch{$('save-state').textContent='No se pudo guardar: conserve esta pestaña y descargue un respaldo.';}
}
function restore(){
 let raw;try{raw=localStorage.getItem(STORE);}catch{saveNotice='Almacenamiento no disponible; trabajo solo en esta pestaña.';blockedStorage=true;return;}
 if(!raw)return;
 try{
  if(raw.length>2500000)throw Error('Registro demasiado grande');const p=JSON.parse(raw);if(p.version!==1||!p.sheet||typeof p.sheet.inputs!=='object')throw Error('Registro no reconocido');
  let next=createSheet({rows:p.sheet.rows,cols:p.sheet.cols});next=setCells(next,p.sheet.inputs,{protectSpills:false});sheet=next;
  if(p.active&&Number.isInteger(p.active.row)&&Number.isInteger(p.active.col)&&p.active.row>=0&&p.active.row<sheet.rows&&p.active.col>=0&&p.active.col<sheet.cols)active=p.active;
  selection={r1:active.row,c1:active.col,r2:active.row,c2:active.col};
  for(const key of ['dn','Fa'])if(typeof p.answers?.[key]==='string'&&p.answers[key].length<10000)answers[key]=p.answers[key];
  if(p.sent&&typeof p.sent==='object')for(const k of ['dn','Fa'])if(p.sent[k]&&typeof p.sent[k].range==='string'&&Array.isArray(p.sent[k].values))sent[k]=p.sent[k];
  if(p.draft&&typeof p.draft.text==='string'&&p.draft.text.length<=2048){const a=parseAddress(p.draft.address);if(a.row<sheet.rows&&a.col<sheet.cols&&a.row>=0&&a.col>=0)edit={address:p.draft.address,text:p.draft.text,original:sheet.inputs[p.draft.address]||'',bar:true};}
 }catch{rawBackup=raw;blockedStorage=true;saveNotice='El guardado del prototipo no se pudo leer. Se conserva sin cambios. Descargue un respaldo antes de reiniciar.';}
}
function recalc(){result=evaluateSheet(sheet);revision++;render();updateAnswers();save();}
function commitUpdates(updates,message='Entrada aplicada. Las fórmulas se recalculan automáticamente.'){
 const next=setCells(sheet,updates);past.push(snapshot());if(past.length>50)past.shift();future=[];sheet=next;edit=null;editor.hidden=true;recalc();const failed=Object.keys(updates).filter(a=>result.cells[a]?.error);if(failed.length)tell(`Entrada guardada con error en ${failed[0]}: ${result.cells[failed[0]].message}`,'error');else tell(message);return true;
}
function syncEditor(){if(!edit)return;formula.value=edit.text;editor.value=edit.text;const a=parseAddress(edit.address);editor.style.left=`${LEFT+a.col*CW}px`;editor.style.top=`${TOP+a.row*RH}px`;editor.style.width=`${Math.max(CW,Math.min(520,edit.text.length*8+24))}px`;editor.hidden=edit.bar;}
function beginEdit(text=null,bar=false){
 const a=address(),owner=result.owners?.[a];if(owner&&owner!==a){tell(`Esta celda pertenece al resultado de ${owner}. Edite su fórmula de origen.`,'error');return false;}
 edit={address:a,text:text===null?(sheet.inputs[a]||''):String(text),original:sheet.inputs[a]||'',bar};syncEditor();const input=bar?formula:editor;input.focus();input.setSelectionRange(input.value.length,input.value.length);save();return true;
}
function finishEdit(move=0){if(!edit)return true;try{const {address:a,text}=edit;commitUpdates({[a]:text});if(move)moveSelection(move,0,false);else grid.focus();return true;}catch(e){tell(e.message,'error');return false;}}
function cancelEdit(){edit=null;editor.hidden=true;formula.value=sheet.inputs[address()]||'';save();grid.focus();tell('Edición cancelada.');}
function focusCell(row,col,{extend=false,scroll=true}={}){
 row=Math.max(0,Math.min(sheet.rows-1,row));col=Math.max(0,Math.min(sheet.cols-1,col));
 endpoint={row,col};if(extend)selection=normalize(active,endpoint);else{active={row,col};selection={r1:row,c1:col,r2:row,c2:col};}
 if(scroll)ensureVisible(row,col);render();save();
}
function ensureVisible(row,col){const left=LEFT+col*CW,top=TOP+row*RH;if(left<grid.scrollLeft+LEFT)grid.scrollLeft=left-LEFT;else if(left+CW>grid.scrollLeft+grid.clientWidth)grid.scrollLeft=left+CW-grid.clientWidth;if(top<grid.scrollTop+TOP)grid.scrollTop=top-TOP;else if(top+RH>grid.scrollTop+grid.clientHeight)grid.scrollTop=top+RH-grid.clientHeight;}
function moveSelection(dr,dc,extend){const base=extend?endpoint:active;focusCell(base.row+dr,base.col+dc,{extend});grid.focus();}
function render(){
 if(!result)return;
 $('spacer').style.width=`${LEFT+sheet.cols*CW}px`;$('spacer').style.height=`${TOP+sheet.rows*RH}px`;
 grid.setAttribute('aria-rowcount',String(sheet.rows));grid.setAttribute('aria-colcount',String(sheet.cols));
 const c0=Math.max(0,Math.floor(grid.scrollLeft/CW)-1),c1=Math.min(sheet.cols-1,Math.ceil((grid.scrollLeft+grid.clientWidth)/CW)+1);
 const r0=Math.max(0,Math.floor(grid.scrollTop/RH)-1),r1=Math.min(sheet.rows-1,Math.ceil((grid.scrollTop+grid.clientHeight)/RH)+1);
 const fragment=document.createDocumentFragment();
 for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){
  const a=formatAddress(r,c),cell=result.cells[a],raw=sheet.inputs[a]||'',owner=result.owners?.[a],div=document.createElement('div');
  div.className='grid-cell'+(typeof cell?.value==='string'?' text':'')+(owner&&owner!==a?' spill':'')+(raw.startsWith('=')?' formula':'')+(cell?.error?' error':'')+(inRange(r,c)?' selected':'')+(r===active.row&&c===active.col?' active':'');
  div.id=`cell-${a}`;div.dataset.address=a;div.dataset.row=String(r);div.dataset.col=String(c);div.setAttribute('role','gridcell');div.setAttribute('aria-rowindex',String(r+1));div.setAttribute('aria-colindex',String(c+1));div.setAttribute('aria-selected',String(inRange(r,c)));div.setAttribute('aria-label',`${a}: ${cell?.message||outputText(cell?.value)||'vacía'}${raw.startsWith('=')?', fórmula '+raw:''}`);
  div.style.cssText=`left:${LEFT+c*CW}px;top:${TOP+r*RH}px;width:${CW}px;height:${RH}px`;
  div.textContent=cell?.error||outputText(cell?.value);div.title=cell?.message||(raw.startsWith('=')?raw:(owner&&owner!==a?`Resultado de ${owner}`:raw));fragment.append(div);
 }
 $('grid-cells').replaceChildren(fragment);
 const columnFrag=document.createDocumentFragment(),rowFrag=document.createDocumentFragment();
 for(let c=c0;c<=c1;c++){const d=document.createElement('div');d.className='column-head'+(c>=selection.c1&&c<=selection.c2?' selected':'');d.textContent=formatAddress(0,c).replace(/\d+$/,'');d.style.cssText=`left:${LEFT+c*CW}px;top:${grid.scrollTop}px;width:${CW}px;height:${TOP}px`;columnFrag.append(d);}
 for(let r=r0;r<=r1;r++){const d=document.createElement('div');d.className='row-head'+(r>=selection.r1&&r<=selection.r2?' selected':'');d.textContent=String(r+1);d.style.cssText=`left:${grid.scrollLeft}px;top:${TOP+r*RH}px;width:${LEFT}px;height:${RH}px`;rowFrag.append(d);}
 $('column-headers').replaceChildren(columnFrag);$('row-headers').replaceChildren(rowFrag);$('corner').style.transform=`translate(${grid.scrollLeft}px,${grid.scrollTop}px)`;
 $('selection').style.cssText=`left:${LEFT+selection.c1*CW}px;top:${TOP+selection.r1*RH}px;width:${(selection.c2-selection.c1+1)*CW}px;height:${(selection.r2-selection.r1+1)*RH}px`;
 const range=rangeText(selection);if(document.activeElement!==$('address'))$('address').value=range;
 $('selection-label').textContent=`${range} · ${selection.r2-selection.r1+1}×${selection.c2-selection.c1+1}`;$('sheet-size').textContent=`${sheet.rows} filas × ${sheet.cols} columnas`;
 const current=result.cells[address()],anchor=result.owners?.[address()];$('cell-detail').textContent=current?.message||(anchor&&anchor!==address()?`Resultado de ${anchor}; edite el ancla.`:sheet.inputs[address()]?.startsWith('=')?sheet.inputs[address()]:typeof current?.value==='number'?String(current.value):'Vacío ≠ 0');
 if(!edit)formula.value=sheet.inputs[address()]||'';else syncEditor();
 $('undo').disabled=!past.length;$('redo').disabled=!future.length;
 const numeric=(()=>{try{const m=readRange(result,range);return m.length===2&&m[0].length===1;}catch{return false;}})();
 for(const id of ['send-dn','send-Fa']){$(id).disabled=!numeric;$(id).title=numeric?'Enviar dos componentes, sin comprobar':'Seleccione un bloque numérico completo de 2×1';}
 grid.setAttribute('aria-activedescendant',`cell-${address()}`);
}
function queueRender(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;render();});}
function updateAnswers(){for(const key of ['dn','Fa']){const input=$(`answer-${key}`);if(document.activeElement!==input)input.value=answers[key];$(`status-${key}`).textContent=checks[key];let msg='';const record=sent[key];if(record){let same=false;try{same=JSON.stringify(readRange(result,record.range))===JSON.stringify(record.values);}catch{}msg=same?`Copia de ${record.range}. La respuesta no está vinculada a la hoja.`:`La hoja cambió desde el envío de ${record.range}. Su respuesta conserva la copia anterior.`;}$(`snapshot-${key}`).textContent=msg;}}
async function confirmAction(title,body,detail=''){
 if(pendingConfirm)return false;pendingConfirm=true;const dialog=$('confirmation');$('confirm-title').textContent=title;$('confirm-body').textContent=body;$('confirm-detail').textContent=detail;dialog.returnValue='';dialog.showModal();
 return new Promise(resolve=>dialog.addEventListener('close',()=>{pendingConfirm=false;resolve(dialog.returnValue==='ok');},{once:true}));
}
function selectedUpdates(value=''){const updates={};for(let r=selection.r1;r<=selection.r2;r++)for(let c=selection.c1;c<=selection.c2;c++)updates[formatAddress(r,c)]=value;return updates;}
function parsePaste(text){if(typeof text!=='string'||text.length>200000)throw Error('El bloque es demasiado grande.');let lines=text.replace(/\r\n?/g,'\n').split('\n');if(lines.length>1&&lines.at(-1)==='')lines.pop();const rows=lines.map(row=>row.split('\t'));const cols=Math.max(...rows.map(row=>row.length));if(rows.some(row=>row.length!==cols))throw Error('El bloque no es rectangular. Use tabuladores entre columnas y una línea por fila; conserve los vacíos.');if(rows.length>120||cols>120)throw Error('Pegue como máximo 120 filas y 120 columnas por bloque.');return rows;}
async function pasteBlock(text,clip=null){
 if(edit){tell('Termine o cancele la edición de la celda antes de pegar un bloque.','error');return;}
 try{
  const rows=parsePaste(text),anchor={...active};if(anchor.row+rows.length>sheet.rows||anchor.col+rows[0].length>sheet.cols)throw Error('El bloque supera el área disponible. Amplíe el área antes de pegar.');
  const updates={};for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++){let value=rows[r][c];if(clip&&value.startsWith('='))value=moveFormula(value,anchor.row-clip.r1,anchor.col-clip.c1);updates[formatAddress(anchor.row+r,anchor.col+c)]=value;}
  // Validate protected spills before asking to overwrite anything.
  setCells(sheet,updates);
  const existing=Object.keys(updates).filter(a=>own(sheet.inputs,a)&&sheet.inputs[a]!==''&&sheet.inputs[a]!==updates[a]);const before=revision;
  if(existing.length&&!await confirmAction('Reemplazar el rango','El pegado reemplazará estas entradas. Puede deshacerlo.',existing.slice(0,20).map(a=>`${a}: ${sheet.inputs[a]} → ${updates[a]}`).join('\n')+(existing.length>20?`\n… y ${existing.length-20} más`:'')))return;
  if(revision!==before)throw Error('La hoja cambió durante la confirmación. Vuelva a pegar el bloque.');
  commitUpdates(updates,`Bloque pegado: ${rows.length}×${rows[0].length}. Los vacíos se conservan.`);active=anchor;selection={r1:anchor.row,c1:anchor.col,r2:anchor.row+rows.length-1,c2:anchor.col+rows[0].length-1};render();save();grid.focus();
 }catch(e){tell(e.message,'error');}
}
function prepareCopy(mode='values'){
 const range=rangeText(selection),text=copyRange(sheet,result,range,mode)+'\n';internalClip={text,mode,r1:selection.r1,c1:selection.c1};return text;
}
async function copyToClipboard(mode){try{if(edit&&!finishEdit())return;const text=prepareCopy(mode);await navigator.clipboard.writeText(text);tell(`${mode==='values'?'Valores con precisión completa':'Entradas y fórmulas'} de ${rangeText(selection)} copiados. Pegue en otra celda o en Excel.`);}catch(e){tell(`No se pudo copiar: ${e.message}. Use Ctrl+C sobre la selección.`,'error');}}
function selectSpill(){const a=result.owners?.[address()]||address(),matrix=result.arrays[a];if(!matrix){tell('La celda seleccionada no tiene un resultado matricial válido.','error');return;}const p=parseAddress(a);active=p;selection={r1:p.row,c1:p.col,r2:p.row+matrix.length-1,c2:p.col+matrix[0].length-1};render();save();grid.focus();}
async function send(key){
 try{
  if(edit&&!finishEdit())return;const range=rangeText(selection),values=readRange(result,range);if(values.length!==2||values[0].length!==1)throw Error(`${fieldName[key]} requiere 2×1. Seleccione exactamente dos filas y una columna con valores numéricos.`);
  const text=values.map(row=>String(row[0])).join('\n'),before=revision,oldAnswer=answers[key],valueKey=JSON.stringify(values);
  if(oldAnswer.trim()&&!await confirmAction(`Reemplazar ${fieldName[key]}`,`Se copiarán los valores de ${range}. La respuesta quedará sin revisar.`,`Actual:\n${oldAnswer}\n\nNueva:\n${text}`))return;
  if(before!==revision||oldAnswer!==answers[key]||JSON.stringify(readRange(result,range))!==valueKey)throw Error('La hoja o la respuesta cambió. Seleccione y envíe de nuevo.');
  answers[key]=text;checks[key]='Sin revisar';sent[key]={range,values:clone(values)};updateAnswers();save();setTab('exercise');const input=$(`answer-${key}`);input.scrollIntoView({block:'center'});input.focus();tell(`${fieldName[key]} recibió una copia de ${range}. Sin revisar: pulse Comprobar si desea verificarla.`,'success');
 }catch(e){tell(e.message,'error');}
}
function checkAnswer(key){
 const raw=answers[key],ambiguity=numericInputError(raw);if(ambiguity){checks[key]=ambiguity;updateAnswers();return;}
 const rows=raw.replace(/\r\n?/g,'\n').trim().split('\n').map(row=>row.split('\t'));if(rows.length!==2||rows.some(row=>row.length!==1)){checks[key]='Use un bloque de 2 filas y 1 columna.';updateAnswers();return;}
 const values=rows.map(row=>parseVal(row[0])),expected=key==='dn'?[219/6910,6/3455]:[-900*219/6910,-850*6/3455];
 if(values.some(n=>n===null||!Number.isFinite(n)))checks[key]='Complete las dos componentes con números válidos.';
 else{const wrong=values.map((v,i)=>Math.abs(v-expected[i])>Math.max(key==='dn'?1e-10:1e-7,Math.abs(expected[i])*5e-5)?i+1:null).filter(Boolean);checks[key]=wrong.length?`Revise la componente ${wrong.join(' y ')}; compruebe orden, signos y operación.`:'Correcto para los datos originales del ejemplo.';}
 updateAnswers();save();
}
function downloadBackup(){const data=rawBackup!==null?rawBackup:JSON.stringify({version:1,sheet,answers,sent,draft:edit,selection,active},null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='respaldo-hoja-prototipo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);tell(rawBackup!==null?'Se descargó el registro original sin modificar.':'Se descargó el respaldo completo de entradas, fórmulas y respuestas.');}
async function loadExample(){
 if(edit&&!finishEdit())return;const has=Object.values(sheet.inputs).some(Boolean),before=revision;
 if(has&&!await confirmAction('Cargar los datos del ejemplo','Se reemplazará solo la hoja de este prototipo. Puede deshacerlo. Las respuestas no se borran.'))return;if(before!==revision)return;
 past.push(snapshot());if(past.length>50)past.shift();future=[];sheet=setCells(createSheet({rows:sheet.rows,cols:sheet.cols}),example);active={row:7,col:0};endpoint={...active};selection={r1:7,c1:0,r2:7,c2:0};recalc();ensureVisible(7,0);setTab('sheet');grid.focus();tell('K está en A1:D4 y Fₙ en F1:F2. En A8 escriba =MINVERSA(B2:C3). No se han calculado resultados.');
}
function undo(redo=false){if(edit){cancelEdit();return;}const from=redo?future:past,to=redo?past:future;if(!from.length)return;to.push(snapshot());sheet=from.pop();active={row:Math.min(active.row,sheet.rows-1),col:Math.min(active.col,sheet.cols-1)};selection={r1:active.row,c1:active.col,r2:active.row,c2:active.col};recalc();tell(redo?'Cambio rehecho.':'Cambio deshecho. Las respuestas enviadas no cambian.');grid.focus();}
function setTab(tab){document.querySelector('.workspace').dataset.tab=tab;document.querySelectorAll('[data-tab]').forEach(el=>{if(el.tagName==='BUTTON')el.setAttribute('aria-pressed',String(el.dataset.tab===tab));});queueRender();}
function pointerCell(event){const rect=grid.getBoundingClientRect(),col=Math.floor((event.clientX-rect.left+grid.scrollLeft-LEFT)/CW),row=Math.floor((event.clientY-rect.top+grid.scrollTop-TOP)/RH);if(row<0||col<0||row>=sheet.rows||col>=sheet.cols)return null;return {row,col};}
function addReference(p){const s=normalize(drag.start,p),ref=rangeText(s);edit.text=drag.base.slice(0,drag.from)+ref+drag.base.slice(drag.to);syncEditor();const input=edit.bar?formula:editor;input.setSelectionRange(drag.from+ref.length,drag.from+ref.length);selection=s;render();tell(`Referencia ${ref} · ${s.r2-s.r1+1}×${s.c2-s.c1+1}. Complete la fórmula y pulse Enter.`);}
// Pointer selection also inserts references while a formula is being edited.
grid.addEventListener('pointerdown',e=>{
 if(e.button!==0||e.target===editor)return;const p=pointerCell(e);if(!p)return;
 if(edit?.text.startsWith('=')){
  e.preventDefault();const input=edit.bar?formula:editor;drag={start:p,reference:true,base:edit.text,from:input.selectionStart??edit.text.length,to:input.selectionEnd??edit.text.length};addReference(p);grid.setPointerCapture(e.pointerId);return;
 }
 if(edit&&!finishEdit())return;e.preventDefault();active=e.shiftKey?active:p;endpoint=p;selection=normalize(active,p);drag={start:active,reference:false};grid.setPointerCapture(e.pointerId);render();grid.focus();
});
grid.addEventListener('pointermove',e=>{if(!drag)return;const p=pointerCell(e);if(!p)return;if(drag.reference)addReference(p);else{endpoint=p;selection=normalize(drag.start,p);render();}});
grid.addEventListener('pointerup',()=>{if(!drag)return;const ref=drag.reference;drag=null;if(ref){const input=edit.bar?formula:editor;input.focus();}else save();});
grid.addEventListener('dblclick',e=>{if(e.target!==editor&&!edit)beginEdit();});
grid.addEventListener('scroll',queueRender,{passive:true});
new ResizeObserver(queueRender).observe(grid);
for(const input of [formula,editor]){
 input.addEventListener('input',()=>{if(!edit)edit={address:address(),original:sheet.inputs[address()]||'',text:input.value,bar:input===formula};else edit.text=input.value;const other=input===formula?editor:formula;other.value=edit.text;save();});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!edit)beginEdit(input.value,input===formula);finishEdit(e.shiftKey?-1:1);}else if(e.key==='Escape'){e.preventDefault();cancelEdit();}else if(e.key==='Tab'){e.preventDefault();if(finishEdit())moveSelection(0,e.shiftKey?-1:1,false);}});
}
formula.addEventListener('focus',()=>{if(!edit){const a=address(),owner=result.owners?.[a];if(owner&&owner!==a){formula.blur();tell(`Resultado de ${owner}: seleccione el ancla para editar la fórmula.`,'error');return;}edit={address:a,text:formula.value,original:sheet.inputs[a]||'',bar:true};save();}});
$('commit').addEventListener('click',()=>finishEdit());
$('address').addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();try{if(edit&&!finishEdit())return;selection=checkedRange(e.target.value.trim().toUpperCase());active={row:selection.r1,col:selection.c1};endpoint={row:selection.r2,col:selection.c2};ensureVisible(active.row,active.col);render();save();grid.focus();}catch(err){tell(err.message,'error');}});
grid.addEventListener('keydown',e=>{
 if(e.target===editor||edit)return;const mod=e.ctrlKey||e.metaKey;
 if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true);return;}
 if(mod&&['c','v','a'].includes(e.key.toLowerCase()))return;
 const movements={ArrowDown:[1,0],ArrowUp:[-1,0],ArrowRight:[0,1],ArrowLeft:[0,-1],Enter:[e.shiftKey?-1:1,0],Tab:[0,e.shiftKey?-1:1]};
 if(movements[e.key]){e.preventDefault();const [r,c]=movements[e.key];moveSelection(r,c,e.shiftKey&&e.key.startsWith('Arrow'));return;}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();try{commitUpdates(selectedUpdates(''),'Selección vaciada. Puede deshacerlo.');}catch(err){tell(err.message,'error');}return;}
 if(e.key==='F2'){e.preventDefault();beginEdit();return;}
 if(!mod&&!e.altKey&&e.key.length===1){e.preventDefault();beginEdit(e.key);}
});
grid.addEventListener('copy',e=>{if(edit)return;try{const mode=e.shiftKey?'formulas':'values',text=prepareCopy(mode);e.clipboardData.setData('text/plain',text);e.clipboardData.setData('application/x-rigidez-sheet',JSON.stringify(internalClip));e.preventDefault();tell(`${rangeText(selection)} copiado: ${mode==='values'?'valores':'fórmulas'}.`);}catch(err){e.preventDefault();tell(err.message,'error');}});
grid.addEventListener('paste',e=>{if(edit)return;e.preventDefault();let clip=null;const text=e.clipboardData.getData('text/plain');try{const p=JSON.parse(e.clipboardData.getData('application/x-rigidez-sheet')||'null');if(p&&p.mode==='formulas'&&p.text===text&&Number.isInteger(p.r1)&&Number.isInteger(p.c1))clip=p;}catch{}if(!clip&&internalClip?.mode==='formulas'&&internalClip.text===text)clip=internalClip;pasteBlock(text,clip);});
$('copy-values').onclick=()=>copyToClipboard('values');$('copy-formulas').onclick=()=>copyToClipboard('formulas');$('select-spill').onclick=()=>{if(edit&&!finishEdit())return;selectSpill();};$('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);$('load-example').onclick=loadExample;$('export').onclick=downloadBackup;
$('toggle-help').onclick=()=>{$('help').hidden=!$('help').hidden;$('toggle-help').setAttribute('aria-expanded',String(!$('help').hidden));};
for(const key of ['dn','Fa']){
 $(`send-${key}`).onclick=()=>send(key);document.querySelector(`[data-send="${key}"]`).onclick=()=>send(key);document.querySelector(`[data-check="${key}"]`).onclick=()=>checkAnswer(key);
 $(`answer-${key}`).addEventListener('input',e=>{answers[key]=e.target.value;checks[key]='Sin revisar';delete sent[key];updateAnswers();save();});
}
$('extend').onclick=()=>{if(edit&&!finishEdit())return;const rows=Math.min(240,sheet.rows+60),cols=Math.min(120,sheet.cols+20);if(rows===sheet.rows&&cols===sheet.cols){tell('Área máxima: 240 filas × 120 columnas. Cada operación admite hasta 36×36.');return;}past.push(snapshot());future=[];sheet={...sheet,rows,cols};recalc();tell(`Área ampliada a ${rows}×${cols}, sin mover ni modificar sus celdas.`);};
$('blank').onclick=async()=>{const before=revision;if(!await confirmAction('Vaciar solo este prototipo','Se vaciarán la hoja y las dos respuestas de esta página. El banco V7 y sus guardados no se modifican. Descargue un respaldo si lo necesita.'))return;if(revision!==before)return;if(blockedStorage&&rawBackup!==null){downloadBackup();rawBackup=null;blockedStorage=false;saveNotice='';}past.push(snapshot());future=[];sheet=createSheet();answers={dn:'',Fa:''};sent={};checks={dn:'Sin revisar',Fa:'Sin revisar'};edit=null;active={row:0,col:0};selection={r1:0,c1:0,r2:0,c2:0};grid.scrollTo(0,0);recalc();tell('Hoja del prototipo vacía. Las hojas del banco permanecen intactas.');};
document.querySelectorAll('button[data-tab]').forEach(button=>button.onclick=()=>setTab(button.dataset.tab));
document.addEventListener('click',e=>{const more=document.querySelector('.more');if(!more.contains(e.target)||e.target.closest('button'))more.open=false;});
window.addEventListener('beforeunload',save);window.addEventListener('storage',e=>{if(e.key===STORE){blockedStorage=true;saveNotice='Otra pestaña cambió este prototipo. Se conserva su sesión sin sobrescribir: descargue un respaldo antes de recargar.';$('save-state').textContent=saveNotice;tell(saveNotice,'error');}});
restore();result=evaluateSheet(sheet);for(const key of ['dn','Fa'])$(`answer-${key}`).value=answers[key];render();updateAnswers();if(edit){syncEditor();tell(`Borrador recuperado en ${edit.address}. Aplique con Enter o cancele con Esc.`);}else if(saveNotice)tell(saveNotice,'error');save();
