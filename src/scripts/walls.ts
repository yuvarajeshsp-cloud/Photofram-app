// "See it on your wall": buttons with data-wall-chip="<id>" pick a preset wall
// and an <input type="color" data-wall-custom> picks any colour. The choice
// recolours every .wall on the site and is remembered, so the catalog and the
// customizer open on the wall the visitor picked.
import { WALLS, WALL_STORAGE_KEY, type WallId } from '../lib/templates';

/** A preset wall id, or a custom colour as #rrggbb. */
export type WallChoice = WallId | `#${string}`;

const HEX = /^#[0-9a-f]{6}$/i;
export const isCustomWall = (c: string): c is `#${string}` => HEX.test(c);

/** The darker lower band (dado) for any wall colour. */
export function dadoFor(hex: string, k = 0.86): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

export function wallColors(choice: WallChoice): { color: string; dado: string } {
  if (isCustomWall(choice)) return { color: choice, dado: dadoFor(choice) };
  const w = WALLS.find((x) => x.id === choice) ?? WALLS[0];
  return { color: w.color, dado: w.dado };
}

function syncControls(choice: WallChoice) {
  const custom = isCustomWall(choice);
  document.querySelectorAll<HTMLElement>('[data-wall-chip]').forEach((b) => {
    b.setAttribute('aria-pressed', String(!custom && b.dataset.wallChip === choice));
  });
  document.querySelectorAll<HTMLInputElement>('[data-wall-custom]').forEach((input) => {
    const chip = input.closest<HTMLElement>('.wall-chip--custom');
    chip?.toggleAttribute('data-on', custom);
    if (custom) {
      if (input.value.toLowerCase() !== choice.toLowerCase()) input.value = choice;
      chip?.style.setProperty('--custom', choice);
    }
  });
}

export function setWall(choice: WallChoice) {
  if (!isCustomWall(choice) && !WALLS.some((w) => w.id === choice)) return;
  const { color, dado } = wallColors(choice);
  const root = document.documentElement;
  root.style.setProperty('--wall', color);
  root.style.setProperty('--wall-dado', dado);
  root.dataset.wall = choice;
  try {
    localStorage.setItem(WALL_STORAGE_KEY, choice);
  } catch {}
  syncControls(choice);
  window.dispatchEvent(new CustomEvent<WallChoice>('pf:wall', { detail: choice }));
}

export function currentWall(): WallChoice {
  const v = document.documentElement.dataset.wall;
  return v && (isCustomWall(v) || WALLS.some((w) => w.id === v)) ? (v as WallChoice) : WALLS[0].id;
}

export function initWallChips() {
  syncControls(currentWall());
  document.querySelectorAll<HTMLElement>('[data-wall-chip]').forEach((b) => {
    b.addEventListener('click', () => setWall(b.dataset.wallChip as WallId));
  });
  document.querySelectorAll<HTMLInputElement>('[data-wall-custom]').forEach((input) => {
    // 'input' fires while the picker is dragged, so the wall repaints live.
    input.addEventListener('input', () => setWall(input.value as WallChoice));
  });
  // Keep every chip group (and the customizer) in step when one changes.
  window.addEventListener('pf:wall', (e) => syncControls((e as CustomEvent<WallChoice>).detail));
}
