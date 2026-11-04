/** Shared step-by-step derivations. Content is supplied separately from the UI. */
export function createDerivationController(registry, { onStateChange = () => {} } = {}) {
  const states = new Map();
  const getState = id => { if (!states.has(id)) states.set(id, { step: 0, all: false, highlight: null }); return states.get(id); };
  function render(host) {
    const id = host.dataset.derivation, definition = registry[id];
    if (!definition) { host.hidden = true; return; }
    const state = getState(id); state.step = Math.max(0, Math.min(state.step, definition.steps.length - 1));
    host.hidden = false; host.className = `derivation ${state.all ? 'show-all-steps' : ''}`;
    host.innerHTML = `<div class="derivation-heading"><div><span class="eyebrow">PROCEDIMIENTO DE DEDUCCIÓN</span><h3>${definition.title}</h3></div><button class="text-button" data-derivation-action="all" aria-pressed="${state.all}">${state.all ? 'Volver a un paso' : 'Ver desarrollo completo'}</button></div>${definition.intro ? `<p class="derivation-intro">${definition.intro}</p>` : ''}<div class="derivation-steps" role="group" aria-label="Pasos de la deducción">${definition.steps.map((step,i) => `<button data-derivation-step="${i}" aria-pressed="${state.step===i}" ${state.all?'aria-disabled="true"':''}><span>${String(i+1).padStart(2,'0')}</span>${step.short || step.title}</button>`).join('')}</div><div class="derivation-panels" aria-live="polite">${(state.all ? definition.steps : [definition.steps[state.step]]).map((step,i) => renderPanel(step,state.all?i:state.step,state,definition)).join('')}</div><div class="derivation-footer"><button class="secondary" data-derivation-action="previous" ${state.all||state.step===0?'disabled':''}>Paso anterior</button><span>${state.all ? `${definition.steps.length} pasos desplegados` : `${state.step+1} / ${definition.steps.length}`}</span><button class="primary" data-derivation-action="next" ${state.all||state.step===definition.steps.length-1?'disabled':''}>Paso siguiente</button></div>`;
    if(state.highlight) highlight(host,state.highlight);
  }
  function renderPanel(step,index,state,definition) {
    const legend = step.legend || definition.legend || [];
    return `<section class="derivation-panel" data-panel-index="${index}"><header><span class="derivation-step-index">${String(index+1).padStart(2,'0')}</span><div><h4>${step.title}</h4>${step.lead ? `<p>${step.lead}</p>`:''}</div></header>${legend.length?`<div class="trace-legend" role="group" aria-label="Resaltar componentes">${legend.map(item=>`<button class="trace-chip trace-${item.key}" data-highlight-key="${item.key}" aria-pressed="${state.highlight===item.key}"><i></i>${item.label}</button>`).join('')}<button class="trace-reset" data-highlight-key="none">Ver todo</button></div>`:''}<div class="derivation-stage ${step.figure?'with-figure':''}">${step.figure?`<div class="derivation-figure">${typeof step.figure==='function'?step.figure(state):step.figure}</div>`:''}<div class="derivation-working">${typeof step.body==='function'?step.body(state):step.body}</div></div>${step.check?`<div class="derivation-check"><strong>Comprobación</strong><span>${step.check}</span></div>`:''}</section>`;
  }
  function highlight(host,key) {
    host.querySelectorAll('[data-trace]').forEach(el=>{el.classList.toggle('trace-muted',!!key&&!el.dataset.trace.split(' ').includes(key));el.classList.toggle('trace-selected',!!key&&el.dataset.trace.split(' ').includes(key));});
    host.querySelectorAll('[data-highlight-key]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.highlightKey===key)));
  }
  function handleClick(target) {
    const host=target.closest('[data-derivation]'); if(!host)return false;
    const id=host.dataset.derivation, definition=registry[id], state=getState(id);if(!definition)return false;
    if(target.hasAttribute('data-derivation-step')){if(!state.all)state.step=Number(target.dataset.derivationStep);}
    else if(target.dataset.derivationAction==='next')state.step=Math.min(state.step+1,definition.steps.length-1);
    else if(target.dataset.derivationAction==='previous')state.step=Math.max(state.step-1,0);
    else if(target.dataset.derivationAction==='all')state.all=!state.all;
    else if(target.dataset.highlightKey){state.highlight=target.dataset.highlightKey==='none'?null:state.highlight===target.dataset.highlightKey?null:target.dataset.highlightKey;highlight(host,state.highlight);onStateChange(id,state);return true;}
    else return false;
    render(host);onStateChange(id,state);return true;
  }
  return { render, handleClick, getState };
}
