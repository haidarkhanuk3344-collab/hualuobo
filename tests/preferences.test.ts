import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DEFAULT_PREFERENCES,patchPreferences,persistPreferences,PreferencesStore} from '../src/electron/preferences';

test('preference IPC rejects wrong types and arbitrary data, and bounds display size',()=>{
 const base={...DEFAULT_PREFERENCES};
 assert.deepEqual(patchPreferences(base,{size:NaN,iconsEnabled:'false',launchAtLogin:1,path:'/tmp/a'}),base);
 assert.deepEqual(patchPreferences(base,{size:900,iconsEnabled:false,launchAtLogin:true}),{size:120,iconsEnabled:false,launchAtLogin:true});
 assert.equal(patchPreferences(base,{size:-10}).size,70);
 assert.deepEqual(base,DEFAULT_PREFERENCES);
});
test('settings survive concurrent saves, corrupt JSON and non-ASCII/space paths',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'花萝卜 settings '));
 try{
  const file=path.join(dir,'偏好.json'),store=new PreferencesStore(file);
  assert.deepEqual(await store.read(),DEFAULT_PREFERENCES);
  await fs.writeFile(file,'{broken');assert.deepEqual(await store.read(),DEFAULT_PREFERENCES);
  await Promise.all([store.save({size:80,iconsEnabled:true,launchAtLogin:false}),store.save({size:115,iconsEnabled:false,launchAtLogin:true})]);
  assert.deepEqual(await new PreferencesStore(file).read(),{size:115,iconsEnabled:false,launchAtLogin:true});
  assert.equal(await fs.stat(file+'.tmp').then(()=>true,()=>false),false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('a failed settings write rolls back the real OS startup item',async()=>{
 let osLogin=false;const before={...DEFAULT_PREFERENCES};
 await assert.rejects(persistPreferences(before,{launchAtLogin:true},async()=>{throw new Error('disk denied');},value=>{osLogin=value;}),/disk denied/);
 assert.equal(osLogin,false);assert.equal(before.launchAtLogin,false);
 const saved=await persistPreferences(before,{launchAtLogin:true},async()=>{},value=>{osLogin=value;});
 assert.equal(osLogin,true);assert.equal(saved.launchAtLogin,true);
});
