import {renderReview} from './vista.mjs';
const button=document.querySelector('#show-example'), picker=document.querySelector('#example-kind');
const host=document.querySelector('#review-result'), status=document.querySelector('#review-message');let samples;
button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='Abriendo la muestra…';
  try {
    if(!samples){const response=await fetch(new URL('./muestras.json',import.meta.url));if(!response.ok)throw Error();samples=await response.json();}
    renderReview(host,samples[picker.value]);status.textContent='Muestra ficticia revisada por el simulador.';
  }catch{status.textContent='No se pudo abrir la muestra. Puede reintentar.';}finally{button.disabled=false;}
});
