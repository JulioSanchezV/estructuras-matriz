/** Embeddable free grid. No exercise answers or persistence: the host owns both. */
import {createSheet,setCells,evaluateSheet,readRange,copyRange,moveFormula,parseAddress,formatAddress,parseRange,resizeSheet,validatePayload} from './free-sheet-core.mjs';
const $=id=>document.getElementById(id),CW=96,RH=29,LEFT=40,TOP=27;
const grid=$('grid'),formula=$('formula'),editor=$('cell-editor');
const moreTools=$('more-tools'),moreToggle=$('more-tools-toggle'),help=$('help');
let sheet=createSheet(),result,selection={r1:0,c1:0,r2:0,c2:0},active={row:0,col:0},endpoint={row:0,col:0},edit=null,drag=null,raf=0;
let past=[],future=[],revision=0,epoch=0,internalClip=null,pendingConfirm=null,locked=false,readOnlyReason='';
const own=(a,k)=>Object.prototype.hasOwnProperty.call(a,k),clone=x=>JSON.parse(JSON.stringify(x));
const address=()=>formatAddress(active.row,active.col);
const rangeText=s=>formatAddress(s.r1,s.c1)+(s.r1===s.r2&&s.c1===s.c2?'':':'+formatAddress(s.r2,s.c2));
const normalize=(a,b)=>({r1:Math.min(a.row,b.row),c1:Math.min(a.col,b.col),r2:Math.max(a.row,b.row),c2:Math.max(a.col,b.col)});
const inRange=(r,c,s=selection)=>r>=s.r1&&r<=s.r2&&c>=s.c1&&c<=s.c2;
const blockedReason=()=>locked?'No se pudo cargar esta hoja. Recupere el registro desde el banco.':readOnlyReason;
const editing=()=>!!edit&&!blockedReason();
function tell(message,kind=''){const n=$('notice'),reason=blockedReason();n.textContent=reason?'Solo lectura: '+reason:String(message);n.title=n.textContent;n.className=reason?'error':kind;n.setAttribute('role',reason?'alert':'status');n.setAttribute('aria-live',reason?'assertive':'polite');}
function requireReadable(){if(locked)throw Error('No se pudo cargar esta hoja. El registro anterior debe recuperarse desde el banco antes de editar.');}
function requireEditable(){const reason=blockedReason();if(reason)throw Error('Solo lectura: '+reason);}
function setReadOnly(reason=''){const next=String(reason??'').trim();if(next===readOnlyReason)return !!blockedReason();const editorFocused=document.activeElement===editor;readOnlyReason=next;cancelPending();render();if(editorFocused&&blockedReason())grid.focus();tell(readOnlyReason?'':'Edición disponible. Los resultados se recalculan automáticamente.');return !!blockedReason();}
function exitGrid(){window.dispatchEvent(new CustomEvent('rigidez-grid-exit',{detail:{reason:'escape',selection:getSelection()}}));}
function checkedRange(text){const s=parseRange(text);if(s.r2>=sheet.rows||s.c2>=sheet.cols)throw Error('El rango está fuera del área. Use Ampliar área.');return s;}
function outputText(value){if(value===null||value===undefined)return '';if(typeof value==='number')return Object.is(value,-0)?'0':Number(value.toPrecision(7)).toString();return String(value);}
function getPayload(){return clone({sheet,active,selection,draft:edit?{address:edit.address,text:edit.text}:null});}
function getSelection(){return {...selection,range:rangeText(selection),rows:selection.r2-selection.r1+1,columns:selection.c2-selection.c1+1};}
function save(){if(blockedReason())return;window.dispatchEvent(new CustomEvent('rigidez-grid-change',{detail:{payload:getPayload(),selection:getSelection(),revision}}));}
function snapshot(){return clone(sheet);}
function recalc(){result=evaluateSheet(sheet);revision++;render();save();}
function commitUpdates(updates,message='Entrada aplicada. Las fórmulas se recalculan automáticamente.'){
 requireEditable();const next=setCells(sheet,updates);past.push(snapshot());if(past.length>50)past.shift();future=[];sheet=next;edit=null;editor.hidden=true;recalc();const failed=Object.keys(updates).filter(a=>result.cells[a]?.error);if(failed.length)tell(`Entrada guardada con error en ${failed[0]}: ${result.cells[failed[0]].message}`,'error');else tell(message);return true;
}
function cancelPending(){epoch++;drag=null;closeMore();closeHelp();const pending=pendingConfirm;pendingConfirm=null;if(pending){pending.resolve(false);if($('confirmation').open)$('confirmation').close('cancel');}}
function resetView(next=createSheet()){sheet=next;result=evaluateSheet(sheet);active={row:0,col:0};endpoint={...active};selection={r1:0,c1:0,r2:0,c2:0};edit=null;editor.hidden=true;past=[];future=[];internalClip=null;revision++;grid.scrollTo(0,0);}
function load(payload=null){
 cancelPending();try{
  const validated=validatePayload(payload),next=validated.sheet,point=validated.active,sel=validated.selection;
  const draft=validated.draft?{...validated.draft,original:next.inputs[validated.draft.address]||'',bar:true}:null;
  resetView(next);locked=false;active={row:point.row,col:point.col};selection={r1:sel.r1,c1:sel.c1,r2:sel.r2,c2:sel.c2};endpoint={row:sel.r2,col:sel.c2};edit=draft;render();ensureVisible(active.row,active.col);if(edit){syncEditor();tell(`Borrador recuperado en ${edit.address}. Enter aplica; Esc cancela.`);}else tell('Seleccione una celda y escriba. Los resultados se recalculan automáticamente.');return getPayload();
 }catch(e){resetView();locked=true;render();tell(e.message+' No se mostrará trabajo de otro contexto.','error');throw e;}
}
async function confirmAction(title,body,detail=''){
 if(pendingConfirm)return false;const dialog=$('confirmation');$('confirm-title').textContent=title;$('confirm-body').textContent=body;$('confirm-detail').textContent=detail;dialog.returnValue='';dialog.showModal();
 return new Promise(resolve=>{const current={resolve};pendingConfirm=current;dialog.addEventListener('close',()=>{if(pendingConfirm!==current)return;pendingConfirm=null;resolve(dialog.returnValue==='ok');},{once:true});});
}
function syncEditor(){if(!edit)return;if(blockedReason()){formula.value=sheet.inputs[address()]||'';editor.hidden=true;return;}formula.value=edit.text;editor.value=edit.text;const a=parseAddress(edit.address);editor.style.left=`${LEFT+a.col*CW}px`;editor.style.top=`${TOP+a.row*RH}px`;editor.style.width=`${Math.max(CW,Math.min(520,edit.text.length*8+24))}px`;editor.hidden=edit.bar;}
function beginEdit(text=null,bar=false){
 if(blockedReason()){tell('','error');return false;}
 const a=address(),owner=result.owners?.[a];if(owner&&owner!==a){tell(`Esta celda pertenece al resultado de ${owner}. Edite su fórmula de origen.`,'error');return false;}
 edit={address:a,text:text===null?(sheet.inputs[a]||''):String(text),original:sheet.inputs[a]||'',bar};syncEditor();const input=bar?formula:editor;input.focus();input.setSelectionRange(input.value.length,input.value.length);save();return true;
}
function finishEdit(move=0){if(blockedReason()){tell('','error');return false;}if(!edit)return true;try{const {address:a,text}=edit;commitUpdates({[a]:text});if(move)moveSelection(move,0,false);else grid.focus();return true;}catch(e){tell(e.message,'error');return false;}}
function cancelEdit(){if(blockedReason()){tell('','error');return;}edit=null;editor.hidden=true;formula.value=sheet.inputs[address()]||'';save();grid.focus();tell('Edición cancelada.');}
function focusCell(row,col,{extend=false,scroll=true}={}){
 row=Math.max(0,Math.min(sheet.rows-1,row));col=Math.max(0,Math.min(sheet.cols-1,col));
 endpoint={row,col};if(extend)selection=normalize(active,endpoint);else{active={row,col};selection={r1:row,c1:col,r2:row,c2:col};}
 if(scroll)ensureVisible(row,col);render();save();
}
function ensureVisible(row,col){const left=LEFT+col*CW,top=TOP+row*RH;if(left<grid.scrollLeft+LEFT)grid.scrollLeft=left-LEFT;else if(left+CW>grid.scrollLeft+grid.clientWidth)grid.scrollLeft=left+CW-grid.clientWidth;if(top<grid.scrollTop+TOP)grid.scrollTop=top-TOP;else if(top+RH>grid.scrollTop+grid.clientHeight)grid.scrollTop=top+RH-grid.clientHeight;}
function ensureSelection(){const rows=Math.max(1,Math.floor((grid.clientHeight-TOP)/RH)),cols=Math.max(1,Math.floor((grid.clientWidth-LEFT)/CW));ensureVisible(selection.r2-selection.r1+1<=rows?selection.r2:selection.r1,selection.c2-selection.c1+1<=cols?selection.c2:selection.c1);}
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
 const readOnly=!!blockedReason();$('undo').disabled=readOnly||!past.length;$('redo').disabled=readOnly||!future.length;$('extend').disabled=readOnly;$('commit').disabled=readOnly;formula.readOnly=readOnly;editor.readOnly=readOnly;grid.setAttribute('aria-readonly',String(readOnly));
 grid.setAttribute('aria-activedescendant',`cell-${address()}`);
}
function queueRender(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;render();});}
function selectedUpdates(value=''){const updates={};for(let r=selection.r1;r<=selection.r2;r++)for(let c=selection.c1;c<=selection.c2;c++)updates[formatAddress(r,c)]=value;return updates;}
function parsePaste(text){if(typeof text!=='string'||text.length>200000)throw Error('El bloque es demasiado grande.');let lines=text.replace(/\r\n?/g,'\n').split('\n');if(lines.length>1&&lines.at(-1)==='')lines.pop();const rows=lines.map(row=>row.split('\t'));const cols=Math.max(...rows.map(row=>row.length));if(rows.some(row=>row.length!==cols))throw Error('El bloque no es rectangular. Use tabuladores entre columnas y una línea por fila; conserve los vacíos.');if(rows.length>36||cols>36)throw Error('Pegue como máximo 36 filas y 36 columnas por bloque.');return rows;}
function validateBlock(cells){if(!Array.isArray(cells)||!cells.length||cells.length>36||!Array.isArray(cells[0])||!cells[0].length||cells[0].length>36)throw Error('Use un bloque de 1 a 36 filas y columnas.');const cols=cells[0].length;if(cells.some(row=>!Array.isArray(row)||row.length!==cols))throw Error('El bloque debe ser rectangular; preserve las celdas vacías.');return cells.map(row=>row.map(v=>{if(v===null||v===undefined)return '';if(typeof v!=='string'&&typeof v!=='number')throw Error('Cada celda debe ser texto o un número.');if(typeof v==='number'&&!Number.isFinite(v))throw Error('El bloque contiene un número no finito.');const text=String(v);if(text.length>2048)throw Error('Una celda excede 2048 caracteres.');return text;}));}
async function importBlock(cells,{label='',confirmOverwrite=true,clip=null}={}){
 requireEditable();if(edit&&!finishEdit())throw Error('Termine o cancele la edición antes de importar el bloque.');requireEditable();
 const rows=validateBlock(cells),anchor={...active},ownEpoch=epoch;if(anchor.row+rows.length>sheet.rows||anchor.col+rows[0].length>sheet.cols)throw Error('El bloque supera el área disponible. Amplíe el área antes de pegar.');
 const updates={};for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++){let value=rows[r][c];if(clip&&value.startsWith('='))value=moveFormula(value,anchor.row-clip.r1,anchor.col-clip.c1);updates[formatAddress(anchor.row+r,anchor.col+c)]=value;}
 setCells(sheet,updates); // Validates protected spill children before confirmation.
 const existing=Object.keys(updates).filter(a=>own(sheet.inputs,a)&&sheet.inputs[a]!==''&&sheet.inputs[a]!==updates[a]);const before=revision;
 if(existing.length){if(!confirmOverwrite)throw Error('El bloque reemplazaría entradas existentes; se requiere confirmación.');if(!await confirmAction('Reemplazar '+rangeText({r1:anchor.row,c1:anchor.col,r2:anchor.row+rows.length-1,c2:anchor.col+rows[0].length-1}),'Se reemplazarán estas entradas. Puede deshacerlo.',existing.slice(0,20).map(a=>`${a}: ${sheet.inputs[a]} → ${updates[a]}`).join('\n')+(existing.length>20?`\n… y ${existing.length-20} más`:'')))return null;}
 if(ownEpoch!==epoch||before!==revision)return null;
 commitUpdates(updates,`${label?label+': ':''}bloque ${rows.length}×${rows[0].length} incorporado. Los vacíos se conservan.`);active=anchor;selection={r1:anchor.row,c1:anchor.col,r2:anchor.row+rows.length-1,c2:anchor.col+rows[0].length-1};endpoint={row:selection.r2,col:selection.c2};render();save();grid.focus();return {range:rangeText(selection),rows:rows.length,columns:rows[0].length};
}
async function pasteBlock(text,clip=null){try{return await importBlock(parsePaste(text),{clip});}catch(e){tell(e.message,'error');return null;}}
function prepareCopy(mode='values'){
 const range=rangeText(selection),text=copyRange(sheet,result,range,mode)+'\n';internalClip={text,mode,r1:selection.r1,c1:selection.c1};return text;
}
async function copyToClipboard(mode){try{if(editing()&&!finishEdit())return;const text=prepareCopy(mode);await navigator.clipboard.writeText(text);tell(`${mode==='values'?'Valores con precisión completa':'Entradas y fórmulas'} de ${rangeText(selection)} copiados. Pegue en otra celda o en Excel.`);}catch(e){tell(`No se pudo copiar: ${e.message}. Use Ctrl+C sobre la selección.`,'error');}}
function selectSpill(){const a=result.owners?.[address()]||address(),matrix=result.arrays[a];if(!matrix){tell('La celda seleccionada no tiene un resultado matricial válido.','error');return;}const p=parseAddress(a);active=p;selection={r1:p.row,c1:p.col,r2:p.row+matrix.length-1,c2:p.col+matrix[0].length-1};endpoint={row:selection.r2,col:selection.c2};ensureSelection();render();save();grid.focus();}
function undo(redo=false){if(blockedReason()){tell('','error');return;}if(edit){cancelEdit();return;}const from=redo?future:past,to=redo?past:future;if(!from.length)return;to.push(snapshot());sheet=from.pop();active={row:Math.min(active.row,sheet.rows-1),col:Math.min(active.col,sheet.cols-1)};selection={r1:active.row,c1:active.col,r2:active.row,c2:active.col};recalc();tell(redo?'Cambio rehecho.':'Cambio deshecho. Las respuestas enviadas no cambian.');grid.focus();}
function pointerCell(event){const rect=grid.getBoundingClientRect(),col=Math.floor((event.clientX-rect.left+grid.scrollLeft-LEFT)/CW),row=Math.floor((event.clientY-rect.top+grid.scrollTop-TOP)/RH);if(row<0||col<0||row>=sheet.rows||col>=sheet.cols)return null;return {row,col};}
function addReference(p){if(!editing())return;const s=normalize(drag.start,p),ref=rangeText(s);edit.text=drag.base.slice(0,drag.from)+ref+drag.base.slice(drag.to);syncEditor();const input=edit.bar?formula:editor;input.setSelectionRange(drag.from+ref.length,drag.from+ref.length);selection=s;render();save();tell(`Referencia ${ref} · ${s.r2-s.r1+1}×${s.c2-s.c1+1}. Complete la fórmula y pulse Enter.`);}
// Pointer selection also inserts references while a formula is being edited.
grid.addEventListener('pointerdown',e=>{
 if(e.button!==0||e.target===editor)return;const p=pointerCell(e);if(!p)return;
 if(editing()&&edit.text.startsWith('=')){
  e.preventDefault();const input=edit.bar?formula:editor;drag={start:p,reference:true,base:edit.text,from:input.selectionStart??edit.text.length,to:input.selectionEnd??edit.text.length};addReference(p);grid.setPointerCapture(e.pointerId);return;
 }
 if(editing()&&!finishEdit())return;e.preventDefault();active=e.shiftKey?active:p;endpoint=p;selection=normalize(active,p);drag={start:active,reference:false};grid.setPointerCapture(e.pointerId);render();save();grid.focus();
});
grid.addEventListener('pointermove',e=>{if(!drag)return;const p=pointerCell(e);if(!p)return;if(drag.reference)addReference(p);else{endpoint=p;selection=normalize(drag.start,p);render();save();}});
grid.addEventListener('pointerup',()=>{if(!drag)return;const ref=drag.reference;drag=null;if(ref&&edit){const input=edit.bar?formula:editor;input.focus();}save();});
grid.addEventListener('dblclick',e=>{if(e.target!==editor&&!edit)beginEdit();});
grid.addEventListener('scroll',queueRender,{passive:true});
new ResizeObserver(()=>{ensureSelection();queueRender();}).observe(grid);
for(const input of [formula,editor]){
 input.addEventListener('input',()=>{if(blockedReason()){render();tell('','error');return;}if(!edit)edit={address:address(),original:sheet.inputs[address()]||'',text:input.value,bar:input===formula};else edit.text=input.value;const other=input===formula?editor:formula;other.value=edit.text;save();});
 input.addEventListener('keydown',e=>{if(blockedReason()){if(e.key==='Escape'){e.preventDefault();exitGrid();}return;}if(e.key==='Enter'){e.preventDefault();if(!edit)beginEdit(input.value,input===formula);finishEdit(e.shiftKey?-1:1);}else if(e.key==='Escape'){e.preventDefault();cancelEdit();}else if(e.key==='Tab'){e.preventDefault();if(finishEdit())moveSelection(0,e.shiftKey?-1:1,false);}});
}
formula.addEventListener('focus',()=>{if(blockedReason())return;if(!edit){const a=address(),owner=result.owners?.[a];if(owner&&owner!==a){formula.blur();tell(`Resultado de ${owner}: seleccione el ancla para editar la fórmula.`,'error');return;}edit={address:a,text:formula.value,original:sheet.inputs[a]||'',bar:true};save();}});
$('commit').addEventListener('click',()=>finishEdit());
$('address').addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();try{if(editing()&&!finishEdit())return;selection=checkedRange(e.target.value.trim().toUpperCase());active={row:selection.r1,col:selection.c1};endpoint={row:selection.r2,col:selection.c2};ensureSelection();render();save();grid.focus();}catch(err){tell(err.message,'error');}});
grid.addEventListener('keydown',e=>{
 if(e.target===editor||editing())return;if(e.key==='Escape'){e.preventDefault();exitGrid();return;}const mod=e.ctrlKey||e.metaKey;
 if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true);return;}
 if(mod&&['c','v','a'].includes(e.key.toLowerCase()))return;
 const movements={ArrowDown:[1,0],ArrowUp:[-1,0],ArrowRight:[0,1],ArrowLeft:[0,-1],Enter:[e.shiftKey?-1:1,0]};
 if(movements[e.key]){e.preventDefault();const [r,c]=movements[e.key];moveSelection(r,c,e.shiftKey&&e.key.startsWith('Arrow'));return;}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();try{commitUpdates(selectedUpdates(''),'Selección vaciada. Puede deshacerlo.');}catch(err){tell(err.message,'error');}return;}
 if(e.key==='F2'){e.preventDefault();beginEdit();return;}
 if(!mod&&!e.altKey&&e.key.length===1){e.preventDefault();beginEdit(e.key);}
});
grid.addEventListener('copy',e=>{if(editing())return;try{const mode=e.shiftKey?'formulas':'values',text=prepareCopy(mode);e.clipboardData.setData('text/plain',text);e.clipboardData.setData('application/x-rigidez-sheet',JSON.stringify(internalClip));e.preventDefault();tell(`${rangeText(selection)} copiado: ${mode==='values'?'valores':'fórmulas'}.`);}catch(err){e.preventDefault();tell(err.message,'error');}});
grid.addEventListener('paste',e=>{if(blockedReason()){e.preventDefault();tell('','error');return;}if(edit)return;e.preventDefault();let clip=null;const text=e.clipboardData.getData('text/plain');try{const p=JSON.parse(e.clipboardData.getData('application/x-rigidez-sheet')||'null');if(p&&p.mode==='formulas'&&p.text===text&&Number.isInteger(p.r1)&&Number.isInteger(p.c1))clip=p;}catch{}if(!clip&&internalClip?.mode==='formulas'&&internalClip.text===text)clip=internalClip;pasteBlock(text,clip);});
// Native disclosure keeps Enter/Space and Tab navigation. These are the actual
// sheet actions, not duplicate controls, so read-only guards remain shared.
function closeMore(restoreFocus=false){
 if(!moreTools.open)return;moreTools.open=false;moreToggle.setAttribute('aria-expanded','false');
 if(restoreFocus)moreToggle.focus({preventScroll:true});
}
function closeHelp(restoreFocus=false){
 if(help.hidden)return;help.hidden=true;$('toggle-help').setAttribute('aria-expanded','false');
 // The help trigger lives in the closed disclosure; return to its visible toggle.
 if(restoreFocus)moreToggle.focus({preventScroll:true});
}
function openHelp(){closeMore();help.hidden=false;$('toggle-help').setAttribute('aria-expanded','true');$('close-help').focus({preventScroll:true});}
moreTools.addEventListener('toggle',()=>{moreToggle.setAttribute('aria-expanded',String(moreTools.open));if(moreTools.open)closeHelp();});
document.addEventListener('pointerdown',event=>{
 if(moreTools.open&&!moreTools.contains(event.target))closeMore();
 if(!help.hidden&&!help.contains(event.target))closeHelp();
});
document.addEventListener('focusin',event=>{
 if(moreTools.open&&!moreTools.contains(event.target))closeMore();
 if(!help.hidden&&!help.contains(event.target))closeHelp();
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape'||event.defaultPrevented)return;
 if(!help.hidden){event.preventDefault();event.stopPropagation();closeHelp(true);}
 else if(moreTools.open){event.preventDefault();event.stopPropagation();closeMore(true);}
 // Otherwise the existing grid/editor Escape handlers retain their semantics.
},true);
const toolbarAction=action=>(...args)=>{closeMore(true);return action(...args);};
$('copy-values').onclick=toolbarAction(()=>copyToClipboard('values'));$('copy-formulas').onclick=toolbarAction(()=>copyToClipboard('formulas'));$('select-spill').onclick=toolbarAction(()=>{if(editing()&&!finishEdit())return;selectSpill();});$('undo').onclick=toolbarAction(()=>undo());$('redo').onclick=toolbarAction(()=>undo(true));
$('toggle-help').onclick=()=>{if(help.hidden)openHelp();else closeHelp(true);};$('close-help').onclick=()=>closeHelp(true);
$('extend').onclick=toolbarAction(()=>{try{requireEditable();if(edit&&!finishEdit())return;requireEditable();const rows=Math.min(240,sheet.rows+60),cols=Math.min(120,sheet.cols+20);if(rows===sheet.rows&&cols===sheet.cols){tell('Área máxima: 240 filas × 120 columnas. Cada operación admite hasta 36×36.');return;}past.push(snapshot());future=[];sheet=resizeSheet(sheet,rows,cols);recalc();tell(`Área ampliada a ${rows}×${cols}; no se movieron celdas.`);}catch(e){tell(e.message,'error');}});
function selectRange(range){if(editing()&&!finishEdit())throw Error('No se pudo aplicar la edición pendiente.');selection=checkedRange(range);active={row:selection.r1,col:selection.c1};endpoint={row:selection.r2,col:selection.c2};ensureSelection();render();save();return getSelection();}
function readSelection({commit=true}={}){requireReadable();if(editing()&&!commit)throw Error('Aplique o cancele la edición antes de enviar la selección.');if(editing()&&!finishEdit())throw Error('No se pudo aplicar la edición pendiente.');const range=rangeText(selection);return {range,values:readRange(result,range)};}
function flush(){save();return getPayload();}
window.RigidezFreeGrid=Object.freeze({load,validatePayload,setReadOnly,getPayload,getSelection,readSelection,readRange:range=>{requireReadable();return readRange(result,range);},importBlock,selectRange,focus:()=>{if(editing()){syncEditor();formula.focus();}else grid.focus();},flush,cancelPending,notify:tell});
result=evaluateSheet(sheet);render();
window.dispatchEvent(new CustomEvent('rigidez-grid-ready'));
