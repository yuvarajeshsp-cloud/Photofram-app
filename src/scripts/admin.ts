// /admin logic: Supabase sign-in, then edit photofram_settings,
// photofram_templates and photofram_items. Row level security enforces that
// only an Administrator or Manager of the shop can change anything; this
// script just gives those rules a friendly face.
import { createClient, type Session } from '@supabase/supabase-js';
import { MEDIA_BUCKET, SHOP_ORG_ID, SUPABASE_KEY, SUPABASE_URL } from '../config/supabase';
import localTemplates from '../data/templates.json';
import { slotPath, type FrameTemplate } from '../lib/templates';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const msgEl = $('#msg');

function say(text: string, ok = true) {
  msgEl.textContent = text;
  msgEl.className = `admin-msg ${ok ? 'admin-msg--ok' : 'admin-msg--err'}`;
  msgEl.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => (msgEl.hidden = true), 6000);
}

const fail = (err: unknown) => {
  console.error(err);
  say(err instanceof Error ? err.message : String(err), false);
};

// ---------- auth ----------

async function refreshAuth(session: Session | null) {
  const authed = !!session;
  $('#auth').hidden = authed;
  $('#app').hidden = !authed;
  if (authed) await loadAll().catch(fail);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  const { error } = await supabase.auth.signInWithPassword({
    email: String(f.get('email')),
    password: String(f.get('password')),
  });
  if (error) say(error.message, false);
});

$('#signout').addEventListener('click', () => supabase.auth.signOut());
supabase.auth.onAuthStateChange((_evt, session) => refreshAuth(session));

// ---------- data ----------

type ItemRow = { id: string; kind: 'review' | 'faq'; position: number; hidden: boolean; data: Record<string, unknown> };
type TplRow = { id: string; slug: string; position: number; hidden: boolean; data: Record<string, unknown> };

let settings: Record<string, any> = {};
let items: ItemRow[] = [];
let templates: TplRow[] = [];

async function loadAll() {
  const [s, i, tp] = await Promise.all([
    supabase.from('photofram_settings').select('data').maybeSingle(),
    supabase.from('photofram_items').select('id,kind,position,hidden,data').order('position').order('created_at'),
    supabase.from('photofram_templates').select('id,slug,position,hidden,data').order('position').order('created_at'),
  ]);
  if (s.error) throw s.error;
  if (i.error) throw i.error;
  if (tp.error) throw tp.error;
  settings = s.data?.data ?? {};
  items = (i.data ?? []) as ItemRow[];
  templates = (tp.data ?? []) as TplRow[];
  fillSettingsForm();
  renderItems();
  renderTemplates();
}

// ---------- settings ----------

const sForm = $('#settings-form') as unknown as HTMLFormElement;

function fillSettingsForm() {
  const f = sForm.elements as any;
  f.brand_name.value = settings.brand_name ?? 'PhotoFram';
  f.tagline.value = settings.tagline ?? '';
  f.whatsapp.value = settings.whatsapp ?? '';
  f.phone_display.value = settings.phone_display ?? '';
  f.instagram.value = settings.instagram ?? '';
  f.facebook_url.value = settings.facebook_url ?? '';
  f.color_primary.value = settings.colors?.primary ?? '#3b38a6';
  f.color_primary_hover.value = settings.colors?.primary_hover ?? '#2e2b8a';
  f.color_tint.value = settings.colors?.tint ?? '#ececff';
  f.color_background.value = settings.colors?.background ?? '#f6f6ff';
  f.announcement.value = settings.announcement ?? '';
  f.hours.value = settings.hours ?? '';
  f.ship_flat.value = settings.shipping?.flat_fee ?? 50;
  f.ship_free.value = settings.shipping?.free_above ?? 299;
  f.ship_processing.value = settings.shipping?.processing_days ?? '1-2 business days';
  f.ship_lead.value = settings.shipping?.occasion_lead_days ?? 15;
  f.addr1.value = settings.address?.line1 ?? '';
  f.addr2.value = settings.address?.line2 ?? '';
  f.city.value = settings.address?.city ?? '';
  f.state.value = settings.address?.state ?? '';
  f.pin.value = settings.address?.pin ?? '';
  $('#logo-now').textContent = settings.logo ? `Current: ${settings.logo}` : 'No logo yet (brand name is shown instead).';
}

async function uploadMedia(file: File, prefix: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${SHOP_ORG_ID}/${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

sForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const f = sForm.elements as any;
    const logoFile: File | undefined = f.logo_file.files?.[0];
    const logo = logoFile && logoFile.size ? await uploadMedia(logoFile, 'logo') : settings.logo ?? '';
    settings = {
      ...settings,
      brand_name: f.brand_name.value.trim(),
      tagline: f.tagline.value.trim(),
      whatsapp: f.whatsapp.value.replace(/\D/g, ''),
      phone_display: f.phone_display.value.trim(),
      instagram: f.instagram.value.trim().replace(/^@/, ''),
      facebook_url: f.facebook_url.value.trim(),
      logo,
      colors: {
        primary: f.color_primary.value,
        primary_hover: f.color_primary_hover.value,
        tint: f.color_tint.value,
        background: f.color_background.value,
      },
      announcement: f.announcement.value.trim(),
      hours: f.hours.value.trim(),
      shipping: {
        flat_fee: Number(f.ship_flat.value) || 0,
        free_above: Number(f.ship_free.value) || 0,
        processing_days: f.ship_processing.value.trim(),
        occasion_lead_days: Number(f.ship_lead.value) || 15,
      },
      address: {
        line1: f.addr1.value.trim(),
        line2: f.addr2.value.trim(),
        city: f.city.value.trim(),
        state: f.state.value.trim(),
        pin: f.pin.value.trim(),
      },
    };
    const { error } = await supabase
      .from('photofram_settings')
      .upsert({ organization_id: SHOP_ORG_ID, data: settings, updated_at: new Date().toISOString() });
    if (error) throw error;
    f.logo_file.value = '';
    fillSettingsForm();
    say('Details saved. Press “Publish website” to put them live.');
  } catch (err) {
    fail(err);
  }
});

// ---------- templates ----------

const tplDialog = $('#tpl-dialog') as HTMLDialogElement;
const tplForm = $('#tpl-form') as unknown as HTMLFormElement;
let editingId: string | null = null;

const starterSelect = $('#tpl-starter') as unknown as HTMLSelectElement;
for (const t of localTemplates.templates) {
  const opt = document.createElement('option');
  opt.value = t.slug;
  opt.textContent = t.name;
  starterSelect.append(opt);
}

function designJsonOf(data: Record<string, unknown>) {
  const { name, slug, category, description, preview, ...design } = data as any;
  return design;
}

function svgPreview(design: any): string {
  try {
    const W = (design.aspect?.w ?? 2) * 100;
    const H = (design.aspect?.h ?? 3) * 100;
    const slots = (design.slots ?? [])
      .map(
        (s: any, i: number) =>
          `<path d="${slotPath(s.shape, s.x * W, s.y * H, s.w * W, s.h * H)}" fill="${['#cfd6e4', '#dbcfe4', '#cfe4d9', '#e4d9cf'][i % 4]}"/>`,
      )
      .join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;border:1px solid var(--border);background:${design.background ?? '#fff'}">${slots}</svg>`;
  } catch {
    return '<p style="color:#991b1b">Invalid design JSON</p>';
  }
}

function openTplDialog(row?: TplRow, base?: FrameTemplate) {
  editingId = row?.id ?? null;
  const d: any = row?.data ?? base ?? {
    name: '',
    category: 'Collage',
    description: '',
    aspect: { w: 2, h: 3 },
    background: '#ffffff',
    slots: [{ id: 'p1', x: 0.08, y: 0.06, w: 0.84, h: 0.72, shape: 'rect' }],
    texts: [],
    sizes: ['8 × 12 in'],
    finishes: [
      { id: 'black', label: 'Black frame', color: '#1c1c1c', group: 'framed' },
      { id: 'canvas', label: 'Gallery wrap canvas', color: null, group: 'canvas' },
    ],
    pricing: { framed: { '8 × 12 in': 749 }, canvas: { '8 × 12 in': 1199 } },
  };
  const f = tplForm.elements as any;
  f.name.value = d.name ?? '';
  f.slug.value = row?.slug ?? d.slug ?? '';
  f.category.value = d.category ?? 'Collage';
  f.description.value = d.description ?? '';
  f.json.value = JSON.stringify(designJsonOf(d), null, 2);
  f.preview_file.value = '';
  $('#tpl-preview').innerHTML = svgPreview(designJsonOf(d));
  tplDialog.showModal();
}

tplForm.querySelector('[name=json]')!.addEventListener('input', () => {
  try {
    $('#tpl-preview').innerHTML = svgPreview(JSON.parse((tplForm.elements as any).json.value));
  } catch {
    $('#tpl-preview').innerHTML = '<p style="color:#991b1b">Invalid JSON…</p>';
  }
});

$('#tpl-new').addEventListener('click', () => openTplDialog());
$('#tpl-copy').addEventListener('click', () => {
  const starter = localTemplates.templates.find((t) => t.slug === starterSelect.value) as FrameTemplate | undefined;
  if (starter) openTplDialog(undefined, starter);
});

tplForm.addEventListener('submit', async (e) => {
  if ((e.submitter as HTMLButtonElement)?.value !== 'save') return;
  e.preventDefault();
  try {
    const f = tplForm.elements as any;
    const design = JSON.parse(f.json.value);
    const previewFile: File | undefined = f.preview_file.files?.[0];
    const existing = editingId ? templates.find((t) => t.id === editingId) : undefined;
    const preview =
      previewFile && previewFile.size ? await uploadMedia(previewFile, `tpl-${f.slug.value}`) : (existing?.data as any)?.preview;
    const data = {
      ...design,
      name: f.name.value.trim(),
      slug: f.slug.value.trim(),
      category: f.category.value.trim(),
      description: f.description.value.trim(),
      ...(preview ? { preview } : {}),
    };
    const row = {
      organization_id: SHOP_ORG_ID,
      slug: data.slug,
      data,
      updated_at: new Date().toISOString(),
      ...(editingId ? { id: editingId } : { position: templates.length }),
    };
    const { error } = await supabase.from('photofram_templates').upsert(row, { onConflict: 'organization_id,slug' });
    if (error) throw error;
    tplDialog.close();
    await loadAll();
    say('Template saved. Publish to put it live.');
  } catch (err) {
    fail(err);
  }
});

function renderTemplates() {
  const list = $('#tpl-list');
  list.innerHTML = '';
  if (!templates.length) {
    list.innerHTML = '<p style="color:var(--ink-soft);font-size:0.9rem;margin-top:12px">No templates yet — the site shows the built-in starter set.</p>';
    return;
  }
  for (const row of templates) {
    const d: any = row.data;
    const div = document.createElement('div');
    div.className = `admin-item${row.hidden ? ' is-hidden' : ''}`;
    div.innerHTML = `
      <div class="admin-item__body">
        <p class="admin-item__name"></p>
        <p style="color:var(--ink-soft)"></p>
      </div>
      <button class="btn btn--ghost" data-act="edit" type="button">Edit</button>
      <button class="btn btn--ghost" data-act="hide" type="button">${row.hidden ? 'Show' : 'Hide'}</button>
      <button class="btn btn--ghost" data-act="del" type="button">Delete</button>`;
    div.querySelector('.admin-item__name')!.textContent = d.name ?? row.slug;
    div.querySelector('p + p')!.textContent = `/frames/${row.slug} · ${(d.slots ?? []).length} photos · ${d.category ?? ''}`;
    div.querySelector('[data-act=edit]')!.addEventListener('click', () => openTplDialog(row));
    div.querySelector('[data-act=hide]')!.addEventListener('click', async () => {
      const { error } = await supabase.from('photofram_templates').update({ hidden: !row.hidden }).eq('id', row.id);
      error ? fail(error) : loadAll();
    });
    div.querySelector('[data-act=del]')!.addEventListener('click', async () => {
      if (!confirm(`Delete template "${d.name ?? row.slug}"?`)) return;
      const { error } = await supabase.from('photofram_templates').delete().eq('id', row.id);
      error ? fail(error) : loadAll();
    });
    list.append(div);
  }
}

// ---------- reviews & FAQs ----------

function renderItems() {
  for (const kind of ['review', 'faq'] as const) {
    const list = $(`#${kind}-list`);
    list.innerHTML = '';
    for (const row of items.filter((i) => i.kind === kind)) {
      const d: any = row.data;
      const div = document.createElement('div');
      div.className = `admin-item${row.hidden ? ' is-hidden' : ''}`;
      div.innerHTML = `
        <div class="admin-item__body">
          <p class="admin-item__name"></p>
          <p style="color:var(--ink-soft)"></p>
        </div>
        <button class="btn btn--ghost" data-act="hide" type="button">${row.hidden ? 'Show' : 'Hide'}</button>
        <button class="btn btn--ghost" data-act="del" type="button">Delete</button>`;
      div.querySelector('.admin-item__name')!.textContent = kind === 'review' ? `${d.name} · ${'★'.repeat(d.rating ?? 5)}` : d.q;
      div.querySelector('p + p')!.textContent = kind === 'review' ? d.text : d.a;
      div.querySelector('[data-act=hide]')!.addEventListener('click', async () => {
        const { error } = await supabase.from('photofram_items').update({ hidden: !row.hidden }).eq('id', row.id);
        error ? fail(error) : loadAll();
      });
      div.querySelector('[data-act=del]')!.addEventListener('click', async () => {
        if (!confirm('Delete this item?')) return;
        const { error } = await supabase.from('photofram_items').delete().eq('id', row.id);
        error ? fail(error) : loadAll();
      });
      list.append(div);
    }
  }
}

async function addItem(kind: 'review' | 'faq', data: Record<string, unknown>) {
  const { error } = await supabase.from('photofram_items').insert({
    organization_id: SHOP_ORG_ID,
    kind,
    data,
    position: items.filter((i) => i.kind === kind).length,
  });
  if (error) throw error;
  await loadAll();
}

$('#review-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  try {
    await addItem('review', { name: f.get('name'), rating: Number(f.get('rating')), text: f.get('text') });
    (e.target as HTMLFormElement).reset();
  } catch (err) {
    fail(err);
  }
});

$('#faq-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  try {
    await addItem('faq', { q: f.get('q'), a: f.get('a') });
    (e.target as HTMLFormElement).reset();
  } catch (err) {
    fail(err);
  }
});

// ---------- publish ----------

$('#publish').addEventListener('click', async () => {
  const state = $('#publish-state');
  state.textContent = 'Starting…';
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch('/.netlify/functions/publish', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Publish failed (${res.status})`);
    state.textContent = 'Rebuilding — the site updates in a few minutes.';
    say('Publish started.');
  } catch (err) {
    state.textContent = '';
    fail(err);
  }
});
