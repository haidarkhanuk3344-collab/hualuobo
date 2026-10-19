import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
if(process.platform==='darwin'){
  await fs.mkdir('native/bin',{recursive:true});
  const headers=process.env.HUALUOBO_NODE_HEADERS||'/usr/local/include/node';
  await fs.access(`${headers}/node_api.h`);
  execFileSync('xcrun',['clang++','-O2','-std=c++17','-fobjc-arc','-bundle','-undefined','dynamic_lookup','-framework','Cocoa','-framework','ApplicationServices',`-I${headers}`,'native/src/DesktopTargets.mm','-o','native/bin/desktop-targets.node'],{stdio:'inherit'});
}
