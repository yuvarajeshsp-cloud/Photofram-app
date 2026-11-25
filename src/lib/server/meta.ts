// Meta Conversions API helper (ported from @rajesh-hub/web-growth's Netlify
// version). Sends nothing unless both the Pixel ID and the access token are
// set as Worker variables/secrets.
import { env } from 'cloudflare:workers';

const GRAPH_VERSION = 'v23.0';

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Phone in E.164 digits (country code, no +), as Meta expects before hashing.
export function normalizePhone(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function clientInfo(req: Request) {
  return {
    client_ip_address: req.headers.get('cf-connecting-ip') || undefined,
    client_user_agent: req.headers.get('user-agent') || undefined,
  };
}

type MetaEvent = {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string;
  userData: Record<string, unknown>;
  customData?: Record<string, unknown>;
};

export async function sendMetaEvent({ eventName, eventId, eventSourceUrl, userData, customData }: MetaEvent) {
  const vars = env as unknown as Record<string, string | undefined>;
  const pixelId = vars.PUBLIC_META_PIXEL_ID || import.meta.env.PUBLIC_META_PIXEL_ID;
  const token = vars.META_CAPI_TOKEN;
  if (!pixelId || !token) return { skipped: true };

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: eventSourceUrl,
        user_data: Object.fromEntries(Object.entries(userData).filter(([, v]) => v)),
        ...(customData && { custom_data: customData }),
      },
    ],
    ...(vars.META_TEST_EVENT_CODE && { test_event_code: vars.META_TEST_EVENT_CODE }),
  };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error('[meta] CAPI error', res.status, await res.text());
  return { ok: res.ok };
}
