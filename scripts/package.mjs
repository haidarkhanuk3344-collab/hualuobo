import {packager} from '@electron/packager';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readManifest,assertOriginalManifest} from './windows-manifest.mjs';

const root=process.cwd();
const platform=process.argv[2]||'darwin';
const arch=process.argv[3]||(platform==='win32'?'x64':'arm64');
if(!['darwin','win32'].includes(platform))throw new Error(`Unsupported delivery platform: ${platform}`);
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const product=platform==='win32'?'花萝卜':'花萝卜素材桌宠';
const electronVersion='38.8.6';
const stage=await fs.mkdtemp(path.join(os.tmpdir(),'hualuobo-package-'));
const exists=async file=>fs.access(file).then(()=>true,()=>false);

async function cachedElectronZip(){
  if(process.env.HUALUOBO_ELECTRON_ZIP_DIR)return process.env.HUALUOBO_ELECTRON_ZIP_DIR;
  const cache=path.join(os.homedir(),'Library','Caches','electron');
  const zip=`electron-v${electronVersion}-${platform}-${arch}.zip`;
  if(await exists(path.join(cache,zip)))return cache;
  for(const entry of await fs.readdir(cache,{withFileTypes:true}).catch(()=>[])){
    if(entry.isDirectory()&&await exists(path.join(cache,entry.name,zip)))return path.join(cache,entry.name);
  }
}

try{
  // Stage a runtime-only tree, excluding native sources and prior releases.
  for(const dir of ['dist','dist-electron'])await fs.cp(path.join(root,dir),path.join(stage,dir),{recursive:true});
  await fs.cp(path.join(root,'assets'),path.join(stage,'assets'),{
    recursive:true,
    filter:source=>!path.relative(path.join(root,'assets'),source).split(path.sep).includes('reference'),
  });
  await fs.mkdir(path.join(stage,'native','bin'),{recursive:true});
  const helper=platform==='win32'?'desktop-targets-win.exe':'desktop-targets.node';
  await fs.copyFile(path.join(root,'native','bin',helper),path.join(stage,'native','bin',helper));
  await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({
    name:pkg.name,productName:product,version:pkg.version,main:pkg.main,
    description:pkg.description,license:pkg.license,author:pkg.author,
  },null,2)+'\n');
  const ico=path.join(root,'assets','app','app.ico');
  const icns=path.join(root,'assets','app','app.icns');
  if(platform==='win32')await fs.access(ico);
  let originalManifest;
  const products=await packager({
    afterExtract:platform==='win32'?[async({buildPath})=>{
      originalManifest=readManifest(await fs.readFile(path.join(buildPath,'electron.exe')));
    }]:undefined,
    afterComplete:platform==='win32'?[async({buildPath})=>{
      assertOriginalManifest(await fs.readFile(path.join(buildPath,`${product}.exe`)),originalManifest);
    }]:undefined,
    dir:stage,out:path.join(root,'release',platform==='darwin'?'mac':'windows'),
    overwrite:true,platform,arch,name:product,appBundleId:'com.hualuobo.multiviewsprite',
    appVersion:pkg.version,buildVersion:pkg.version,electronVersion,
    electronZipDir:await cachedElectronZip(),asar:false,prune:false,
    icon:platform==='win32'?ico:await exists(icns)?icns:undefined,
    appCopyright:'Copyright © 2026 Hualuobo',
    extendInfo:platform==='darwin'?{NSAccessibilityUsageDescription:'读取桌面及 Dock 图标位置，供小猫靠近、碰撞、趴在图标上和拍爪互动。'}:undefined,
    win32metadata:platform==='win32'?{
      CompanyName:'Hualuobo',FileDescription:'花萝卜桌面猫咪',ProductName:'花萝卜',
      InternalName:'Hualuobo',OriginalFilename:`${product}.exe`,
      // Electron already uses asInvoker. Packager 19.1.1's manifest rewrite
      // stores the whole Buffer backing slab, corrupting the activation context.
      // Leave the original manifest intact and compare exact bytes after packing.
    }:undefined,
  });
  console.log(JSON.stringify({version:pkg.version,platform,arch,products},null,2));
}finally{
  await fs.rm(stage,{recursive:true,force:true});
}
