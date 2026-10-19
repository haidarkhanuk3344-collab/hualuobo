import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// No compiler is needed by installed app users. This is a maintainer-only build.
// MSVC Developer Prompt: CXX=cl node scripts/build_windows_native.mjs
// Portable LLVM-MinGW: HUALUOBO_WINDOWS_CXX=/path/to/x86_64-w64-mingw32-clang++ ...
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const compiler=process.env.HUALUOBO_WINDOWS_CXX||process.env.CXX||(process.platform==='win32'?'cl':'x86_64-w64-mingw32-clang++');
const output=path.join(root,'native/bin/desktop-targets-win.exe');
await fs.mkdir(path.dirname(output),{recursive:true});
const source=path.join(root,'native/src/DesktopTargetsWin.cpp');
const isMsvc=/^(cl|cl\.exe)$/i.test(path.basename(compiler));
const args=isMsvc
  ? ['/nologo','/std:c++17','/O2','/EHsc','/MT','/DUNICODE','/D_UNICODE',source,`/Fe:${output}`,`/Fo:${path.join(root,'native/bin/desktop-targets-win.obj')}`,'/link','/SUBSYSTEM:CONSOLE','ole32.lib','oleaut32.lib','uiautomationcore.lib','uuid.lib','dwmapi.lib','user32.lib','shell32.lib','shlwapi.lib']
  : ['-std=c++17','-O2','-Wall','-Wextra','-Werror','-DUNICODE','-D_UNICODE','-municode','-static',source,'-o',output,'-lole32','-loleaut32','-luiautomationcore','-luuid','-ldwmapi','-luser32','-lshell32','-lshlwapi'];
execFileSync(compiler,args,{cwd:root,stdio:'inherit'});
console.log(`Windows desktop target reader: ${output}`);
