import {NtExecutable,NtExecutableResource} from 'resedit';
import {DOMParser} from '@xmldom/xmldom';

// Validate the entire RT_MANIFEST resource, not a substring inside an 8 KiB slab.
export function validateManifest(bytes){
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(xml))throw new Error('Manifest contains binary/control bytes');
  if(!/^\s*(?:<\?xml[^?]*\?>\s*)?<assembly\b/u.test(xml)||!/<\/assembly>\s*$/u.test(xml))throw new Error('Manifest has data outside its assembly document');
  const doc=new DOMParser({onError:(level,message)=>{throw new Error(`Invalid manifest XML: ${message}`);}}).parseFromString(xml,'application/xml');
  if(doc.documentElement.namespaceURI!=='urn:schemas-microsoft-com:asm.v1')throw new Error('Incorrect manifest namespace');
  const levels=doc.getElementsByTagNameNS('urn:schemas-microsoft-com:asm.v3','requestedExecutionLevel');
  if(levels.length!==1||levels[0].getAttribute('level')!=='asInvoker'||levels[0].getAttribute('uiAccess')!=='false')throw new Error('Manifest must use asInvoker without UI access');
  return xml;
}
export function readManifest(executable){
  const resources=NtExecutableResource.from(NtExecutable.from(executable));
  const entries=resources.entries.filter(e=>e.type===24);
  if(entries.length!==1||entries[0].id!==1)throw new Error('Expected one process manifest at resource ID 1');
  const bytes=Buffer.from(entries[0].bin);
  validateManifest(bytes);
  return bytes;
}
export function assertOriginalManifest(executable,original){
  const bytes=readManifest(executable);
  if(!bytes.equals(original))throw new Error('Packaged app manifest differs from original Electron manifest');
  return bytes;
}
