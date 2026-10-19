import {spawn as nodeSpawn} from 'node:child_process';
import type {ChildProcess, SpawnOptions} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import type {DesktopObject} from '../shared';

/** UI Automation and Win32 return physical pixels. Convert in Electron's main process. */
export type WindowsTargetBatch = {
  status:'ready'|'unavailable';
  targets:DesktopObject[];
  coordinateSpace:'physical';
  readOnly:true;
  reason?:string;
};
export type WindowsTargetSpawn = (file:string,args:string[],options:SpawnOptions)=>ChildProcess;
type ReaderOptions = {
  executablePath:string;
  parentPid?:number;
  onState:(state:WindowsTargetBatch)=>void;
  spawn?:WindowsTargetSpawn;
  /** Test seams; production uses a 5 second heartbeat and capped restart backoff. */
  staleAfterMs?:number;
  retryBaseMs?:number;
};
const MAX_LINE = 1024*1024;
const unavailable = (reason:string):WindowsTargetBatch=>({status:'unavailable',targets:[],coordinateSpace:'physical',readOnly:true,reason});

export function parseWindowsTargetBatch(line:string):WindowsTargetBatch {
  if(line.length>MAX_LINE)throw new Error('oversized-line');
  const value=JSON.parse(line);
  if(!value||value.coordinateSpace!=='physical'||value.readOnly!==true||!['ready','unavailable'].includes(value.status)||!Array.isArray(value.targets)||value.targets.length>2048)throw new Error('invalid-batch');
  if(value.status==='unavailable')return unavailable(typeof value.reason==='string'?value.reason.slice(0,120):'provider-unavailable');
  const ids=new Set<string>();const targets:DesktopObject[]=[];
  for(const o of value.targets){
    const b=o?.bounds;
    if(!o||o.kind!=='desktop'||typeof o.id!=='string'||!o.id.startsWith('desktop:')||o.id.length>4096||typeof o.name!=='string'||!o.name.trim()||o.name.length>1024||!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||Math.abs(b.x)>1000000||Math.abs(b.y)>1000000||b.width<16||b.height<16||b.width>1024||b.height>1024||ids.has(o.id))throw new Error('invalid-target');
    ids.add(o.id);targets.push({id:o.id,kind:'desktop',name:o.name,bounds:{x:b.x,y:b.y,width:b.width,height:b.height}});
  }
  return {status:'ready',targets,coordinateSpace:'physical',readOnly:true};
}

/** One supervised, hidden helper. Failed / stale reads clear supports immediately. */
export class WindowsTargetsReader {
  private child:ChildProcess|null=null;
  private running=false;
  private retry:ReturnType<typeof setTimeout>|null=null;
  private watchdog:ReturnType<typeof setTimeout>|null=null;
  private failureCount=0;
  private readonly spawn:WindowsTargetSpawn;
  constructor(private readonly options:ReaderOptions){this.spawn=options.spawn??nodeSpawn;}
  start(){if(this.running)return;this.running=true;this.failureCount=0;this.launch();}
  stop(){
    this.running=false;
    if(this.retry)clearTimeout(this.retry);this.retry=null;
    if(this.watchdog)clearTimeout(this.watchdog);this.watchdog=null;
    const child=this.child;this.child=null;child?.kill();
  }
  private launch(){
    if(!this.running)return;
    let child:ChildProcess;
    try{
      const pid=this.options.parentPid??process.pid;
      child=this.spawn(this.options.executablePath,['--parent-pid',String(pid),'--ignore-pid',String(pid)],{windowsHide:true,stdio:['ignore','pipe','pipe'],detached:false});
    }catch{this.options.onState(unavailable('helper-start-failed'));this.scheduleRetry();return;}
    this.child=child;
    const decoder=new StringDecoder('utf8');let pending='';let failed=false;
    const fail=(reason:string)=>{
      if(failed||this.child!==child)return;failed=true;this.child=null;
      if(this.watchdog)clearTimeout(this.watchdog);this.watchdog=null;
      child.kill();
      if(this.running){this.options.onState(unavailable(reason));this.scheduleRetry();}
    };
    const arm=()=>{
      if(this.watchdog)clearTimeout(this.watchdog);
      this.watchdog=setTimeout(()=>fail('helper-timeout'),this.options.staleAfterMs??5000);
      this.watchdog.unref?.();
    };
    child.stdout?.on('data',(data:Buffer)=>{
      if(this.child!==child||failed||!this.running)return;
      pending+=decoder.write(data);
      let end:number;
      while((end=pending.indexOf('\n'))>=0){
        if(this.child!==child||failed||!this.running)return;
        const line=pending.slice(0,end).trim();pending=pending.slice(end+1);
        if(!line)continue;
        let batch:WindowsTargetBatch;
        try{batch=parseWindowsTargetBatch(line);}
        catch{fail('helper-invalid-output');return;}
        this.options.onState(batch);this.failureCount=0;
        if(this.child===child&&this.running)arm();
      }
      if(pending.length>MAX_LINE)fail('helper-output-overflow');
    });
    child.stdout?.on('error',()=>fail('helper-output-error'));
    // Drain diagnostics without retaining arbitrary output or user-visible icon names.
    child.stderr?.on('data',()=>{});
    child.stderr?.on('error',()=>fail('helper-output-error'));
    child.on('error',()=>fail('helper-start-failed'));
    child.on('close',()=>fail('helper-exited'));
    arm();
  }
  private scheduleRetry(){
    if(!this.running||this.retry)return;
    const delay=Math.min(15000,(this.options.retryBaseMs??900)*2**Math.min(4,this.failureCount++));
    this.retry=setTimeout(()=>{this.retry=null;this.launch();},delay);this.retry.unref?.();
  }
}
