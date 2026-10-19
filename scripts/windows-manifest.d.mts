export function validateManifest(bytes: Uint8Array): string;
export function readManifest(executable: Uint8Array): Buffer;
export function assertOriginalManifest(executable: Uint8Array, original: Buffer): Buffer;
