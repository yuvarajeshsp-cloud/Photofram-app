# Photofram — personalized photo frame shop

An [Astro](https://astro.build) website where customers pick a frame
template, upload photos into its pre-defined slots, watch a **live canvas
preview**, see it on their wall (and in AR), and order on WhatsApp. Inspired
by made-to-order frame shops; all branding, templates and copy are our own.

Built from **rajesh-hub** (`templates/site`, `@rajesh-hub/tokens`,
`@rajesh-hub/web-growth` — vendored in `packages/`). Runs entirely on
Cloudflare.

- **Pages:** Home, Frame templates (catalog + a customizer page per
  template), How it works, FAQs, Corporate gifts, Contact, policy pages, AR
  hand-off page (`/ar`).
- **Customizer** (`src/components/customizer/FrameCustomizer.tsx`): canvas
  rendering, per-slot drag/zoom crop, rect/circle/heart masks, text slots,
  size + finish pricing, print-DPI warning, wall view with colour wheel,
  Web Share / wa.me ordering. Photos never leave the browser until the
  customer orders.
- **AR** (`src/lib/arModel.ts`, `src/components/ar/`): builds a true-size 3D
  frame (GLB) in the browser. On a computer it is uploaded to R2 so a QR code
  can open it on a phone; only the 3D model is shared, never the photos.
- **Admin** (separate Worker, `admin/`): brand name, logo, colours, WhatsApp
  number, address, shipping rules, frame templates (JSON design editor with
  live layout preview), reviews and FAQs. Saves are live on the site at once.
- **Templates** are JSON (`src/data/templates.json` is the starter set, shown
  until templates are added in admin): slot geometry as fractions, so one
  design scales to every print size. `src/lib/templates.ts` holds the schema
  and shared geometry (`slotPath` renders identically as SVG and canvas).

## How it runs

| Piece | Cloudflare | Code |
|---|---|---|
| Public site | Worker `photofram` (Astro, server output, `@astrojs/cloudflare`) | `src/`, `wrangler.jsonc` |
| Content | D1 database `photofram`, read on every page request | `migrations/`, `src/lib/content.ts`, `src/middleware.ts` |
| Logos / catalog images | R2 bucket `photofram-media`, served at `/media/<key>` | `src/pages/media/` |
| AR previews | R2 bucket `photofram-ar`, `POST /api/ar`, served at `/ar-files/<uuid>.glb`; lifecycle rule deletes after 7 days | `src/pages/api/ar.ts`, `src/pages/ar-files/` |
| Meta Conversions API | `POST /api/meta-event`, `POST /api/enquiry` (send nothing unless `PUBLIC_META_PIXEL_ID` and the `META_CAPI_TOKEN` secret are set) | `src/pages/api/`, `src/lib/server/meta.ts` |
| Admin | Worker `photofram-admin` on its own workers.dev address, whole Worker behind a Cloudflare Access app (team `small-rain-35c8`), policy "Photofram owner" allowing only the owner's email; sign-in is with the owner's Cloudflare login. The Worker also verifies the `Cf-Access-Jwt-Assertion` token on every request. Same D1 and media bucket. | `admin/` |

`/admin` on the public site redirects to the admin Worker (`ADMIN_URL` in
`wrangler.jsonc`).

The D1 tables hold JSON in a `data` column: `settings` (one row, id `site`),
`templates` (slug, position, hidden) and `items` (kind `review` or `faq`).
Missing settings keys fall back to `src/data/settings.json`; FAQs fall back to
`src/data/faqs.json`; reviews never fall back (owner-entered only).

## Run locally

```sh
npm install
npm run db:migrate:local   # create the local D1 tables + starter content
npm run dev                # public site, http://localhost:4321
npm run admin:dev          # admin, http://localhost:8788 (Access check skipped via admin/.dev.vars)
```

Both use the same local D1/R2 state in `.wrangler/state`. For the admin
locally, create `admin/.dev.vars` with:

```
DEV_SKIP_ACCESS=1
PUBLIC_SITE_URL=http://localhost:4321
```

(`.dev.vars` is never deployed.)

## Deploy

```sh
npx wrangler login
npm run db:migrate          # apply new migrations to the remote D1
npm run deploy              # public site: https://photofram.photofram-web.workers.dev
npm run admin:deploy        # admin: https://photofram-admin.photofram-web.workers.dev
```

One-time setup (already done for the current account):

- `wrangler d1 create photofram` (id in both `wrangler.jsonc` files).
- `wrangler r2 bucket create photofram-media` and `photofram-ar`, plus
  `wrangler r2 bucket lifecycle add photofram-ar expire-ar-previews --expire-days 7`.
- Workers & Pages → photofram-admin → Access → "Protect this Worker behind
  Access" (all traffic). In Zero Trust → Access controls → Applications, the
  app uses the reusable policy "Photofram owner" (Include → Emails). To let
  someone else into admin, add their email to that policy. The team domain
  and the app's AUD tag are in `admin/wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`,
  `ACCESS_AUD`); update them if the Access app is ever recreated.
- Optional Meta CAPI: `wrangler secret put META_CAPI_TOKEN` and
  `PUBLIC_META_PIXEL_ID` as a var (and at build time for the browser Pixel).
