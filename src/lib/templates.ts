// Frame template model shared by the catalog (SVG previews), the customizer
// island (canvas rendering) and the admin editor. Geometry is stored as
// fractions of the artwork (0..1) so one template works at every print size.

export type SlotShape = 'rect' | 'circle' | 'heart';

export interface PhotoSlot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: SlotShape;
}

export interface TextSlot {
  id: string;
  label: string;
  placeholder: string;
  /** Center of the text line, as fractions of the artwork. */
  x: number;
  y: number;
  /** Maximum line width as a fraction of artwork width. */
  w: number;
  /** Font size as a fraction of artwork height. */
  size: number;
  color: string;
  font: 'script' | 'serif' | 'sans';
  align?: 'center' | 'left';
}

export interface Finish {
  id: string;
  label: string;
  /** Border colour; null for gallery-wrap canvas (no visible frame). */
  color: string | null;
  group: 'framed' | 'canvas';
}

export interface FrameTemplate {
  slug: string;
  name: string;
  category: string;
  description: string;
  aspect: { w: number; h: number };
  background: string;
  slots: PhotoSlot[];
  texts: TextSlot[];
  sizes: string[];
  finishes: Finish[];
  pricing: Record<string, Record<string, number>>;
  /** Optional catalog image uploaded from /admin; SVG preview is used when empty. */
  preview?: string;
}

export const FONT_STACKS: Record<TextSlot['font'], string> = {
  script: "'Great Vibes', cursive",
  serif: "Georgia, 'Times New Roman', serif",
  sans: "'Onest', system-ui, sans-serif",
};

/** Wall colours for "See it on your wall". `dado` is the darker lower band. */
export const WALLS = [
  { id: 'mint', label: 'Mint', color: '#8fd3b6', dado: '#6fbf9e' },
  { id: 'sky', label: 'Sky blue', color: '#8ccbeb', dado: '#67b1d6' },
  { id: 'salmon', label: 'Salmon', color: '#f2ae9f', dado: '#e3907e' },
  { id: 'white', label: 'White', color: '#f1eee6', dado: '#ddd8cc' },
] as const;

export type WallId = (typeof WALLS)[number]['id'];
export const WALL_STORAGE_KEY = 'pf-wall';

export function priceFor(t: FrameTemplate, size: string, finishId: string): number | null {
  const finish = t.finishes.find((f) => f.id === finishId);
  if (!finish) return null;
  return t.pricing[finish.group]?.[size] ?? null;
}

export function priceRange(t: FrameTemplate): { min: number; max: number } {
  const all = Object.values(t.pricing).flatMap((bySize) => Object.values(bySize));
  return { min: Math.min(...all), max: Math.max(...all) };
}

export const formatINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * SVG path for a slot's mask in absolute units. Canvas can consume the same
 * string through `new Path2D(path)`, so preview and print render identically.
 */
export function slotPath(shape: SlotShape, x: number, y: number, w: number, h: number): string {
  if (shape === 'circle') {
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    const cy = y + ry;
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
  }
  if (shape === 'heart') {
    // A rounded heart drawn inside the box (x, y, w, h).
    const cx = x + w / 2;
    const top = y + h * 0.3;
    return [
      `M ${cx} ${y + h}`,
      `C ${x - w * 0.08} ${y + h * 0.62} ${x + w * 0.04} ${y + h * 0.06} ${cx} ${top}`,
      `C ${x + w - w * 0.04} ${y + h * 0.06} ${x + w + w * 0.08} ${y + h * 0.62} ${cx} ${y + h}`,
      'Z',
    ].join(' ');
  }
  return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}

/** Parse a size label like "8 × 12 in" into inches. */
export function parseSize(label: string): { w: number; h: number } | null {
  const m = label.match(/([\d.]+)\s*[×x]\s*([\d.]+)/);
  return m ? { w: parseFloat(m[1]), h: parseFloat(m[2]) } : null;
}
