// Transfer links between OpenKitchen3D web and iOS, with no server in between.
//
//   web:  https://openkitchen3d-cloud.web.app/#/import/v1/<payload>
//   iOS:  openkitchen3d://import/v1/<payload>
//
// <payload> = base64url( raw DEFLATE (RFC 1951) of the UTF-8 OpenPlan3D prepared-RoomPlan JSON ).
// Raw DEFLATE is what Apple's Compression framework calls COMPRESSION_ZLIB and what browsers
// call 'deflate-raw', so both sides use their built-in codecs. The fragment never reaches a server.
import type { Project } from '../model/types';
import { toOpenPlan } from './openplan';

export const TRANSFER_VERSION = 'v1';
export const WEB_ORIGIN = 'https://openkitchen3d-cloud.web.app';
export const IOS_SCHEME = 'openkitchen3d';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodePayload(json: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  return toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function decodePayload(payload: string): Promise<unknown> {
  const bytes = await pipe(fromBase64Url(payload.trim()), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** OpenPlan3D JSON without the embedded web project: what iOS reads, and small enough for a link. */
export const transferJson = (p: Project) => toOpenPlan(p, { embedWebProject: false });

export async function webImportUrl(p: Project, origin = WEB_ORIGIN): Promise<string> {
  return `${origin}/#/import/${TRANSFER_VERSION}/${await encodePayload(transferJson(p))}`;
}

export async function iosImportUrl(p: Project): Promise<string> {
  return `${IOS_SCHEME}://import/${TRANSFER_VERSION}/${await encodePayload(transferJson(p))}`;
}
