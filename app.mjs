import { chapters, exercises, matrix } from './content.mjs';
import { sectionsForChapter, resolveLocation } from './routes.mjs';
import { springChain, bar2D, barPlanar } from './math.mjs';
import { createDerivationController } from './stepper.mjs';
import { derivations } from './derivations.mjs';
import { createVectorLab } from './vectorlab.mjs';
import { createBeamLab } from './beam-lab.mjs';
import { checkFixedExercise } from './exercise-validation.mjs';
const beamLab = createBeamLab();
const vectorLab = createVectorLab();
const derivationController = createDerivationController(derivations);

const $ = s => document.querySelector(s);
const state = { chapter: 'inicio', step: 0, mode: 'book', route: 'apply', springCount: 2, stiffness: [600,200,400], loads: [50,-20,0], springTab: 'solution', bar:{angle:45,E:200000000,A:.002,L:2}, exercises:{} };
let toastTimer;
const fmt = (n, digits=6) => n === 0 ? '0' : Math.abs(n) < 10 ** (-digits) || Math.abs(n) >= 1e12 ? n.toExponential(Math.min(digits, 3)) : n.toLocaleString('en-US',{maximumFractionDigits:digits,useGrouping:false});
const numberMatrix = (m,label,cls='') => matrix(m.map(r=>r.map(n=>fmt(n,4))),label,cls);
const getChapter = () => chapters.find(c=>c.id===state.chapter) || chapters[0];
function sections() { return sectionsForChapter(getChapter(), state.route); }
function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200); }
function readHash(){ Object.assign(state, resolveLocation(chapters, location.hash, state.route)); }
function setHash(){ const hash=`#${state.chapter}/${sections()[state.step]?.id || sections()[0].id}?ruta=${state.route}`; if(location.hash!==hash) history.pushState(null,'',hash); }
function navigate(chapter,step=0){ state.chapter=chapter;state.step=step;setHash();render();window.scrollTo({top:0,behavior:'instant'});closeMenu();$('#main').focus({preventScroll:true}); }
function closeMenu(){ $('#sidebar').classList.remove('is-open');$('#menu-toggle').setAttribute('aria-expanded','false'); }
function changeMode(mode){ state.mode=mode;render();window.scrollTo({top:0,behavior:'instant'});closeMenu(); }
function changeRoute(route){ const oldId=sections()[state.step]?.id;state.route=route;state.step=Math.max(0,sections().findIndex(s=>s.id===oldId));render();setHash(); }
function move(direction){
 const index=chapters.findIndex(c=>c.id===state.chapter);
 if(state.mode==='slides'){
  const next=state.step+direction;
  if(next>=0 && next<sections().length) navigate(state.chapter,next);
  else if(chapters[index+direction]) {state.chapter=chapters[index+direction].id;navigate(state.chapter,direction>0?0:sections().length-1);}
 } else if(chapters[index+direction]) navigate(chapters[index+direction].id);
}
function render(){
 const chapter=getChapter(), list=sections(); state.step=Math.min(state.step,list.length-1);
 document.body.classList.toggle('presentation',state.mode==='slides');
 document.querySelectorAll('.mode-switch button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===state.mode));
 $('#chapter-nav').innerHTML=chapters.map(c=>`<a href="#${c.id}" data-chapter="${c.id}" class="chapter-link ${c.id===chapter.id?'active':''}" ${c.id===chapter.id?'aria-current="page"':''}><span class="chapter-number">${c.number}</span><span><b>${c.title}</b><small>${c.short}</small></span></a>`).join('') + '<a class="chapter-link bank-nav-link" href="./banco.html"><span class="chapter-number">08</span><span><b>Comprobar pasos</b><small>Banco de ejercicios</small></span></a><a class="chapter-link" href="./calculadora.html"><span class="chapter-number">09</span><span><b>Operaciones matriciales</b><small>Calculadora y ensamblaje</small></span></a>';
 const routeBar=`<div class="reading-tools"><div class="breadcrumbs"><span>CUADERNO 01</span><span>/</span><span>${chapter.number} · ${chapter.title}</span></div><div class="route-switch" role="group" aria-label="Ruta de aprendizaje"><span>Ruta</span><button data-route="understand" aria-pressed="${state.route==='understand'}">Demostraciones</button><button data-route="apply" aria-pressed="${state.route==='apply'}">Formulario</button></div></div>`;
 const chapterIntro=chapter.id!=='inicio'?`<div class="chapter-intro"><span class="eyebrow">CAPÍTULO ${chapter.number}</span><span class="tag ${chapter.status==='Desarrollado'?'complete':chapter.status==='Síntesis'?'overview':'deeper'}">${chapter.status==='Síntesis'?'Síntesis · no es capítulo completo':chapter.status}</span></div>`:'';
 const active=state.mode==='slides'?[list[state.step]]:list;
 $('#content').innerHTML=routeBar+chapterIntro+active.map(s=>`<section class="lesson ${s.hero?'hero':''} ${s.body.includes('data-widget')?'lab-lesson':''}" id="section-${s.id}"><div class="section-head"><span class="eyebrow">${s.tag}</span><h${s.hero?'1':'2'}>${s.title}</h${s.hero?'1':'2'}><p class="lead">${s.lead}</p></div>${!s.hero&&s.showRouteNote!==false?`<div class="route-note"><span>${state.route==='understand'?'DEDUCCIÓN':'PROCEDIMIENTO'}</span><p>${s[state.route]}</p></div>`:''}<div class="section-body">${s.body}</div></section>`).join('')+(state.mode==='book'?`<div class="chapter-bottom"><span>Fin del capítulo.</span>${chapters[chapters.indexOf(chapter)+1]?`<button class="primary" data-next-chapter>Continuar: ${chapters[chapters.indexOf(chapter)+1].title}</button>`:'<button class="primary" data-go="inicio">Volver al inicio</button>'}</div>`:'');
 const i=chapters.indexOf(chapter);$('#location-label').innerHTML=`<span class="footer-book">Matriz /</span> ${chapter.title}`;
 $('#page-count').textContent=state.mode==='slides'?`${state.step+1} / ${list.length}`:`${i+1} / ${chapters.length}`;
 $('#previous').disabled=i===0&&(state.mode==='book'||state.step===0);
 $('#next').disabled=i===chapters.length-1&&(state.mode==='book'||state.step===list.length-1);
 document.querySelectorAll('[data-widget="springs"]').forEach(renderSpringWidget);
 document.querySelectorAll('[data-widget="bar"]').forEach(renderBarWidget);
 document.querySelectorAll('[data-widget="vectors"]').forEach(vectorLab.render);
 document.querySelectorAll('[data-widget="beam-derivation"]').forEach(beamLab.render);
 document.querySelectorAll('[data-exercise]').forEach(renderExercise);
 document.querySelectorAll('[data-derivation]').forEach(derivationController.render);
 document.title=`${chapter.title} · Matriz`;
}
function input(name,label,value,attrs=''){return `<label class="field"><span>${label}</span><input type="number" data-param="${name}" value="${value}" step="any" ${attrs}></label>`;}
function springDiagram(k,loads){
 const n=k.length, xs=Array.from({length:n+1},(_,i)=>65+i*470/n), colors=['#287f77','#ad7a37','#7770a7'];
 return `<svg class="spring-svg" viewBox="0 0 650 175" role="img" aria-label="Cadena de ${n} resortes: nudo ${n+1} fijo, traslaciones positivas hacia la derecha"><path d="M545 63v67m9-61-9-6m9 23-9-6m9 23-9-6m9 23-9-6" stroke="#173a42" stroke-width="2"/>${k.map((v,e)=>{ const x=xs[e],x2=xs[e+1],dx=(x2-x-34)/10;let path=`M${x} 96h17`;for(let j=0;j<10;j++)path+=`l${dx} ${j===0?-10:j===9?10:j%2===1?20:-20}`;path+='h17';return `<path d="${path}" fill="none" stroke="${colors[e]}" stroke-width="3"/><text x="${(x+x2)/2}" y="49" text-anchor="middle" fill="${colors[e]}" font-size="13">k${['ₐ','_b','_c'][e]} = ${fmt(v,2)}</text>`;}).join('')}${xs.map((x,i)=>`<circle cx="${x}" cy="96" r="7" fill="#f7f4eb" stroke="#173a42" stroke-width="2"/><text x="${x}" y="137" text-anchor="middle" fill="#173a42" font-size="13">${i+1}</text>${i<n?`<text x="${x}" y="24" text-anchor="middle" fill="#173a42" font-size="12">F${i+1} = ${fmt(loads[i],2)}</text>`:''}`).join('')}<path d="M570 153h46l-8-5m8 5-8 5" fill="none" stroke="#173a42"/><text x="574" y="141" fill="#173a42" font-size="12">+X</text><text x="535" y="160" text-anchor="middle" fill="#526765" font-size="12">δ${n+1} = 0</text></svg>`;
}
function renderSpringWidget(host){
 host.className='lab';host.innerHTML=`<div class="lab-header"><div><span class="live-dot"></span><strong>Laboratorio de ensamblaje</strong></div><button class="text-button" data-reset="springs">Restablecer</button></div><div class="lab-controls"><label class="field"><span>Configuración</span><select id="spring-count"><option value="2" ${state.springCount===2?'selected':''}>2 resortes · 3 nudos</option><option value="3" ${state.springCount===3?'selected':''}>3 resortes · 4 nudos</option></select></label><span class="control-note">Cadena en serie<br>Nudo ${state.springCount+1} fijo · δ${state.springCount+1} = 0</span></div><div class="parameter-rows">${Array.from({length:state.springCount},(_,i)=>`<div class="parameter-row"><span class="element-badge element-${i+1}">e${i+1}</span>${input(`k-${i}`,`k${['ₐ','_b','_c'][i]} · kN/m`,state.stiffness[i],'min="0.000001"')}${input(`f-${i}`,`F${i+1} aplicada · kN`,state.loads[i])}</div>`).join('')}</div><div class="lab-tabs" role="group" aria-label="Etapa del cálculo">${[['local','01 · Elementos'],['assembly','02 · Ensamblaje'],['solution','03 · Solución']].map(([id,label])=>`<button data-spring-tab="${id}" aria-pressed="${state.springTab===id}">${label}</button>`).join('')}</div><div id="spring-result" aria-live="polite"></div><div class="lab-footer"><span>Lineal elástico · cálculo en su navegador</span><button class="text-button" data-export="springs">Exportar resultados CSV</button></div>`;
 updateSpring();
}
function springData(){return springChain(state.stiffness.slice(0,state.springCount),state.loads.slice(0,state.springCount),state.springCount);}
function updateSpring(){
 const out=$('#spring-result'); if(!out)return;
 try{
  const ks=state.stiffness.slice(0,state.springCount),ls=state.loads.slice(0,state.springCount),r=springData();
  let body='';
  if(state.springTab==='local')body=`<div class="dynamic-matrices">${ks.map((k,i)=>numberMatrix([[k,-k],[-k,k]],`kₑ${i+1} · nudos [${i+1},${i+2}]`,`element-${i+1}`)).join('')}</div><p class="caption">Orden de cada elemento: [δᵢ, δⱼ]. Todas las matrices locales están en kN/m.</p><div class="equation compact">Fₑ = Kₑδₑ &nbsp; · &nbsp; Sᵢⱼ = kₑ(δⱼ − δᵢ)</div>`;
  if(state.springTab==='assembly')body=`<h4>Aportes ubicados en los GDL globales</h4><div class="dynamic-matrices contributions">${r.contributions.map((m,i)=>numberMatrix(m,`Aporte e${i+1}`,`element-${i+1}`)).join('<span class="operator">+</span>')}</div><h4>La suma: matriz global K</h4>${numberMatrix(r.K,'K · kN/m')}<p class="caption">Orden: [${r.u.map((_,i)=>`δ${i+1}`).join(', ')}]. Sin apoyos, esta matriz es singular. Cada diagonal recibe los aportes de los resortes conectados a su nudo.</p>`;
  if(state.springTab==='solution'){
   const residue=Math.max(...r.free.map(i=>Math.abs(r.residual[i])));
   body=`<div class="reduced-system"><div>${numberMatrix(r.reduced,'Kₙₙ · kN/m')}</div><span class="operator">×</span>${matrix(r.free.map(i=>[`δ${i+1}`]),'δₙ · m')}<span class="operator">=</span>${numberMatrix(ls.map(n=>[n]),'Fₙ · kN')}</div><p class="caption">Se impone δ${state.springCount+1} = 0. Eliminamos su fila y columna solo del sistema de incógnitas.</p><div class="lab-result-cards">${r.free.map(i=>r.u[i]).map((u,i)=>`<div><span>δ${i+1}</span><strong>${fmt(u,6)}</strong><small>m · ${fmt(u*1000,3)} mm</small></div>`).join('')}<div class="reaction"><span>F${state.springCount+1} (reacción)</span><strong>${fmt(r.reaction,4)}</strong><small>kN · ${r.reaction<0?'hacia −X':r.reaction>0?'hacia +X':'sin reacción'}</small></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Elemento</th><th>Alargamiento δⱼ − δᵢ (m)</th><th>Sᵢⱼ (kN)</th><th>Estado</th><th>Fₑ = [−S,+S] (kN)</th></tr></thead><tbody>${r.elementForces.map((n,i)=>`<tr><td>e${i+1} · ${i+1}–${i+2}</td><td>${fmt(r.u[i+1]-r.u[i],6)}</td><td>${fmt(n,4)}</td><td>${Math.abs(n)<1e-8?'Sin fuerza':n>0?'Tensión':'Compresión'}</td><td>[${fmt(-n,3)}, ${fmt(n,3)}]</td></tr>`).join('')}</tbody></table></div><div class="verification"><div><strong>Equilibrio verificado numéricamente</strong><p>F${state.springCount+1} + ΣF aplicada = ${fmt(r.reaction+ls.reduce((a,b)=>a+b,0),10)} kN · máximo residuo libre: ${residue.toExponential(2)} kN.<br>Energía elástica U = ${fmt(r.energy,6)} kJ.</p></div></div><details class="technical"><summary>Ver matriz global y residuo completo</summary>${numberMatrix(r.K,'K · kN/m')}${numberMatrix(r.residual.map(n=>[n]),'Kδ − F aplicada · kN')}<p>Solo el GDL restringido contiene una reacción; los GDL libres deben tener residuo numérico cercano a cero.</p></details>`;
  }
  out.innerHTML=springDiagram(ks,ls)+`<div class="lab-output">${body}</div>`;
 }catch(error){out.innerHTML=`<div class="error-message" role="alert"><strong>No se puede resolver el sistema.</strong><p>${error.message} Corrija las entradas para recalcular.</p></div>`;}
}
function barDiagram(angle){
 const a=angle*Math.PI/180, c=Math.cos(a),s=Math.sin(a),x=270,y=160,len=90,x2=x+len*c,y2=y-len*s;
 const d=`M${x+47} ${y} A47 47 0 ${angle>180?1:0} 0 ${x+47*c} ${y-47*s}`;
 return `<svg class="bar-svg" viewBox="0 0 560 260" role="img" aria-label="Barra i a j con ángulo ${angle} grados respecto al eje X global"><defs><marker id="bar-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3 0 6Z" fill="#173a42"/></marker><marker id="local-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3 0 6Z" fill="#287f77"/></marker></defs><path d="M55 215h70M55 215v-70" fill="none" stroke="#173a42" stroke-width="1.5" marker-end="url(#bar-arrow)"/><text x="128" y="220" fill="#173a42" font-size="13">X</text><text x="50" y="136" fill="#173a42" font-size="13">Y</text><text x="44" y="241" fill="#62716b" font-size="11">Ejes globales</text><path d="M${x-125} ${y}h290" stroke="#abb9ad" stroke-dasharray="4 5"/><path d="${d}" fill="none" stroke="#ad7a37" stroke-width="2"/><text x="${x+65}" y="${y-15}" fill="#99702f" font-size="13">φ = ${fmt(angle,1)}°</text><path d="M${x} ${y}L${x2} ${y2}" stroke="#287f77" stroke-width="9" stroke-linecap="round"/><path d="M${x2} ${y2}l${c*27} ${-s*27}" stroke="#287f77" stroke-width="2" marker-end="url(#local-arrow)"/><path d="M${x} ${y}l${-s*57} ${-c*57}" stroke="#287f77" stroke-width="1.5" marker-end="url(#local-arrow)"/><text x="${x2+c*43}" y="${y2-s*43+4}" fill="#287f77" font-size="14">X̄</text><text x="${x-s*70-4}" y="${y-c*70}" fill="#287f77" font-size="14">Ȳ</text><circle cx="${x}" cy="${y}" r="6" fill="#f5f1e7" stroke="#173a42" stroke-width="2"/><circle cx="${x2}" cy="${y2}" r="6" fill="#f5f1e7" stroke="#173a42" stroke-width="2"/><text x="${x-4}" y="${y+26}" fill="#173a42" font-size="14">i</text><text x="${x2+10}" y="${y2+19}" fill="#173a42" font-size="14">j</text><text x="355" y="227" fill="#62716b" font-size="11">Esquema de orientación, no deformada</text></svg>`;
}
function renderBarWidget(host){
 host.className='lab'; const b=state.bar;
 host.innerHTML=`<div class="lab-header"><div><span class="live-dot"></span><strong>Laboratorio de transformación</strong></div><button class="text-button" data-reset="bar">Restablecer</button></div><div class="bar-controls">${input('E','E · kN/m²',b.E,'min="0.000001"')}${input('A','A · m²',b.A,'min="0.000001"')}${input('L','L · m',b.L,'min="0.000001"')}</div><div class="angle-control"><label for="bar-angle">Ángulo φ <strong id="angle-label">${b.angle}°</strong></label><input type="range" id="bar-angle" min="0" max="180" step="1" value="${b.angle}"><div class="angle-presets">${[0,30,45,90,135,180].map(a=>`<button data-angle="${a}" aria-label="Usar ángulo ${a} grados">${a}°</button>`).join('')}</div></div><div id="bar-result" aria-live="polite"></div><div class="lab-footer"><span>Orden global: δ = [uᵢ, vᵢ, uⱼ, vⱼ]ᵀ</span><button class="text-button" data-export="bar">Exportar matrices CSV</button></div>`;updateBar();
}
function updateBar(){ const out=$('#bar-result');if(!out)return;try{const b=state.bar,r=barPlanar(b.E,b.A,b.L,b.angle);out.innerHTML=`<div class="bar-visual-row">${barDiagram(b.angle)}<div class="bar-facts"><div><span>cos φ</span><strong>${fmt(r.c,6)}</strong></div><div><span>sen φ</span><strong>${fmt(r.s,6)}</strong></div><div><span>EA/L</span><strong>${fmt(r.k,3)} <small>kN/m</small></strong></div></div></div><div class="lab-output"><div class="dynamic-matrices">${numberMatrix(r.T,'T · 4×4 · adimensional')}${numberMatrix(r.local,'K̄ local · 4×4 · kN/m')}</div><div class="global-bar-matrix">${numberMatrix(r.global,'K = TᵀK̄T · 4×4 · kN/m')}</div><p class="caption">Esta es la rigidez de una barra expresada en ejes globales, no la matriz ensamblada de una estructura. La matriz permanece singular antes de conectar elementos y aplicar apoyos.</p></div>`;}catch(error){out.innerHTML=`<div class="error-message" role="alert"><strong>Revise las propiedades.</strong><p>${error.message}</p></div>`;}}
function renderExercise(host){ const id=host.dataset.exercise,e=exercises[id],saved=state.exercises[id]||{};host.className='exercise';host.innerHTML=`<div class="exercise-head"><span class="exercise-number">${id.padStart(2,'0')}</span><div><span class="eyebrow">${e.label}</span><h3>${e.title}</h3></div></div><p>${e.statement}</p><form class="answer-form" data-answer-form="${id}"><label for="answer-${id}">${e.question}</label><div><input id="answer-${id}" type="text" autocomplete="off" placeholder="Número o expresión" value="${saved.value||''}" aria-describedby="answer-help-${id} feedback-${id}"><button class="secondary" type="submit">Comprobar</button></div><p class="small" id="answer-help-${id}">Puede escribir fracciones, potencias y raíces: −30/6480, 2^3, sqrt(2). No incluya la unidad.</p><p class="answer-feedback" id="feedback-${id}" data-status="${saved.status||'unverified'}" role="status">${saved.feedback||'Comprobación local, sin puntuación.'}</p></form><details class="solution" ${saved.open?'open':''} data-solution="${id}"><summary>Ver desarrollo y solución </summary><div>${e.solution}</div></details>`; }
function checkExercise(form){const id=form.dataset.answerForm,e=exercises[id],input=$(`#answer-${id}`);const raw=input.value.trim(),result=checkFixedExercise(raw,e);state.exercises[id]={...(state.exercises[id]||{}),value:raw.replace(/[<>"']/g,''),feedback:result.msg,status:result.status};const feedback=$(`#feedback-${id}`);feedback.textContent=result.msg;feedback.dataset.status=result.status;}
function csvDownload(name,rows){const csv='\uFEFF'+rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');const a=document.createElement('a');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Archivo preparado. Importe con separador punto y coma.');}
const csvNum=n=>String(n).replace('.',',');
function exportResults(type){try{if(type==='springs'){const r=springData(),rows=[['MATRIZ · Instantánea del laboratorio de resortes'],['Alcance',`Lineal elástico; nudo ${state.springCount+1} fijo; cargas kN; desplazamientos m`],[],['Elemento','k (kN/m)','Fuerza axial Sij (kN)','Alargamiento (m)']];state.stiffness.slice(0,state.springCount).forEach((k,i)=>rows.push([i+1,csvNum(k),csvNum(r.elementForces[i]),csvNum(r.u[i+1]-r.u[i])]));rows.push([],['Nudo','Carga aplicada (kN)','delta (m)','Kdelta-F aplicada (kN)']);r.u.forEach((u,i)=>rows.push([i+1,csvNum(r.F[i]),csvNum(u),csvNum(r.residual[i])]));rows.push([],['K global (kN/m)'],...r.K.map(row=>row.map(csvNum)),[],['K reducida (kN/m)'],...r.reduced.map(row=>row.map(csvNum)),[],['Energia (kJ)',csvNum(r.energy)]);csvDownload('matriz-resortes-resultados.csv',rows);}else{const b=state.bar,r=barPlanar(b.E,b.A,b.L,b.angle);csvDownload('matriz-barra-transformacion.csv',[['MATRIZ · Transformación axial 2D'],['E (kN/m2)',csvNum(b.E)],['A (m2)',csvNum(b.A)],['L (m)',csvNum(b.L)],['Angulo (grados)',csvNum(b.angle)],[],['T 4x4 (adimensional)'],...r.T.map(row=>row.map(csvNum)),[],['K barra local 4x4 (kN/m)'],...r.local.map(row=>row.map(csvNum)),[],['K global de elemento 4x4 (kN/m)'],...r.global.map(row=>row.map(csvNum))]);}}catch(error){toast('No se exportó: '+error.message);}}

document.addEventListener('click',event=>{
 const b=event.target.closest('button,a');if(!b)return;
 if(b.classList.contains('skip-link')){event.preventDefault();$('#main').focus();return;}
 if(derivationController.handleClick(b)||vectorLab.handleClick(b)||beamLab.handleClick(b))return;
 if(b.dataset.chapter){event.preventDefault();navigate(b.dataset.chapter);return;}
 if(b.dataset.route){changeRoute(b.dataset.route);}
 if(b.dataset.go){event.preventDefault();navigate(b.dataset.go);return;}
 if(b.dataset.mode){changeMode(b.dataset.mode);return;}
 if(b.hasAttribute('data-next-chapter')){move(1);return;}
 if(b.dataset.springTab){state.springTab=b.dataset.springTab;document.querySelectorAll('[data-spring-tab]').forEach(btn=>btn.setAttribute('aria-pressed',btn.dataset.springTab===state.springTab));updateSpring();}
 if(b.dataset.reset==='springs'){state.springCount=2;state.stiffness=[600,200,400];state.loads=[50,-20,0];renderSpringWidget($('[data-widget="springs"]'));}
 if(b.dataset.reset==='bar'){state.bar={angle:45,E:200000000,A:.002,L:2};renderBarWidget($('[data-widget="bar"]'));}
 if(b.hasAttribute('data-angle')){state.bar.angle=Number(b.dataset.angle);$('#bar-angle').value=state.bar.angle;$('#angle-label').textContent=state.bar.angle+'°';updateBar();}
 if(b.dataset.export)exportResults(b.dataset.export);
});
document.addEventListener('input',event=>{const target=event.target;if(vectorLab.handleInput(target)||beamLab.handleInput(target))return;
 if(target.closest('[data-answer-form]')){const id=target.closest('[data-answer-form]').dataset.answerForm;const message='Respuesta modificada. Compruebe de nuevo el valor.';state.exercises[id]={...(state.exercises[id]||{}),value:target.value.replace(/[<>"']/g,''),feedback:message,status:'unverified'};const feedback=$(`#feedback-${id}`);feedback.textContent=message;feedback.dataset.status='unverified';return;}
 if(target.id==='bar-angle'){state.bar.angle=Number(target.value);$('#angle-label').textContent=target.value+'°';updateBar();return;}
 if(!target.dataset.param)return;const p=target.dataset.param;const value=target.value.trim()===''?NaN:Number(target.value);
 if(p.startsWith('k-')||p.startsWith('f-')){const [kind,index]=p.split('-');state[kind==='k'?'stiffness':'loads'][Number(index)]=value;updateSpring();}
 else if(['E','A','L'].includes(p)){state.bar[p]=value;updateBar();}
});
document.addEventListener('change',event=>{if(event.target.id==='spring-count'){state.springCount=Number(event.target.value);renderSpringWidget($('[data-widget="springs"]'));}});
document.addEventListener('submit',event=>{if(event.target.matches('[data-answer-form]')){event.preventDefault();checkExercise(event.target);}});
document.addEventListener('toggle',event=>{if(event.target.dataset?.solution){const id=event.target.dataset.solution;state.exercises[id]={...(state.exercises[id]||{}),open:event.target.open};}},true);
$('#menu-toggle').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('is-open');$('#menu-toggle').setAttribute('aria-expanded',String(open));});
$('#previous').addEventListener('click',()=>move(-1));$('#next').addEventListener('click',()=>move(1));
document.addEventListener('keydown',event=>{if(!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.target.closest('input,textarea,select,[contenteditable="true"]')&&event.key.toLowerCase()==='p'){event.preventDefault();changeMode(state.mode==='slides'?'book':'slides');return;}if(event.key==='Escape'){if($('#sidebar').classList.contains('is-open'))closeMenu();else if(state.mode==='slides')changeMode('book');return;}if(state.mode!=='slides'||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;if(event.key==='ArrowRight'||event.key==='PageDown'){event.preventDefault();move(1);}if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();move(-1);}});
window.addEventListener('hashchange',()=>{readHash();render();window.scrollTo({top:0,behavior:'instant'});});
window.addEventListener('popstate',()=>{readHash();render();});
readHash();render();
