import fs from 'node:fs/promises';
import path from 'node:path';
import type {Preferences} from '../shared';

export const DEFAULT_PREFERENCES:Readonly<Preferences>={size:100,iconsEnabled:true,launchAtLogin:false};
export function patchPreferences(current:Preferences,patch:unknown):Preferences{
 const next={...current};
 if(!patch||typeof patch!=='object'||Array.isArray(patch))return next;
 const p=patch as Record<string,unknown>;
 if(typeof p.size==='number'&&Number.isFinite(p.size))next.size=Math.round(Math.max(70,Math.min(120,p.size)));
 if(typeof p.iconsEnabled==='boolean')next.iconsEnabled=p.iconsEnabled;
 if(typeof p.launchAtLogin==='boolean')next.launchAtLogin=p.launchAtLogin;
 return next;
}
/** Keep the operating-system login item and the saved preference in agreement. */
export async function persistPreferences(current:Preferences,patch:unknown,save:(p:Preferences)=>Promise<void>,setLogin:(enabled:boolean)=>void){
 const next=patchPreferences(current,patch),changed=next.launchAtLogin!==current.launchAtLogin;
 if(changed)setLogin(next.launchAtLogin);
 try{await save(next);}catch(error){if(changed)setLogin(current.launchAtLogin);throw error;}
 return next;
}
export class PreferencesStore{
 private queue:Promise<void>=Promise.resolve();
 constructor(private file:string){}
 async read():Promise<Preferences>{try{return patchPreferences({...DEFAULT_PREFERENCES},JSON.parse(await fs.readFile(this.file,'utf8')));}catch{return{...DEFAULT_PREFERENCES};}}
 save(value:Preferences):Promise<void>{
  const clean=patchPreferences({...DEFAULT_PREFERENCES},value);
  const operation=this.queue.catch(()=>{}).then(async()=>{
   await fs.mkdir(path.dirname(this.file),{recursive:true});
   const temp=this.file+'.tmp';
   await fs.writeFile(temp,JSON.stringify(clean,null,2)+'\n','utf8');
   await fs.rename(temp,this.file);
  });
  this.queue=operation;return operation;
 }
 async flush(){await this.queue;}
}
