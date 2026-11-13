// Live frame customizer: upload a photo per slot, drag/zoom to crop, type the
// texts, pick size + finish, and the canvas preview updates instantly. The
// same geometry (slotPath) powers the catalog SVGs, so what you see is what
// we print. Ordering composes a WhatsApp message and shares the preview.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FrameTemplate, PhotoSlot } from '../../lib/templates';
import { FONT_STACKS, formatINR, parseSize, priceFor, slotPath } from '../../lib/templates';

type SlotState = {
  img: HTMLImageElement;
  /** Pan offset in slot-widths/heights (0 = centered). */
  dx: number;
  dy: number;
  /** Extra zoom on top of cover-fit (1 = cover). */
  zoom: number;
};

interface Props {
  template: FrameTemplate;
  whatsapp: string;
  brandName: string;
  shipping: { flat_fee: number; free_above: number };
}

const PREVIEW_LONG_SIDE = 1400;
const EXPORT_LONG_SIDE = 2000;

export default function FrameCustomizer({ template: t, whatsapp, brandName, shipping }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [size, setSize] = useState(t.sizes[0]);
  const [finishId, setFinishId] = useState(t.finishes[0]?.id ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const dragRef = useRef<{ slotId: string; startX: number; startY: number; dx0: number; dy0: number } | null>(null);
  const pendingSlotRef = useRef<string | null>(null);

  const finish = t.finishes.find((f) => f.id === finishId) ?? t.finishes[0];
  const price = priceFor(t, size, finish?.id ?? '') ?? 0;
  const filled = Object.keys(slots).length;
  const shipText = price > shipping.free_above ? 'Free shipping' : `+ ₹${shipping.flat_fee} shipping`;

  // Canvas geometry in device pixels.
  const geo = useMemo(() => {
    const long = PREVIEW_LONG_SIDE;
    const ratio = t.aspect.w / t.aspect.h;
    const W = ratio >= 1 ? long : Math.round(long * ratio);
    const H = ratio >= 1 ? Math.round(long / ratio) : long;
    const border = finish?.color ? Math.round(Math.min(W, H) * 0.045) : 0;
    const mat = finish?.color ? Math.round(border * 0.55) : 0;
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
      const border = geo.border * scale;

      ctx.clearRect(0, 0, W + 2 * pad, H + 2 * pad);
      // Frame border + mat (framed finishes) or a plain canvas edge.
      if (finish?.color) {
        ctx.fillStyle = finish.color;
        ctx.fillRect(0, 0, W + 2 * pad, H + 2 * pad);
        // Bevel hint on the inner edge of the moulding.
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(border, border, W + 2 * (pad - border), H + 2 * (pad - border));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(border * 1.12, border * 1.12, W + 2 * pad - 2.24 * border, H + 2 * pad - 2.24 * border);
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
          ctx.fillStyle = '#e7e9f2';
          ctx.fill(path);
          if (!forExport) {
            ctx.fillStyle = '#8a8fb0';
            ctx.font = `600 ${Math.max(13, Math.min(r.w, r.h) * 0.12)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+ Add photo', r.x + r.w / 2, r.y + r.h / 2);
          }
        }
        ctx.restore();
        if (!forExport) {
          ctx.save();
          ctx.lineWidth = selected === s.id ? 4 : 1.5;
          ctx.strokeStyle = selected === s.id ? '#3b38a6' : 'rgba(35,34,79,0.25)';
          ctx.stroke(path);
          ctx.restore();
        }
      }

      for (const txt of t.texts) {
        const value = texts[txt.id]?.trim();
        const shown = value || (forExport ? '' : txt.placeholder);
        if (!shown) continue;
        ctx.fillStyle = value ? txt.color : 'rgba(35,34,79,0.35)';
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

  // Redraw on any state change (and once fonts arrive).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, 1, false);
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) draw(ctx, 1, false);
    });
    return () => {
      alive = false;
    };
  }, [draw]);

  const addPhoto = (slotId: string, file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setSlots((prev) => ({ ...prev, [slotId]: { img, dx: 0, dy: 0, zoom: 1 } }));
    img.src = url;
    setSelected(slotId);
  };

  const canvasPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * geo.totalW,
      y: ((e.clientY - rect.top) / rect.height) * geo.totalH,
    };
  };

  const hitSlot = (x: number, y: number) =>
    [...t.slots].reverse().find((s) => {
      const r = slotRect(s);
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    });

  const onPointerDown = (e: React.PointerEvent) => {
    const p = canvasPoint(e);
    const s = hitSlot(p.x, p.y);
    if (!s) {
      setSelected(null);
      return;
    }
    setSelected(s.id);
    const st = slots[s.id];
    if (!st) {
      pendingSlotRef.current = s.id;
      fileRef.current?.click();
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { slotId: s.id, startX: p.x, startY: p.y, dx0: st.dx, dy0: st.dy };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = canvasPoint(e);
    const s = t.slots.find((x) => x.id === d.slotId)!;
    const r = slotRect(s);
    setSlots((prev) => {
      const st = prev[d.slotId];
      if (!st) return prev;
      return { ...prev, [d.slotId]: { ...st, dx: d.dx0 + (p.x - d.startX) / r.w, dy: d.dy0 + (p.y - d.startY) / r.h } };
    });
  };

  const onPointerUp = () => (dragRef.current = null);

  const selectedState = selected ? slots[selected] : undefined;

  // Print-quality hint for the selected photo at the chosen size.
  const dpiWarning = useMemo(() => {
    if (!selected || !selectedState) return null;
    const inches = parseSize(size);
    const s = t.slots.find((x) => x.id === selected);
    if (!inches || !s) return null;
    const slotInches = s.w * inches.w;
    const cover = Math.max(
      (s.w * geo.W) / selectedState.img.naturalWidth,
      (s.h * geo.H) / selectedState.img.naturalHeight,
    ) * selectedState.zoom;
    const printedPx = (s.w * geo.W) / cover; // source pixels across the slot
    const dpi = printedPx / slotInches;
    return dpi < 100 ? `This photo may look soft at ${size} (≈${Math.round(dpi)} DPI). A larger photo will print sharper.` : null;
  }, [selected, selectedState, size, t, geo]);

  const renderExport = async (): Promise<Blob | null> => {
    const scale = EXPORT_LONG_SIDE / Math.max(geo.W, geo.H);
    const off = document.createElement('canvas');
    off.width = Math.round(geo.totalW * scale);
    off.height = Math.round(geo.totalH * scale);
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    draw(ctx, scale, true);
    return new Promise((resolve) => off.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
  };

  const orderMessage = () => {
    const lines = [
      `Hi ${brandName}! I'd like to order this frame:`,
      '',
      `🖼 Template: ${t.name}`,
      `📐 Size: ${size}`,
      `🪵 Finish: ${finish?.label}`,
      ...t.texts.map((txt) => `✏️ ${txt.label}: ${texts[txt.id]?.trim() || '—'}`),
      `💰 Price: ${formatINR(price)} (${shipText})`,
      '',
      `I'm sharing my design preview and will attach my ${t.slots.length} original photo${t.slots.length > 1 ? 's' : ''} here.`,
    ];
    return lines.join('\n');
  };

  const order = async () => {
    setOrdering(true);
    try {
      const blob = await renderExport();
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
        // Fallback: download the preview, then open WhatsApp chat.
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
        <canvas
          ref={canvasRef}
          width={geo.totalW}
          height={geo.totalH}
          className="pfc__canvas"
          style={{ touchAction: 'none', cursor: selectedState ? 'grab' : 'pointer' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={`Live preview of ${t.name}`}
        />
        <p className="pfc__hint">
          {filled < t.slots.length
            ? `Tap a slot to add a photo (${filled}/${t.slots.length} added) · drag a photo to reposition`
            : 'Drag any photo to reposition · use the zoom slider to crop'}
        </p>
        {selectedState && (
          <div className="pfc__slot-tools">
            <label>
              Zoom
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={selectedState.zoom}
                onChange={(e) =>
                  setSlots((prev) => ({ ...prev, [selected!]: { ...prev[selected!], zoom: Number(e.target.value) } }))
                }
              />
            </label>
            <button type="button" className="btn btn--ghost" onClick={() => { pendingSlotRef.current = selected; fileRef.current?.click(); }}>
              Replace photo
            </button>
            <button
              type="button"
              className="btn btn--ghost"
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
        )}
        {dpiWarning && <p className="pfc__warn">{dpiWarning}</p>}
      </div>

      <div className="pfc__panel">
        {t.texts.length > 0 && (
          <fieldset className="pfc__group">
            <legend>Your words</legend>
            {t.texts.map((txt) => (
              <label key={txt.id}>
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
          <div className="pfc__chips">
            {t.sizes.map((s) => (
              <button key={s} type="button" className={`pfc__chip${s === size ? ' is-on' : ''}`} onClick={() => setSize(s)}>
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="pfc__group">
          <legend>Frame finish</legend>
          <div className="pfc__chips">
            {t.finishes.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`pfc__chip${f.id === finishId ? ' is-on' : ''}`}
                onClick={() => setFinishId(f.id)}
              >
                {f.color && <span className="pfc__swatch" style={{ background: f.color }} />}
                {f.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="pfc__price">
          <div>
            <strong>{formatINR(price)}</strong>
            <span>{shipText}</span>
          </div>
          <button
            type="button"
            className="btn btn--whatsapp"
            disabled={ordering || filled < t.slots.length}
            onClick={order}
          >
            {ordering ? 'Preparing…' : 'Order on WhatsApp'}
          </button>
        </div>
        {filled < t.slots.length && (
          <p className="pfc__note">Add all {t.slots.length} photos to place the order.</p>
        )}
        <p className="pfc__note">
          Your photos stay on this device while you design. On ordering, the preview is shared with us on WhatsApp —
          please attach your original photos in the chat for full print quality.
        </p>
      </div>
    </div>
  );
}
