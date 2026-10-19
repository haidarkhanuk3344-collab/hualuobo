import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {ChildProcess, SpawnOptions} from 'node:child_process';
import {WindowsTargetsReader,parseWindowsTargetBatch,type WindowsTargetBatch,type WindowsTargetSpawn} from '../src/electron/windowsTargets';

const icon={id:'desktop:155:42.2',kind:'desktop',name:'花萝卜的文件夹',bounds:{x:-1810,y:75,width:72,height:96}};
const batch=(targets:unknown[]=[icon])=>({status:'ready',coordinateSpace:'physical',readOnly:true,targets});
const line=(targets:unknown[]=[icon])=>JSON.stringify(batch(targets))+'\n';
const wait=(ms=15)=>new Promise(r=>setTimeout(r,ms));
async function until(check:()=>boolean){const end=Date.now()+1000;while(!check()){assert(Date.now()<end,'timed out waiting for supervised restart');await wait(5);}}
class FakeChild extends EventEmitter {
  stdout=new PassThrough();stderr=new PassThrough();killed=false;
  kill(){this.killed=true;this.emit('close',0,null);return true;}
}
function harness(extra:{staleAfterMs?:number,retryBaseMs?:number}={}){
  const children:FakeChild[]=[],states:WindowsTargetBatch[]=[],calls:{file:string,args:string[],options:SpawnOptions}[]=[];
  const spawn:WindowsTargetSpawn=(file,args,options)=>{calls.push({file,args,options});const child=new FakeChild();children.push(child);return child as unknown as ChildProcess;};
  const reader=new WindowsTargetsReader({executablePath:'C:\\Hualuobo\\desktop-targets-win.exe',parentPid:123,onState:s=>states.push(s),spawn,staleAfterMs:10000,retryBaseMs:1,...extra});
  reader.start();return {reader,children,states,calls};
}

test('physical batches preserve negative monitor coordinates and do not leak extra fields',()=>{
  const result=parseWindowsTargetBatch(JSON.stringify({...batch([{...icon,private:'not forwarded'}]),unneeded:'drop'}));
  assert.deepEqual(result,batch());
  assert.deepEqual(parseWindowsTargetBatch(JSON.stringify({...batch([]),status:'unavailable',reason:'explorer-restarting'})),{status:'unavailable',targets:[],coordinateSpace:'physical',readOnly:true,reason:'explorer-restarting'});
});
test('protocol rejects untrusted rectangles, duplicate IDs and wrong target/platform types',()=>{
  for(const value of [null,{},batch([{...icon,kind:'dock'}]),batch([icon,icon]),batch([{...icon,id:'window:1'}]),batch([{...icon,bounds:{...icon.bounds,width:-1}}]),batch([{...icon,bounds:{...icon.bounds,x:'0'}}]),{...batch(),coordinateSpace:'dip'},{...batch(),readOnly:false}])assert.throws(()=>parseWindowsTargetBatch(JSON.stringify(value)));
});
test('hidden child uses an explicit parent PID and only the private helper executable',()=>{
  const h=harness();h.reader.start();assert.equal(h.children.length,1);
  assert.deepEqual(h.calls[0].args,['--parent-pid','123','--ignore-pid','123']);assert.equal(h.calls[0].options.windowsHide,true);assert.equal(h.calls[0].options.detached,false);assert.deepEqual(h.calls[0].options.stdio,['ignore','pipe','pipe']);h.reader.stop();assert(h.children[0].killed);
});
test('NDJSON handles split UTF8 names and coalesced updates, including icon disappearance',()=>{
  const h=harness();const data=Buffer.from(line()+line([]));const nameStart=data.indexOf(Buffer.from('花'));h.children[0].stdout.write(data.subarray(0,nameStart+1));assert.equal(h.states.length,0);h.children[0].stdout.write(data.subarray(nameStart+1));assert.deepEqual(h.states.map(s=>s.targets),[[icon],[]]);h.reader.stop();
});
test('helper exit clears old support geometry and restarts instead of retaining stale icons',async()=>{
  const h=harness();h.children[0].stdout.write(line());h.children[0].emit('close',1,null);assert.equal(h.states.at(-1)?.status,'unavailable');assert.deepEqual(h.states.at(-1)?.targets,[]);await wait();assert.equal(h.children.length,2);h.children[1].stdout.write(line());assert.equal(h.states.at(-1)?.status,'ready');h.reader.stop();
});
test('malformed output kills and recovers a helper without accepting a partial scene',async()=>{
  const h=harness();h.children[0].stdout.write(line());h.children[0].stdout.write('{bad}\n');assert(h.children[0].killed);assert.equal(h.states.at(-1)?.reason,'helper-invalid-output');await wait();assert.equal(h.children.length,2);h.reader.stop();
});
test('a hung helper times out, clears icons and restarts without blocking the app',async()=>{
  const h=harness({staleAfterMs:15});h.children[0].stdout.write(line());await until(()=>h.children.length>=2);assert(h.children[0].killed);assert(h.states.some(s=>s.reason==='helper-timeout'&&s.targets.length===0));h.reader.stop();
});
test('stop cancels restarts and ignores late data from a previous helper',async()=>{
  const h=harness();const old=h.children[0];old.stdout.write(line());h.reader.stop();old.stdout.write(line([]));old.emit('error',new Error('late'));await wait();assert.equal(h.children.length,1);assert.equal(h.states.length,1);h.reader.start();assert.equal(h.children.length,2);old.stdout.write(line([]));assert.equal(h.states.length,1);h.reader.stop();
});
test('synchronous spawn failure is reported once and retry can be cancelled',async()=>{
  const states:WindowsTargetBatch[]=[];let calls=0;
  const reader=new WindowsTargetsReader({executablePath:'missing',spawn:()=>{calls++;throw new Error('ENOENT');},onState:s=>states.push(s),retryBaseMs:5});reader.start();assert.equal(states[0].reason,'helper-start-failed');reader.stop();await wait();assert.equal(calls,1);
});
test('Explorer unavailable and restored batches recover in the same process and clear all support',()=>{
  const h=harness();h.children[0].stdout.write(line());h.children[0].stdout.write(JSON.stringify({...batch(),status:'unavailable',reason:'desktop-provider-unavailable'})+'\n');h.children[0].stdout.write(line([]));
  assert.equal(h.children.length,1);assert.deepEqual(h.states.map(s=>[s.status,s.targets.length]),[['ready',1],['unavailable',0],['ready',0]]);h.reader.stop();
});
test('an unterminated oversized stream is bounded and clears the scene',()=>{
  const h=harness();h.children[0].stdout.write('a'.repeat(1024*1024+1));assert(h.children[0].killed);assert.equal(h.states.at(-1)?.reason,'helper-output-overflow');h.reader.stop();
});
test('a consumer stopping in a callback receives no more coalesced batches',()=>{
  const child=new FakeChild(),states:WindowsTargetBatch[]=[];
  const reader=new WindowsTargetsReader({executablePath:'test.exe',spawn:()=>child as unknown as ChildProcess,onState:s=>{states.push(s);reader.stop();}});reader.start();child.stdout.write(line()+line([]));assert.equal(states.length,1);assert(child.killed);
});
test('real Node spawn ENOENT becomes unavailable without an unhandled child error',async()=>{
  await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>{reader.stop();reject(new Error('missing-helper error was not reported'));},2000);
    const reader=new WindowsTargetsReader({executablePath:'/__hualuobo_missing_helper__/desktop-targets-win.exe',onState:s=>{
      try{assert.equal(s.status,'unavailable');assert.equal(s.reason,'helper-start-failed');assert.deepEqual(s.targets,[]);reader.stop();clearTimeout(timeout);resolve();}
      catch(e){reader.stop();clearTimeout(timeout);reject(e);}
    }});reader.start();
  });
});
