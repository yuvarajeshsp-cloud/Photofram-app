# Handover: move Photofram to Cloudflare

Written 24 Nov 2026 at the end of a cloud session, for a local Claude Code
session on the owner's Mac. Read this whole file before changing anything.

## 0. Get the code

```sh
git clone https://github.com/yuvarajeshsp-cloud/Photofram-app.git   # or cd into your existing clone
cd Photofram-app
git fetch origin
git checkout claude/brave-hawking-73y4v1     # all work so far is on this branch (main is empty)
npm install
npm run dev                                  # http://localhost:4321, admin at /admin
```

Keep working on `claude/brave-hawking-73y4v1` (or a new branch from it). Do
not push to `main` without the owner saying so.

## 1. What the site is today

Astro 7 + React islands, plain CSS on top of the vendored `@rajesh-hub/tokens`
and `@rajesh-hub/web-growth` packages (in `packages/`). Personalised photo
frame shop: pick a template, add photos, live preview, see it on a wall,
order on WhatsApp.

| Area | Files |
|---|---|
| Pages | `src/pages/*.astro` (home, `/frames`, `/frames/[slug]`, `/ar`, `/admin`, FAQs, contact, corporate, policies) |
| Customizer (canvas, wall view, AR button) | `src/components/customizer/FrameCustomizer.tsx` |
| AR (model-viewer, GLB builder, QR hand-off) | `src/lib/arModel.ts`, `src/components/ar/*` |
| Wall colours incl. custom colour wheel | `src/scripts/walls.ts`, `src/components/WallChips.astro` |
| Template model + geometry | `src/lib/templates.ts`, starter data `src/data/templates.json` |
| Content loading (build time) | `src/lib/content.ts`, `src/config/site.ts`, `src/config/supabase.ts` |
| Admin UI (Supabase auth + tables) | `src/pages/admin.astro`, `src/scripts/admin.ts` |
| Server functions (Netlify) | `netlify/functions/publish.mjs`, `enquiry.mjs`, `meta-event.mjs`, `ar-cleanup.mjs` |
| Design system / product truth | `DESIGN.md`, `PRODUCT.md`, `.impeccable/` (keep the UI exactly as it is) |
| Supabase SQL (history) | `supabase/*.sql` |

Pinned versions that matter: `@google/model-viewer@4.4.0` needs `three@0.183.x`
(do not upgrade three on its own).

## 2. Current hosting and data (all still live)

- **Netlify**: site `photofram-shop` (https://photofram-shop.netlify.app,
  site id `c2e37152-ea23-4e62-9aef-d52172fd7720`). Deployed by direct API
  upload, not linked to Git. It is behind Netlify's SSO site protection, so
  the public sees a login page. Leave it running until Cloudflare is confirmed.
- **Supabase** project `Embroidery-Shop-Manager-DB` (ref
  `brjosrtzyjorncmjhqhg`) is shared with the owner's **Shop Manager app and the
  Paavai Embroidery website**. Photofram only owns: tables `photofram_settings`,
  `photofram_templates`, `photofram_items`, the RPC
  `public_photofram_content`, and bucket `photofram-media`.
  - Checked on 24 Nov: all three Photofram tables are **empty** and
    `photofram-media` has no files. **Nothing needs migrating**; the site has
    always run on the starter content in `src/data/*.json`.
  - The AR bucket `photofram-ar` was **never created** (the Supabase approval
    prompt kept timing out). Its SQL is in
    `supabase/20261123000000_photofram_ar_handoff.sql` but is no longer needed
    once AR moves to R2.

## 3. Decisions the owner made

1. **Move only Photofram** to Cloudflare. Shop Manager and Paavai stay on
   Supabase, untouched. Remove Photofram's Supabase tables/bucket/RPC **only
   after** the Cloudflare site is confirmed working, and never touch any other
   table, policy or bucket in that project.
2. **Admin login = Cloudflare Access** (email one-time code, free up to 50
   users). No passwords stored by the site.
3. **Start on the free `*.workers.dev` address**; a custom domain comes later.
4. Keep the current UI and features exactly; this is an infrastructure move.

## 4. Target architecture

| Today | On Cloudflare |
|---|---|
| Netlify static site | **Worker `photofram`** (Astro with `@astrojs/cloudflare`, server output) serving the public site |
| Supabase tables, read at build + Publish rebuild | **D1** database `photofram`, read per request; admin saves go live at once (Publish button removed or turned into "View site") |
| Supabase `photofram-media` bucket | **R2** bucket `photofram-media`, served by the Worker at `/media/<key>` |
| Supabase `photofram-ar` bucket + `ar-cleanup` job | **R2** bucket `photofram-ar` with a **lifecycle rule: delete after 7 days**; upload via `POST /api/ar`, served at `/ar-files/<uuid>.glb` (public URL, so Android Scene Viewer works) |
| `/admin` with Supabase auth | **Separate Worker `photofram-admin`** on its own workers.dev hostname, whole hostname protected by Cloudflare Access; it shares the same D1 and R2 bindings |
| Netlify functions | Astro API routes / Worker routes |

Why admin is a separate Worker: Cloudflare Access on a `workers.dev` address
protects the whole Worker hostname, not a path, so `/admin` inside the public
Worker would lock the whole shop. Defence in depth: the admin Worker must also
verify the `Cf-Access-Jwt-Assertion` JWT against
`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` and the app's AUD.

Other things to know:
- The Cache API does nothing on `workers.dev`, so read D1 per request (cheap;
  D1 free tier is 5M reads/day). Add edge caching when a custom domain exists.
- R2 needs a payment method on the account even on the free tier.
- Zero Trust needs a one-time onboarding (team name + Free plan) before Access
  apps can be created.

## 5. Step-by-step plan

1. **Account prerequisites** (owner, in the dashboard): Cloudflare account,
   workers.dev subdomain chosen, R2 enabled, Zero Trust onboarded (Free plan).
   Locally: `npx wrangler login` (browser OAuth; no API token needed).
2. **D1**: `wrangler d1 create photofram`; schema in `migrations/0001_init.sql`:
   - `settings (id TEXT PRIMARY KEY DEFAULT 'site', data TEXT NOT NULL, updated_at TEXT)`
   - `templates (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, position INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, data TEXT NOT NULL, created_at TEXT, updated_at TEXT)`
   - `items (id TEXT PRIMARY KEY, kind TEXT CHECK (kind IN ('review','faq')), position INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, data TEXT NOT NULL, created_at TEXT, updated_at TEXT)`
   Seed `settings` from `src/data/settings.json` and `faqs` from
   `src/data/faqs.json`. Leave `templates` empty (the site falls back to
   `src/data/templates.json` while it is empty, same as today). Reviews stay
   empty: **never ship sample testimonials** (owner-entered reviews only).
3. **R2**: `wrangler r2 bucket create photofram-media` and `photofram-ar`;
   lifecycle on `photofram-ar` to expire objects after 7 days
   (`wrangler r2 bucket lifecycle add photofram-ar ...`).
4. **Public Worker**: add `@astrojs/cloudflare`, `output: 'server'`,
   `wrangler.jsonc` with D1 + R2 bindings. Rewrite `src/lib/content.ts` to read
   D1 at request time (keep the JSON fallbacks and the same `Content` shape so
   pages don't change). Routes:
   - `GET /media/[...key]` and `GET /ar-files/[name]` stream from R2 with
     correct content types and long cache headers.
   - `POST /api/ar`: accept only `model/gltf-binary`, max 4 MB, body must
     start with the GLB magic `glTF`; store as `<uuid>.glb`; return the path.
     Update `uploadFrameGlb` / `publicModelUrl` / `AR_PATH_RE` in
     `src/lib/arModel.ts` and `src/components/ar/ArPage.tsx` to use these
     routes; delete the Supabase sweep code (R2 lifecycle replaces it).
   - Port `netlify/functions/enquiry.mjs` and `meta-event.mjs` (they come from
     `packages/web-growth/netlify/`) to API routes with the same behaviour.
5. **Admin Worker** (`admin/` folder or a second Astro entry; simplest is a
   small Worker that serves the existing admin page and a JSON API):
   - Replace the Supabase calls in `src/scripts/admin.ts` with `fetch` to
     `/api/admin/*` (settings GET/PUT, templates CRUD, items CRUD, media upload
     to R2). Remove sign-in UI; Access handles login. Keep the UI otherwise.
   - Every `/api/admin/*` handler verifies the Access JWT first.
6. **Cloudflare Access**: create a self-hosted Access application for the
   admin Worker's workers.dev hostname with a policy allowing the owner's
   email (ask the owner which email(s); do not guess). Verify an
   unauthenticated request gets the Access login.
7. **Deploy** both Workers (`wrangler deploy`), then verify (section 6).
8. **After the owner confirms**: optionally delete the Netlify site, and drop
   only the Photofram objects from Supabase (`photofram_*` tables,
   `public_photofram_content`, `photofram-media` bucket and its policies).
   Remove `netlify/`, `netlify.toml`, `src/config/supabase.ts`,
   `@supabase/supabase-js` and the Supabase build-time fetch.

## 6. Done means

- Public site on `https://photofram.<subdomain>.workers.dev`: home, `/frames`,
  every `/frames/<slug>`, FAQs, policies render with D1 content; no console
  errors; no horizontal scroll at 390px.
- Customizer: add photos, Design / On your wall views, colour wheel, size and
  finish prices, WhatsApp order button, all unchanged.
- AR: on a computer, View in AR shows the 3D frame and a QR code; the QR link
  opens `/ar/?m=...` on a phone and loads the model from `/ar-files/...`.
  On an iPhone and an Android phone, "Place on your wall" works.
- Admin Worker: blocked without Access login; after login, editing brand
  name / WhatsApp number / colours shows on the public site immediately;
  template and FAQ edits work; logo upload lands in R2 and displays.
- `PRODUCT.md` (Capabilities) and `README.md` describe Cloudflare, not
  Netlify/Supabase.

## 7. Open items from earlier (tell the owner)

- The **WhatsApp number** has never been set; ordering does nothing useful
  until it is entered in admin.
- A **Netlify personal access token was pasted in chat** earlier; it should be
  revoked in Netlify (User settings → Applications) once Netlify is retired.
- Sample photos in previews are illustrations and are labelled as samples;
  real product photography is still wanted.
- AR placement on real phones has not been tested yet (no camera in the cloud
  session).

## 8. Owner's standing preferences

- Reuse designs and features from the `yuvarajeshsp-cloud/rajesh-hub` repo
  (see its `CATALOGUE.md`) before building new ones.
- Everything the owner may change lives in admin, not in code.
- Use the Impeccable design rules already captured in `DESIGN.md`; no
  eyebrows/kickers, no glyph icons, label sample content.
