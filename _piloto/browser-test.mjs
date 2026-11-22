// Headless Chrome, only a loopback checkout and generated Office samples.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)), profile=await mkdtemp(join(tmpdir(),'estructuras-chrome-'));
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root)||path.includes('/.git/'))throw Error();const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const chrome=spawn(process.env.CHROME_PATH||'google-chrome',['--headless','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let id=0,buffer='',session;const pending=new Map(),pause=ms=>new Promise(r=>setTimeout(r,ms));
function failAll(error){for(const h of pending.values())h.reject(error);pending.clear();}
chrome.on('error',failAll);chrome.on('exit',()=>failAll(Error('Se cerró Chrome.')));
chrome.stdio[4].on('data',chunk=>{buffer+=chunk.toString();const m=buffer.split('\0');buffer=m.pop();for(const raw of m){if(!raw)continue;const msg=JSON.parse(raw),p=pending.get(msg.id);if(!p)continue;pending.delete(msg.id);if(msg.error)p.reject(Error(msg.error.message));else p.resolve(msg.result);}});
function cmd(method,params={},sid=session){return new Promise((accept,reject)=>{const i=++id,t=setTimeout(()=>{pending.delete(i);reject(Error('Tiempo de espera: '+method));},10000);pending.set(i,{resolve:v=>{clearTimeout(t);accept(v);},reject:e=>{clearTimeout(t);reject(e);}});chrome.stdio[3].write(JSON.stringify({id:i,method,params,...(sid?{sessionId:sid}:{})})+'\0');});}
async function ev(expression){const v=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(v.exceptionDetails)throw Error(v.exceptionDetails.exception?.description||v.exceptionDetails.text);return v.result.value;}
async function until(expression){for(let i=0;i<100;i++){try{const q=await ev(expression);if(q)return q;}catch{}await pause(60);}throw Error('No se alcanzó '+expression.slice(0,105));}
async function go(file,condition){await cmd('Page.navigate',{url:origin+'/'+file});await until('location.pathname==='+JSON.stringify('/'+file.split('#')[0])+'&&document.readyState==="complete"&&('+condition+')');}
const metrics=[];
try{
 const t=await cmd('Target.createTarget',{url:'about:blank'},null);session=(await cmd('Target.attachToTarget',{targetId:t.targetId,flatten:true},null)).sessionId;
 await cmd('Page.enable');await cmd('Runtime.enable');
 for(const width of [320,390,1280]){
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
  await go('index.html','document.querySelector(".course-cover h1")');assert.equal(await ev('document.querySelectorAll("#chapter-nav [data-chapter]").length'),8);
  await ev('document.querySelector(".course-nav a[href*=proyecto]").click()');await until('document.querySelector("#show-example")');
  const dimensions=await ev('({viewport:innerWidth,contenido:document.documentElement.scrollWidth})');metrics.push({width,...dimensions});assert.ok(dimensions.contenido<=width+1,JSON.stringify(dimensions));
  assert.equal(await ev('!!document.querySelector("#entregar button:disabled")&&!document.querySelector("input[type=file]")'),true);
  for(const fmt of ['docx','xlsx','pptx','empty']){await ev('document.querySelector("#example-kind").value='+JSON.stringify(fmt)+';document.querySelector("#show-example").click()');await until('document.querySelector("#review-result li")&&!document.querySelector("#show-example").disabled');assert.equal(await ev('document.querySelectorAll("#review-result li").length'),7);}
  if(process.env.ESTRUCTURAS_CAPTURAS){const dir=resolve(process.env.ESTRUCTURAS_CAPTURAS);await mkdir(dir,{recursive:true});await ev('scrollTo(0,0)');const png=await cmd('Page.captureScreenshot',{format:'png'});await writeFile(join(dir,'proyecto-'+width+'.png'),Buffer.from(png.data,'base64'));}
 }
 await go('banco.html#resortes','document.querySelector("input.cell")');
 await ev('let alias=document.querySelector("#alias");alias.value="PUENTE-LAB";alias.dispatchEvent(new Event("change",{bubbles:true}));let answer=document.querySelector("input.cell");answer.value="100";answer.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("[data-sheet-open]").click()');
 await until('document.querySelector("iframe.free-frame")?.contentWindow?.RigidezFreeGrid');
 await ev('window.fg=document.querySelector("iframe.free-frame").contentWindow.RigidezFreeGrid;fg.importBlock([["100","850"],["-100","950"]])');
 await until('Object.keys(localStorage).some(k=>k.startsWith("rigidez:hoja-libre:1:PUENTE-LAB:")&&!k.endsWith(":respaldo")&&localStorage[k].includes("950"))');
 await ev('window.bankKey=Object.keys(localStorage).find(k=>k.startsWith("rigidez:banco:v2:PUENTE-LAB:"));window.sheetKey=Object.keys(localStorage).find(k=>k.startsWith("rigidez:hoja-libre:1:PUENTE-LAB:")&&!k.endsWith(":respaldo"));window.beforeBank=localStorage.getItem(bankKey);window.beforeSheet=localStorage.getItem(sheetKey);document.querySelector("[data-free-action=reset]").click()');
 assert.ok(await ev('beforeBank&&beforeBank.includes("100")&&beforeSheet.includes("950")'));await until('!document.querySelector("[data-free-confirm]").hidden');
 await ev('document.querySelector("[data-free-action=confirm]").click()');await until('localStorage.getItem(sheetKey+":respaldo")===beforeSheet');
 assert.ok(await ev('localStorage.getItem(bankKey)===beforeBank&&!Object.keys(fg.getPayload().sheet.inputs).length'));
 await cmd('Page.reload');await until('document.readyState==="complete"&&document.querySelector("input.cell")?.value==="100"');
 assert.ok(await ev('Object.keys(localStorage).some(k=>k.endsWith(":respaldo")&&localStorage[k].includes("950"))'));
 await go('calculadora.html#ensamblaje','document.querySelector("#assemble")');await ev('document.querySelector("#assemble").click()');
 await until('document.querySelector("#assembly-result [data-cell]")');await ev('let c=document.querySelector("#assembly-result [data-cell]");c.focus();c.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));');
 assert.equal(await ev('document.activeElement.dataset.cell'),'0,1');
 console.log('Proyecto, hoja, respaldo, recarga, banco y teclado de matriz comprobados.',JSON.stringify(metrics));
}finally{chrome.kill();server.close();await pause(120);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
