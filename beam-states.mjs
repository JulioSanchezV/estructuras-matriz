/** Physical unit-movement sketches, without integration steps. */
import { beamMode, beamSVGPath } from './beam-math.mjs';
export function beamPhysicalStates() {
 const labels=['vᵢ = Δ','θᵢ = ψ','vⱼ = Δ','θⱼ = ψ'];
 const colors=['#2463c8','#b04b3e','#267c62','#7c55a2'];
 return `<div class="beam-physical-states">${labels.map((label,gdl)=>{
  const d=[0,0,0,0];d[gdl]=1;
  const q=beamMode(gdl,0).nodal,scale=gdl%2?52/(4/27):52;
  const path=beamSVGPath(d,1,{x0:72,y0:103,width:230,verticalScale:scale});
  const arrow=(x,sign)=>`<path d="M${x} 104v${-sign*34}" stroke="${colors[gdl]}" stroke-width="2" marker-end="url(#bf-${gdl})"/>`;
  const moment=(x,sign)=>`<path d="M${x+13} 163 A13 13 0 1 ${sign>0?0:1} ${x-6.5} ${163+(sign>0?11.26:-11.26)}" fill="none" stroke="${colors[gdl]}" stroke-width="2" marker-end="url(#bf-${gdl})"/>`;
  return `<figure><figcaption><strong>Columna ${gdl+1}: ${label}</strong><br>Los otros tres movimientos son cero.</figcaption><svg viewBox="0 0 375 205" role="img" aria-label="${label} positivo; los demás movimientos son cero. Y i ${q[0]>0?'hacia arriba':'hacia abajo'}, Y j ${q[2]>0?'hacia arriba':'hacia abajo'}; momentos ${q[1]>0?'antihorarios':'horarios'}."><defs><marker id="bf-${gdl}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3 0 6Z" fill="${colors[gdl]}"/></marker></defs><path d="M72 103H302" stroke="#999" stroke-dasharray="5 4"/><path d="${path}" fill="none" stroke="${colors[gdl]}" stroke-width="3"/><circle cx="72" cy="${103-scale*d[0]}" r="4" fill="white" stroke="#222"/><circle cx="302" cy="${103-scale*d[2]}" r="4" fill="white" stroke="#222"/><text x="69" y="130">i</text><text x="299" y="130">j</text>${arrow(42,Math.sign(q[0]))}${arrow(332,Math.sign(q[2]))}<text x="12" y="${q[0]>0?58:155}" fill="${colors[gdl]}">Yᵢ</text><text x="341" y="${q[2]>0?58:155}" fill="${colors[gdl]}">Yⱼ</text>${moment(92,Math.sign(q[1]))}${moment(282,Math.sign(q[3]))}<text x="114" y="168" fill="${colors[gdl]}">Mᵢ</text><text x="243" y="168" fill="${colors[gdl]}">Mⱼ</text><text x="143" y="195" fill="#555">Acciones sobre el elemento</text></svg></figure>`;
 }).join('')}</div><p class="caption">Deformadas amplificadas con escala vertical independiente. Δ y ψ indican un desplazamiento y un giro positivos pequeños. Divida las acciones por el movimiento impuesto para obtener la columna de rigidez. Las flechas representan los signos de esas acciones.</p>`;
}
