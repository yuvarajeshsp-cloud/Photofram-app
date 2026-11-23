# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Families and gift buyers in India (Tamil Nadu first) ordering a personalised photo frame for an anniversary, birthday, wedding, housewarming or as a corporate gift. They arrive from Instagram and WhatsApp links and design on phones and desktops in equal measure. The shop owner manages content from `/admin`.

## Product Purpose

Let a customer pick a frame template with fixed photo positions, drop their own photos and words into it, see exactly what will be printed in a live preview, and send the order on WhatsApp. Success: a customer goes from template to a confident WhatsApp order without needing to ask questions.

## Positioning

The preview is the product: the customer's real photos in the real layout, cropped by them, in the chosen finish and size, and shown hanging on a wall at true scale before they pay. Competing shops (for example the Shopify reference store) rely on a paid personalisation app and static product photos.

## Operating Context

- Ordering happens on WhatsApp: the site composes the order text and shares the preview image; payment is collected in the chat.
- Photos never leave the customer's device until they order.
- Prices are in rupees and vary by size and finish group (framed vs gallery-wrap canvas). Flat ₹50 shipping up to ₹299, free above (editable in /admin).
- Orders are processed in 1–2 business days; customers should order 15 working days ahead for occasions (editable in /admin).

## Capabilities and Constraints

- Astro static site with React islands, hosted on Netlify, content read from Supabase at build time; `/admin` edits content and a Publish button rebuilds.
- Templates are JSON: slot geometry as fractions, rect / circle / heart masks, text slots, sizes, finishes, pricing.
- Brand name, logo, colours, WhatsApp number, address, shipping rules are configurable in /admin; nothing brand-specific may be hard-coded beyond defaults.
- Shared designs and features come from the `rajesh-hub` repo where they exist.
- No online payment yet (Razorpay is a later phase). No customer accounts.

## Brand Commitments

- Brand name is currently "PhotoFram" (placeholder until the owner sets it in /admin).
- Owner's direction (Nov 2026): clean, elegant storefront in the modern gift-store standard, with a "see it on your wall" preview as the signature.

## Evidence on Hand

- Starter frame templates in `src/data/templates.json` (our own layouts).
- Sample reviews in `src/data/reviews.json` are placeholders and must be replaced with real reviews before launch.
- No real product photography yet; illustrated sample photos are used in previews and labelled as samples.

## Product Principles

1. What you see is what we print: the preview uses the same geometry as production.
2. The customer's photos stay theirs until they choose to order.
3. Ordering should feel like messaging a trusted local shop, not filling a checkout.
4. Everything the owner might change lives in /admin, not in code.
