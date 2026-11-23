// Thin React wrapper around <model-viewer>, created imperatively so React
// never has to type or reconcile the custom element. Shows the 3D frame,
// lets it be turned with a finger or mouse, and (when `ar`) offers the
// "place on your wall" AR button.
import { useEffect, useRef, useState } from 'react';
import { loadModelViewer } from '../../lib/arModel';

type MV = HTMLElement & { canActivateAR?: boolean; loaded?: boolean };

interface Props {
  src: string;
  alt: string;
  ar: boolean;
  /** AR modes in priority order. Scene Viewer needs a public URL, never a blob. */
  arModes?: string;
  onStatus?: (s: { loaded: boolean; canAR: boolean }) => void;
}

export default function ModelView({ src, alt, ar, arModes = 'webxr quick-look', onStatus }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mv: MV | null = null;
    let alive = true;
    loadModelViewer()
      .then(() => {
        if (!alive || !host.current) return;
        mv = document.createElement('model-viewer') as MV;
        const attrs: Record<string, string> = {
          src,
          alt,
          'camera-controls': '',
          'touch-action': 'pan-y',
          'shadow-intensity': '0.6',
          exposure: '1.05',
          'environment-image': 'neutral',
          'camera-orbit': '0deg 90deg auto',
          'interaction-prompt': 'none',
          loading: 'eager',
        };
        if (ar) Object.assign(attrs, { ar: '', 'ar-modes': arModes, 'ar-placement': 'wall', 'ar-scale': 'fixed', 'xr-environment': '' });
        for (const [k, v] of Object.entries(attrs)) mv.setAttribute(k, v);
        mv.className = 'mv';
        const progress = document.createElement('div');
        progress.slot = 'progress-bar';
        mv.appendChild(progress);
        if (ar) {
          const btn = document.createElement('button');
          btn.slot = 'ar-button';
          btn.type = 'button';
          btn.className = 'btn btn--primary mv__ar';
          btn.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>Place on your wall';
          mv.appendChild(btn);
        }
        const report = () => onStatus?.({ loaded: true, canAR: !!mv?.canActivateAR });
        mv.addEventListener('load', () => {
          report();
          // canActivateAR settles a moment after load on some devices.
          window.setTimeout(report, 400);
        });
        mv.addEventListener('error', () => setFailed(true));
        host.current.appendChild(mv);
      })
      .catch(() => setFailed(true));
    return () => {
      alive = false;
      mv?.remove();
    };
  }, [src, alt, ar, arModes]);

  return (
    <div className="mv-host" ref={host}>
      {failed && <p className="mv__error">The 3D preview couldn't load on this browser.</p>}
    </div>
  );
}
