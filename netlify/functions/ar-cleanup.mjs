// Daily: delete AR previews (photofram-ar bucket) older than 7 days.
// Row level security only lets anyone list or delete *expired* previews, so
// the public key is enough and no secret is stored here. The same sweep also
// runs after every new AR upload (src/lib/arModel.ts).
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'https://brjosrtzyjorncmjhqhg.supabase.co';
const SUPABASE_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_aHybAGjo0HzjcnHMq1itXw_8WWOa7Y-';
const BUCKET = 'photofram-ar';

export async function sweepExpired() {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
  let deleted = 0;
  for (let round = 0; round < 20; round++) {
    const list = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix: 'ar', limit: 500, offset: 0 }),
    });
    if (!list.ok) throw new Error(`list failed: ${list.status} ${await list.text()}`);
    const names = (await list.json()).filter((o) => o.id && o.name).map((o) => `ar/${o.name}`);
    if (!names.length) break;
    const del = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes: names }),
    });
    if (!del.ok) throw new Error(`delete failed: ${del.status} ${await del.text()}`);
    deleted += (await del.json()).length;
    if (names.length < 500) break;
  }
  return deleted;
}

export default async () => {
  try {
    const deleted = await sweepExpired();
    console.log(`[ar-cleanup] deleted ${deleted} expired AR preview(s)`);
    return new Response(JSON.stringify({ deleted }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[ar-cleanup]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};

export const config = { schedule: '@daily' };
