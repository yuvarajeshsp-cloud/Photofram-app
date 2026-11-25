// Everything editable on the site (brand settings, frame templates, reviews,
// FAQs) lives in the Cloudflare D1 database `photofram` and is edited in the
// admin Worker. The public Worker reads it on every page request
// (src/middleware.ts calls loadContent), so a save in admin is live at once.
//
// The JSON files in src/data/ are the starting content and the fallback for
// anything not set yet: until templates are added in admin the built-in set is
// shown, and FAQs fall back to the starter list. Reviews never fall back:
// only reviews the owner entered are shown.
//
// `content` is one shared object that loadContent() refreshes in place, so
// pages keep importing it as before. It is site-wide data (the same for every
// visitor), so sharing it between concurrent requests is safe.
import localSettings from '../data/settings.json';
import localTemplates from '../data/templates.json';
import localFaqs from '../data/faqs.json';
import type { FrameTemplate } from './templates';

export type Settings = typeof localSettings;

export type Content = {
  settings: Settings;
  templates: FrameTemplate[];
  reviews: { name: string; rating: number; text: string }[];
  faqs: { q: string; a: string }[];
};

const local: Content = {
  settings: localSettings,
  templates: localTemplates.templates as unknown as FrameTemplate[],
  reviews: [],
  faqs: localFaqs.faqs,
};

export const content: Content = { ...local };

/** Minimal D1 shape, so this file needs no Workers types. */
export type D1Like = {
  prepare(sql: string): unknown;
  batch(statements: unknown[]): Promise<{ results: Record<string, unknown>[] }[]>;
};

const parse = (s: unknown) => {
  try {
    return typeof s === 'string' ? JSON.parse(s) : {};
  } catch {
    return {};
  }
};

export async function readContent(db: D1Like): Promise<Content> {
  const [s, t, i] = await db.batch([
    db.prepare(`SELECT data FROM settings WHERE id = 'site'`),
    db.prepare(`SELECT slug, data FROM templates WHERE hidden = 0 ORDER BY position, created_at`),
    db.prepare(`SELECT kind, data FROM items WHERE hidden = 0 ORDER BY position, created_at`),
  ]);
  const saved = parse(s.results[0]?.data);
  const templates = t.results.map((r) => ({ ...parse(r.data), slug: r.slug })) as FrameTemplate[];
  const items = i.results.map((r) => ({ kind: r.kind, ...parse(r.data) }));
  const faqs = items.filter((x) => x.kind === 'faq').map(({ q, a }) => ({ q, a }));
  return {
    // Missing keys (e.g. a field added later) keep their local default.
    settings: {
      ...localSettings,
      ...saved,
      colors: { ...localSettings.colors, ...saved.colors },
      address: { ...localSettings.address, ...saved.address },
      shipping: { ...localSettings.shipping, ...saved.shipping },
    },
    // Until templates are added in admin, the built-in set stays live.
    templates: templates.length ? templates : local.templates,
    // Only reviews the owner entered in admin; never sample testimonials.
    reviews: items.filter((x) => x.kind === 'review').map(({ name, rating, text }) => ({ name, rating, text })),
    faqs: faqs.length ? faqs : local.faqs,
  };
}

let loadedOnce = false;

/** Refreshes `content` from D1. If D1 can't be read, the last good content stays. */
export async function loadContent(db: D1Like | undefined): Promise<Content> {
  try {
    if (!db) throw new Error('no D1 binding');
    Object.assign(content, await readContent(db));
    loadedOnce = true;
  } catch (err) {
    console.error(`[content] Could not read D1, using ${loadedOnce ? 'the last good' : 'the starter'} content: ${err}`);
  }
  return content;
}
