import {build} from 'esbuild';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
await fs.mkdir('dist',{recursive:true});await fs.mkdir('dist-electron',{recursive:true});
await Promise.all([build({entryPoints:['src/electron/main.ts'],outfile:'dist-electron/main.cjs',bundle:true,platform:'node',external:['electron'],target:'node22'}),build({entryPoints:['src/electron/preload.ts'],outfile:'dist-electron/preload.cjs',bundle:true,platform:'node',external:['electron'],target:'node22'}),build({entryPoints:['src/renderer/main.ts'],outfile:'dist/main.js',bundle:true,format:'esm',target:'es2022'})]);
for(const name of ['index','settings']){
 let html=await fs.readFile(`src/renderer/${name}.html`,'utf8');
 const hashes=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim()).map(s=>`'sha256-${createHash('sha256').update(s).digest('base64')}'`);
 const csp=`default-src 'none'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`;
 html=html.replace(/<meta charset="[^"]+">/i,m=>m+`<meta http-equiv="Content-Security-Policy" content="${csp}">`);
 await fs.writeFile(`dist/${name}.html`,html);
}
