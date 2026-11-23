---
name: Photofram
description: A calm gift store whose one dramatic idea is the wall.
colors:
  accent: "#2346d8"
  accent-hover: "#1b37b0"
  accent-tint: "#eef2ff"
  bg: "#ffffff"
  surface-2: "#f6f7f9"
  ink: "#111827"
  ink-soft: "#4b5563"
  muted: "#6b7280"
  line: "#e5e7eb"
  whatsapp: "#128c4a"
  wall-mint: "#8fd3b6"
  wall-sky: "#8ccbeb"
  wall-salmon: "#f2ae9f"
  wall-white: "#f1eee6"
typography:
  display:
    fontFamily: "Onest, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 4.4vw, 3.9rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  heading:
    fontFamily: "Onest, system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 2.6vw, 2.2rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Onest, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Onest, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
  frame-script:
    fontFamily: "Great Vibes, cursive"
rounded:
  sm: "10px"
  md: "12px"
  lg: "20px"
  pill: "999px"
spacing:
  gutter-mobile: "16px"
  gutter: "24px"
  section: "clamp(56px, 8vw, 96px)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 22px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-ghost:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
  button-whatsapp:
    backgroundColor: "{colors.whatsapp}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    height: "48px"
  choice:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "46px"
  choice-selected:
    backgroundColor: "{colors.accent-tint}"
  field:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "46px"
---

# Design System: Photofram

## Overview

A clean, modern gift store (white ground, one accent, one sans) with a single signature: every frame is shown hanging on a wall. Walls are textured distemper colours with a darker dado band; frames hang from a nail on picture wire with a soft offset shadow. The visitor's chosen wall colour follows them across the site and into the customizer, where "On your wall" hangs their own design at true scale above a sofa.

Mode: Persuade on home and catalog, Operate on the customizer and admin. Operate surfaces borrow only the type, palette, density and the wall move; their controls stay standard.

## Colors

### Primary
- **Accent** `#2346d8`: primary buttons, links, selection, focus rings, selected choices. Owner-configurable in /admin (with **Accent hover** `#1b37b0` and **Accent tint** `#eef2ff`).

### Neutral
- **Bg** `#ffffff` page ground (configurable), **Surface 2** `#f6f7f9` tinted sections, footer and preview stage.
- **Ink** `#111827` text, **Ink soft** `#4b5563` secondary text, **Muted** `#6b7280` meta, **Line** `#e5e7eb` hairlines.
- **WhatsApp** `#128c4a`: only the order action and WhatsApp links.

### Walls
Mint `#8fd3b6`, Sky `#8ccbeb`, Salmon `#f2ae9f`, White `#f1eee6`, each with a darker dado. Walls are the only saturated fields on the page.

### Named Rules
- **The One Accent Rule.** The accent marks action and selection only; walls carry the colour, never decoration.
- **Admin owns the brand.** Accent, hover, tint and background come from /admin via `:root:root` overrides; never hard-code them.

## Typography

One family, Onest, for everything in the interface. Great Vibes appears only inside frames as the customer's script text.

### Hierarchy
- Display: 700, clamp(2.4rem → 3.9rem), line-height 1.04, tracking -0.03em, balanced.
- Heading: 700, clamp(1.7rem → 2.2rem). Small heading 1.1rem.
- Body: 400, 1rem / 1.6; lede 1.15rem in ink-soft, max 44ch.
- Labels and choices: 600 at 0.9–0.95rem; prices use tabular figures.

## Layout

Container max 1200px, 24px gutter (16px on phones). Sections pace at clamp(56px, 8vw, 96px), alternating white and surface-2. Home hero is a two-column split (copy left, wall right) that stacks below 860px. Template grids auto-fill 250px tiles, two columns on phones. The customizer is preview left (sticky) and controls right on desktop; on phones the preview leads, controls follow, and a fixed bottom bar holds price and the order action.

## Elevation & Depth

- Hung frames: `drop-shadow(10px 18px 14px rgb(12 28 22 / .32))`, light from the top-left.
- Cards and order panel: `0 1px 2px rgb(17 24 39 / .05), 0 8px 24px -12px rgb(17 24 39 / .18)`.
- Header: translucent white with backdrop blur, hairline bottom border.

## Shapes

Controls 10–12px radius, panels and walls 20px, wall chips round. Frames themselves are square-cornered with mitred mouldings.

## Components

### Buttons
Primary (accent), ghost (white, hairline border) and WhatsApp (green, only for ordering). Height 48px, small variant 38px.

### Wall chips
34px round swatches with a white ring; the selected chip gets an ink ring. Changing one updates every wall on the site and is remembered. A fifth chip is a colour wheel (conic rainbow ring around the current custom colour) wrapping the native colour picker, so customers can match their own paint; custom walls get a dado 14% darker.

### Choices
Size and finish pickers are bordered tiles with the price underneath; selected = accent border + accent tint.

### Inputs / Fields
46px, hairline border, accent border + 3px accent glow on focus.

### Navigation
Text links with an accent underline for the current page; a details-based menu on phones.

### Hung frame (signature)
Nail, picture wire (SVG, 76% of frame width) and the frame art, on a `.wall` with noise texture and a dado band.

## Do's and Don'ts

### Do:
- Show every frame hanging on a wall, with the visitor's wall colour.
- Label illustrated sample photos as samples wherever they appear.
- Keep ordering on the WhatsApp green button only.

### Don't:
- Don't add eyebrows/kickers above headings, gradient text, or glyph icons; icons are drawn SVG.
- Don't show sample testimonials as real reviews; only owner-entered reviews ship.
- Don't let walls become decoration behind text; they hold frames.
