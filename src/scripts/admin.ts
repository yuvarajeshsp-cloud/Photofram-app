// Admin page logic (Worker photofram-admin): edit the brand settings, frame
// templates, reviews and FAQs stored in D1, through /api/admin/*. Cloudflare
// Access signs people in before the page loads, and the Worker checks the
// Access token on every request; this script just gives the API a friendly face.
import localTemplates from '../data/templates.json';
import { slotPath, type FrameTemplate } from '../lib/templates';

async function api<T = unknown>(method: string, path: string, body?: unknown, contentType = 'application/json'): Promise<T> {
  const expired = new Error('Your sign-in has expired. Reload the page to sign in again.');
  let res: Response;
  try {
    res = await fetch(`/api/admin/${path}`, {
      method,
      // The custom header means another site can't send these requests for you.
      headers: { 'X-Admin': '1', ...(body !== undefined && { 'Content-Type': contentType }) },
      body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : (body as BodyInit),
    });
  } catch {
    // An expired Access session redirects to the sign-in page on another
    // address, which the browser blocks for fetch.
    throw expired;
  }
  if (res.redirected || res.status === 401) throw expired;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

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

// ---------- data ----------

type ItemRow = { id: string; kind: 'review' | 'faq'; position: number; hidden: boolean; data: Record<string, unknown> };
type TplRow = { id: string; slug: string; position: number; hidden: boolean; data: Record<string, unknown> };

let settings: Record<string, any> = {};
let items: ItemRow[] = [];
let templates: TplRow[] = [];

async function loadAll() {
  const res = await api<{ settings: Record<string, any>; items: ItemRow[]; templates: TplRow[]; siteUrl: string; email: string }>('GET', 'content');
  settings = res.settings ?? {};
  items = res.items;
  templates = res.templates;
  if (res.siteUrl) ($('#view-site') as HTMLAnchorElement).href = res.siteUrl;
  $('#who').textContent = res.email ? `Signed in as ${res.email}` : '';
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
  f.color_primary.value = settings.colors?.primary ?? '#2346d8';
  f.color_primary_hover.value = settings.colors?.primary_hover ?? '#1b37b0';
  f.color_tint.value = settings.colors?.tint ?? '#eef2ff';
  f.color_background.value = settings.colors?.background ?? '#ffffff';
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

// Stores the image in R2 (photofram-media); returns its path on the public site (/media/...).
async function uploadMedia(file: File, prefix: string): Promise<string> {
  const res = await api<{ url: string }>('POST', `media?prefix=${encodeURIComponent(prefix)}`, file, file.type || 'application/octet-stream');
  return res.url;
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
    await api('PUT', 'settings', settings);
    f.logo_file.value = '';
    fillSettingsForm();
    say('Details saved. They are live on the site now.');
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
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;border:1px solid var(--line);border-radius:6px;background:${design.background ?? '#fff'}">${slots}</svg>`;
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
    await api('POST', 'templates', { id: editingId ?? undefined, slug: data.slug, data });
    tplDialog.close();
    await loadAll();
    say('Template saved. It is live on the site now.');
  } catch (err) {
    fail(err);
  }
});

function renderTemplates() {
  const list = $('#tpl-list');
  list.innerHTML = '';
  if (!templates.length) {
    list.innerHTML = '<p class="muted" style="font-size:0.9rem;margin:12px 0 0">No templates yet — the site shows the built-in starter set.</p>';
    return;
  }
  for (const row of templates) {
    const d: any = row.data;
    const div = document.createElement('div');
    div.className = `admin-item${row.hidden ? ' is-hidden' : ''}`;
    div.innerHTML = `
      <div class="admin-item__body">
        <p class="admin-item__name"></p>
        <p class="muted"></p>
      </div>
      <button class="btn btn--ghost btn--sm" data-act="edit" type="button">Edit</button>
      <button class="btn btn--ghost btn--sm" data-act="hide" type="button">${row.hidden ? 'Show' : 'Hide'}</button>
      <button class="btn btn--ghost btn--sm" data-act="del" type="button">Delete</button>`;
    div.querySelector('.admin-item__name')!.textContent = d.name ?? row.slug;
    div.querySelector('p + p')!.textContent = `/frames/${row.slug} · ${(d.slots ?? []).length} photos · ${d.category ?? ''}`;
    div.querySelector('[data-act=edit]')!.addEventListener('click', () => openTplDialog(row));
    div.querySelector('[data-act=hide]')!.addEventListener('click', async () => {
      api('PATCH', `templates/${encodeURIComponent(row.id)}`, { hidden: !row.hidden }).then(loadAll).catch(fail);
    });
    div.querySelector('[data-act=del]')!.addEventListener('click', async () => {
      if (!confirm(`Delete template "${d.name ?? row.slug}"?`)) return;
      api('DELETE', `templates/${encodeURIComponent(row.id)}`).then(loadAll).catch(fail);
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
          <p class="muted"></p>
        </div>
        <button class="btn btn--ghost btn--sm" data-act="hide" type="button">${row.hidden ? 'Show' : 'Hide'}</button>
        <button class="btn btn--ghost btn--sm" data-act="del" type="button">Delete</button>`;
      div.querySelector('.admin-item__name')!.textContent = kind === 'review' ? `${d.name} · ${'★'.repeat(d.rating ?? 5)}` : d.q;
      div.querySelector('p + p')!.textContent = kind === 'review' ? d.text : d.a;
      div.querySelector('[data-act=hide]')!.addEventListener('click', async () => {
        api('PATCH', `items/${encodeURIComponent(row.id)}`, { hidden: !row.hidden }).then(loadAll).catch(fail);
      });
      div.querySelector('[data-act=del]')!.addEventListener('click', async () => {
        if (!confirm('Delete this item?')) return;
        api('DELETE', `items/${encodeURIComponent(row.id)}`).then(loadAll).catch(fail);
      });
      list.append(div);
    }
  }
}

async function addItem(kind: 'review' | 'faq', data: Record<string, unknown>) {
  await api('POST', 'items', { kind, data });
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

loadAll().catch(fail);
