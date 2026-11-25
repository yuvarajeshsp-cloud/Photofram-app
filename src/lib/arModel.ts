// Builds a true-size 3D frame (binary glTF) from the customer's rendered
// design, for <model-viewer> AR: the design is the front face, the moulding
// (or canvas wrap) colours the sides. Units are metres; the front faces +Z,
// so AR wall placement puts the back against the wall.
// three.js is loaded on demand so the customizer itself stays light.

const INCH = 0.0254;

export interface FrameModelInput {
  /** Rendered design including the moulding, as drawn by the customizer. */
  image: HTMLCanvasElement;
  /** Physical width and height of `image`, in inches. */
  widthIn: number;
  heightIn: number;
  /** Moulding colour for the edges; null for gallery-wrap canvas. */
  edgeColor: string | null;
}

export async function buildFrameGlb({ image, widthIn, heightIn, edgeColor }: FrameModelInput): Promise<Blob> {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

  const w = widthIn * INCH;
  const h = heightIn * INCH;
  const depth = (edgeColor ? 1 : 1.5) * INCH;

  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.mimeType = 'image/jpeg';

  const front = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0 });
  const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color(edgeColor ?? '#efe9dc'), roughness: 0.7, metalness: 0 });
  // BoxGeometry face order: +x, -x, +y, -y, +z (front), -z (back).
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), [edge, edge, edge, edge, front, edge]);
  mesh.position.z = depth / 2;
  mesh.name = 'frame';

  const scene = new THREE.Scene();
  scene.add(mesh);

  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(scene, { binary: true, maxTextureSize: 2048 })) as ArrayBuffer;
  texture.dispose();
  return new Blob([glb], { type: 'model/gltf-binary' });
}

/** Loads <model-viewer> once (it registers the custom element). */
export function loadModelViewer(): Promise<unknown> {
  return import('@google/model-viewer');
}

/** Uploads a frame model for the desktop → phone hand-off; returns its file name. */
export async function uploadFrameGlb(blob: Blob): Promise<string> {
  const res = await fetch('/api/ar', { method: 'POST', headers: { 'Content-Type': 'model/gltf-binary' }, body: blob });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return ((await res.json()) as { path: string }).path;
}

export { AR_LINK_DAYS, AR_PATH_RE } from './arPaths';

/** Absolute URL, so Android Scene Viewer (which fetches the file itself) can load it. */
export function publicModelUrl(path: string) {
  return `${location.origin}/ar-files/${path}`;
}

export const isPhone = () =>
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
