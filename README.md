# Photofram — personalized photo frame shop

A static [Astro](https://astro.build) website where customers pick a frame
template, upload photos into its pre-defined slots, watch a **live canvas
preview**, and order on WhatsApp. Inspired by made-to-order frame shops;
all branding, templates and copy are our own.

Built from **rajesh-hub** (`templates/site`, `@rajesh-hub/tokens`,
`@rajesh-hub/web-growth` — vendored in `packages/`) and the Paavai admin
pattern (Supabase as CMS + role-checked Publish button).

- **Pages:** Home, Frame templates (catalog + a customizer page per
  template), How it works, FAQs, Corporate gifts, Contact, policy pages.
- **Customizer** (`src/components/customizer/FrameCustomizer.tsx`): canvas
  rendering, per-slot drag/zoom crop, rect/circle/heart masks, text slots,
  size + finish pricing, print-DPI warning, Web Share / wa.me ordering.
  Photos never leave the browser until the customer orders.
- **Admin page** at `/admin`, signed in with a Shop Manager account
  (Administrator/Manager): brand name, logo, colours, WhatsApp number,
  address, shipping rules, frame templates (with a JSON design editor and
  live layout preview), reviews and FAQs. Content lives in the Shop Manager
  Supabase project (`photofram_settings`, `photofram_templates`,
  `photofram_items`; bucket `photofram-media`); **Publish website** rebuilds
  the site through a Netlify build hook.
- **Templates** are JSON (`src/data/templates.json` is the starter set and
  offline fallback): slot geometry as fractions, so one design scales to
  every print size. `src/lib/templates.ts` holds the schema + shared
  geometry (`slotPath` renders identically as SVG and canvas `Path2D`).

## Run locally

```sh
npm install
npm run dev            # http://localhost:4321 (admin at /admin)
npm run build          # production build into dist/
```

Without network access the site builds from the JSON files in `src/data/`.
On Netlify the build reads Supabase and fails rather than falling back, so
the last good version stays live.

## Deploy on Netlify

1. Create the site from this repo; set env vars from `.env.example`
   (at minimum `PUBLIC_SITE_URL`; the Supabase values have safe defaults).
2. Create a build hook and store it in `BUILD_HOOK_URL` so the admin
   **Publish website** button works.

## Supabase

The migration that creates the tables, storage bucket and the
`public_photofram_content()` reader lives in
`supabase/20261113000000_photofram_website_content.sql` and is applied to the
shared Shop Manager project.
