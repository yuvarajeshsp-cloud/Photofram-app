// Stores a frame model for the computer → phone AR hand-off. Only binary glTF
// up to 4 MB is accepted; the file gets a random name and expires after 7 days
// (R2 lifecycle rule on photofram-ar).
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const MAX_BYTES = 4 * 1024 * 1024;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request }) => {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'model/gltf-binary') return json(415, { error: 'Only model/gltf-binary is accepted' });
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return json(413, { error: 'Model is larger than 4 MB' });

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BYTES) return json(413, { error: 'Model is larger than 4 MB' });
  // GLB header: magic "glTF", version 2, total length (little-endian).
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const isGlb =
    body.byteLength >= 12 &&
    body[0] === 0x67 && body[1] === 0x6c && body[2] === 0x54 && body[3] === 0x46 &&
    view.getUint32(4, true) === 2 &&
    view.getUint32(8, true) === body.byteLength;
  if (!isGlb) return json(422, { error: 'Not a binary glTF file' });

  const path = `${crypto.randomUUID()}.glb`;
  await env.AR.put(path, body, { httpMetadata: { contentType: 'model/gltf-binary' } });
  return json(201, { path });
};
