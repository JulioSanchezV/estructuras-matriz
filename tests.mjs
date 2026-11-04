import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { springChain, bar2D, barPlanar, beam4, frame6, solveLinear, matVec, multiply, transpose } from './math.mjs';
import { chapters, exercises } from './content.mjs';
import { beamPhysicalStates } from './beam-states.mjs';
import { ROUTES, sectionsForChapter, resolveLocation } from './routes.mjs';
import { parseVal, judge, parsePastedGrid } from './bank-validation.mjs';
import { runBeamChecks } from './beam-math.mjs';
import { dot2,project2,angle2,rotateBasis2,norm2 } from './vector-math.mjs';
let checks = 0;
function near(actual, expected, tolerance = 1e-9) { checks++; assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`); }
function symmetric(m){m.forEach((row,i)=>row.forEach((v,j)=>near(v,m[j][i])));}
function throws(fn){checks++;assert.throws(fn);}
const base=springChain([600,200],[50,20]);
assert.deepEqual(base.K,[[600,-600,0],[-600,800,-200],[0,-200,200]]);checks++;
assert.deepEqual(base.reduced,[[800,-200],[-200,200]]);checks++;
base.u.forEach((u,i)=>near(u,[0,7/60,13/60][i]));near(base.reaction,-70);near(base.elementForces[0],70);near(base.elementForces[1],20);near(base.energy,61/12);
let seed=20261102;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
for(let trial=0;trial<250;trial++){
 const count=trial%2+2,ks=Array.from({length:count},()=>10+random()*10000),loads=Array.from({length:count},()=>-200+random()*400),r=springChain(ks,loads);
 symmetric(r.K);r.K.forEach(row=>near(row.reduce((a,b)=>a+b,0),0,1e-8));near(r.reaction,-loads.reduce((a,b)=>a+b,0));
 let u=0;r.elementForces.forEach((n,i)=>{const expected=loads.slice(i).reduce((a,b)=>a+b,0);near(n,expected);u+=expected/ks[i];near(r.u[i+1],u);});
 r.residual.slice(1).forEach(v=>near(v,0,1e-8));near(r.energy,.5*r.u.slice(1).reduce((sum,v,i)=>sum+v*loads[i],0));
}
for(const angle of [0,1,15,30,45,89,90,120,135,179,180]){
 const r=bar2D(200000000,.002,2,angle);near(r.k,200000);symmetric(r.global);
 const identity=multiply(r.T,transpose(r.T));identity.forEach((row,i)=>row.forEach((v,j)=>near(v,i===j?1:0)));
 matVec(r.global,[1,2,1,2]).forEach(v=>near(v,0,1e-8));
 const u=[.001,-.002,.003,.001],localU=matVec(r.T,u),fg=matVec(r.global,u),fl=matVec(r.local,localU);
 near(u.reduce((sum,v,i)=>sum+v*fg[i],0),localU.reduce((sum,v,i)=>sum+v*fl[i],0));
}
const a0=bar2D(200000000,.002,2,0),a90=bar2D(200000000,.002,2,90),a45=bar2D(200000000,.002,2,45);
near(a0.global[0][0],200000);near(a0.global[1][1],0);near(a90.global[0][0],0);near(a90.global[1][1],200000);near(a45.global[0][1],100000);
const b=beam4(200000000,.00004,2);symmetric(b);const v=solveLinear(b.slice(2).map(r=>r.slice(2)),[-10,0]);near(v[0],-1/300);near(v[1],-.0025);
const f=frame6(200000000,.002,.00004,2,35);symmetric(f.local);symmetric(f.global);matVec(f.global,[1,2,0,1,2,0]).forEach(v=>near(v,0,1e-7));
const swapped=solveLinear([[0,2],[1,3]],[4,7]);near(swapped[0],1);near(swapped[1],2);
throws(()=>springChain([0,200],[50,20]));throws(()=>springChain([-5,200],[50,20]));throws(()=>springChain([600,200],[NaN,20]));throws(()=>springChain([600],[10]));throws(()=>solveLinear([[1,1],[1,1]],[1,1]));throws(()=>solveLinear([[1]],[Infinity]));throws(()=>bar2D(0,.002,2,45));throws(()=>bar2D(200000000,.002,0,45));throws(()=>bar2D(200000000,.002,2,181));throws(()=>bar2D(1e308,2,1,45));throws(()=>bar2D(1e-300,1e-300,1,45));throws(()=>beam4(1e308,1,1));throws(()=>springChain([1e110,1e110],[1e220,1e220]));
const original=springChain([600,200],[50,-20],2);
near(original.u[0],exercises[1].answer);near(original.u[1],.15);near(original.reaction,-30);near(original.elementForces[0],exercises[2].answer);near(original.elementForces[1],-30);near(original.energy,13/3);
near(exercises[3].answer,-10);near(exercises[4].answer,50*Math.sqrt(2));near(exercises[5].answer,-30/6480);near(exercises[6].answer,30);
for(const angle of [0,30,45,90,135,180]){const full=barPlanar(200000000,.002,2,angle),axial=bar2D(200000000,.002,2,angle),identity=multiply(transpose(full.T),full.T);identity.forEach((row,i)=>row.forEach((v,j)=>near(v,i===j?1:0)));full.global.forEach((row,i)=>row.forEach((v,j)=>near(v,axial.global[i][j])));}
const ids=new Set();chapters.forEach(chapter=>{checks++;assert.ok(!ids.has(chapter.id));ids.add(chapter.id);const sectionIds=chapter.sections.map(s=>s.id);checks++;assert.equal(new Set(sectionIds).size,sectionIds.length);if(chapter.orderApply){checks++;assert.deepEqual([...chapter.orderApply].sort(),[...sectionIds].sort());}chapter.sections.forEach(s=>{checks++;assert.ok(s.body && s.understand && s.apply);});});
const index=readFileSync(new URL('./index.html',import.meta.url),'utf8');for(const match of index.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)){checks++;assert.ok(existsSync(fileURLToPath(new URL(match[1],import.meta.url))),match[1]);}
for(const chapter of chapters)for(const section of chapter.sections)for(const match of section.body.matchAll(/href="(\.\/[^"#]+)"/g)){checks++;assert.ok(existsSync(fileURLToPath(new URL(match[1],import.meta.url))),match[1]);}
// CSV formulas contain quoted semicolons. Parse, rather than split, those cells.
const csvRows=readFileSync(new URL('./assets/plantilla-resortes.csv',import.meta.url),'utf8').trimEnd().split(/\r?\n/);
const csv=csvRows.map(row=>{const cells=[];let cell='',quoted=false;for(let i=0;i<row.length;i++){const c=row[i];if(c==='"'){if(quoted&&row[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===';'&&!quoted){cells.push(cell);cell='';}else cell+=c;}cells.push(cell);return cells;});
checks++;assert.equal(csv[11][1],'=MMULT(MINVERSA(B8:C9);E8:E9)');checks++;assert.ok(!csv[12][1]);checks++;assert.equal(csv[14][1],'=-B3*B13');
for(const chapter of chapters)for(const route of ROUTES){const selected=sectionsForChapter(chapter,route);checks++;assert.ok(selected.length);checks++;assert.equal(selected.length,chapter.routes[route].length);checks++;assert.equal(new Set(selected.map(s=>s.id)).size,selected.length);for(const section of selected){checks++;assert.equal(resolveLocation(chapters,`#${chapter.id}/${section.id}?ruta=${route}`).route,route);}}
const beamChapter=chapters.find(c=>c.id==='vigas'),transformChapter=chapters.find(c=>c.id==='transformacion'),springChapter=chapters.find(c=>c.id==='resortes'),loadChapter=chapters.find(c=>c.id==='cargas');
checks++;assert.ok(!sectionsForChapter(beamChapter,'apply').some(s=>s.id==='deduccion'));
checks++;assert.ok(sectionsForChapter(beamChapter,'understand').some(s=>s.id==='deduccion'));
checks++;assert.ok(sectionsForChapter(loadChapter,'understand').some(s=>s.id==='particion-general'));
checks++;assert.ok(!sectionsForChapter(transformChapter,'apply').some(s=>s.id==='algebra-particion'));
for(const id of ['algebra-producto','algebra-transpuesta','algebra-inversa']){checks++;assert.ok(sectionsForChapter(springChapter,'understand').findIndex(s=>s.id===id)<sectionsForChapter(springChapter,'understand').findIndex(s=>s.id==='ensamble'));checks++;assert.equal(resolveLocation(chapters,`#transformacion/${id}`).chapter,'resortes');}
checks++;assert.equal(resolveLocation(chapters,'#transformacion/algebra-particion').chapter,'cargas');
checks++;assert.equal(resolveLocation(chapters,'#transformacion/algebra-particion').route,'understand');
checks++;assert.ok(chapters.indexOf(transformChapter)<chapters.findIndex(c=>c.id==='axial'));
checks++;assert.equal(resolveLocation(chapters,'#vigas/deduccion','apply').route,'understand');
checks++;assert.deepEqual(resolveLocation(chapters,'#invalid/missing?ruta=invalid'),{chapter:'inicio',route:'apply',step:0});
for(const chapter of chapters)for(const section of chapter.sections)for(const match of section.body.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)){if(/^(?:https?:|mailto:)/.test(match[1]))continue;checks++;assert.ok(existsSync(fileURLToPath(new URL(match[1].split('?')[0],import.meta.url))),match[1]);}
// Additional solved beams: loading through fixed-end forces, not sign shortcuts.
const loadedK=beam4(30400,1,6),fixedEnd=[2350/27,1000/9,1700/27,-800/9];
const thetaJ=-fixedEnd[3]/loadedK[3][3];near(thetaJ,1/228);
const loadedForces=matVec(loadedK,[0,0,0,thetaJ]).map((v,i)=>v+fixedEnd[i]);
loadedForces.forEach((v,i)=>near(v,[2950/27,1400/9,1100/27,0][i]));
const K6=Array.from({length:6},()=>Array(6).fill(0));for(const ids of [[0,1,2,3],[2,3,4,5]]){const kb=beam4(1,1,2);ids.forEach((r,i)=>ids.forEach((c,j)=>K6[r][c]+=kb[i][j]));}
const free=[1,3,4,5],db=solveLinear(free.map(i=>free.map(j=>K6[i][j])),[0,0,-5,0]);db.forEach((v,i)=>near(v,[10/3,-20/3,-80/3,-50/3][i]));
const dfull=[0,db[0],0,db[1],db[2],db[3]],fb=matVec(K6,dfull);near(fb[0],-5);near(fb[2],10);
// Nonzero support movement and an applied support load must not disappear.
const Knn=10,Kna=-10,Kan=-10,Kaa=10,Fn=3,Fan=-4,FFn=2,FFa=-2,da=.2;
const dn=(Fn-FFn-Kna*da)/Knn,Ra=FFa+Kan*dn+Kaa*da-Fan;
near(FFn+Knn*dn+Kna*da,Fn);near(FFa+Kan*dn+Kaa*da,Fan+Ra);
near(parseVal('-2^2'),-4);near(parseVal('sqrt(2)^2'),2);near(parseVal('0,25'),.25);
checks++;assert.ok(Number.isNaN(parseVal('1 2')));checks++;assert.ok(Number.isNaN(parseVal('1/*2*/+3')));
checks++;assert.ok(!judge(0,{ans:[[.1078402943]],unit:'kN·m',tolAbs:.3203533223},0,0).ok);
checks++;assert.ok(judge(.10784,{ans:[[.1078402943]],unit:'kN·m'},0,0).ok);
checks++;assert.deepEqual(parsePastedGrid('\t2\n3\t4'),[['','2'],['3','4']]);
const physical=beamPhysicalStates();checks++;assert.equal((physical.match(/<svg /g)||[]).length,4);checks++;assert.ok(!/NaN|Infinity/.test(physical));
const beamChecks=runBeamChecks();assert.ok(beamChecks.passed);checks+=beamChecks.checks;
near(dot2([3,0],[0,4]),0);near(angle2([3,0],[0,4]),Math.PI/2);near(norm2(rotateBasis2([3,4],.7)),5);assert.deepEqual(project2([3,4],[1,0]),[3,0]);checks++;assert.equal(project2([3,4],[0,0]),null);checks++;
console.log(`PASS: ${checks} checks, 250 deterministic spring chains, transforms, beam/frame kernels, all 6 exercises, content routes and asset links.`);
