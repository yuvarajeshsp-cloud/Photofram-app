// Business details shown across the site. They are edited in the admin Worker
// (Brand & shop details), stored in D1 and refreshed on every request by
// src/middleware.ts; only the domain comes from the environment (or the
// request's own address).
import { content, type Settings } from '../lib/content';

function fromSettings(settings: Settings, url: string) {
  return {
    name: settings.brand_name,
    tagline: settings.tagline,
    url,

    logo: settings.logo || null,
    colors: settings.colors,

    // Digits only, with country code — used to build wa.me links.
    whatsapp: (settings.whatsapp || '').replace(/\D/g, ''),
    phoneDisplay: settings.phone_display,

    instagram: (settings.instagram || '').trim().replace(/^@/, ''),
    facebookUrl: settings.facebook_url || null,
    youtubeUrl: settings.youtube_url || null,
    googleReviewsUrl: settings.google_reviews_url || null,

    address: settings.address,
    hours: settings.hours,
    shipping: settings.shipping,
    announcement: settings.announcement,
  };
}

const fixedUrl: string = import.meta.env.PUBLIC_SITE_URL || '';

export const site = fromSettings(content.settings, fixedUrl || 'https://photofram.example.com');

/** Called by the middleware after content is refreshed. */
export function refreshSite(origin: string) {
  Object.assign(site, fromSettings(content.settings, fixedUrl || origin));
}
