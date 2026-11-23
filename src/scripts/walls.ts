// "See it on your wall": any button with data-wall-chip="<id>" sets the wall
// colour for every .wall on the site and remembers it, so the catalog and the
// customizer open on the same wall the visitor picked on the home page.
import { WALLS, WALL_STORAGE_KEY, type WallId } from '../lib/templates';

export function setWall(id: WallId) {
  const w = WALLS.find((x) => x.id === id);
  if (!w) return;
  const root = document.documentElement;
  root.style.setProperty('--wall', w.color);
  root.style.setProperty('--wall-dado', w.dado);
  root.dataset.wall = w.id;
  try {
    localStorage.setItem(WALL_STORAGE_KEY, w.id);
  } catch {}
  document.querySelectorAll<HTMLElement>('[data-wall-chip]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.wallChip === w.id));
  });
  window.dispatchEvent(new CustomEvent('pf:wall', { detail: w.id }));
}

export function currentWall(): WallId {
  return (document.documentElement.dataset.wall as WallId) || WALLS[0].id;
}

export function initWallChips() {
  const now = currentWall();
  document.querySelectorAll<HTMLElement>('[data-wall-chip]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.wallChip === now));
    b.addEventListener('click', () => setWall(b.dataset.wallChip as WallId));
  });
}
