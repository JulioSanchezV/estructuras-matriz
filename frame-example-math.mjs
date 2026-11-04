/** Worked example 253. All calculations use kN, m and rad. No user data. */
import { frame6, zeros, transpose, matVec, solveLinear } from './math.mjs';

export const FRAME_EXAMPLE_DATA = Object.freeze({
  E: 19e6, w: 25,
  nodes: Object.freeze([[0, 3], [6, 3], [0, 0], [6, 0]]),
  beamA: .15, beamI: .003125, columnA: .09, columnI: .000675
});

/** The actions act ON the element; +local y and counterclockwise moments. */
export function frameSection(element, x) {
  if (!Number.isFinite(x) || x < 0 || x > element.L) throw new Error('La sección debe estar dentro del elemento.');
  const [Xi, Yi, Mi] = element.actions;
  return { x, S: -Xi, V: Yi - element.w * x, M: -Mi + Yi * x - element.w * x * x / 2 };
}

export function calculateFrameExample() {
  const {E, w, nodes, beamA, beamI, columnA, columnI} = FRAME_EXAMPLE_DATA;
  const definitions = [
    {id:'31', i:3, j:1, A:columnA, I:columnI, w:0},
    {id:'12', i:1, j:2, A:beamA, I:beamI, w},
    {id:'42', i:4, j:2, A:columnA, I:columnI, w:0}
  ];
  const K=zeros(12), FF=Array(12).fill(0);
  const elements=definitions.map(element => {
    const [xi,yi]=nodes[element.i-1], [xj,yj]=nodes[element.j-1];
    const dx=xj-xi,dy=yj-yi,L=Math.hypot(dx,dy),c=dx/L,s=dy/L;
    const {local,T,global}=frame6(E,element.A,element.I,L,Math.atan2(dy,dx)*180/Math.PI);
    const codes=[3*element.i-2,3*element.i-1,3*element.i,3*element.j-2,3*element.j-1,3*element.j];
    const indices=codes.map(n=>n-1);
    const fixed=[0,element.w*L/2,element.w*L*L/12,0,element.w*L/2,-element.w*L*L/12];
    const fixedGlobal=matVec(transpose(T),fixed);
    indices.forEach((row,a)=>{
      FF[row]+=fixedGlobal[a];
      indices.forEach((col,b)=>{K[row][col]+=global[a][b];});
    });
    return {...element,L,c,s,codes,indices,local,T,global,fixed,fixedGlobal,
      coefficients:[E*element.A/L,12*E*element.I/L**3,6*E*element.I/L**2,4*E*element.I/L,2*E*element.I/L]};
  });
  const Knn=K.slice(0,6).map(row=>row.slice(0,6));
  const Kan=K.slice(6).map(row=>row.slice(0,6));
  const FFn=FF.slice(0,6), Fn=Array(6).fill(0), da=Array(6).fill(0);
  const dn=solveLinear(Knn,Fn.map((load,i)=>load-FFn[i]));
  const delta=[...dn,...da], F=matVec(K,delta).map((value,i)=>value+FF[i]);
  for(const e of elements) {
    e.localDelta=matVec(e.T,e.indices.map(index=>delta[index]));
    e.actions=matVec(e.local,e.localDelta).map((value,i)=>value+e.fixed[i]);
    e.actionsGlobal=matVec(transpose(e.T),e.actions);
    e.ends=[frameSection(e,0),frameSection(e,e.L)];
    e.stationary=e.w!==0 && e.actions[1]/e.w>0 && e.actions[1]/e.w<e.L
      ? frameSection(e,e.actions[1]/e.w) : null;
  }
  const result={E,w,nodes,elements,K,Knn,Kan,FF,FFn,Fn,da,dn,delta,F,Fa:F.slice(6)};
  if (![...K.flat(),...delta,...F,...elements.flatMap(e=>e.actions)].every(Number.isFinite)) throw new Error('El cálculo del ejemplo no es finito.');
  return result;
}
