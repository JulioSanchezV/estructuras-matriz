/**
 * Pure Euler–Bernoulli educational mathematics, original derivation.
 * Local convention: v up, theta=dv/dx counterclockwise.
 * M=EI v'', V=EI v''' (V downward on the +x cut face).
 * Nodal actions applied TO element: [V(0), -M(0), -V(L), M(L)].
 * Consistent units required; rotations in rad. No distributed load.
 */
function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and > 0`);
}
function displacementVector(d) {
  if (!Array.isArray(d) || d.length !== 4 || !d.every(Number.isFinite)) {
    throw new TypeError('d must be four finite numbers: [v1, theta1, v2, theta2]');
  }
}

export function beamStiffness(L, EI) {
  positive(L, 'L'); positive(EI, 'EI');
  const a = 12 * EI / L ** 3;
  const b = 6 * EI / L ** 2;
  const c = 4 * EI / L;
  const e = 2 * EI / L;
  const K=[[a,b,-a,b],[b,c,-b,e],[-a,-b,a,-b],[b,e,-b,c]];
  if(!K.flat().every(Number.isFinite)||a<=0||c<=0)throw new RangeError('Beam stiffness exceeds numerical range');
  return K;
}

export function beamResponse(d, L, EI, x) {
  displacementVector(d); positive(L, 'L'); positive(EI, 'EI');
  if (!Number.isFinite(x) || x < 0 || x > L) throw new RangeError('x must be in [0,L]');
  const [v1, t1, v2, t2] = d;
  // v'''=C1; v''=C1*x+C2; v'=C1*x^2/2+C2*x+C3; v=C1*x^3/6+C2*x^2/2+C3*x+C4.
  const C1 = 12 * (v1 - v2) / L ** 3 + 6 * (t1 + t2) / L ** 2;
  const C2 = 6 * (v2 - v1) / L ** 2 - (4 * t1 + 2 * t2) / L;
  const C3 = t1;
  const C4 = v1;
  const v = ((C1 * x / 6 + C2 / 2) * x + C3) * x + C4;
  const theta = (C1 * x / 2 + C2) * x + C3;
  const curvature = C1 * x + C2;
  const M = EI * curvature;
  const V = EI * C1;
  const nodal = [V, -EI*C2, -V, EI*(C1*L+C2)];
  if(![v,theta,curvature,M,V,...nodal,C1,C2,C3,C4].every(Number.isFinite))throw new RangeError('Beam response exceeds numerical range');
  return { x, xi:x/L, v, theta, curvature, M, V, nodal, constants:[C1,C2,C3,C4] };
}

/** gdl is zero-based: 0=v1, 1=theta1, 2=v2, 3=theta2. */
export function beamMode(gdl, xi, L=1, EI=1, amplitude=1) {
  if (!Number.isInteger(gdl) || gdl < 0 || gdl > 3) throw new RangeError('gdl must be 0,1,2,3');
  if (!Number.isFinite(xi) || xi < 0 || xi > 1) throw new RangeError('xi must be in [0,1]');
  if (!Number.isFinite(amplitude)) throw new TypeError('amplitude must be finite');
  const d = [0,0,0,0];
  d[gdl] = amplitude;
  return {...beamResponse(d,L,EI,xi*L), d, gdl, amplitude};
}

/**
 * Exact cubic Bezier, not a visual approximation.
 * verticalScale is screen pixels per length unit; positive v is screen-up.
 * Choose a common scale to compare physical magnitudes, or explicitly label
 * individual normalization as "Deformación amplificada. Escala vertical independiente".
 */
export function beamSVGPath(d, L, {x0=50, y0=150, width=600, verticalScale=100}={}) {
  displacementVector(d); positive(L,'L'); positive(width,'width'); positive(verticalScale,'verticalScale');
  if (![x0,y0].every(Number.isFinite)) throw new TypeError('x0,y0 must be finite');
  const [v1,t1,v2,t2] = d;
  const screenY = v => {const y=y0-verticalScale*v;if(!Number.isFinite(y))throw new RangeError('Beam SVG exceeds numerical range');return y;};
  return `M ${x0} ${screenY(v1)} C ${x0+width/3} ${screenY(v1+L*t1/3)}, ${x0+2*width/3} ${screenY(v2-L*t2/3)}, ${x0+width} ${screenY(v2)}`;
}

function matVec(K,d) { return K.map(row => row.reduce((s,k,j)=>s+k*d[j],0)); }
function near(a,b,label,tol=2e-10) {
  if (Math.abs(a-b) > tol * Math.max(1,Math.abs(a),Math.abs(b))) {
    throw new Error(`${label}: got ${a}, expected ${b}`);
  }
}
export function runBeamChecks() {
  let checks=0;
  const check=(a,b,label)=>{near(a,b,label);checks++;};
  for (const L of [0.7,1,4,11.3]) for (const EI of [1,234.5,20000]) {
    const K=beamStiffness(L,EI);
    for(let i=0;i<4;i++) for(let j=0;j<4;j++) check(K[i][j],K[j][i],'symmetry');
    for(let j=0;j<4;j++) {
      const amplitude=(j%2===0 ? 0.001 : 0.002);
      const left=beamMode(j,0,L,EI,amplitude);
      const right=beamMode(j,1,L,EI,amplitude);
      const boundary=[left.v,left.theta,right.v,right.theta];
      boundary.forEach((b,i)=>check(b,i===j?amplitude:0,'prescribed boundary'));
      left.nodal.forEach((q,i)=>check(q,K[i][j]*amplitude,'column from tractions'));
      const [F1,M1,F2,M2]=left.nodal;
      check(F1+F2,0,'force equilibrium');
      check(M1+M2+F2*L,0,'moment equilibrium');
    }
    // Exactly rigid movements (no curvature).
    for(const d of [[0.002,0,0.002,0],[0,0.001,L*0.001,0.001]]) {
      matVec(K,d).forEach(q=>check(q,0,'rigid-body null mode'));
      for(const xi of [0,0.37,1]) check(beamResponse(d,L,EI,xi*L).curvature,0,'rigid curvature');
    }
    for(let n=0;n<20;n++) {
      // Deterministic arbitrary mixed states; no random test flakiness.
      const d=Array.from({length:4},(_,j)=>0.003*Math.sin((n+1)*(j+1)*1.7));
      const qK=matVec(K,d);
      const result=beamResponse(d,L,EI,0.41*L);
      result.nodal.forEach((q,i)=>check(q,qK[i],'general action superposition'));
      const Unodal=0.5*d.reduce((sum,di,i)=>sum+di*qK[i],0);
      // Three-point Gauss integration independent of closed form energy.
      const r=Math.sqrt(3/5), pts=[-r,0,r], weights=[5/9,8/9,5/9];
      const Uintegral=0.5*EI*(L/2)*pts.reduce((sum,p,i)=>{
        const curv=beamResponse(d,L,EI,(p+1)*L/2).curvature;
        return sum+weights[i]*curv*curv;
      },0);
      check(Unodal,Uintegral,'energy equality');
      if(Unodal < -1e-12) throw new Error('negative strain energy');
      checks++;
    }
  }
  const expected=[[3750,7500,-3750,7500],[7500,20000,-7500,10000],[-3750,-7500,3750,-7500],[7500,10000,-7500,20000]];
  beamStiffness(4,20000).forEach((row,i)=>row.forEach((v,j)=>check(v,expected[i][j],'numeric worked example')));
  check(beamMode(1,1/3).v,4/27,'mode 2 positive maximum');
  check(beamMode(3,2/3).v,-4/27,'mode 4 negative minimum');
  for(const gdl of [0,1,2,3]) {
    const d=[0,0,0,0];d[gdl]=1;
    // Check exact Bezier formula at sample positions against the polynomial.
    const [v1,t1,v2,t2]=d, L=2.3;
    const B=[v1,v1+L*t1/3,v2-L*t2/3,v2];
    for(const t of [0,0.1,0.31,0.5,0.9,1]) {
      const bv=(1-t)**3*B[0]+3*(1-t)**2*t*B[1]+3*(1-t)*t*t*B[2]+t**3*B[3];
      check(bv,beamResponse(d,L,1,t*L).v,'SVG Bezier exactness');
    }
  }
  return {passed:true, checks, cases:'12 parameter combinations; all four modes; 240 mixed states; symmetry, boundary conditions, nodal traction signs, equilibrium, rigid modes, energy and exact SVG cubic'};
}
