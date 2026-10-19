import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {readManifest,validateManifest} from './windows-manifest.mjs';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const toolsRoot=process.env.HUALUOBO_WINDOWS_TOOLS_DIR||path.join(os.tmpdir(),'hualuobo-windows-tools');
const nsisVersion='3.0.5.0';
const nsisSHA256='44755ffcf6401ef358369fa80fb4351d7d0d649d8d3deda39a8d29035cbb9747';
const nsisRoot=process.env.HUALUOBO_NSIS_DIR||path.join(toolsRoot,`nsis-${nsisVersion}`);
const nsisSource=`https://github.com/electron-userland/electron-builder-binaries/releases/tag/nsis-${nsisVersion}`;
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const exists=async file=>fs.access(file).then(()=>true,()=>false);
const run=(file,args,options={})=>execFileSync(file,args,{stdio:'inherit',...options});

async function prepareSevenZip(){
  const exe=process.env.HUALUOBO_7ZZ||path.join(toolsRoot,'7zip-full','7zz');
  if(await exists(exe))return exe;
  if(process.platform!=='darwin')throw new Error('Set HUALUOBO_7ZZ to the official 7-Zip executable for this build host');
  const dir=path.dirname(exe);
  await fs.mkdir(dir,{recursive:true});
  const archive=path.join(dir,'7z2604-mac.tar.xz');
  if(!await exists(archive))run('gh',['release','download','26.04','--repo','ip7z/7zip','--pattern',path.basename(archive),'--dir',dir]);
  if(sha(await fs.readFile(archive))!=='bee04358cbcbc7106273cee0e8d72916db2696c48067a3538c34d8cd6fd16578')throw new Error('7-Zip archive checksum mismatch');
  run('tar',['-xf',archive,'-C',dir]);
  await fs.chmod(exe,0o755);
  return exe;
}

async function prepareNSIS(){
  const exe=path.join(nsisRoot,process.platform==='darwin'?'mac':process.platform==='win32'?'Bin':'linux',process.platform==='win32'?'makensis.exe':'makensis');
  if(!await exists(exe)){
    await fs.mkdir(nsisRoot,{recursive:true});
    const archive=path.join(nsisRoot,`nsis-${nsisVersion}.7z`);
    if(!await exists(archive))run('gh',['release','download',`nsis-${nsisVersion}`,'--repo','electron-userland/electron-builder-binaries','--pattern',path.basename(archive),'--dir',nsisRoot]);
    if(sha(await fs.readFile(archive))!==nsisSHA256)throw new Error('NSIS archive checksum mismatch');
    run('tar',['-xf',archive,'-C',nsisRoot]);
    if(process.platform!=='win32')await fs.chmod(exe,0o755);
  }
  run(exe,['-VERSION'],{env:{...process.env,NSISDIR:nsisRoot}});
  return exe;
}

const makensis=await prepareNSIS();
const sevenZip=await prepareSevenZip();
if(process.argv.includes('--prepare-tools')){
  console.log(JSON.stringify({makensis,sevenZip,nsisRoot,nsisSource,archiveSHA256:nsisSHA256},null,2));
  process.exit(0);
}
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const appDir=path.join(root,'release','windows','花萝卜-win32-x64');
const releaseDir=path.join(root,'release','windows-installer');
const evidenceDir=path.join(root,'artifacts','v'+pkg.version.replaceAll('.',''),'windows-installer');
await fs.mkdir(releaseDir,{recursive:true});
await fs.mkdir(evidenceDir,{recursive:true});
const output=path.join(releaseDir,`花萝卜-${pkg.version}-Windows-x64-Setup.exe`);
const buildOutput=path.join(evidenceDir,`花萝卜-${pkg.version}-Windows-x64-Setup.pending.exe`);
const runtime=path.join(appDir,'resources','app');
const stagedPkg=JSON.parse(await fs.readFile(path.join(runtime,'package.json'),'utf8'));
if(stagedPkg.version!==pkg.version)throw new Error('Windows app is stale; run package:windows after the unified build');
const runtimeHashes=[];
for(const f of ['dist/main.js','dist/index.html','dist/settings.html','dist-electron/main.cjs','dist-electron/preload.cjs','native/bin/desktop-targets-win.exe','assets/app/app.ico']){
  const source=await fs.readFile(path.join(root,f));
  const packaged=await fs.readFile(path.join(runtime,f));
  if(sha(source)!==sha(packaged))throw new Error(`Stale packaged runtime: ${f}`);
  runtimeHashes.push({file:f,match:true,sha256:sha(packaged)});
}

async function inventory(dir,prefix=''){
  const files=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const relative=prefix?`${prefix}/${entry.name}`:entry.name;
    if(entry.isSymbolicLink())throw new Error(`Unexpected symlink in Windows payload: ${relative}`);
    if(entry.isDirectory())files.push(...await inventory(path.join(dir,entry.name),relative));
    else if(entry.isFile())files.push({path:relative,size:(await fs.stat(path.join(dir,entry.name))).size});
  }
  return files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
const files=await inventory(appDir);
for(const f of files){
  if(/(^|\/)(node_modules|src|scripts|tests|docs|artifacts|archive|reference)(\/|$)/.test(f.path)||/\.node$/.test(f.path)||f.path==='resources/app/native/bin/desktop-targets')throw new Error(`Non-Windows/development file in delivery: ${f.path}`);
}

function pe(buffer){
  if(buffer.toString('ascii',0,2)!=='MZ')throw new Error('Not a PE executable');
  const header=buffer.readUInt32LE(0x3c);
  if(buffer.toString('ascii',header,header+4)!=='PE\0\0')throw new Error('Invalid PE header');
  const machine=buffer.readUInt16LE(header+4),count=buffer.readUInt16LE(header+6);
  const optional=header+24,optionalSize=buffer.readUInt16LE(header+20);
  const magic=buffer.readUInt16LE(optional);
  const sections=[];
  for(let i=0;i<count;i++){
    const s=optional+optionalSize+i*40;
    sections.push({rva:buffer.readUInt32LE(s+12),size:Math.max(buffer.readUInt32LE(s+8),buffer.readUInt32LE(s+16)),offset:buffer.readUInt32LE(s+20)});
  }
  const offset=rva=>{const section=sections.find(s=>rva>=s.rva&&rva<s.rva+s.size);if(!section)throw new Error(`Invalid resource RVA ${rva}`);return section.offset+rva-section.rva;};
  const resourceRva=buffer.readUInt32LE(optional+(magic===0x20b?112:96)+16);
  const icons=[],manifests=[];
  if(resourceRva){
    const base=offset(resourceRva);
    function visit(at,depth,type){
      const size=buffer.readUInt16LE(at+12)+buffer.readUInt16LE(at+14);
      for(let i=0;i<size;i++){
        const entry=at+16+i*8,id=buffer.readUInt32LE(entry),value=buffer.readUInt32LE(entry+4);
        const kind=depth===0?id:type;
        if(value&0x80000000)visit(base+(value&0x7fffffff),depth+1,kind);
        else if(kind===3||kind===24){
          const d=base+value,start=offset(buffer.readUInt32LE(d));
          const data=buffer.subarray(start,start+buffer.readUInt32LE(d+4));
          if(kind===3)icons.push(data);else manifests.push(data.toString('utf8'));
        }
      }
    }
    visit(base,0,0);
  }
  return {machine,icons,manifests};
}
const iconFile=await fs.readFile(path.join(root,'assets','app','app.ico'));
if(iconFile.readUInt16LE(0)!==0||iconFile.readUInt16LE(2)!==1)throw new Error('Invalid app.ico');
const iconImages=[];
for(let i=0;i<iconFile.readUInt16LE(4);i++){
  const e=6+i*16,bytes=iconFile.readUInt32LE(e+8),start=iconFile.readUInt32LE(e+12);
  iconImages.push(iconFile.subarray(start,start+bytes));
}
const appManifest=readManifest(await fs.readFile(path.join(appDir,'花萝卜.exe')));
await fs.writeFile(path.join(evidenceDir,'app.manifest'),appManifest);
const appPE=pe(await fs.readFile(path.join(appDir,'花萝卜.exe')));
const helperPE=pe(await fs.readFile(path.join(runtime,'native','bin','desktop-targets-win.exe')));
if(appPE.machine!==0x8664||helperPE.machine!==0x8664)throw new Error('Windows app/helper must both be x64 PE');
if(!appPE.icons.some(image=>iconImages.some(expected=>image.equals(expected))))throw new Error('Application executable does not contain the Hualuobo icon');
if(!appPE.manifests.some(xml=>xml.includes('asInvoker')))throw new Error('Windows app manifest is not current-user/asInvoker');

const directories=[...new Set(files.flatMap(f=>{const parents=[];let d=path.posix.dirname(f.path);while(d!=='.'){parents.push(d);d=path.posix.dirname(d);}return parents;}))].sort((a,b)=>b.split('/').length-a.split('/').length);
const escapeNSIS=s=>s.replaceAll('$','$$').replaceAll('"','$\\"');
const uninstallInclude=path.join(evidenceDir,'uninstall-files.nsh');
const uninstallText=files.map(f=>`Delete "$INSTDIR\\${escapeNSIS(f.path.replaceAll('/','\\'))}"`).concat(directories.map(d=>`RMDir "$INSTDIR\\${escapeNSIS(d.replaceAll('/','\\'))}"`)).join('\n')+'\n';
await fs.writeFile(uninstallInclude,uninstallText,'utf8');
const size=files.reduce((n,f)=>n+f.size,0);
const args=[
  '-INPUTCHARSET','UTF8',`-DAPP_VERSION=${pkg.version}`,`-DVERSION_QUAD=${pkg.version}.0`,
  `-DAPP_DIR=${appDir}`,`-DAPP_ICON=${path.join(root,'assets','app','app.ico')}`,
  `-DOUTPUT_FILE=${buildOutput}`,`-DUNINSTALL_FILES=${uninstallInclude}`,`-DAPP_SIZE_KB=${Math.ceil(size/1024)}`,
  path.join(root,'scripts','windows-installer.nsi'),
];
const buildLog=execFileSync(makensis,args,{env:{...process.env,NSISDIR:nsisRoot},encoding:'utf8',maxBuffer:12*1024*1024});
await fs.writeFile(path.join(evidenceDir,'nsis-build.log'),buildLog);
const installerPE=pe(await fs.readFile(buildOutput));
for(const manifest of installerPE.manifests)validateManifest(Buffer.from(manifest));
if(installerPE.machine!==0x14c)throw new Error('Unexpected installer bootstrap architecture');
if(!installerPE.manifests.some(xml=>xml.includes('asInvoker')))throw new Error('Installer must not require administrator privileges');
if(!installerPE.icons.some(image=>iconImages.some(expected=>image.equals(expected))))throw new Error('Installer does not contain the Hualuobo icon');

// Extracts without executing any Windows program or touching the desktop.
const extracted=path.join(evidenceDir,'extracted');
await fs.rm(extracted,{recursive:true,force:true});
await fs.mkdir(extracted,{recursive:true});
const listing=execFileSync(sevenZip,['l','-slt',buildOutput],{encoding:'utf8',maxBuffer:20*1024*1024});
await fs.writeFile(path.join(evidenceDir,'archive-listing.txt'),listing);
execFileSync(sevenZip,['x','-y',`-o${extracted}`,buildOutput],{stdio:'pipe',maxBuffer:4*1024*1024});
const extractedFiles=await inventory(extracted);
const uninstaller=extractedFiles.find(f=>f.path==='卸载花萝卜.exe'||f.path.endsWith('/卸载花萝卜.exe'));
if(!uninstaller)throw new Error('Installer does not include its uninstaller');
if(pe(await fs.readFile(path.join(extracted,uninstaller.path))).machine!==0x14c)throw new Error('Invalid extracted uninstaller executable');
let checked=0;
for(const f of files){
  const candidate=extractedFiles.find(e=>e.path===f.path||e.path.endsWith('/'+f.path));
  if(!candidate)throw new Error(`Missing installer payload file: ${f.path}`);
  if(sha(await fs.readFile(path.join(appDir,f.path)))!==sha(await fs.readFile(path.join(extracted,candidate.path))))throw new Error(`Installer payload hash mismatch: ${f.path}`);
  checked++;
}
const exeHash=sha(await fs.readFile(buildOutput));
for(const expected of runtimeHashes){
  if(sha(await fs.readFile(path.join(root,expected.file)))!==expected.sha256)throw new Error(`Runtime changed during compression; rebuild the Windows app: ${expected.file}`);
}
// Publish only a fully extracted and hash-checked setup; interrupted compression
// can never leave a misleading partial installer in the friends' delivery folder.
await fs.rename(buildOutput,output);
await fs.writeFile(path.join(releaseDir,'SHA256SUMS.txt'),`${exeHash}  ${path.basename(output)}\n`);
const readme=`花萝卜 ${pkg.version} · Windows 内测安装版\r\n\r\n适用：Windows 10 / 11，64 位（x64）。\r\n本版已按确认的控制面板草图实现，启动时花萝卜默认收起。\r\n\r\n1. 双击“${path.basename(output)}”，按向导安装，无需管理员权限。\r\n2. 从桌面或开始菜单打开花萝卜，在控制面板点击“放出花萝卜”。\r\n3. 连续双击猫咪身体打开操作菜单；再次打开快捷方式也可找回面板。\r\n4. 猫咪大小可调为 70%–120%，面板可暂停、收起猫咪或退出应用。\r\n5. Windows 图标互动范围为桌面上的文件、文件夹和快捷方式。\r\n6. 从 Windows“设置 → 应用”卸载，或使用开始菜单中的“卸载花萝卜”。\r\n\r\n安装位置：%LOCALAPPDATA%\\Programs\\Hualuobo\r\n个人设置：%APPDATA%\\HualuoboMultiviewSprite，卸载时保留；开机启动项会移除。\r\n\r\n本包为未签名内测包，Windows 可能显示来源提示。请核对来源与随附 SHA256SUMS.txt，无需关闭系统安全功能。\r\n制作环境未配备 Windows 虚拟机。已完成安装包解包比对、猫咪图标及 x64 可执行文件检查；实际安装、运行、桌面互动和卸载仍待 Windows 电脑验证。\r\n`;
await fs.writeFile(path.join(releaseDir,'给朋友的使用说明.txt'),'\ufeff'+readme,'utf8');
const report={
  version:pkg.version,platform:'win32',arch:'x64',installer:output,sha256:exeHash,
  installerBytes:(await fs.stat(output)).size,payloadBytes:size,payloadFiles:files.length,
  verifiedExtractedFiles:checked,actualCatIconEmbedded:true,installerCatIconEmbedded:true,
  appPEMachine:'AMD64',helperPEMachine:'AMD64',uninstallerPEVerified:true,
  userInstall:true,administratorRequired:false,registryScope:'HKCU',
  shortcuts:['current-user desktop','current-user Start Menu','uninstaller'],
  userDataPath:'%APPDATA%\\HualuoboMultiviewSprite',uninstallKeepsSettings:true,
  uninstallRemovesLoginItem:'HKCU Run and StartupApproved/Run: Hualuobo',
  excluded:['macOS native .node','native source','node_modules','history','test/development files'],
  manifestXMLValidated:true,appManifestBytes:appManifest.length,
  staticChecksPassed:true,windowsInstallRunUninstallTested:false,
  limitation:'No Wine or Windows VM is available; no Windows runtime pass is claimed.',
  nsis:{version:nsisVersion,source:nsisSource,archiveSHA256:nsisSHA256},
  extractionTool:{version:'26.04',source:'https://github.com/ip7z/7zip/releases/tag/26.04',archiveSHA256:'bee04358cbcbc7106273cee0e8d72916db2696c48067a3538c34d8cd6fd16578'},
};
await fs.writeFile(path.join(evidenceDir,'verification.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(evidenceDir,'payload-files.json'),JSON.stringify(files,null,2)+'\n');
await fs.writeFile(path.join(evidenceDir,'runtime-hashes.json'),JSON.stringify(runtimeHashes,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
