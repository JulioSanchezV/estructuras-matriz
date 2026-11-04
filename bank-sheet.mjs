/** Contextual student worksheet. The bridge supplies only entered values and public data. */
import {createStateV2,createCard,updateCell,renameCard,setCardUnit,resizePreview,resizeConfirmed,pastePreview,applyPaste,calculateCard,recalculateCard,cardStatus,checkCompatibility,removeCard,undoLast,migrateV1,serializeV2,restoreV2,storageKeyV2,uniqueName} from './bank-sheet-v2-core.mjs';
import {storageKey as legacyStorageKey} from './bank-sheet-core.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={ready:'Completa',incomplete:'Con vacíos',invalid:'Revise expresiones',stale:'Desactualizada'};
const operations={solve:'Resolver A·X = B',multiply:'Producto A × B',add:'Suma A + B',subtract:'Resta A − B',inverse:'Inversa de A',transpose:'Transpuesta de A',dot:'Producto escalar',scale:'Multiplicar A por un escalar'};
const blankUI=()=>({active:'',a:'',b:'',operation:'solve',scalarText:'1',resultName:'R',resultUnit:'',link:'',fieldCards:{},newName:'A',newRows:'2',newColumns:'1',newUnit:'',rangeRows:'',rangeColumns:'',rangeName:'Submatriz',paste:null});
const tsv=cells=>cells.map(row=>row.join('\t')).join('\n')+'\n';
const numericText=values=>values.map(row=>row.map(String).join('\t')).join('\n');

export function mountBankSheet({host,context,fields,readField,writeField,hasContent,focusField,exports:publicExports={}}){
 if(!host||typeof readField!=='function'||typeof writeField!=='function')throw new Error('Falta el enlace de la hoja con el ejercicio.');
 let ctx={...context},descriptors=fields.map(f=>({...f})),exportsData={...publicExports};
 let state=createStateV2(),ui=blankUI(),opened=false,key=storageKeyV2(ctx.alias,ctx.type,ctx.variant),notice='',saveNotice='',returnFocus=null,pendingAction=null,pasteDraft=null,timer=null,pendingSave=null;
 const memory=new Map(),sessionSnapshots=new Map(),blockedPersistence=new Set(),corruptRecords=new Map(),$=selector=>host.querySelector(selector);
 const card=id=>state.cards.find(c=>c.id===id),active=()=>card(ui.active),field=k=>descriptors.find(f=>f.key===k);
 const link=()=>field(ui.link),lastCard=()=>state.cards.at(-1);
 const nextName=base=>uniqueName(state,String(base||'Matriz').replace(/[^A-Za-z0-9_]/g,'').replace(/^[^A-Za-z]+/,'').slice(0,18)||'Matriz');
 const status=c=>cardStatus(c,state);
 function message(text,error=false){notice=text;const el=$('[data-sheet-message]');if(el){el.textContent=text;el.className=`sheet-message${error?' sheet-error':''}`;}}
 function attempt(fn){try{return fn();}catch(error){message(error?.message||'No se pudo completar la operación.',true);return null;}}
 function storageStatus(text){saveNotice=text;const el=$('[data-storage]');if(el)el.textContent=text;}
 function flush(){
  if(timer!==null){clearTimeout(timer);timer=null;}const job=pendingSave;pendingSave=null;if(!job)return;
  try{localStorage.setItem(job.key,job.payload);if(localStorage.getItem(job.key)!==job.payload)throw new Error('No se pudo verificar el guardado.');if(job.key===key)storageStatus('Guardado en este navegador.');}
  catch{if(job.key===key)storageStatus('No se pudo guardar en el navegador. Su trabajo sigue en memoria; copie sus matrices antes de cerrar esta página.');}
 }
 function scheduleSave(){
  if(timer!==null){clearTimeout(timer);timer=null;}pendingSave=null;
  sessionSnapshots.set(key,{state:structuredClone(state),ui:structuredClone(ui)});
  if(blockedPersistence.has(key)){storageStatus('El registro anterior es ilegible y se conserva sin sobrescribir. El trabajo actual permanece en memoria; use el reset explícito para guardar una hoja nueva con respaldo.');return;}
  try{const payload=JSON.stringify({state:serializeV2(state),ui});memory.set(key,payload);pendingSave={key,payload};storageStatus('Cambios guardados en memoria…');timer=setTimeout(flush,300);}
  catch(error){storageStatus(`No se pudo guardar: ${error.message} Su trabajo sigue en memoria.`);}
 }
 function restoreUI(candidate){
  ui=blankUI();if(!candidate||typeof candidate!=='object')return;
  for(const prop of Object.keys(ui)){if(prop==='fieldCards'||prop==='paste')continue;if(typeof candidate[prop]==='string')ui[prop]=candidate[prop].slice(0,200);}
  if(candidate.fieldCards&&typeof candidate.fieldCards==='object')for(const [k,id]of Object.entries(candidate.fieldCards))if(k.length<100&&typeof id==='string'&&card(id))ui.fieldCards[k]=id;
  if(!operations[ui.operation])ui.operation='solve';for(const prop of ['active','a','b'])if(ui[prop]&&!card(ui[prop]))ui[prop]='';
  if(ui.link&&!field(ui.link))ui.link='';
  const paste=candidate.paste;if(paste&&typeof paste==='object'&&card(paste.id)&&typeof paste.text==='string'&&Number.isInteger(paste.row)&&Number.isInteger(paste.column)&&paste.row>=0&&paste.column>=0){ui.paste={id:paste.id,text:paste.text,row:paste.row,column:paste.column};}
 }
 function loadContext(){
  state=createStateV2();ui=blankUI();notice='';saveNotice='';pendingAction=null;pasteDraft=null;
  const snapshot=sessionSnapshots.get(key);if(snapshot){state=structuredClone(snapshot.state);restoreUI(snapshot.ui);saveNotice=blockedPersistence.has(key)?'Trabajo conservado en memoria; el registro anterior sigue protegido.':'Trabajo recuperado de esta sesión.';return;}
  let raw=memory.get(key);try{raw??=localStorage.getItem(key);}catch{saveNotice='Almacenamiento no disponible; se conserva el trabajo en memoria.';}
  if(raw){try{const payload=JSON.parse(raw);state=restoreV2(typeof payload.state==='string'?payload.state:raw);restoreUI(payload.ui);if(!ui.active)ui.active=state.cards[0]?.id||'';return;}catch{blockedPersistence.add(key);corruptRecords.set(key,raw);notice='No se pudo leer esta hoja guardada. Se conserva el registro íntegro sin sobrescribir. El trabajo nuevo queda en memoria hasta un reset explícito con respaldo.';return;}}
  let legacy;try{legacy=localStorage.getItem(legacyStorageKey(ctx.alias,ctx.type,ctx.variant));}catch{}
  if(legacy){try{
   state=migrateV1(legacy);const old=state.migration?.ui||{};ui.active=state.cards.find(c=>c.name===old.selected)?.id||state.cards[0]?.id||'';ui.a=state.cards.find(c=>c.name===old.a)?.id||'';ui.b=state.cards.find(c=>c.name===old.b)?.id||'';
   ui.operation=operations[old.operation]?old.operation:'solve';ui.resultName=nextName(old.resultName||'R');ui.resultUnit=typeof old.resultUnit==='string'?old.resultUnit.slice(0,100):'';notice=state.recovery?.some(item=>String(item.reason||'').startsWith('No se migró'))?'La hoja anterior se conserva íntegra en Borradores recuperados; no se pudo interpretar automáticamente.':'Se recuperó la hoja anterior. Su copia original se conserva; revise también Borradores recuperados.';scheduleSave();flush();
  }catch(error){notice=`No se pudo migrar la hoja anterior. Sus datos originales se conservan sin modificar. ${error.message}`;}}
 }
 function fieldLabel(f){return `${f.writable===false?'Enunciado':`Paso ${f.stepIndex+1}`} · ${f.label} · ${f.rows}×${f.columns}`;}
 function cardOptions(selected){return `<option value="">Seleccione</option>${state.cards.map(c=>`<option value="${esc(c.id)}"${c.id===selected?' selected':''}>${esc(c.name)} · ${c.rows}×${c.columns} · ${labels[status(c).status]}</option>`).join('')}`;}
 function renderNav(){
  const el=$('[data-card-list]');el.innerHTML=state.cards.length?state.cards.map(c=>`<button type="button" class="sheet-card-tab${c.id===ui.active?' active':''}" data-action="select-card" data-card-id="${esc(c.id)}" aria-pressed="${c.id===ui.active}"><b>${esc(c.name)}</b> <span>${c.rows}×${c.columns}</span><small class="status-${status(c).status}">${labels[status(c).status]}</small></button>`).join(''):'<p class="sheet-small">Aún no hay matrices. Cree una o comience desde un bloque del ejercicio.</p>';
 }
 function renderLink(){
  const f=link();$('[data-link-label]').textContent=f?`Trabajando para: ${fieldLabel(f)}`:'Hoja libre: elija sus matrices y operaciones.';
  $('[data-return]').textContent=f&&f.writable!==false?`Volver al paso ${f.stepIndex+1}`:'Volver al ejercicio';
 }
 function renderGrid(c){return `<div class="sheet-grid-scroll"><table class="sheet-grid"><thead><tr><th></th>${Array.from({length:c.columns},(_,j)=>`<th scope="col">${j+1}</th>`).join('')}</tr></thead><tbody>${c.cells.map((row,i)=>`<tr><th scope="row">${i+1}</th>${row.map((value,j)=>`<td><input data-grid-cell="${i},${j}" data-card-id="${esc(c.id)}" aria-label="${esc(c.name)}, fila ${i+1}, columna ${j+1}" value="${esc(value)}" autocomplete="off" spellcheck="false" maxlength="512"${c.origin?.kind==='resultado'?' readonly':''}></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
 function originText(c){const o=c.origin||{};if(o.kind!=='resultado')return o.source||'Matriz editable; cada cambio se conserva automáticamente.';const names=(o.operands||[]).map(x=>card(x.id)?.name||x.name);if(o.op==='solve')return `${c.name}: solución de ${names[0]}·X=${names[1]}.`;if(o.op==='inverse')return `${c.name} = ${names[0]}⁻¹.`;if(o.op==='transpose')return `${c.name} = ${names[0]}ᵀ.`;return `${c.name}: ${operations[o.op]||o.op} con ${names.join(', ')}.`;}
 function destinationOptions(c,selected){return `<option value="">Seleccione destino</option>${descriptors.filter(f=>f.writable!==false).map(f=>{const compatible=f.rows===c.rows&&f.columns===c.columns;return `<option value="${esc(f.key)}"${f.key===selected&&compatible?' selected':''}${compatible?'':' disabled'}>${esc(fieldLabel(f))}${compatible?'':' · forma distinta'}</option>`;}).join('')}`;}
 function renderActive(){
  const c=active(),el=$('[data-active-card]');if(!c){el.innerHTML='<p class="sheet-small">Use «Nueva matriz» o «Trabajar en la hoja» desde el ejercicio.</p>';return;}
  const st=status(c),result=c.origin?.kind==='resultado';
  el.innerHTML=`<div class="sheet-card-heading"><h3>${esc(c.name)} <span>${c.rows}×${c.columns}</span></h3><span data-active-status class="sheet-status status-${st.status}">${labels[st.status]}</span></div><p class="sheet-small">${esc(originText(c))}</p>
   <div class="sheet-row"><label>Nombre<input data-card-name value="${esc(c.name)}" maxlength="24"></label><label>Unidades o bloques<input data-card-unit value="${esc(c.unit)}" maxlength="100"></label></div>
   <div class="sheet-dimensions"><label>Filas<input data-rows type="number" min="1" max="36" value="${c.rows}"></label><label>Columnas<input data-columns type="number" min="1" max="36" value="${c.columns}"></label><button class="btn btn-sm" type="button" data-action="resize"${result?' disabled':''}>Cambiar tamaño</button></div>
   ${renderGrid(c)}<p class="sheet-small">${result?'Resultado con precisión completa. Cree una copia editable si desea modificarlo.':'Una casilla vacía no es cero. Enter baja a la fila siguiente; Tab avanza. Los cambios se guardan automáticamente.'}</p>
   <p data-active-problem class="sheet-error">${esc(st.reason||'')}</p><div class="sheet-actions"><button class="btn btn-sm" type="button" data-action="use-a"${st.canOperate?'':' disabled'}>Usar ${esc(c.name)} como A</button><button class="btn btn-sm" type="button" data-action="use-b"${st.canOperate?'':' disabled'}>Usar como B</button><button class="btn btn-sm" type="button" data-action="copy-card">Copiar matriz</button>${result?'<button class="btn btn-sm" type="button" data-action="manual-copy">Crear copia editable</button><button class="btn btn-sm" type="button" data-action="recalculate">Recalcular</button>':'<button class="btn btn-sm" type="button" data-action="show-paste">Pegar bloque</button>'}</div>
   <div class="sheet-transfer"><label>Enviar <b>${esc(c.name)} · ${c.rows}×${c.columns}</b> a<select data-destination>${destinationOptions(c,ui.link)}</select></label><button class="btn btn-primary" type="button" data-action="transfer"${st.canOperate?'':' disabled'}>Enviar ${esc(c.name)} al bloque</button><p class="sheet-small">La respuesta queda sin revisar hasta que pulse Comprobar.</p></div>
   <details class="sheet-more"><summary>Rangos y otras acciones</summary><p class="sheet-small">Extraer filas o columnas no aplica apoyos. Use índices desde 1: 2:3, 1,3 o *.</p><div class="sheet-row"><label>Filas del rango<input data-range-rows value="${esc(ui.rangeRows)}"></label><label>Columnas del rango<input data-range-columns value="${esc(ui.rangeColumns)}"></label></div><label>Nombre de submatriz<input data-range-name value="${esc(ui.rangeName)}" maxlength="24"></label><button type="button" class="btn btn-sm" data-action="extract"${st.canOperate?'':' disabled'}>Extraer como nueva tarjeta</button><button type="button" class="btn btn-sm" data-action="ask-delete">Eliminar esta matriz</button></details>`;
  markGridStatus();
 }
 function markGridStatus(){
  const c=active();if(!c)return;const st=status(c);const node=$('[data-active-status]');if(node){node.textContent=labels[st.status];node.className=`sheet-status status-${st.status}`;}const error=$('[data-active-problem]');if(error)error.textContent=st.reason||'';
  for(const input of host.querySelectorAll('[data-grid-cell]')){const [r,col]=input.dataset.gridCell.split(',').map(Number);const blank=c.cells[r][col].trim()==='';input.classList.toggle('is-empty',blank);input.classList.toggle('is-invalid',!blank&&st.errors?.some(e=>e.row===r+1&&e.column===col+1));}
  const undoButton=$('[data-action="undo"]');if(undoButton)undoButton.disabled=!state.undo;
  for(const action of ['use-a','use-b','transfer','extract']){const button=$(`[data-action="${action}"]`);if(button)button.disabled=!st.canOperate;}
 }
 function calculationCheck(){
  const a=card(ui.a),b=card(ui.b);if(!a)return {ok:false,reason:'Seleccione la matriz A.'};
  const sa=status(a);if(!sa.canOperate)return {ok:false,reason:`${a.name}: ${sa.reason||labels[sa.status]}.`};
  if(!['inverse','transpose','scale'].includes(ui.operation)){if(!b)return {ok:false,reason:'Seleccione la matriz B.'};const sb=status(b);if(!sb.canOperate)return {ok:false,reason:`${b.name}: ${sb.reason||labels[sb.status]}.`};}
  return checkCompatibility(ui.operation,a,b,ui.scalarText);
 }
 function renderCalc(){
  $('[data-operand-a]').innerHTML=cardOptions(ui.a);$('[data-operand-b]').innerHTML=cardOptions(ui.b);$('[data-operation]').value=ui.operation;
  const a=card(ui.a),b=card(ui.b),check=calculationCheck();const unary=['inverse','transpose'].includes(ui.operation),scale=ui.operation==='scale';
  $('[data-b-wrap]').hidden=unary||scale;$('[data-scalar-wrap]').hidden=!scale;
  let equation=ui.operation==='solve'?`${a?.name||'A'} · X = ${b?.name||'B'}`:ui.operation==='inverse'?`${a?.name||'A'}⁻¹`:ui.operation==='transpose'?`${a?.name||'A'}ᵀ`:`${a?.name||'A'} ${{multiply:'×',add:'+',subtract:'−',dot:'·',scale:'×'}[ui.operation]} ${scale?ui.scalarText:b?.name||'B'}`;
  $('[data-equation]').textContent=`${ui.operation==='solve'?'Resolver: ':''}${equation}${check.ok?` → ${check.rows}×${check.columns}`:''}`;
  $('[data-compatibility]').textContent=check.ok?`${a.rows}×${a.columns}${b&&!unary&&!scale?' y '+b.rows+'×'+b.columns:''}: dimensiones compatibles. ${ui.operation==='solve'?'Equivale a A⁻¹B; no se eligen apoyos por usted.':'Revise las unidades antes de interpretar el resultado.'}`:check.reason;
  $('[data-compatibility]').className=check.ok?'sheet-small':'sheet-error';$('[data-action="calculate"]').disabled=!check.ok;
 }
 function renderRecovery(){
  const entries=[...(state.recovery||[]),...(corruptRecords.has(key)?[{name:'Registro V2 sin interpretar',rawText:corruptRecords.get(key),reason:'Registro protegido: copiar antes de restablecer.'}]:[])];$('[data-recovery]').innerHTML=entries.length?entries.map((item,index)=>`<div class="sheet-recovery-item"><b>${esc(item.name||item.label||'Borrador recuperado '+(index+1))}</b><p class="sheet-small">${esc(item.reason||'Se conserva el texto original aunque no forme una matriz completa o ya existan 40 tarjetas.')}</p><textarea rows="4" readonly data-recovery-text="${index}">${esc(item.rawText??item.text??item.raw??'')}</textarea><button type="button" class="btn btn-sm" data-action="copy-recovery" data-recovery-index="${index}">Copiar borrador</button></div>`).join(''):'<p class="sheet-small">No hay borradores pendientes de recuperar.</p>';
 }
 function render(){
  host.classList.add('bank-sheet');host.hidden=!opened;host.setAttribute('aria-label','Hoja matricial del ejercicio');
  host.innerHTML=`<header class="sheet-header"><div class="sheet-heading"><div><p class="sheet-eyebrow">Hoja libre · ${esc((ctx.alias||'EJEMPLO').trim().toUpperCase())} · variante ${esc(ctx.variant)}</p><h2 tabindex="-1" data-sheet-title>Operaciones matriciales</h2></div><button type="button" class="btn btn-sm" data-action="close">Cerrar · Esc</button></div><p class="sheet-small" data-link-label></p><p data-storage class="sheet-storage">${esc(saveNotice)}</p></header>
   <div class="sheet-content"><p class="sheet-small">Tarjetas de 1 a 36 filas y columnas. Solo se utilizan sus entradas y los datos visibles, no las soluciones del banco.</p><p data-sheet-message class="sheet-message" aria-live="polite" role="status">${esc(notice)}</p>
   <nav class="sheet-card-list" aria-label="Mis matrices" data-card-list></nav>
   <details class="sheet-new" data-new-details${state.cards.length?'':' open'}><summary>Nueva matriz</summary><div class="sheet-row"><label>Nombre nuevo<input data-new-name maxlength="24" value="${esc(ui.newName)}"></label><label>Unidades<input data-new-unit maxlength="100" value="${esc(ui.newUnit)}"></label></div><div class="sheet-dimensions"><label>Filas<input data-new-rows type="number" min="1" max="36" value="${esc(ui.newRows)}"></label><label>Columnas<input data-new-columns type="number" min="1" max="36" value="${esc(ui.newColumns)}"></label><button type="button" class="btn btn-sm" data-action="new-column">Vector columna</button><button type="button" class="btn btn-sm" data-action="new-square">Cuadrada</button></div><button type="button" class="btn btn-primary" data-action="new-card">Crear tarjeta vacía</button></details>
   <section class="sheet-card" data-active-card aria-label="Matriz activa"></section>
   <section class="sheet-calculation"><h3>Calcular con las matrices</h3><label>Operación<select data-operation>${Object.entries(operations).map(([value,label])=>`<option value="${value}"${ui.operation===value?' selected':''}>${label}</option>`).join('')}</select></label><div class="sheet-row"><label>Matriz A<select data-operand-a></select></label><label data-b-wrap>Matriz B<select data-operand-b></select></label></div><label data-scalar-wrap hidden>Escalar<input data-scalar value="${esc(ui.scalarText)}"></label><div data-equation class="sheet-equation"></div><p data-compatibility class="sheet-small" aria-live="polite"></p><div class="sheet-row"><label>Nombre del resultado<input data-result-name maxlength="24" value="${esc(ui.resultName)}"></label><label>Unidades del resultado<input data-result-unit maxlength="100" value="${esc(ui.resultUnit)}"></label></div><button type="button" class="btn btn-primary" data-action="calculate">Calcular · Ctrl+Enter</button><p class="sheet-small">El resultado crea otra tarjeta. A y B solo cambian cuando usted lo indica.</p></section>
   <section class="sheet-dialog" data-confirmation hidden aria-live="polite"></section><section class="sheet-paste" data-paste-region hidden></section>
   <details class="sheet-more"><summary>Traer respuesta o datos visibles</summary><label>Bloque del ejercicio<select data-import-source><option value="">Seleccione</option>${descriptors.map(f=>`<option value="${esc(f.key)}">${esc(fieldLabel(f))}</option>`).join('')}</select></label><button type="button" class="btn btn-sm" data-action="import">Crear copia en la hoja</button></details>
   <details class="sheet-more"><summary>Datos para Excel y Python</summary><p class="sheet-small">Datos públicos de esta variante; no se ejecuta Python en la hoja.</p><label>Excel<textarea data-export-tsv readonly rows="5">${esc(exportsData.tsv||'')}</textarea></label><button type="button" class="btn btn-sm" data-action="copy-tsv">Copiar datos</button><label>Python<textarea data-export-python readonly rows="5">${esc(exportsData.python||'')}</textarea></label><button type="button" class="btn btn-sm" data-action="copy-python">Copiar código</button></details>
   <details class="sheet-more"><summary>Borradores recuperados (${(state.recovery||[]).length})</summary><div data-recovery></div></details>
   <details class="sheet-more"><summary>Historial y administración</summary><p class="sheet-small">El historial conserva operaciones anteriores. La hoja no recalcula resultados sin que usted lo indique.</p><div class="sheet-history">${state.history.slice(-12).reverse().map(h=>`<p>${esc(h.label||h.action||h.name||'Cambio en la hoja')}</p>`).join('')}</div><button type="button" class="btn btn-sm" data-action="ask-clear">Vaciar solo esta hoja</button></details>
   <div data-copy-fallback hidden><label>Texto seleccionado para copiar<textarea rows="5" readonly></textarea></label></div></div>
   <footer class="sheet-footer"><button type="button" class="btn btn-primary" data-action="return" data-return>Volver al ejercicio</button><button type="button" class="btn btn-sm" data-action="undo"${state.undo?'':' disabled'}>Deshacer último cambio de tamaño o eliminación</button></footer>`;
  renderLink();renderNav();renderActive();renderCalc();renderRecovery();if(ui.paste&&card(ui.paste.id)){pasteDraft={...ui.paste,preview:null};renderPaste();}
 }
 function changed({rerender=true}={}){scheduleSave();if(rerender)render();else{renderNav();markGridStatus();renderCalc();}}
 function open(target){if(typeof target==='string'&&field(target)?.writable!==false)ui.link=target;returnFocus=document.activeElement;opened=true;document.body.classList.add('sheet-open');host.hidden=false;host.setAttribute('role',window.matchMedia('(max-width:900px)').matches?'dialog':'complementary');host.setAttribute('aria-modal',window.matchMedia('(max-width:900px)').matches?'true':'false');renderLink();scheduleSave();$('[data-sheet-title]').focus({preventScroll:true});}
 function close({returnToOrigin=true}={}){flush();opened=false;host.hidden=true;document.body.classList.remove('sheet-open');if(returnToOrigin){if(link()?.writable!==false&&typeof focusField==='function'&&link())focusField(ui.link);else returnFocus?.focus?.({preventScroll:true});}}
 function returnToField(){const f=link();if(window.matchMedia('(max-width:900px)').matches)close({returnToOrigin:false});flush();if(f&&f.writable!==false&&typeof focusField==='function'){focusField(f.key);return;}returnFocus?.focus?.();}
 function sourceCells(f){const own=readField(f.key),text=typeof own==='string'?own:own?.text??'';const temporary=createCard(createStateV2(),{name:'Importado',rows:f.rows,columns:f.columns});let grid=text.trim()===''?[]:pastePreview(temporary,temporary.cards[0].id,text).cells;if(grid.length>f.rows||grid.some(row=>row.length>f.columns))throw new Error(`El bloque escrito excede ${f.rows}×${f.columns}. Corrija sus dimensiones antes de copiarlo.`);return Array.from({length:f.rows},(_,r)=>Array.from({length:f.columns},(_,c)=>String(grid[r]?.[c]??'')));}
 function createFromField(fieldKey,reuse=false){return attempt(()=>{
  const f=field(fieldKey);if(!f)throw new Error('Seleccione un bloque de este ejercicio.');open(fieldKey);
  if(reuse&&card(ui.fieldCards[fieldKey])){ui.active=ui.fieldCards[fieldKey];changed();message('Se abrió la tarjeta de trabajo existente. No se reemplazaron sus valores.');return ui.active;}
  const name=nextName(f.fieldId||'Datos');state=createCard(state,{name,rows:f.rows,columns:f.columns,cells:sourceCells(f),unit:f.unit||'',origin:{kind:f.writable===false?'enunciado':'paso',fieldKey,source:fieldLabel(f)}});ui.active=lastCard().id;ui.fieldCards[fieldKey]=ui.active;
  if(f.writable!==false){ui.link=fieldKey;ui.resultName=nextName(f.fieldId||'Resultado');}ui.newName=nextName('A');changed();message(`${name}: ${f.rows}×${f.columns}. Puede escribir directamente; los vacíos se conservan.`);return ui.active;
 });}
 function ask(html,action){pendingAction={...action,key};$('[data-confirmation]').hidden=false;$('[data-confirmation]').innerHTML=`<p>${html}</p><div class="sheet-actions"><button type="button" class="btn btn-primary" data-action="confirm">Confirmar</button><button type="button" class="btn btn-sm" data-action="cancel">Cancelar</button></div>`;$('[data-confirmation]').scrollIntoView({block:'nearest'});}
 function hidePending(){pendingAction=null;$('[data-confirmation]').hidden=true;}
 function resizeActive(){const c=active();if(!c)return;const rows=Number($('[data-rows]').value),columns=Number($('[data-columns]').value),preview=resizePreview(state,c.id,rows,columns);if(preview.requiresConfirmation){ask(`Reducir ${esc(c.name)} a ${rows}×${columns} quitará ${preview.discarded.length} casillas con datos: ${preview.discarded.slice(0,6).map(x=>`(${x.row},${x.column})=${esc(x.text)}`).join('; ')}. Puede deshacer inmediatamente.`,{type:'resize',id:c.id,version:c.version,rows,columns});return;}state=resizeConfirmed(state,c.id,rows,columns);changed();message('Tamaño actualizado. Las casillas nuevas están vacías; no se transpuso la matriz.');}
 function renderPaste(){const c=card(pasteDraft?.id);if(!c)return;const {text,row,column}=pasteDraft;$('[data-paste-region]').hidden=false;$('[data-paste-region]').innerHTML=`<h3>Pegar en ${esc(c.name)}</h3><p class="sheet-small">Desde (${row+1},${column+1}). Columnas con tabulador o punto y coma; una fila por línea. La coma es decimal. Este borrador se conserva al cerrar.</p><label>Bloque para pegar<textarea data-paste-text rows="4" spellcheck="false">${esc(text)}</textarea></label><button class="btn btn-sm" type="button" data-action="preview-paste">Ver forma antes de pegar</button><button class="btn btn-sm" type="button" data-action="cancel-paste">Cancelar y descartar pegado</button><div data-paste-preview></div>`;}
 function startPaste(text='',row=0,column=0){const c=active();if(!c)return;pasteDraft={id:c.id,text,row,column,preview:null};ui.paste={id:c.id,text,row,column};scheduleSave();renderPaste();$('[data-paste-region]').scrollIntoView({block:'nearest'});if(text)attempt(showPastePreview);else $('[data-paste-text]').focus();}
 function showPastePreview(){
  if(!pasteDraft)return;pasteDraft.text=$('[data-paste-text]').value;pasteDraft.preview=pastePreview(state,pasteDraft.id,pasteDraft.text,{row:pasteDraft.row,column:pasteDraft.column});const p=pasteDraft.preview,c=card(pasteDraft.id);
  $('[data-paste-preview]').innerHTML=`<p>Bloque leído: <b>${p.rows}×${p.columns}</b>. ${esc(c.name)}: ${c.rows}×${c.columns}.</p>${p.errors?.length?`<p class="sheet-error">${p.errors.map(e=>esc(e.message||e)).join(' ')}</p>`:''}<div class="sheet-mini-grid"><table>${p.cells.map(row=>`<tr>${row.map(value=>`<td>${value===''?'(vacío)':esc(value)}</td>`).join('')}</tr>`).join('')}</table></div><div class="sheet-actions">${p.canApply?`<button class="btn btn-primary" type="button" data-action="apply-paste">${p.fits?'Pegar en la tarjeta':`Ampliar a ${p.neededRows}×${p.neededColumns} y pegar`}</button><button class="btn btn-sm" type="button" data-action="paste-new">Pegar como tarjeta nueva</button>`:''}</div><p class="sheet-small">No se reemplaza nada hasta confirmar. Los blancos se conservan.</p>`;
 }
 async function copy(text){try{await navigator.clipboard.writeText(text);message('Matriz copiada con sus celdas y precisión completas.');}catch{const region=$('[data-copy-fallback]');region.hidden=false;const area=region.querySelector('textarea');area.value=text;area.focus();area.select();message('El bloque está seleccionado. Use Ctrl+C o Copiar.');}}
 function transfer(id,targetKey,confirmed=false){
  const c=card(id),target=field(targetKey);if(!c||!target||target.writable===false)throw new Error('Seleccione un destino de respuesta.');const st=status(c);if(!st.canOperate)throw new Error(st.reason||'Complete o recalcule la tarjeta antes de enviarla.');if(c.rows!==target.rows||c.columns!==target.columns)throw new Error('Las dimensiones no coinciden; no se transfirió ningún valor.');
  const filled=typeof hasContent==='function'?hasContent(targetKey):String(readField(targetKey)?.text??'').trim()!=='';
  if(filled&&!confirmed){ask(`${esc(fieldLabel(target))} ya contiene trabajo. ¿Reemplazarlo por <b>${esc(c.name)} · ${c.rows}×${c.columns}</b>?`,{type:'transfer',id,version:c.version,targetKey,targetText:String(readField(targetKey)?.text??'')});return;}
  const response=writeField(targetKey,st.values.map(row=>row.slice()));if(response?.ok===false)throw new Error(response.message||'No se pudo transferir.');ui.link=targetKey;scheduleSave();renderLink();message(`${c.name} enviada al paso ${target.stepIndex+1}. Queda sin revisar: pulse Comprobar.`);
 }
 function calculate(){const check=calculationCheck();if(!check.ok)throw new Error(check.reason);state=calculateCard(state,{name:ui.resultName,operation:ui.operation,aId:ui.a,bId:ui.b,scalarText:ui.scalarText,unit:ui.resultUnit});ui.active=lastCard().id;const c=active();ui.resultName=nextName(link()?.fieldId||'R');changed();message(`${c.name} calculada: ${c.rows}×${c.columns}. A y B no cambiaron.`);}
 host.addEventListener('input',event=>{
  const input=event.target;if(input.dataset.gridCell){attempt(()=>{const [r,c]=input.dataset.gridCell.split(',').map(Number);state=updateCell(state,input.dataset.cardId,r,c,input.value);changed({rerender:false});message('Entrada modificada. Revise los resultados que dependan de esta matriz.');});return;}
  const map={'new-name':'newName','new-rows':'newRows','new-columns':'newColumns','new-unit':'newUnit','result-name':'resultName','result-unit':'resultUnit','scalar':'scalarText','range-rows':'rangeRows','range-columns':'rangeColumns','range-name':'rangeName'};
  for(const [attr,prop]of Object.entries(map))if(input.hasAttribute(`data-${attr}`)){ui[prop]=input.value;scheduleSave();if(attr==='scalar')renderCalc();break;}
  if(input.hasAttribute('data-paste-text')&&pasteDraft){pasteDraft.text=input.value;pasteDraft.preview=null;ui.paste={id:pasteDraft.id,text:input.value,row:pasteDraft.row,column:pasteDraft.column};scheduleSave();$('[data-paste-preview]').innerHTML='';}
 });
 host.addEventListener('change',event=>attempt(()=>{
  const input=event.target,c=active();if(input.hasAttribute('data-card-name')&&c){try{state=renameCard(state,c.id,input.value);changed();}catch(error){input.value=c.name;throw error;}}
  if(input.hasAttribute('data-card-unit')&&c){state=setCardUnit(state,c.id,input.value);changed({rerender:false});}
  const map={'operand-a':'a','operand-b':'b','operation':'operation'};for(const [attr,prop]of Object.entries(map))if(input.hasAttribute(`data-${attr}`)){ui[prop]=input.value;scheduleSave();renderCalc();}
 }));
 host.addEventListener('paste',event=>{const input=event.target;if(!input.dataset.gridCell||input.readOnly)return;const text=event.clipboardData?.getData('text');if(typeof text!=='string')return;event.preventDefault();const [r,c]=input.dataset.gridCell.split(',').map(Number);startPaste(text,r,c);});
 host.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();return;}
  if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();attempt(calculate);return;}
  const input=event.target;if(event.key==='Tab'&&window.matchMedia('(max-width:900px)').matches){const focusable=[...host.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&input===first){event.preventDefault();last?.focus();return;}if(!event.shiftKey&&input===last){event.preventDefault();first?.focus();return;}}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'&&!['INPUT','TEXTAREA'].includes(input.tagName)&&input.closest('[data-active-card]')){event.preventDefault();if(active())copy(tsv(active().cells));return;}if(!input.dataset.gridCell)return;const c=card(input.dataset.cardId),[r,col]=input.dataset.gridCell.split(',').map(Number);let nr=r,nc=col;
  if(event.key==='Delete'&&!input.readOnly){event.preventDefault();input.value='';attempt(()=>{state=updateCell(state,c.id,r,col,'');changed({rerender:false});});return;}
  if(event.key==='Enter')nr++;else if(event.key==='ArrowDown')nr++;else if(event.key==='ArrowUp')nr--;else if(event.key==='ArrowRight'&&input.selectionEnd===input.value.length)nc++;else if(event.key==='ArrowLeft'&&input.selectionStart===0)nc--;else if(event.key==='Tab'){const flat=r*c.columns+col+(event.shiftKey?-1:1);if(flat<0||flat>=c.rows*c.columns)return;nr=Math.floor(flat/c.columns);nc=flat%c.columns;}else return;
  if(nr>=0&&nr<c.rows&&nc>=0&&nc<c.columns){event.preventDefault();$(`[data-grid-cell="${nr},${nc}"]`)?.focus();}
 });
 host.addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]');if(!button||!host.contains(button))return;const action=button.dataset.action;
  if(action==='close')return close();if(action==='return')return returnToField();
  attempt(()=>{
   const c=active();
   if(action==='select-card'){ui.active=button.dataset.cardId;pendingAction=null;pasteDraft=null;changed();}
   if(action==='new-column'){ui.newColumns='1';$('[data-new-columns]').value='1';scheduleSave();}
   if(action==='new-square'){ui.newColumns=ui.newRows;$('[data-new-columns]').value=ui.newColumns;scheduleSave();}
   if(action==='new-card'){state=createCard(state,{name:ui.newName,rows:Number(ui.newRows),columns:Number(ui.newColumns),unit:ui.newUnit});ui.active=lastCard().id;ui.newName=nextName('A');changed();message('Tarjeta creada con celdas vacías. Escriba directamente.');$('[data-grid-cell="0,0"]')?.focus();}
   if(action==='use-a'||action==='use-b'){if(!status(c).canOperate)throw new Error('Complete o recalcule esta tarjeta.');ui[action==='use-a'?'a':'b']=c.id;scheduleSave();renderCalc();message(`${c.name} seleccionada como ${action==='use-a'?'A':'B'}.`);}
   if(action==='resize')resizeActive();if(action==='show-paste')startPaste();if(action==='preview-paste')showPastePreview();
   if(action==='cancel-paste'){pasteDraft=null;ui.paste=null;scheduleSave();$('[data-paste-region]').hidden=true;}
   if(action==='apply-paste'||action==='paste-new'){
    if(!pasteDraft?.preview)throw new Error('Revise primero la forma del bloque.');const p=pasteDraft.preview;if(!p.canApply)throw new Error('Corrija el bloque antes de pegar.');
    if(action==='paste-new'){state=createCard(state,{name:nextName('Pegado'),rows:p.rows,columns:p.columns,cells:p.cells,unit:card(pasteDraft.id)?.unit||'',origin:{kind:'pegado'}});ui.active=lastCard().id;}
    else state=applyPaste(state,pasteDraft.id,p,{resize:!p.fits});pasteDraft=null;ui.paste=null;changed();message('Bloque pegado; los blancos se conservaron.');
   }
   if(action==='calculate')calculate();if(action==='recalculate'){state=recalculateCard(state,c.id);changed();message(`${c.name} recalculada con las versiones actuales de sus operandos.`);}
   if(action==='manual-copy'){if(!status(c).canOperate)throw new Error('Recalcule primero el resultado desactualizado o incompleto.');state=createCard(state,{name:nextName(c.name+'_copia'),rows:c.rows,columns:c.columns,cells:c.cells.map(row=>row.slice()),unit:c.unit,origin:{kind:'manual',source:`Copia editable de ${c.name}.`}});ui.active=lastCard().id;changed();}
   if(action==='extract'){state=calculateCard(state,{name:ui.rangeName,operation:'extract',aId:c.id,rowSpec:ui.rangeRows,columnSpec:ui.rangeColumns,unit:c.unit});ui.active=lastCard().id;ui.rangeName=nextName('Submatriz');changed();}
   if(action==='copy-card')copy(tsv(c.cells));if(action==='copy-tsv')copy(exportsData.tsv||'');if(action==='copy-python')copy(exportsData.python||'');
   if(action==='copy-recovery'){const area=$(`[data-recovery-text="${button.dataset.recoveryIndex}"]`);copy(area.value);}
   if(action==='transfer')transfer(c.id,$('[data-destination]').value);
   if(action==='import')createFromField($('[data-import-source]').value,false);
   if(action==='ask-delete'){if(!c)throw new Error('Seleccione una tarjeta.');ask(`¿Eliminar ${esc(c.name)}? Los resultados que dependan de ella quedarán desactualizados. Puede deshacer.`,{type:'delete',id:c.id});}
   if(action==='ask-clear')ask(`¿Vaciar solo esta hoja de ${esc(ctx.title)}, variante ${esc(ctx.variant)}? Se eliminan tarjetas, borradores e historial de esta hoja. No se borran respuestas ni otras variantes; la copia anterior V1 se conserva.`,{type:'clear'});
   if(action==='cancel')hidePending();
   if(action==='confirm'){
    const request=pendingAction;if(!request||request.key!==key)throw new Error('La variante cambió; confirme de nuevo.');hidePending();
    if(request.type==='resize'){if(card(request.id)?.version!==request.version)throw new Error('La tarjeta cambió; revise de nuevo las casillas que se quitarán.');state=resizeConfirmed(state,request.id,request.rows,request.columns,{confirmDiscard:true});changed();message('Tamaño reducido. Puede deshacer antes de otra edición.');}
    if(request.type==='delete'){state=removeCard(state,request.id);ui.active=state.cards[0]?.id||'';changed();}
    if(request.type==='clear'){if(blockedPersistence.has(key)){const raw=corruptRecords.get(key),backupKey=key+':respaldo';try{localStorage.setItem(backupKey,raw);if(localStorage.getItem(backupKey)!==raw)throw new Error();}catch{throw new Error('No se pudo conservar el respaldo del registro anterior. No se vació ni sobrescribió la hoja. Copie el registro recuperado antes de continuar.');}blockedPersistence.delete(key);corruptRecords.delete(key);}state=createStateV2();ui=blankUI();changed();flush();message('Hoja vaciada. Las respuestas y otras variantes se conservaron.');}
    if(request.type==='transfer'){if(card(request.id)?.version!==request.version||String(readField(request.targetKey)?.text??'')!==request.targetText)throw new Error('La matriz o el bloque de destino cambió. Revise y confirme de nuevo el envío.');transfer(request.id,request.targetKey,true);}
   }
   if(action==='undo'){state=undoLast(state);if(!card(ui.active))ui.active=state.cards[0]?.id||'';changed();message('Se restauró el cambio anterior.');}
  });
 });
 window.addEventListener('beforeunload',flush);
 function refresh(next){flush();ctx={...next.context};descriptors=next.fields.map(f=>({...f}));exportsData={...(next.exports||{})};const nextKey=storageKeyV2(ctx.alias,ctx.type,ctx.variant);if(nextKey!==key){key=nextKey;loadContext();}pendingAction=null;pasteDraft=null;render();document.body.classList.toggle('sheet-open',opened);}
 loadContext();render();
 return {open,close,importField:key=>createFromField(key,false),openForField:key=>createFromField(key,true),refresh};
}
