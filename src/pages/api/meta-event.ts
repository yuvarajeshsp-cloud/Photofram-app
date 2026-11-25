// Server-side copy of browser events (Conversions API), so ad reporting still
// works when the Pixel is blocked. Only a fixed set of events is accepted.
// Same behaviour as the Netlify function it replaces.
import type { APIRoute } from 'astro';
import { clientInfo, sendMetaEvent } from '../../lib/server/meta';

const ALLOWED = new Set(['Contact', 'ViewContent', 'AddToWishlist']);

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!ALLOWED.has(body?.event_name) || typeof body.event_id !== 'string') return new Response(null, { status: 422 });

  const str = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);
  // Optional product details, checked strictly.
  const cd = body.custom_data && typeof body.custom_data === 'object' ? body.custom_data : null;
  const ids: string[] = Array.isArray(cd?.content_ids)
    ? cd.content_ids.filter((x: unknown) => typeof x === 'string' && /^[\w-]{1,40}$/.test(x)).slice(0, 20)
    : [];
  const customData = ids.length
    ? {
        content_ids: ids,
        content_type: 'product',
        ...(Number.isFinite(cd.value) && cd.value >= 0 && { value: cd.value, currency: 'INR' }),
      }
    : undefined;
  await sendMetaEvent({
    eventName: body.event_name,
    eventId: body.event_id.slice(0, 100),
    eventSourceUrl: str(body.event_source_url, 500),
    userData: { fbp: str(body.fbp, 200), fbc: str(body.fbc, 500), ...clientInfo(request) },
    customData,
  }).catch((err) => console.error('[meta-event]', err));

  return new Response(null, { status: 204 });
};
