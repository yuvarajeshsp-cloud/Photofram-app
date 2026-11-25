// Streams an R2 object as an HTTP response, with conditional requests (ETag)
// so browsers and phones can revalidate cheaply.
export type R2Like = {
  get(key: string, options?: { onlyIf?: Headers }): Promise<R2ObjectLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};
type R2ObjectLike = {
  httpEtag: string;
  uploaded: Date;
  size: number;
  body?: ReadableStream;
  writeHttpMetadata(headers: Headers): void;
};

export async function serveR2(
  bucket: R2Like,
  key: string,
  request: Request,
  { cacheControl, maxAgeMs }: { cacheControl: string; maxAgeMs?: number },
): Promise<Response> {
  const head = request.method === 'HEAD';
  const obj = head ? await bucket.head(key) : await bucket.get(key, { onlyIf: request.headers });
  if (!obj || (maxAgeMs && Date.now() - obj.uploaded.getTime() > maxAgeMs)) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', cacheControl);
  headers.set('X-Content-Type-Options', 'nosniff');
  // Uploaded files are never pages: block scripts even if one is opened directly.
  headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  headers.set('Access-Control-Allow-Origin', '*');
  if (head) return new Response(null, { headers });
  if (!obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
}
