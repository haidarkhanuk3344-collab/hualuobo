import {app,BrowserWindow,screen,ipcMain,Tray,Menu,nativeImage,globalShortcut,shell,systemPreferences} from 'electron';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {performance} from 'node:perf_hooks';
import type {DesktopInfo,Point,ObjectState,DesktopObject,AppState,Preferences} from '../shared';
import {PreferencesStore,DEFAULT_PREFERENCES,persistPreferences} from './preferences';
import {WindowsTargetsReader} from './windowsTargets';
const appOnly=process.argv.includes('--app-verify');
const menuOnly=process.argv.includes('--menu-verify');
const treeOnly=process.argv.includes('--tree-verify');
const motionOnly=process.argv.includes('--motion-verify');
const smoke=process.argv.includes('--smoke');const verify=process.argv.includes('--verify')||smoke||motionOnly||treeOnly||menuOnly||appOnly,probe=process.argv.includes('--probe');
app.setName('花萝卜');
if(process.platform==='win32')app.setAppUserModelId('com.hualuobo.desktop');
app.setPath('userData',process.env.HUALUOBO_USER_DATA||path.join(app.getPath('appData'),verify?'HualuoboMultiviewSprite-Verification':'HualuoboMultiviewSprite'));
const locked=app.requestSingleInstanceLock();let win:BrowserWindow,tray:Tray,settings:BrowserWindow|null=null,fixture:BrowserWindow|null=null;
let menuPointerFixture:Point|null=null;let petMenu:Menu|null=null,menuOpenCount=0;let quitting=false,finalExitCode=0;let timer:ReturnType<typeof setTimeout>,ignore=true,bodyHit=false,drag=false,last:any=null;const moveTimes:number[]=[];let moveCount=0,maskChanges=0;
let pendingObjects:Promise<string>|null=null;let objectTimer:ReturnType<typeof setTimeout>;let objectState:ObjectState={status:'unavailable',targets:[],enabled:true};
let windowsReader:WindowsTargetsReader|null=null,rendererReady=false,visible=verify&&!appOnly,paused=false,lastError:string|undefined;
let prefs:Preferences={...DEFAULT_PREFERENCES};const preferenceStore=new PreferencesStore(path.join(app.getPath('userData'),'preferences.json'));let preferenceQueue:Promise<unknown>=Promise.resolve();
const out=process.env.HUALUOBO_VERIFY_DIR||path.join(app.getPath('userData'),'verification');
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const iconPath=path.join(__dirname,'../assets/app',process.platform==='win32'?'app.ico':'app.png');
function state():AppState{return{...prefs,visible,paused,platform:process.platform,version:app.getVersion(),iconStatus:objectState.status,iconCount:objectState.targets.length,iconMessage:objectState.status==='permission-required'?'请在系统设置中允许读取图标位置。':objectState.status==='unavailable'?'正在查找桌面图标；桌面暂不可用时会自动重试。':objectState.status==='unsupported'?'此系统暂不支持桌面图标互动。':undefined,errorMessage:lastError};}
function broadcastState(){if(quitting)return;for(const w of BrowserWindow.getAllWindows())if(!w.isDestroyed())w.webContents.send('state',state());if(tray&&!tray.isDestroyed())tray.setContextMenu(menu());}
function sendObjects(){if(quitting)return;for(const w of BrowserWindow.getAllWindows())if(!w.isDestroyed())w.webContents.send('objects',objectState);broadcastState();}
function validTargets(targets:unknown,info:DesktopInfo):DesktopObject[]{
 const a=info.screenArea;
 return(Array.isArray(targets)?targets:[]).filter((o:any)=>o&&typeof o.id==='string'&&typeof o.name==='string'&&['desktop',...(process.platform==='darwin'?['dock']:[])].includes(o.kind)&&o.bounds&&[o.bounds.x,o.bounds.y,o.bounds.width,o.bounds.height].every(Number.isFinite)&&o.bounds.width>=16&&o.bounds.height>=16&&o.bounds.x+o.bounds.width/2>=a.x&&o.bounds.x+o.bounds.width/2<=a.x+a.width&&o.bounds.y+o.bounds.height/2>=a.y&&o.bounds.y+o.bounds.height/2<=a.y+a.height);
}
async function pollObjects(info:DesktopInfo){
 if(quitting)return;
 if(process.platform==='darwin'&&objectState.enabled){
  try{
   const native=require(path.join(__dirname,'../native/bin/desktop-targets.node')) as {getTargets:()=>Promise<string>};
   pendingObjects=native.getTargets();const result=JSON.parse(await pendingObjects.finally(()=>{pendingObjects=null;}));if(quitting)return;
   objectState={...objectState,status:result.status==='ready'?'ready':result.status==='permission-required'?'permission-required':'unavailable',targets:validTargets(result.targets,info)};
  }catch{objectState={...objectState,status:'unavailable',targets:[]};}
  if(probe)void fs.mkdir(out,{recursive:true}).then(()=>fs.writeFile(path.join(out,'objects-latest.json'),JSON.stringify({at:new Date().toISOString(),...objectState},null,2))).catch(()=>{});
  sendObjects();
 }
 if(!quitting)objectTimer=setTimeout(()=>void pollObjects(info),900);
}
function startObjectReader(info:DesktopInfo){
 if(process.platform==='win32'){
  windowsReader=new WindowsTargetsReader({executablePath:path.join(__dirname,'../native/bin/desktop-targets-win.exe'),parentPid:process.pid,onState:batch=>{
   if(quitting)return;
   const targets=batch.targets.map(o=>({...o,bounds:screen.screenToDipRect(null,{x:Math.round(o.bounds.x),y:Math.round(o.bounds.y),width:Math.round(o.bounds.width),height:Math.round(o.bounds.height)})}));
   objectState={...objectState,status:batch.status,targets:objectState.enabled?validTargets(targets,info):[]};sendObjects();
  }});windowsReader.start();
 }else if(process.platform==='darwin')void pollObjects(info);
 else{objectState={...objectState,status:'unsupported'};sendObjects();}
}
const menu=()=>Menu.buildFromTemplate([
 {label:'打开控制面板',click:()=>void panel()},
 {label:visible?'收起花萝卜':'放出花萝卜',click:()=>setPetVisible(!visible)},
 {label:paused?'继续活动':'暂停活动',enabled:visible,click:()=>command('pause')},
 {label:'回到屏幕中央',enabled:visible,click:()=>command('center')},
 {label:'去猫爬架休息',enabled:visible&&prefs.iconsEnabled&&objectState.status==='ready'&&objectState.targets.length>0,click:()=>command('inspect-icons')},
 {type:'separator'},
 {label:'退出花萝卜',accelerator:'CommandOrControl+Q',click:()=>app.quit()}
]);
function openPetMenu(point?:Point){
 if(quitting||win.isDestroyed()||petMenu||!visible)return;
 const popup=menu();petMenu=popup;menuOpenCount++;command('menu-open');
 popup.once('menu-will-close',()=>{if(petMenu===popup)petMenu=null;command('menu-close');});
 const scale=prefs.size/100;
 const location=point&&Number.isFinite(point.x)&&Number.isFinite(point.y)?{x:Math.round(Math.max(0,Math.min(340*scale-1,point.x))),y:Math.round(Math.max(0,Math.min(260*scale-1,point.y)))}:{};
 popup.popup({window:win,...location});
}
function setPetVisible(next:boolean){
 visible=next;
 if(!quitting&&win&&!win.isDestroyed()){
  if(visible&&rendererReady)win.showInactive();else if(!visible){petMenu?.closePopup(win);win.hide();bodyHit=false;drag=false;ignore=true;win.setIgnoreMouseEvents(true,{forward:true});}
 }
 broadcastState();
}
function command(s:string){
 if(quitting)return;
 if(s==='show-pet'){setPetVisible(true);return;}if(s==='hide-pet'){setPetVisible(false);return;}
 if(s==='pause'){paused=!paused;broadcastState();return;}
 if(s==='quit'){app.quit();return;}if(s==='panel'){void panel();return;}if(s==='hide-panel'){settings?.hide();return;}
 if(s==='icons-toggle'){void updatePreferences({iconsEnabled:!prefs.iconsEnabled});return;}
 if(s==='icons-permission'){if(process.platform==='darwin')void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');return;}
 if(s==='inspect-icons'){paused=false;broadcastState();}
 const allowed=['menu-open','menu-close','center','inspect-icons','sit','rest','sleep','groom','walk-left','walk-right'];
 if(allowed.includes(s)&&win&&!win.isDestroyed())win.webContents.send('command',s);
}
function readLoginEnabled(){const item=app.getLoginItemSettings({path:process.execPath});return process.platform==='win32'?item.executableWillLaunchAtLogin:item.openAtLogin;}
async function panel(){
 if(!verify&&!quitting){try{const actual=readLoginEnabled();if(actual!==prefs.launchAtLogin){prefs={...prefs,launchAtLogin:actual};await preferenceStore.save(prefs);}}catch{}}
 if(quitting)return;if(settings&&!settings.isDestroyed()){settings.show();settings.focus();broadcastState();return;}
 const available=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
 settings=new BrowserWindow({width:Math.min(420,available.width-32),height:Math.min(632,available.height-32),title:'花萝卜',frame:false,backgroundColor:'#fdfdf9',icon:iconPath,resizable:false,autoHideMenuBar:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 settings.webContents.setWindowOpenHandler(()=>({action:'deny'}));settings.webContents.on('will-navigate',e=>e.preventDefault());
 settings.on('close',e=>{if(!quitting){e.preventDefault();settings?.hide();}});
 settings.on('closed',()=>settings=null);
 await settings.loadFile(path.join(__dirname,'../dist/settings.html'));if(quitting)return;settings.show();broadcastState();
}
function updatePreferences(patch:unknown):Promise<AppState>{
 const change=preferenceQueue.catch(()=>{}).then(async()=>{
  lastError=undefined;
  try{
   prefs=await persistPreferences(prefs,patch,value=>preferenceStore.save(value),enabled=>app.setLoginItemSettings({openAtLogin:enabled,path:process.execPath,name:'Hualuobo'}));objectState={...objectState,enabled:prefs.iconsEnabled};
   if(!prefs.iconsEnabled)objectState.targets=[];
   const scale=prefs.size/100;
   if(win&&!win.isDestroyed()){
    const b=win.getBounds(),foot=last?.desktopPosition||last?.position||{x:b.x+b.width/2,y:b.y+b.height*220/260};
    win.setBounds({x:Math.round(foot.x-170*scale),y:Math.round(foot.y-220*scale),width:Math.ceil(340*scale),height:Math.ceil(260*scale)});
   }
  }catch(e){try{prefs={...prefs,launchAtLogin:readLoginEnabled()};}catch{}lastError='设置暂时未能保存，请再试一次。';console.error('Preferences update:',e);}
  sendObjects();return state();
 });preferenceQueue=change;return change;
}
function knownSender(event:Electron.IpcMainEvent|Electron.IpcMainInvokeEvent){return event.sender===win?.webContents||event.sender===settings?.webContents;}
if(!locked)app.quit();else{
 app.on('second-instance',()=>void panel());
 app.whenReady().then(async()=>{
  prefs=await preferenceStore.read();
  if(!verify){try{const actual=readLoginEnabled();if(actual!==prefs.launchAtLogin){prefs={...prefs,launchAtLogin:actual};await preferenceStore.save(prefs);}}catch{lastError='暂时无法读取开机启动设置，请稍后再试。';}}
  objectState.enabled=prefs.iconsEnabled;
  const d=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());const worldArea=process.platform==='win32'?d.workArea:d.bounds;
  const info:DesktopInfo={area:d.workArea,screenArea:worldArea,dpr:d.scaleFactor,width:340,height:260,verify:verify&&!menuOnly,probe,platform:process.platform};const scale=prefs.size/100;
  win=new BrowserWindow({width:Math.ceil(info.width*scale),height:Math.ceil(info.height*scale),x:Math.round(d.workArea.x+d.workArea.width/2-170*scale),y:Math.round(d.workArea.y+d.workArea.height/2-130*scale),transparent:true,frame:false,hasShadow:false,resizable:false,movable:false,focusable:true,acceptFirstMouse:true,alwaysOnTop:true,skipTaskbar:true,icon:iconPath,backgroundColor:'#00000000',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.setAlwaysOnTop(true,'floating');if(process.platform==='darwin')win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});win.setIgnoreMouseEvents(true,{forward:true});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.on('console-message',d=>console.log('Renderer:',d.message));win.webContents.on('render-process-gone',(_,d)=>{console.error('Renderer stopped',d);visible=false;lastError='花萝卜暂时停止响应，请退出后重新打开。';broadcastState();void panel();});
  ipcMain.handle('info',event=>{if(!knownSender(event))throw new Error('Untrusted sender');return info;});
  ipcMain.handle('state',event=>{if(!knownSender(event))throw new Error('Untrusted sender');return state();});
  ipcMain.handle('preferences',(event,patch)=>{if(!knownSender(event))throw new Error('Untrusted sender');return updatePreferences(patch);});
  ipcMain.handle('objects',event=>{if(!knownSender(event))throw new Error('Untrusted sender');return objectState;});
  ipcMain.on('move',(event,p:Point)=>{if(!knownSender(event)||quitting||!visible||!win||win.isDestroyed())return;if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;const x=Math.round(p.x),y=Math.round(p.y),current=win.getBounds();if(current.x===x&&current.y===y)return;const t=performance.now();win.setPosition(x,y,false);moveTimes.push(performance.now()-t);moveCount++;if(moveTimes.length>60000)moveTimes.shift();});
  const mask=()=>{if(quitting||!win||win.isDestroyed())return;const next=!visible||!(bodyHit||drag);if(ignore!==next){win.setIgnoreMouseEvents(next,{forward:true});ignore=next;maskChanges++;}};
  ipcMain.on('hit',(event,hit:boolean)=>{if(!knownSender(event))return;bodyHit=!!hit;mask();});ipcMain.on('drag',(event,on:boolean)=>{if(!knownSender(event))return;drag=!!on;mask();});ipcMain.on('menu',(event,point?:Point)=>{if(knownSender(event))openPetMenu(point);});
  ipcMain.on('report',(event,data)=>{if(!knownSender(event))return;last=data;if(probe)void fs.mkdir(out,{recursive:true}).then(()=>fs.writeFile(path.join(out,'live-latest.json'),JSON.stringify(data,null,2))).catch(()=>{});});
  ipcMain.on('command',(event,s:string)=>{if(knownSender(event)&&typeof s==='string')command(s);});
  ipcMain.once('ready',()=>{rendererReady=true;broadcastState();if(visible)win.showInactive();if(appOnly)void appVerification();else if(menuOnly)void menuVerification();else if(treeOnly)void treeVerification(info);else if(motionOnly)void motionVerification(info);else if(verify)void verification(info);else void panel();});
  await win.loadFile(path.join(__dirname,'../dist/index.html'));
  startObjectReader(info);
  const poll=()=>{if(!quitting&&!win.isDestroyed()){win.webContents.send('cursor',{...(menuOnly&&menuPointerFixture?menuPointerFixture:screen.getCursorScreenPoint()),at:performance.now(),bounds:win.getBounds()});timer=setTimeout(poll,1000/60);}};poll();
  let icon=nativeImage.createFromPath(path.join(__dirname,'../assets/app/app.png'));if(icon.isEmpty())icon=nativeImage.createFromPath(path.join(__dirname,'../assets/poses/sit-0-0.png'));icon=icon.resize({height:process.platform==='darwin'?20:32});
  tray=new Tray(icon);tray.setToolTip('花萝卜 · 双击猫咪打开菜单');if(process.platform==='darwin')tray.setTitle('花萝卜');tray.setContextMenu(menu());tray.on('click',()=>void panel());
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'花萝卜',submenu:[{label:'控制面板',click:()=>void panel()},{label:'退出花萝卜',role:'quit',accelerator:'CommandOrControl+Q'}]}]));
  screen.on('display-metrics-changed',()=>{app.relaunch();app.quit();});
 }).catch(e=>{console.error('Startup:',e);app.exit(1);});
}
app.on('before-quit',event=>{if(quitting)return;event.preventDefault();quitting=true;clearTimeout(timer);clearTimeout(objectTimer);windowsReader?.stop();globalShortcut.unregisterAll();petMenu?.closePopup();for(const w of BrowserWindow.getAllWindows())w.hide();if(tray&&!tray.isDestroyed())tray.destroy();void Promise.allSettled([preferenceQueue,pendingObjects||Promise.resolve()]).finally(()=>app.exit(finalExitCode));});
app.on('window-all-closed',()=>{if(!quitting)app.quit();});

async function appVerification(){
 try{
  await fs.mkdir(out,{recursive:true});await panel();await pause(200);
  const checks:{name:string;pass:boolean}[]=[],samples:any[]=[];
  const ui=(js:string)=>settings!.webContents.executeJavaScript(js);
  const waitUntil=async(fn:()=>boolean)=>{for(let n=0;n<60;n++){if(fn())return;await pause(50);}throw new Error('Control state timeout');};
  const shot=async(name:string)=>{await fs.writeFile(path.join(out,name+'.png'),(await settings!.webContents.capturePage()).toPNG());};
  const inspect=async()=>({state:state(),ui:await ui(`({status:document.querySelector('#status-text').textContent,primary:document.querySelector('#visibility').textContent,pause:document.querySelector('#pause-text').textContent,disabled:document.querySelector('#pause').disabled,scroll:document.documentElement.scrollHeight,height:innerHeight,exitBottom:document.querySelector('[data-command="quit"]').getBoundingClientRect().bottom,error:document.querySelector('#error').textContent})`)});
  let sample=await inspect();samples.push(sample);await shot('01-control-panel-hidden');
  checks.push({name:'startup opens approved panel while the pet stays hidden',pass:!visible&&!win.isVisible()&&settings!.isVisible()&&sample.ui.status==='已收起'&&sample.ui.disabled});
  checks.push({name:'exit remains inside the control panel viewport',pass:sample.ui.exitBottom<=sample.ui.height});
  await ui(`document.querySelector('#visibility').click()`);await waitUntil(()=>visible&&win.isVisible());await pause(160);sample=await inspect();samples.push(sample);await shot('02-control-panel-active');
  checks.push({name:'show button displays pet and reports live state',pass:sample.ui.primary==='收起花萝卜'&&sample.ui.status==='在桌面活动'});
  await ui(`document.querySelector('#pause').click()`);await waitUntil(()=>paused);await pause(450);const stopped=await win.webContents.executeJavaScript('window.__catSprite.snapshot()');await shot('03-control-panel-paused');
  checks.push({name:'pause synchronizes controller, UI and menu state',pass:stopped.paused&&stopped.speed===0&&(await inspect()).ui.status==='已暂停'});
  await ui(`document.querySelector('#pause').click()`);await waitUntil(()=>!paused);
  for(const size of [70,120,100]){
   await ui(`(()=>{const s=document.querySelector('#size');s.value='${size}';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
   await waitUntil(()=>prefs.size===size);await pause(160);const snap=await win.webContents.executeJavaScript('window.__catSprite.snapshot()');
   checks.push({name:`size ${size}% scales native window and renderer together`,pass:win.getBounds().width===Math.ceil(340*size/100)&&Math.abs(snap.displaySize-size)<.001&&snap.errors===0});
  }
  await ui(`document.querySelector('#icons').click()`);await waitUntil(()=>!prefs.iconsEnabled);checks.push({name:'icon toggle disables support discovery without changing files',pass:!objectState.enabled&&objectState.targets.length===0});
  await ui(`document.querySelector('#icons').click()`);await waitUntil(()=>prefs.iconsEnabled);
  await ui(`document.querySelector('.tray').click()`);await waitUntil(()=>!settings!.isVisible());checks.push({name:'closing panel keeps the pet and tray alive',pass:visible&&win.isVisible()&&!tray.isDestroyed()});
  await panel();await ui(`document.querySelector('#visibility').click()`);await waitUntil(()=>!visible);checks.push({name:'collect button hides pet without quitting control panel',pass:!win.isVisible()&&settings!.isVisible()});
  await pause(100);await shot('04-control-panel-final');
  const saved=await preferenceStore.read();checks.push({name:'preferences are persisted separately from install files',pass:saved.size===100&&saved.iconsEnabled&&saved.launchAtLogin===false});
  clearTimeout(objectTimer);if(pendingObjects)await pendingObjects.catch(()=>{});clearTimeout(objectTimer);
  const normalState=state();settings!.webContents.send('state',{...normalState,platform:'win32',iconStatus:'unavailable',iconCount:0,iconMessage:'正在查找桌面图标；桌面暂不可用时会自动重试。',errorMessage:'设置暂时未能保存，请再试一次。'});await pause(250);
  const fallback=await inspect();samples.push({...fallback,syntheticWindowsUiState:true});await shot('05-windows-error-layout-fixture');
  checks.push({name:'error and missing icons keep exit inside the viewport',pass:fallback.ui.exitBottom<=fallback.ui.height});
  settings!.webContents.send('state',{...normalState,platform:'win32',iconStatus:'ready',iconCount:8});await pause(250);await shot('06-windows-control-panel-layout-fixture');
  const passed=checks.every(c=>c.pass);finalExitCode=passed?0:1;
  await fs.writeFile(path.join(out,'app-verification.json'),JSON.stringify({version:app.getVersion(),platform:process.platform,checks,samples,evidence:'Real Electron renderer, isolated profile and native show/hide/menu state. DOM clicks and icon fixtures are synthetic. No Windows OS was emulated. Exit button is clicked after writing this report; parent process checks normal exit.'},null,2));
  console.log('APP_VERIFICATION_DONE',checks);await ui(`document.querySelector('[data-command="quit"]').click()`);
 }catch(e){console.error('APP_VERIFICATION_FAILED',e);finish(1);}
}

async function capture(name:string){await fs.mkdir(out,{recursive:true});const image=await win.webContents.capturePage();await fs.writeFile(path.join(out,name+'.png'),image.toPNG());}
async function menuVerification(){try{
 await pause(600);const js=(s:string)=>win.webContents.executeJavaScript(s);const checks:any[]=[];
 await js("window.__catSprite.pose('rest')");await pause(100);
 const before=await js('window.__catSprite.snapshot()');
 const point={x:Math.round(before.rect.x+before.rect.w*.5),y:Math.round(before.rect.y+before.rect.h*.7)};
 const move=(p:Point,pressed=false)=>{const b=win.getBounds();menuPointerFixture={x:b.x+p.x,y:b.y+p.y};win.webContents.sendInputEvent({type:'mouseMove',modifiers:pressed?['leftbuttondown']:[],...p});};
 const tap=async()=>{if(ignore)throw new Error('Native window is ignoring the next click; hover='+JSON.stringify({bodyHit,drag,pointer:menuPointerFixture,last}));win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});await pause(30);win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await pause(100);};
 move(point);await pause(150);const hovered={bodyHit,ignore};
 await tap();const first={native:{bodyHit,drag,ignore},renderer:await js('window.__catSprite.snapshot()')};
 await tap();await pause(100);const opened=await js('window.__catSprite.snapshot()');const count=menuOpenCount,labels=petMenu?.items.map(i=>i.label)||[];
 petMenu?.closePopup(win);await pause(150);const closed=await js('window.__catSprite.snapshot()');
 checks.push({name:'hover enables native click reception',pass:hovered.bodyHit&&!hovered.ignore},{name:'first release keeps native window receiving the second click',pass:first.native.bodyHit&&!first.native.drag&&!first.native.ignore},{name:'two clickCount 1 taps open menu once',pass:count===1&&opened.menuOpen},{name:'menu includes pause, climbing and exit',pass:['暂停活动','去猫爬架休息','退出花萝卜'].every(label=>labels.includes(label))},{name:'closing releases hold without panel, drag or pose reset',pass:!closed.menuOpen&&settings===null&&!closed.dragging&&closed.pose==='rest'&&closed.position.x===before.position.x&&closed.position.y===before.position.y});
 await tap();await pause(710);const slowFirst=await js('window.__catSprite.snapshot()');await tap();await pause(710);checks.push({name:'slow clicks do not open menu',pass:menuOpenCount===count&&!slowFirst.menuOpen&&!petMenu});
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});await pause(40);move({x:point.x+28,y:point.y},true);const drop={...menuPointerFixture!};await pause(100);const dropBounds=win.getBounds();win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:drop.x-dropBounds.x,y:drop.y-dropBounds.y});await pause(150);const dragged=await js('window.__catSprite.snapshot()');checks.push({name:'dragging moves the cat without opening menu or retaining tap',pass:dragged.position.x>before.position.x+15&&!dragged.tapPending&&!dragged.dragging&&menuOpenCount===count});
 console.log('MENU_CHECK_PROGRESS',checks,dragged);command('pause');await pause(80);const pausedBefore=await js('window.__catSprite.snapshot()');const r=pausedBefore.rect;point.x=Math.round(r.x+r.w*.5);point.y=Math.round(r.y+r.h*.7);move(point);await pause(150);await tap();await tap();const pausedOpen=await js('window.__catSprite.snapshot()');petMenu?.closePopup(win);await pause(150);const pausedClosed=await js('window.__catSprite.snapshot()');checks.push({name:'menu can open on paused cat and preserves pause',pass:pausedBefore.paused&&pausedOpen.menuOpen&&pausedClosed.paused&&!pausedClosed.menuOpen},{name:'renderer remains healthy',pass:pausedClosed.errors===0});
 await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'menu-verification.json'),JSON.stringify({version:app.getVersion(),checks,before,hovered,first,opened,closed,dragged,pausedOpen,pausedClosed,labels,inputEvidence:'Normal hover, press, release, native ignore state and pointer capture handlers. Every clickCount is 1; no preclassified double-click or forced interactive window. Input is Chromium injection confined to the packaged webContents, with a synthetic screen-point sample fed through the normal cursor poll for hover testing. Physical OS dispatch is not exercised; system cursor not moved.'},null,2));console.log('MENU_VERIFICATION_DONE',checks);finish(checks.every(c=>c.pass)?0:1);
 }catch(e){console.error(e);petMenu?.closePopup(win);finish(1);}}
async function motionVerification(info:DesktopInfo){try{await pause(800);await fs.mkdir(out,{recursive:true});for(const direction of [-1,1]){await win.webContents.executeJavaScript(`window.__catSprite.neutral(${direction})`);await pause(80);await capture('neutral-'+(direction<0?'left':'right'));}await win.webContents.executeJavaScript("window.__catSprite.motionScene(-1)");await pause(400);await capture('bridge-mid');for(const kind of ['left','right','turn','sleep','paw','groom']){const result=await win.webContents.executeJavaScript(`window.__catSprite.recordMotion('${kind}')`);await fs.writeFile(path.join(out,kind+'.webm'),Buffer.from(result.bytes));await fs.writeFile(path.join(out,kind+'-samples.json'),JSON.stringify(result.samples));await capture(kind+'-final');}for(const direction of [-1,1])for(let i=0;i<12;i++){await win.webContents.executeJavaScript(`window.__catSprite.walkFrame(${direction},-1,${i/12})`);await pause(50);await capture('full-body-'+direction+'-'+i);}console.log('MOTION_RECORDING_DONE',await win.webContents.executeJavaScript('window.__catSprite.metrics()'));finish(0);}catch(e){console.error(e);finish(1);}}
async function treeVerification(info:DesktopInfo){try{
 await pause(1000);const js=(s:string)=>win.webContents.executeJavaScript(s);const checks:any[]=[];
 const icon={id:'fixture:tree',kind:'desktop',name:'测试猫爬架',bounds:{x:info.area.x+info.area.width*.55,y:info.area.y+info.area.height*.6,width:56,height:56}};
 await js(`window.__catSprite.treeScene(${JSON.stringify(icon)})`);
 const clip=js('window.__catSprite.recordCurrent(15500)');
 await pause(4000);const rested=await js('window.__catSprite.snapshot()');await capture('tree-rest');
 await pause(5500);const held=await js('window.__catSprite.snapshot()');await capture('tree-long-rest');
 await js('window.__catSprite.leaveScene()');await pause(1000);const leaving=await js('window.__catSprite.snapshot()');await capture('tree-descending');
 await pause(4500);const departed=await js('window.__catSprite.snapshot()');await capture('tree-departed');
 const result=await clip;await fs.writeFile(path.join(out,'icon-tree.webm'),Buffer.from(result.bytes));await fs.writeFile(path.join(out,'icon-tree-samples.json'),JSON.stringify(result.samples));
 checks.push({name:'autonomous approach climbs and lies on icon',pass:rested.contact.support===icon.id&&rested.pose==='rest'},{name:'lazy rest stays on support without repeat hops',pass:held.contact.support===icon.id&&held.pose==='rest'&&!held.contact.airborne},{name:'departure wakes before controlled descent',pass:leaving.contact.airborne&&leaving.pose==='sit'},{name:'departure returns to ground and finishes seated',pass:!departed.contact.support&&!departed.contact.airborne&&departed.speed===0&&departed.sprite==='action-settle-0'},{name:'recording draws one complete cat throughout',pass:result.samples.every((s:any)=>s.bodyDraws===1)});
 await js(`window.__catSprite.treeScene(${JSON.stringify(icon)})`);await pause(3800);
 const shelf={...icon,id:'fixture:neighbor',name:'相邻猫爬架',bounds:{...icon.bounds,x:icon.bounds.x+120}};
 await js(`window.__catSprite.sceneObjects(${JSON.stringify([icon,shelf])})`);await js('window.__catSprite.leaveScene(1)');await pause(3000);const neighbor=await js('window.__catSprite.snapshot()');await capture('tree-neighbor-rest');checks.push({name:'dense row departure lands and rests on adjacent shelf',pass:neighbor.contact.support===shelf.id&&neighbor.pose==='rest'&&!neighbor.contact.airborne});
 let real:any=null;const selected=objectState.targets.find(o=>o.kind==='dock'&&o.bounds.x>info.area.x+300&&o.bounds.x<info.area.x+info.area.width-300)||objectState.targets[0];
 if(selected){await js(`window.__catSprite.treeScene(${JSON.stringify(selected)},${JSON.stringify(objectState.targets)})`);await pause(5000);const rested=await js('window.__catSprite.snapshot()');await capture('real-full-collection-rest');real={requested:selected,rested,all:objectState.targets};checks.push({name:'full system icon collection offers resting support',pass:!!rested.contact.support&&rested.pose==='rest'});}
 await fs.writeFile(path.join(out,'tree-verification.json'),JSON.stringify({version:app.getVersion(),checks,rested,held,leaving,departed,neighbor,real,metrics:await js('window.__catSprite.metrics()'),evidence:'Actual packaged playback; fixture input and coordinate rectangles in recording. Real case uses the full AX-discovered icon collection without clicking icons.'},null,2));console.log('TREE_VERIFICATION_DONE',checks);finish(checks.every(c=>c.pass)?0:1);
 }catch(e){console.error(e);finish(1);}}
async function verification(info:DesktopInfo){try{
 await pause(900);const js=(s:string)=>win.webContents.executeJavaScript(s);const checks:any[]=[];
 const shot=async(name:string)=>{await pause(80);await capture(name);};
 for(const pose of ['sit','rest','sleep','groom']){await js(`window.__catSprite.pose('${pose}')`);await shot(pose);}
 const plain=await js('window.__catSprite.snapshot()');
 const opacity=[];for(const [x,y] of [[0,0],[-1,-1],[1,1],[-1,1]]){await js(`window.__catSprite.fixtureHead(${x},${y})`);await pause(250);opacity.push(await js('window.__catSprite.snapshot()'));await capture(`opaque-head-${x}-${y}`);}
 const pawFrames=[];for(const direction of [-1,1])for(let frame=0;frame<6;frame++){await js(`window.__catSprite.fixturePaw(${direction},${frame})`);await shot(`paw-${direction<0?'left':'right'}-${frame}`);pawFrames.push(await js('window.__catSprite.snapshot()'));}
 // Select complete source walk frames by distance phase; no cutout limbs or compositing.
 const gaitBodies:any[]=[];for(const direction of [-1,1])for(let i=0;i<16;i++){await js(`window.__catSprite.walkFrame(${direction},-1,${i/16})`);await shot(`continuous-${direction<0?'left':'right'}-${i.toString().padStart(2,'0')}`);gaitBodies.push({direction,phase:i/16,...await js('window.__catSprite.snapshot()')});}
 const gait=await js('window.__catSprite.snapshot()');
 await js("window.__catSprite.transitionTo('sleep')");const transitions=[];
 for(let i=0;i<14;i++){await pause(240);transitions.push(await js('window.__catSprite.snapshot()'));await capture('settle-curl-'+i.toString().padStart(2,'0'));}
 const curled=await js('window.__catSprite.snapshot()');
 await js('window.__catSprite.beginTour()');for(let i=0;i<6;i++){await pause(2000);console.log('SPRITE_VERIFY',i,last?.sprite);if(i===1||i===4)await capture('walking-'+i);}
 const roam=await js('window.__catSprite.snapshot()');
 const idleSprite=(s:any)=>s.sprite==='action-settle-0'||s.sprite==='action-settle-5';
 const arrivals:any[]=[];for(const direction of [-1,1]){await js(`window.__catSprite.motionScene(${direction})`);await pause(5000);arrivals.push({...await js('window.__catSprite.snapshot()'),expectedX:info.area.x+info.area.width*.5+direction*240});await capture('arrival-idle-'+direction);}
 await js('window.__catSprite.motionScene(-1)');await pause(1400);command('pause');await pause(900);const pausedIdle=await js('window.__catSprite.snapshot()');await capture('paused-idle');
 command('pause');await js('window.__catSprite.go(1)');await pause(1300);const resumedWalk=await js('window.__catSprite.snapshot()');await capture('resumed-walk');

 await js('window.__catSprite.fixtureNear()');await pause(450);await capture('sniff');await pause(650);await capture('paw');const interacted=await js('window.__catSprite.snapshot()');
 await js('window.__catSprite.mouse({x:-9999,y:-9999})');await pause(200);const cancelled=await js('window.__catSprite.snapshot()');
 const icon={id:'fixture:contact',kind:'desktop',name:'Contact fixture',bounds:{x:info.area.x+info.area.width*.55,y:info.area.y+info.area.height*.6,width:48,height:48}};
 await js(`window.__catSprite.contactScene(${JSON.stringify(icon)})`);await pause(1700);const blocked=await js('window.__catSprite.snapshot()');await pause(650);const blockedIdle=await js('window.__catSprite.snapshot()');await capture('contact-blocked');
 await js(`window.__catSprite.perchScene('${icon.id}')`);await pause(2600);const perched=await js('window.__catSprite.snapshot()');await capture('contact-perched');
 await js('window.__catSprite.sceneObjects([])');await pause(200);const released=await js('window.__catSprite.snapshot()');
 await pause(1600);const fell=await js('window.__catSprite.snapshot()');await capture('contact-fell');
 let realContact:any=null;
 const real=objectState.targets.find(o=>o.kind==='dock'&&o.bounds.x>info.area.x+350&&o.bounds.x<info.area.x+info.area.width-300)||objectState.targets.find(o=>o.bounds.x>info.area.x+350&&o.bounds.x<info.area.x+info.area.width-300);
 if(real){await js(`window.__catSprite.contactScene(${JSON.stringify(real)})`);await pause(1700);const stop=await js('window.__catSprite.snapshot()');await capture('real-icon-blocked');await js(`window.__catSprite.perchScene(${JSON.stringify(real.id)})`);await pause(2600);const rest=await js('window.__catSprite.snapshot()');await capture('real-icon-perched');realContact={object:real,blocked:stop,perched:rest,inputEvidence:'Actual AX icon coordinates; selected collider isolated for repeatable obstacle verification. Full desktop selection runs independently in normal mode.'};}
 checks.push(
  {name:'2D original reference and new temporal actions, no model',pass:roam.modelFiles===0&&roam.assetCount===104},
  {name:'both independent walk directions moved',pass:roam.directions.includes(-1)&&roam.directions.includes(1)&&roam.travel>700},
  {name:'renderer has no errors',pass:roam.errors===0&&fell.errors===0},
  {name:'whole-body source only; no limb cutouts or pose blending',pass:gait.wholeBodyPlayback&&!gait.gaitWarp&&!gait.motionInterpolation&&!gait.continuousRig},
  {name:'32 samples draw exactly one complete source and visit all eight frames',pass:gaitBodies.every(p=>p.bodyDraws===1)&&[-1,1].every(d=>new Set(gaitBodies.filter(p=>p.direction===d).map(p=>p.frame)).size===8)},
  {name:'sniff and paw react to near pointer; departure cancels',pass:interacted.visitedModes.includes('sniff')&&interacted.visitedModes.includes('paw')&&cancelled.mode!=='paw'},
  {name:'six whole-body paw stages both directions',pass:pawFrames.length===12&&pawFrames.every((p,i)=>p.pawWholeBody&&p.frame===i%6&&p.errors===0)},
  {name:'no constant close icon',pass:plain.closeAdornment===false&&plain.formerCloseAlpha===0},
  {name:'head/body interior opaque at attention extremes',pass:opacity.every(p=>p.neckOpacity===255)},
  {name:'sit to prone to curl uses complete-frame clips',pass:transitions.some(p=>p.transition?.clip==='settle')&&transitions.some(p=>p.transition?.clip==='curl')&&curled.pose==='sleep'},
  {name:'arrival left/right finishes seated or prone instead of frozen walk',pass:arrivals.every(s=>!s.walkingVisual&&s.speed===0&&idleSprite(s)&&Math.abs(s.position.x-s.expectedX)<.5)},
  {name:'pause during a walk finishes seated; resumed goal walks again',pass:pausedIdle.speed===0&&!pausedIdle.walkingVisual&&idleSprite(pausedIdle)&&resumedWalk.walkingVisual},
  {name:'blocked stationary cat finishes idle pose',pass:blockedIdle.speed===0&&!blockedIdle.walkingVisual&&idleSprite(blockedIdle)},
  {name:'icon side blocks movement',pass:blocked.contact.blocked===icon.id&&blocked.speed===0&&Math.abs(blocked.position.x-(icon.bounds.x-112))<.01},
  {name:'icon top supports prone cat',pass:perched.contact.support===icon.id&&perched.pose==='rest'&&Math.abs(perched.position.y-icon.bounds.y)<.01},
  {name:'hidden support releases and cat falls',pass:released.contact.support===null&&released.contact.airborne&&fell.position.y>=released.position.y&&!fell.contact.airborne}
 );
 const metrics=await js('window.__catSprite.metrics()');await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({date:new Date().toISOString(),version:app.getVersion(),hardware:{cpu:os.cpus()[0]?.model,memoryGB:os.totalmem()/2**30,platform:process.platform,dpr:info.dpr},checks,gaitBodies,roam,pawFrames,opacity,transitions,interaction:interacted,cancelled,contacts:{blocked,perched,released,fell},realContact,objectDiscovery:{status:objectState.status,count:objectState.targets.length,kinds:[...new Set(objectState.targets.map(o=>o.kind))],transport:'in-process Node-API worker',mainTrusted:process.platform==='darwin'?systemPreferences.isTrustedAccessibilityClient(false):null},metrics,stopIdle:{arrivals,blockedIdle,pausedIdle,resumedWalk},inputEvidence:'Packaged native movement and rendered motion captures. Pointer and obstacle fixtures are synthetic. realContact uses system-reported icon bounds with isolated collision geometry. Visual gait/style acceptance is separate.'},null,2));console.log('VERIFICATION_DONE',checks);finish(checks.every(c=>c.pass)?0:1);
 }catch(e){console.error(e);finish(1);}}
async function finish(code:number){windowsReader?.stop();finalExitCode=code;quitting=true;clearTimeout(timer);clearTimeout(objectTimer);if(pendingObjects)await pendingObjects.catch(()=>{});await pause(0);if(tray&&!tray.isDestroyed())tray.destroy();for(const w of BrowserWindow.getAllWindows())w.destroy();app.exit(code);setTimeout(()=>process.exit(code),800).unref();}
