export const dot2 = (a,b) => a[0]*b[0]+a[1]*b[1];
export const add2 = (a,b) => [a[0]+b[0],a[1]+b[1]];
export const scale2 = (a,t) => [t*a[0],t*a[1]];
export const norm2 = a => Math.hypot(a[0],a[1]);
export function angle2(a,b){const m=norm2(a)*norm2(b);return m===0?null:Math.acos(Math.max(-1,Math.min(1,dot2(a,b)/m)));}
export function project2(a,b){const denominator=dot2(b,b);return denominator===0?null:scale2(b,dot2(a,b)/denominator);}
export function rotateBasis2(a,angle){const c=Math.cos(angle),s=Math.sin(angle);return [c*a[0]+s*a[1],-s*a[0]+c*a[1]];}
