import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Packaging tools are JS modules, outside the application TS build.
import {validateManifest} from '../scripts/windows-manifest.mjs';
const original=fs.readFileSync(new URL('./fixtures/electron-38.8.6-windows.manifest',import.meta.url));
test('official Electron activation manifest is valid and retains normal-user privileges',()=>{
 assert.match(validateManifest(original),/asInvoker/);
});
test('rejects the 0.6.0 pooled-buffer corruption even though asInvoker is present',()=>{
 const slab=Buffer.alloc(8192);slab.write('var __extends = function () {};');original.copy(slab,6072);
 assert.throws(()=>validateManifest(slab),/binary|outside/);
});
test('rejects prefix/suffix data, malformed XML and invalid UTF-8',()=>{
 for(const bytes of [Buffer.concat([Buffer.from('garbage'),original]),Buffer.concat([original,Buffer.from('garbage')]),Buffer.from(original.toString().replace('</dependency>','</wrong>')),Buffer.concat([Buffer.from([0xff]),original])])assert.throws(()=>validateManifest(bytes));
});
test('rejects accidental administrator elevation',()=>{
 assert.throws(()=>validateManifest(Buffer.from(original.toString().replace('asInvoker','requireAdministrator'))),/asInvoker/);
});
