// Everything editable on the site (brand settings, frame templates, reviews,
// FAQs) is read once per build from Supabase, through
// public_photofram_content(), which only returns items that are not hidden.
// You edit it at /admin.
//
// The JSON files in src/data/ are the starting content and the fallback for
// local development without internet. A Netlify build never falls back: if
// Supabase can't be reached the build fails, so the last good version stays
// live instead of the sample content.
import localSettings from '../data/settings.json';
import localTemplates from '../data/templates.json';
import localReviews from '../data/reviews.json';
import localFaqs from '../data/faqs.json';
import { SHOP_ORG_SLUG, SUPABASE_KEY, SUPABASE_URL } from '../config/supabase';
import type { FrameTemplate } from './templates';

export type Settings = typeof localSettings;

type Content = {
  settings: Settings;
  templates: FrameTemplate[];
  reviews: { name: string; rating: number; text: string }[];
  faqs: { q: string; a: string }[];
};

const local: Content = {
  settings: localSettings,
  templates: localTemplates.templates as FrameTemplate[],
  reviews: localReviews.reviews,
  faqs: localFaqs.faqs,
};

async function load(): Promise<Content> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_photofram_content`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_slug: SHOP_ORG_SLUG }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.found) throw new Error(`No shop with slug "${SHOP_ORG_SLUG}"`);
    const templates = (data.templates as FrameTemplate[] | null) ?? [];
    return {
      // Missing keys (e.g. a field added later) keep their local default.
      settings: {
        ...localSettings,
        ...data.settings,
        colors: { ...localSettings.colors, ...data.settings?.colors },
        address: { ...localSettings.address, ...data.settings?.address },
        shipping: { ...localSettings.shipping, ...data.settings?.shipping },
      },
      // Until templates are added in /admin, the built-in set stays live.
      templates: templates.length ? templates : local.templates,
      reviews: data.reviews?.length ? data.reviews : local.reviews,
      faqs: data.faqs?.length ? data.faqs : local.faqs,
    };
  } catch (err) {
    if (process.env.NETLIFY) throw new Error(`[content] Could not load website content from Supabase: ${err}`);
    console.warn(`[content] Using local sample content (${err}).`);
    return local;
  }
}

export const content = await load();
