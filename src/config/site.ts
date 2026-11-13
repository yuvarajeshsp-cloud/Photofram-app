// Business details shown across the site. They are edited in the admin page
// (/admin → Brand & shop details) and loaded from Supabase at build time;
// only the domain is fixed here.
import { content } from '../lib/content';

const settings = content.settings;

export const site = {
  name: settings.brand_name,
  tagline: settings.tagline,
  url: import.meta.env.PUBLIC_SITE_URL || 'https://photofram.example.com',

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
