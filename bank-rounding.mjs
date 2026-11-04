/** Precision diagnostics, never a replacement for strict answer validation.
 * The original generator runs unchanged. Bounds refer to FOUR significant
 * decimal digits in intermediate element data and final answers, not to
 * machine floating-point noise. All recovery sums have the output's unit.
 */
export const ROUNDING_DIGITS = 4;
const EPS = 5 * 10 ** -ROUNDING_DIGITS;
const zeros = (n,m=n) => Array.from({length:n},()=>Array(m).fill(0));
const abs = A => A.map(row=>row.map(Math.abs));
const mv = (A,x) => A.map(row=>row.reduce((sum,a,j)=>sum+a*x[j],0));
const mm = (A,B) => A.map(row=>B[0].map((_,j)=>row.reduce((sum,a,k)=>sum+a*B[k][j],0)));
const dotabs = (a,b) => a.reduce((sum,x,j)=>sum+Math.abs(x*b[j]),0);
const finalBound = (a,b) => (1+EPS)*b+EPS*Math.abs(a);
const scalarRadius = x => x===0 ? 0 : 0.5*10**(Math.floor(Math.log10(Math.abs(x)))-ROUNDING_DIGITS+1);

/** Attach diagnostics only to recovered quantities; geometry/properties/code/
 * stiffness inputs retain their original strict checking. Bounds do NOT say
 * that the student's work is correct. They identify a rounding-compatible
 * region and are not used if the perturbed system cannot be certified stable.
 */
export function generateWithRounding(MR, catalogEntry, rng) {
  let model=null, bar=null;
  const originalSolve=MR.assembleSolve, originalTruss=MR.trussElem;
  MR.assembleSolve=function(...args){const solution=originalSolve(...args);model={args,solution};return solution;};
  MR.trussElem=function(...args){bar=originalTruss(...args);return bar;};
  const tape=[];
  const tracked=Object.fromEntries(Object.entries(rng).map(([name,fn])=>[name,(...args)=>{
    const value=fn(...args);tape.push({name,value:JSON.parse(JSON.stringify(value))});return value;
  }]));
  let exercise;
  try { exercise=catalogEntry.gen(tracked); }
  finally { MR.assembleSolve=originalSolve;MR.trussElem=originalTruss; }
  try {
    const fields=Object.fromEntries(exercise.steps.flatMap(step=>step.fields).map(field=>[field.id,field]));
    if(catalogEntry.id==='barra'&&bar) annotateBar(fields,bar);
    else if(model&&catalogEntry.id!=='resortes'&&!annotateSystem(fields,model,MR,catalogEntry.id)) exercise.roundingDiagnostic='No se pudo acotar con seguridad la sensibilidad del sistema. Conserve más cifras y compruebe el equilibrio; no se amplía la aceptación de respuestas.';
    if(Object.values(fields).some(field=>field.rounding)) addRoundingEvidence(fields,MR,catalogEntry,tape);
  } catch { exercise.roundingDiagnostic='No se pudo acotar el redondeo: conserve más cifras y compruebe el equilibrio.'; }
  return exercise;
}
function attach(field, bounds, scales, source) {
  if(!field)return;
  field.rounding=field.ans.map((row,r)=>row.map((answer,c)=>({
    bound:finalBound(answer,Array.isArray(bounds[r])?bounds[r][c]:bounds[r]),
    scale:Array.isArray(scales[r])?scales[r][c]:scales[r],digits:ROUNDING_DIGITS,source,
    // Certified refers to the declared componentwise perturbation model,
    // not to the correctness of unknown student operations.
    certified:true
  })));
}
function annotateBar(fields,t) {
  const local=fields.dl.ans.map(row=>row[0]);
  const displacement=t.T[0].map((_,j)=>t.T.reduce((sum,row,i)=>sum+row[j]*local[i],0));
  const scale=t.T.map(row=>dotabs(row,displacement));
  attach(fields.dl,scale.map(s=>EPS*s),scale,'proyección de desplazamientos');
  const coeff=[-t.k*t.c,-t.k*t.s,t.k*t.c,t.k*t.s];
  const axialScale=dotabs(coeff,displacement);
  attach(fields.S,[((1+EPS)**2-1)*axialScale+EPS*(1+EPS)*t.k*(Math.abs(local[0])+Math.abs(local[2]))],[axialScale],'recuperación axial');
}
function annotateSystem(fields,{args,solution:s},MR,type) {
  const [nd,elements,Fnodal]=args;
  if(!s.pd||!s.dn)return;
  const dK=zeros(nd),df=Array(nd).fill(0),truss=type.startsWith('cercha');
  // A truss entry involves rounded k,c,s and then the entry itself: four
  // factors, worst relative bound (1+eps)^4-1. An exact zero stays zero.
  const trussRelative=(1+EPS)**4-1;
  for(const element of elements) element.code.forEach((gi,i)=>{
    df[gi]+=scalarRadius(element.FfG?.[i]||0);
    element.code.forEach((gj,j)=>{dK[gi][gj]+=truss?trussRelative*Math.abs(element.Kg[i][j]):scalarRadius(element.Kg[i][j]);});
  });
  const n=s.free.length,deltaK=s.free.map(i=>s.free.map(j=>dK[i][j]));
  const inverse=zeros(n);
  for(let j=0;j<n;j++){const col=MR.solve(s.Knn,Array.from({length:n},(_,i)=>i===j?1:0));col.forEach((v,i)=>inverse[i][j]=v);}
  const invAbs=abs(inverse),B=mm(invAbs,deltaK);
  const C=B.map((row,i)=>row.map((b,j)=>(i===j?1:0)-b));
  // For nonnegative B, a positive w with (I-B)w=1 certifies rho(B)<1.
  // Do not silently inflate tolerance for singular/ill-conditioned systems.
  const weights=MR.solve(C,Array(n).fill(1));
  if(weights.some(w=>!Number.isFinite(w)||w<=0)||mv(B,weights).some((v,i)=>v>=weights[i]))return;
  const perturbation=s.free.map((g,i)=>df[g]+deltaK[i].reduce((sum,k,j)=>sum+k*Math.abs(s.dn[j]),0));
  const b=MR.solve(C,mv(invAbs,perturbation));
  if(b.some(v=>!Number.isFinite(v)||v< -1e-12))return;
  const displacementBounds=Array(nd).fill(0),displacementScales=Array(nd).fill(0);
  const magnitudeScale=mv(invAbs,s.rhs.map(Math.abs));
  s.free.forEach((g,i)=>{displacementBounds[g]=finalBound(s.d[g],Math.max(0,b[i]));displacementScales[g]=magnitudeScale[i];});
  // Displacements are presented in mm for the frame; the solver uses m.
  if(fields.dn){
    const scaleFactor=i=>type==='portico'&&s.free[i]%3!==2?1000:1;
    attach(fields.dn,b.map((v,i)=>Math.max(0,v)*scaleFactor(i)),magnitudeScale.map((v,i)=>v*scaleFactor(i)),'sensibilidad del sistema de desplazamientos');
  }
  if(fields.R){
    const bounds=[],scales=[];
    for(const g of s.rest){
      bounds.push(df[g]+s.K[g].reduce((sum,k,j)=>sum+dK[g][j]*Math.abs(s.d[j])+(Math.abs(k)+dK[g][j])*displacementBounds[j],0));
      scales.push(Math.abs(s.Ff[g])+Math.abs(Fnodal[g])+dotabs(s.K[g],s.d));
    }
    attach(fields.R,bounds,scales,'recuperación de reacciones por sumandos');
  }
  if(truss&&fields.S){
    const bounds=[],scales=[];
    for(const element of elements){
      const coeff=[-element.k*element.c,-element.k*element.s,element.k*element.c,element.k*element.s];
      const coefficientRelative=(1+EPS)**2-1;
      bounds.push(coeff.reduce((sum,q,j)=>sum+coefficientRelative*Math.abs(q*s.d[element.code[j]])+(1+coefficientRelative)*Math.abs(q)*displacementBounds[element.code[j]],0));
      scales.push(coeff.reduce((sum,q,j)=>sum+Math.abs(q*s.d[element.code[j]]),0));
    }
    attach(fields.S,bounds,scales,'recuperación de fuerzas axiales');
  }
  // Moment recovery at the internal joint or beam ends uses the same
  // element action equation. No unrelated reaction sets its scale.
  if(type==='viga-continua'&&fields.M2){
    const pairs=[[elements[0],3],[elements[1],1]];
    const rows=pairs.map(([el,i])=>recover(el,i));attach(fields.M2,rows.map(x=>x.bound),rows.map(x=>x.scale),'recuperación de momentos de extremo');
  }
  if(type==='portico'&&fields.Mb){
    const beam=elements[1]; // horizontal beam: local/global axes coincide
    const rows=[2,5].map(i=>recover(beam,i));attach(fields.Mb,rows.map(x=>x.bound),rows.map(x=>x.scale),'recuperación de momentos de la viga');
  }
  return true;
  function recover(el,i){
    const row=el.Kg[i],fe=el.FfG?.[i]||0;
    return {bound:scalarRadius(fe)+row.reduce((sum,k,j)=>sum+scalarRadius(k)*Math.abs(s.d[el.code[j]])+(Math.abs(k)+scalarRadius(k))*displacementBounds[el.code[j]],0),scale:Math.abs(fe)+row.reduce((sum,k,j)=>sum+Math.abs(k*s.d[el.code[j]]),0)};
  }
}

/** A conservative interval may be much too broad near a mechanism. It is
 * NEVER sufficient evidence for an amber diagnosis. Require also proximity
 * to a concrete, reproducible rounding workflow with the SAME input draws.
 * This does not certify arbitrary student work: it explains a numerically
 * reproduced residual. No additional random draws or student data are sent.
 */
function addRoundingEvidence(fields,MR,catalogEntry,tape) {
  for(const digits of [4,5,6]) for(const stage of ['element-data','also-displacements']) {
    const round=x=>x===0?0:Number(x.toPrecision(digits));
    const vec=v=>v.map(round),mat=A=>A.map(vec);
    const originals=Object.fromEntries(['trussElem','beamK','fixedEnd','frameElem','assembleSolve','matvec'].map(key=>[key,MR[key]]));
    let cursor=0;
    const replay=Object.fromEntries(['next','int','pick','step','sign','nz'].map(name=>[name,()=>{
      const draw=tape[cursor++];if(!draw||draw.name!==name)throw new Error('rounding replay differs');
      return JSON.parse(JSON.stringify(draw.value));
    }]));
    try {
      MR.trussElem=(...args)=>{const t=originals.trussElem(...args);t.c=round(t.c);t.s=round(t.s);t.k=round(t.k);const {c,s,k}=t;
        t.T=[[c,s,0,0],[-s,c,0,0],[0,0,c,s],[0,0,-s,c]];const q=[-c,-s,c,s];
        t.Kg=q.map(a=>q.map(b=>round(k*a*b)));t.Kl=mat(t.Kl);return t;};
      MR.beamK=(...args)=>mat(originals.beamK(...args));
      MR.fixedEnd=(...args)=>vec(originals.fixedEnd(...args));
      MR.frameElem=(...args)=>{const t=originals.frameElem(...args);for(const key of ['Kl','T','Kg'])t[key]=mat(t[key]);for(const key of ['FfL','FfG'])t[key]=vec(t[key]);return t;};
      if(stage==='also-displacements'){
        MR.matvec=(...args)=>vec(originals.matvec(...args));
        MR.assembleSolve=(...args)=>{const s=originals.assembleSolve(...args);if(s.dn){s.d=vec(s.d);s.dn=vec(s.dn);const Kd=originals.matvec(s.K,s.d);s.Fa=s.rest.map(g=>Kd[g]+s.Ff[g]);s.R=s.rest.map((g,i)=>s.Fa[i]-args[2][g]);}return s;};
      }
      const approximate=catalogEntry.gen(replay);
      if(cursor!==tape.length)continue;
      for(const step of approximate.steps)for(const field of step.fields){
        const target=fields[field.id];if(!target?.rounding)continue;
        field.ans.forEach((row,r)=>row.forEach((value,c)=>{
          const info=target.rounding[r]?.[c];if(!info||!Number.isFinite(value))return;
          const sample=round(value),radius=sample===0?0:0.5*10**(Math.floor(Math.log10(Math.abs(sample)))-digits+1);
          (info.samples ||= []).push({value:sample,radius,digits,stage});
        }));
      }
    } catch { /* No replay evidence => never promote by the bound alone. */ }
    finally { for(const [key,fn] of Object.entries(originals))MR[key]=fn; }
  }
}
