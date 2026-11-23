// Live frame customizer. Design view: tap a slot to add a photo, drag to
// reposition, zoom to crop, type the words; the canvas redraws instantly.
// On-your-wall view: the same render hung on the visitor's wall colour at
// true scale above a sofa, so sizes can be compared honestly. Ordering
// composes a WhatsApp message and shares the preview image.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FrameTemplate, PhotoSlot } from '../../lib/templates';
import { FONT_STACKS, WALLS, formatINR, parseSize, priceFor, slotPath } from '../../lib/templates';
import { currentWall, isCustomWall, setWall, type WallChoice } from '../../scripts/walls';
import { SUPABASE_KEY, SUPABASE_URL } from '../../config/supabase';

const ArDialog = lazy(() => import('../ar/ArDialog'));

type SlotState = { img: HTMLImageElement; dx: number; dy: number; zoom: number };

interface Props {
  template: FrameTemplate;
  whatsapp: string;
  brandName: string;
  shipping: { flat_fee: number; free_above: number };
}

const PREVIEW_LONG_SIDE = 1400;
const EXPORT_LONG_SIDE = 2000;
const WALL_LONG_SIDE = 800;
// Room drawn at 128 × 96 inches (a 10.7 ft wide, 8 ft tall wall section).
const ROOM_W_IN = 128;
const ROOM_H_IN = 96;
const SOFA_W_IN = 84;
const FRAME_BOTTOM_IN = 44; // sofa back (34 in) + 10 in gap
const MOULDING_IN = 1.25;

const Icon = {
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  pencil: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>,
  wall: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3v3M7 10l5-4 5 4" /><rect x="6" y="10" width="12" height="9" /></svg>,
  ar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></svg>,
  wa: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.2 21.8l5.1-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.3-.2-.6-.3Z" /></svg>,
};

export default function FrameCustomizer({ template: t, whatsapp, brandName, shipping }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [size, setSize] = useState(t.sizes[0]);
  const [finishId, setFinishId] = useState(t.finishes[0]?.id ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'design' | 'wall'>('design');
  const [wall, setWallState] = useState<WallChoice>(WALLS[0].id);
  const [wallImg, setWallImg] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [arUsed, setArUsed] = useState(false);
  const dragRef = useRef<{ slotId: string; startX: number; startY: number; dx0: number; dy0: number } | null>(null);
  const pendingSlotRef = useRef<string | null>(null);

  useEffect(() => {
    setWallState(currentWall());
    const onWall = (e: Event) => setWallState((e as CustomEvent<WallChoice>).detail);
    window.addEventListener('pf:wall', onWall);
    return () => window.removeEventListener('pf:wall', onWall);
  }, []);

  const finish = t.finishes.find((f) => f.id === finishId) ?? t.finishes[0];
  const price = priceFor(t, size, finish?.id ?? '') ?? 0;
  const filled = t.slots.filter((s) => slots[s.id]).length;
  const ready = filled === t.slots.length;
  const shipText = price > shipping.free_above ? 'Free shipping' : `+ ₹${shipping.flat_fee} shipping`;

  const geo = useMemo(() => {
    const long = PREVIEW_LONG_SIDE;
    const ratio = t.aspect.w / t.aspect.h;
    const W = ratio >= 1 ? long : Math.round(long * ratio);
    const H = ratio >= 1 ? Math.round(long / ratio) : long;
    const border = finish?.color ? Math.round(Math.min(W, H) * 0.05) : 0;
    const mat = finish?.color ? Math.round(border * 0.6) : 0;
    const pad = border + mat;
    return { W, H, pad, border, totalW: W + 2 * pad, totalH: H + 2 * pad };
  }, [t, finish]);

  const slotRect = useCallback(
    (s: PhotoSlot) => ({ x: geo.pad + s.x * geo.W, y: geo.pad + s.y * geo.H, w: s.w * geo.W, h: s.h * geo.H }),
    [geo],
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number, forExport: boolean) => {
      const W = geo.W * scale;
      const H = geo.H * scale;
      const pad = geo.pad * scale;
      const b = geo.border * scale;
      const TW = W + 2 * pad;
      const TH = H + 2 * pad;

      ctx.clearRect(0, 0, TW, TH);
      if (finish?.color) {
        ctx.fillStyle = finish.color;
        ctx.fillRect(0, 0, TW, TH);
        // Light from the top-left: lit top edge, shaded bottom edge, mitred corners.
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b, b); ctx.lineTo(TW - b, b); ctx.lineTo(TW, 0); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.moveTo(0, TH); ctx.lineTo(b, TH - b); ctx.lineTo(TW - b, TH - b); ctx.lineTo(TW, TH); ctx.fill();
        ctx.fillStyle = '#fbfbf9';
        ctx.fillRect(b, b, TW - 2 * b, TH - 2 * b);
      }
      ctx.save();
      ctx.translate(pad, pad);
      ctx.fillStyle = t.background;
      ctx.fillRect(0, 0, W, H);

      for (const s of t.slots) {
        const r = { x: s.x * W, y: s.y * H, w: s.w * W, h: s.h * H };
        const path = new Path2D(slotPath(s.shape, r.x, r.y, r.w, r.h));
        const st = slots[s.id];
        ctx.save();
        ctx.clip(path);
        if (st) {
          const cover = Math.max(r.w / st.img.naturalWidth, r.h / st.img.naturalHeight) * st.zoom;
          const iw = st.img.naturalWidth * cover;
          const ih = st.img.naturalHeight * cover;
          ctx.drawImage(st.img, r.x + r.w / 2 - iw / 2 + st.dx * r.w, r.y + r.h / 2 - ih / 2 + st.dy * r.h, iw, ih);
        } else {
          ctx.fillStyle = '#eceef2';
          ctx.fill(path);
          if (!forExport) {
            const s2 = Math.min(r.w, r.h);
            ctx.strokeStyle = '#9aa1ac';
            ctx.lineWidth = Math.max(2, s2 * 0.018);
            ctx.lineCap = 'round';
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2 - s2 * 0.06;
            const k = s2 * 0.08;
            ctx.beginPath(); ctx.moveTo(cx - k, cy); ctx.lineTo(cx + k, cy); ctx.moveTo(cx, cy - k); ctx.lineTo(cx, cy + k); ctx.stroke();
            ctx.fillStyle = '#6b7280';
            ctx.font = `600 ${Math.max(13, s2 * 0.085)}px Onest, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Add photo', cx, cy + k + s2 * 0.1);
          }
        }
        ctx.restore();
        if (!forExport) {
          ctx.save();
          const on = selected === s.id;
          ctx.lineWidth = on ? 5 : 1.5;
          ctx.strokeStyle = on ? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2346d8' : 'rgba(17,24,39,0.18)';
          ctx.stroke(path);
          ctx.restore();
        }
      }

      for (const txt of t.texts) {
        const value = texts[txt.id]?.trim();
        const shown = value || (forExport ? '' : txt.placeholder);
        if (!shown) continue;
        ctx.fillStyle = value ? txt.color : 'rgba(17,24,39,0.32)';
        ctx.font = `${txt.size * H}px ${FONT_STACKS[txt.font]}`;
        ctx.textAlign = txt.align === 'left' ? 'left' : 'center';
        ctx.textBaseline = 'middle';
        const x = txt.align === 'left' ? (txt.x - txt.w / 2) * W : txt.x * W;
        ctx.fillText(shown, x, txt.y * H, txt.w * W);
      }
      ctx.restore();
    },
    [t, geo, slots, texts, selected, finish],
  );

  useEffect(() => {
    if (view !== 'design') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    draw(ctx, 1, false);
    let alive = true;
    document.fonts?.ready.then(() => alive && draw(ctx, 1, false));
    return () => {
      alive = false;
    };
  }, [draw, view]);

  const renderTo = useCallback(
    (longSide: number) => {
      const scale = longSide / Math.max(geo.W, geo.H);
      const off = document.createElement('canvas');
      off.width = Math.round(geo.totalW * scale);
      off.height = Math.round(geo.totalH * scale);
      const ctx = off.getContext('2d');
      if (ctx) draw(ctx, scale, true);
      return off;
    },
    [geo, draw],
  );

  // Keep the wall picture in step with the design while the wall view is open.
  useEffect(() => {
    if (view !== 'wall') return;
    const id = window.setTimeout(() => setWallImg(renderTo(WALL_LONG_SIDE).toDataURL('image/png')), 60);
    return () => window.clearTimeout(id);
  }, [view, renderTo]);

  const pickFor = (slotId: string) => {
    pendingSlotRef.current = slotId;
    setSelected(slotId);
    fileRef.current?.click();
  };

  const addPhoto = (slotId: string, file: File) => {
    const img = new Image();
    img.onload = () => setSlots((prev) => ({ ...prev, [slotId]: { img, dx: 0, dy: 0, zoom: 1 } }));
    img.src = URL.createObjectURL(file);
    setSelected(slotId);
  };

  const canvasPoint = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * geo.totalW, y: ((e.clientY - rect.top) / rect.height) * geo.totalH };
  };

  const hitSlot = (x: number, y: number) =>
    [...t.slots].reverse().find((s) => {
      const r = slotRect(s);
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    });

  const onPointerDown = (e: React.PointerEvent) => {
    const p = canvasPoint(e);
    const s = hitSlot(p.x, p.y);
    if (!s) return setSelected(null);
    setSelected(s.id);
    const st = slots[s.id];
    if (!st) return pickFor(s.id);
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { slotId: s.id, startX: p.x, startY: p.y, dx0: st.dx, dy0: st.dy };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = canvasPoint(e);
    const r = slotRect(t.slots.find((x) => x.id === d.slotId)!);
    setSlots((prev) => {
      const st = prev[d.slotId];
      return st ? { ...prev, [d.slotId]: { ...st, dx: d.dx0 + (p.x - d.startX) / r.w, dy: d.dy0 + (p.y - d.startY) / r.h } } : prev;
    });
  };

  const onPointerUp = () => (dragRef.current = null);
  const selectedState = selected ? slots[selected] : undefined;

  const dpiWarning = useMemo(() => {
    if (!selected || !selectedState) return null;
    const inches = parseSize(size);
    const s = t.slots.find((x) => x.id === selected);
    if (!inches || !s) return null;
    const cover = Math.max((s.w * geo.W) / selectedState.img.naturalWidth, (s.h * geo.H) / selectedState.img.naturalHeight) * selectedState.zoom;
    const dpi = (s.w * geo.W) / cover / (s.w * inches.w);
    return dpi < 100 ? `This photo may print soft at ${size} (about ${Math.round(dpi)} DPI). A larger original will print sharper.` : null;
  }, [selected, selectedState, size, t, geo]);

  // True-scale placement on the wall.
  const wallPlacement = useMemo(() => {
    const inches = parseSize(size) ?? { w: 12, h: 18 };
    const m = finish?.color ? MOULDING_IN : 0.4;
    return {
      width: `${((inches.w + 2 * m) / ROOM_W_IN) * 100}%`,
      bottom: `${(FRAME_BOTTOM_IN / ROOM_H_IN) * 100}%`,
      sofaWidth: `${(SOFA_W_IN / ROOM_W_IN) * 100}%`,
    };
  }, [size, finish]);

  const arDesign = useMemo(() => {
    const inches = parseSize(size) ?? { w: 12, h: 18 };
    return {
      render: () => renderTo(1400),
      widthIn: (inches.w * geo.totalW) / geo.W,
      heightIn: (inches.h * geo.totalH) / geo.H,
      edgeColor: finish?.color ?? null,
      name: t.name,
      slug: t.slug,
      size,
      finishLabel: finish?.label ?? '',
    };
  }, [size, geo, finish, t, renderTo]);

  const orderMessage = () =>
    [
      `Hi ${brandName}! I'd like to order this frame:`,
      '',
      `Layout: ${t.name}`,
      `Size: ${size}`,
      `Finish: ${finish?.label}`,
      ...t.texts.map((txt) => `${txt.label}: ${texts[txt.id]?.trim() || '—'}`),
      `Price: ${formatINR(price)} (${shipText})`,
      '',
      `I'm sharing my design preview and will attach my ${t.slots.length} original photo${t.slots.length > 1 ? 's' : ''} here.`,
    ].join('\n');

  const order = async () => {
    if (!ready) {
      const next = t.slots.find((s) => !slots[s.id]);
      if (next) {
        setView('design');
        pickFor(next.id);
      }
      return;
    }
    setOrdering(true);
    try {
      const blob = await new Promise<Blob | null>((res) => renderTo(EXPORT_LONG_SIDE).toBlob(res, 'image/jpeg', 0.92));
      const message = orderMessage();
      const waUrl = `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
      if (blob) {
        const file = new File([blob], `${t.slug}-preview.jpg`, { type: 'image/jpeg' });
        if (whatsapp && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text: message });
            return;
          } catch (err) {
            if ((err as DOMException)?.name === 'AbortError') return;
          }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      if (whatsapp) window.open(waUrl, '_blank', 'noopener');
      else alert('Ordering is not set up yet: add a WhatsApp number in the site admin.');
    } finally {
      setOrdering(false);
    }
  };

  const orderLabel = ordering ? 'Preparing…' : ready ? 'Order on WhatsApp' : `Add ${t.slots.length - filled} more photo${t.slots.length - filled > 1 ? 's' : ''}`;
  const customWall = isCustomWall(wall) ? wall : null;
  const wallLabel = customWall ? 'custom colour' : (WALLS.find((w) => w.id === wall) ?? WALLS[0]).label.toLowerCase();

  return (
    <div className="pfc">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          const slotId = pendingSlotRef.current ?? selected;
          if (f && slotId) addPhoto(slotId, f);
          pendingSlotRef.current = null;
          e.target.value = '';
        }}
      />

      <div className="pfc__stage">
        <div className="pfc__toolbar">
        <div className="pfc__tabs" role="tablist" aria-label="Preview">
          <button type="button" role="tab" id="pfc-tab-design" aria-controls="pfc-panel" className="pfc__tab" aria-selected={view === 'design'} onClick={() => setView('design')}>
            {Icon.pencil} Design
          </button>
          <button type="button" role="tab" id="pfc-tab-wall" aria-controls="pfc-panel" className="pfc__tab" aria-selected={view === 'wall'} onClick={() => setView('wall')}>
            {Icon.wall} On your wall
          </button>
        </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm pfc__ar"
            onClick={() => {
              setArUsed(true);
              setArOpen(true);
            }}
          >
            {Icon.ar} View in AR
          </button>
        </div>

        <div id="pfc-panel" role="tabpanel" aria-labelledby={view === 'design' ? 'pfc-tab-design' : 'pfc-tab-wall'} style={{ display: 'grid', gap: 12 }}>
        {view === 'design' ? (
          <>
            <div className="pfc__view">
              <canvas
                ref={canvasRef}
                width={geo.totalW}
                height={geo.totalH}
                className="pfc__canvas"
                style={{ cursor: selectedState ? 'grab' : 'pointer' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                aria-label={`Live preview of ${t.name}. Tap a photo spot to add a photo.`}
              />
            </div>
            {selectedState ? (
              <div className="pfc__slot-tools">
                <label className="pfc__zoom">
                  Zoom
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={selectedState.zoom}
                    onChange={(e) => setSlots((prev) => ({ ...prev, [selected!]: { ...prev[selected!], zoom: Number(e.target.value) } }))}
                  />
                </label>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => pickFor(selected!)}>Replace</button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() =>
                    setSlots((prev) => {
                      const next = { ...prev };
                      delete next[selected!];
                      return next;
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ) : (
              <p className="pfc__hint">
                {ready ? 'Tap a photo to zoom it. Drag a photo to reposition it.' : 'Tap a photo spot to add a photo. Drag a photo to reposition it.'}
              </p>
            )}
            {dpiWarning && <p className="pfc__warn">{dpiWarning}</p>}
          </>
        ) : (
          <>
            <div className="pfc__room wall" aria-label={`${t.name} at ${size} on a ${wallLabel} wall, to scale above a sofa`}>
              <span className="wall__dado" aria-hidden="true" />
              <svg className="pfc__sofa" viewBox="0 0 84 34" aria-hidden="true">
                <rect x="2" y="2" width="80" height="20" rx="5" fill="#59606b" />
                <rect x="0" y="12" width="9" height="18" rx="3.5" fill="#4b525c" />
                <rect x="75" y="12" width="9" height="18" rx="3.5" fill="#4b525c" />
                <rect x="8" y="17" width="68" height="11" rx="2.5" fill="#6a727e" />
                <path d="M30 17v11M54 17v11" stroke="#59606b" strokeWidth="0.8" />
                <rect x="10" y="30" width="2" height="4" fill="#3b3128" />
                <rect x="72" y="30" width="2" height="4" fill="#3b3128" />
              </svg>
              {wallImg && (
                <div className="hung" style={{ width: wallPlacement.width, bottom: wallPlacement.bottom }}>
                  <span className="hung__nail" aria-hidden="true" />
                  <svg className="hung__string" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M50 1 L2 34 M50 1 L98 34" stroke="#3a3a38" strokeWidth="1.2" fill="none" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <img src={wallImg} alt="" />
                </div>
              )}
            </div>
            <div className="pfc__room-foot">
              <div className="wall-chips" role="group" aria-label="Wall colour">
                <span className="wall-chips__label">Wall</span>
                {WALLS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className="wall-chip"
                    style={{ background: w.color }}
                    aria-pressed={w.id === wall}
                    aria-label={`${w.label} wall`}
                    title={w.label}
                    onClick={() => setWall(w.id)}
                  />
                ))}
                <label
                  className="wall-chip wall-chip--custom"
                  title="Pick any wall colour"
                  data-on={customWall ? '' : undefined}
                  style={customWall ? ({ '--custom': customWall } as React.CSSProperties) : undefined}
                >
                  <input
                    type="color"
                    value={customWall ?? '#c9b8a6'}
                    aria-label="Pick any wall colour"
                    onChange={(e) => setWall(e.target.value as WallChoice)}
                  />
                </label>
              </div>
              <p className="pfc__hint">{size} shown to scale above a 7 ft sofa</p>
            </div>
          </>
        )}
        </div>
      </div>

      <div className="pfc__panel">
        <fieldset className="pfc__group">
          <legend>Photos <span className="muted" style={{ fontWeight: 500 }}>· {filled} of {t.slots.length} added</span></legend>
          <div className="pfc__slots">
            {t.slots.map((s, i) => {
              const st = slots[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`slot-btn${st ? ' is-filled' : ''}`}
                  style={st ? { backgroundImage: `url(${st.img.src})` } : undefined}
                  aria-pressed={selected === s.id}
                  aria-label={st ? `Photo ${i + 1}: selected photo. Tap to edit.` : `Photo ${i + 1}: add a photo`}
                  onClick={() => {
                    setView('design');
                    if (st) setSelected(s.id);
                    else pickFor(s.id);
                  }}
                >
                  {!st && Icon.plus}
                </button>
              );
            })}
          </div>
        </fieldset>

        {t.texts.length > 0 && (
          <fieldset className="pfc__group">
            <legend>Your words</legend>
            {t.texts.map((txt) => (
              <label key={txt.id} className="field">
                {txt.label}
                <input
                  type="text"
                  maxLength={60}
                  placeholder={txt.placeholder}
                  value={texts[txt.id] ?? ''}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [txt.id]: e.target.value }))}
                />
              </label>
            ))}
          </fieldset>
        )}

        <fieldset className="pfc__group">
          <legend>Size</legend>
          <div className="choices">
            {t.sizes.map((s) => {
              const p = priceFor(t, s, finish?.id ?? '');
              return (
                <button key={s} type="button" className="choice" aria-pressed={s === size} onClick={() => setSize(s)}>
                  <span>
                    {s}
                    {p !== null && <small>{formatINR(p)}</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="pfc__group">
          <legend>Finish</legend>
          <div className="choices">
            {t.finishes.map((f) => {
              const p = priceFor(t, size, f.id);
              return (
                <button key={f.id} type="button" className="choice" aria-pressed={f.id === finishId} onClick={() => setFinishId(f.id)}>
                  <span
                    className={`choice__swatch${f.color ? '' : ' choice__swatch--canvas'}`}
                    style={f.color ? { background: f.color } : undefined}
                  />
                  <span>
                    {f.label}
                    {p !== null && <small>{formatINR(p)}</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="pfc__order">
          <div className="pfc__price">
            <strong>{formatINR(price)}</strong>
            <span>{shipText}</span>
          </div>
          <button type="button" className={`btn ${ready ? 'btn--whatsapp' : 'btn--primary'}`} disabled={ordering} onClick={order}>
            {ready && Icon.wa}
            {orderLabel}
          </button>
          <p className="pfc__note">
            Your photos stay on this device while you design. When you order, the preview is shared with us on WhatsApp; attach your original photos in the chat for full print quality.
          </p>
        </div>
      </div>

      {arUsed && (
        <Suspense fallback={null}>
          <ArDialog open={arOpen} onClose={() => setArOpen(false)} design={arDesign} supabase={{ url: SUPABASE_URL, key: SUPABASE_KEY }} />
        </Suspense>
      )}

      <div className="pfc__bar">
        <div>
          <strong>{formatINR(price)}</strong>
          <span>{size} · {finish?.label}</span>
        </div>
        <button type="button" className={`btn ${ready ? 'btn--whatsapp' : 'btn--primary'}`} disabled={ordering} onClick={order}>
          {ready && Icon.wa}
          {orderLabel}
        </button>
      </div>
    </div>
  );
}
