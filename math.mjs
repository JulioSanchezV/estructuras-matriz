/** Small, transparent numerical kernel. Units: kN, m, rad unless stated otherwise. */
export const zeros = (r, c = r) => Array.from({ length: r }, () => Array(c).fill(0));
export const transpose = a => a[0].map((_, j) => a.map(row => row[j]));
export const multiply = (a, b) => {
  if (!a.length || !b.length || a[0].length !== b.length) throw new Error('Dimensiones incompatibles.');
  return a.map(row => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
};
export const matVec = (a, x) => a.map(row => row.reduce((s, v, j) => s + v * x[j], 0));
function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} debe ser un número mayor que cero.`);
}
export function solveLinear(matrix, rhs) {
  const n = matrix.length;
  if (!n || rhs.length !== n || matrix.some(row => row.length !== n)) throw new Error('El sistema debe ser cuadrado.');
  if (![...matrix.flat(), ...rhs].every(Number.isFinite)) throw new Error('Hay valores no finitos en el sistema.');
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  const scale = Math.max(...matrix.flat().map(Math.abs));
  if (!scale) throw new Error('Matriz singular: revise apoyos y conectividad.');
  for (let p = 0; p < n; p++) {
    let pivot = p;
    for (let i = p + 1; i < n; i++) if (Math.abs(a[i][p]) > Math.abs(a[pivot][p])) pivot = i;
    if (Math.abs(a[pivot][p]) < 1e-12 * scale) throw new Error('Sistema singular o mal condicionado. Revise apoyos y rigideces.');
    [a[p], a[pivot]] = [a[pivot], a[p]];
    for (let i = p + 1; i < n; i++) {
      const f = a[i][p] / a[p][p];
      for (let j = p; j <= n; j++) a[i][j] -= f * a[p][j];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let r = a[i][n];
    for (let j = i + 1; j < n; j++) r -= a[i][j] * x[j];
    x[i] = r / a[i][i];
  }
  if (!x.every(Number.isFinite)) throw new Error('El resultado excede la precisión disponible.');
  return x;
}
export function springChain(stiffnesses, freeLoads, fixedNode = 0) {
  if (![2, 3].includes(stiffnesses.length) || freeLoads.length !== stiffnesses.length) throw new Error('Use dos o tres resortes y una carga por nodo libre.');
  stiffnesses.forEach((k, i) => positive(k, `k${i + 1}`));
  if (!freeLoads.every(Number.isFinite)) throw new Error('Las cargas deben ser números finitos.');
  const n = stiffnesses.length + 1;
  if (!Number.isInteger(fixedNode) || fixedNode < 0 || fixedNode >= n) throw new Error('El índice del apoyo no es válido.');
  const K = zeros(n), contributions = [];
  stiffnesses.forEach((k, e) => {
    const contribution = zeros(n);
    [[e,e,k],[e,e+1,-k],[e+1,e,-k],[e+1,e+1,k]].forEach(([i,j,v]) => { K[i][j] += v; contribution[i][j] = v; });
    contributions.push(contribution);
  });
  const free = Array.from({length:n},(_,i)=>i).filter(i=>i!==fixedNode);
  const reduced = free.map(i=>free.map(j=>K[i][j]));
  const freeU = solveLinear(reduced, freeLoads);
  const u = Array(n).fill(0), F = Array(n).fill(0);
  free.forEach((i,j)=>{u[i]=freeU[j];F[i]=freeLoads[j];});
  const residual = matVec(K, u).map((v, i) => v - F[i]);
  const elementForces = stiffnesses.map((k, e) => k * (u[e + 1] - u[e]));
  const elementVectors = elementForces.map(n => [-n, n]);
  const energy = .5 * u.reduce((s, v, i) => s + v * matVec(K, u)[i], 0);
  if (![...residual, ...elementForces, energy].every(Number.isFinite)) throw new Error('Las entradas exceden el rango numérico; reduzca su magnitud.');
  const forceScale = Math.max(1, ...F.map(Math.abs), ...elementForces.map(Math.abs));
  if (Math.max(...free.map(i=>Math.abs(residual[i]))) > 1e-8 * forceScale) throw new Error('La precisión numérica no es suficiente para verificar el equilibrio. Revise las rigideces.');
  return { K, contributions, reduced, u, F, residual, reaction: residual[fixedNode], fixedNode, free, elementForces, elementVectors, energy };
}
export function bar2D(E, A, L, angleDegrees) {
  positive(E, 'E'); positive(A, 'A'); positive(L, 'L');
  if (!Number.isFinite(angleDegrees) || angleDegrees < 0 || angleDegrees > 180) throw new Error('El ángulo debe estar entre 0° y 180°.');
  const angle = angleDegrees * Math.PI / 180;
  const clean = n => Math.abs(n) < 1e-14 ? 0 : n;
  const c = clean(Math.cos(angle)), s = clean(Math.sin(angle)), k = E * A / L;
  positive(k, 'La rigidez EA/L calculada');
  const T = [[c, s, 0, 0], [0, 0, c, s]], local = [[k, -k], [-k, k]];
  const global = multiply(multiply(transpose(T), local), T);
  if (!global.flat().every(Number.isFinite)) throw new Error('La matriz transformada excede el rango numérico.');
  return { c, s, k, T, local, global };
}
export function beam4(E, I, L) {
  positive(E, 'E'); positive(I, 'I'); positive(L, 'L');
  const r = [[12,6*L,-12,6*L],[6*L,4*L*L,-6*L,2*L*L],[-12,-6*L,12,-6*L],[6*L,2*L*L,-6*L,4*L*L]];
  const factor = E * I / L ** 3;
  positive(factor, 'La rigidez EI/L³ calculada');
  const result = r.map(row => row.map(v => factor * v));
  if (!result.flat().every(Number.isFinite)) throw new Error('La matriz de viga excede el rango numérico.');
  return result;
}
export function frame6(E, A, I, L, angleDegrees = 0) {
  const axial = bar2D(E, A, L, angleDegrees), b = beam4(E, I, L), local = zeros(6);
  local[0][0] = local[3][3] = axial.k; local[0][3] = local[3][0] = -axial.k;
  const ids = [1,2,4,5]; ids.forEach((i, a) => ids.forEach((j, z) => local[i][j] = b[a][z]));
  const {c,s} = axial;
  const T = [[c,s,0,0,0,0],[-s,c,0,0,0,0],[0,0,1,0,0,0],[0,0,0,c,s,0],[0,0,0,-s,c,0],[0,0,0,0,0,1]];
  const global = multiply(multiply(transpose(T),local),T);
  if (!global.flat().every(Number.isFinite)) throw new Error('La matriz de pórtico excede el rango numérico.');
  return {local,T,global};
}
/** Source-course convention: barred quantities local, unbarred global; full planar rotation. */
export function barPlanar(E,A,L,phiDegrees){
  const axial=bar2D(E,A,L,phiDegrees),{c,s,k}=axial;
  const T=[[c,s,0,0],[-s,c,0,0],[0,0,c,s],[0,0,-s,c]];
  const local=[[k,0,-k,0],[0,0,0,0],[-k,0,k,0],[0,0,0,0]];
  const global=multiply(multiply(transpose(T),local),T);
  if(!global.flat().every(Number.isFinite))throw new Error('La matriz transformada excede el rango numérico.');
  return {c,s,k,T,local,global,axialT:axial.T,axialLocal:axial.local};
}
