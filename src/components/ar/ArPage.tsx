// /ar/?m=ar/<uuid>.glb&n=<name>&s=<size>&f=<finish>&t=<slug>
// Opened from the QR code a computer shows: loads the shared frame model and
// offers "Place on your wall". The model URL is public here, so Scene Viewer
// works as a fallback on Android phones without WebXR.
import { useEffect, useState } from 'react';
import ModelView from './ModelView';
import { AR_LINK_DAYS, AR_PATH_RE, isPhone, publicModelUrl } from '../../lib/arModel';

interface Props {
  supabaseUrl: string;
}

type Info = { src: string; name: string; size: string; finish: string; slug: string };

export default function ArPage({ supabaseUrl }: Props) {
  const [info, setInfo] = useState<Info | null | 'bad' | 'expired'>(null);
  const [phone, setPhone] = useState(true);
  const [canAR, setCanAR] = useState<boolean | null>(null);

  useEffect(() => {
    setPhone(isPhone());
    const q = new URLSearchParams(location.search);
    const m = q.get('m') ?? '';
    if (!AR_PATH_RE.test(m)) return setInfo('bad');
    const clip = (v: string | null) => (v ?? '').slice(0, 80);
    const next: Info = { src: publicModelUrl(supabaseUrl, m), name: clip(q.get('n')) || 'Your frame', size: clip(q.get('s')), finish: clip(q.get('f')), slug: clip(q.get('t')).replace(/[^a-z0-9-]/g, '') };
    // Previews are deleted after AR_LINK_DAYS; check before loading the viewer.
    fetch(next.src, { method: 'HEAD' })
      .then((r) => setInfo(r.ok ? next : r.status === 400 || r.status === 404 ? 'expired' : next))
      .catch(() => setInfo(next));
  }, [supabaseUrl]);

  if (info === null) return null;
  if (info === 'expired')
    return (
      <div className="ar-page__msg">
        <h1>This AR link has expired</h1>
        <p className="muted">AR links work for {AR_LINK_DAYS} days. Open your design on the computer and tap View in AR again for a new QR code.</p>
        <a className="btn btn--primary" href="/frames">Browse layouts</a>
      </div>
    );
  if (info === 'bad')
    return (
      <div className="ar-page__msg">
        <h1>This AR link isn't complete</h1>
        <p className="muted">Scan the QR code again from the frame you designed, or start a new design.</p>
        <a className="btn btn--primary" href="/frames">Browse layouts</a>
      </div>
    );

  const meta = [info.size, info.finish].filter(Boolean).join(' · ');
  return (
    <div className="ar-page">
      <div className="ar-page__head">
        <h1>{info.name}</h1>
        {meta && <p className="muted">{meta}</p>}
      </div>
      <div className="ar-page__stage">
        <ModelView src={info.src} alt={`3D model of ${info.name}`} ar arModes="webxr scene-viewer quick-look" onStatus={(s) => setCanAR(s.canAR)} />
      </div>
      {phone && canAR !== false ? (
        <ol className="ar-steps">
          <li>Tap <b>Place on your wall</b> and allow the camera.</li>
          <li>Point your phone at the wall and move it slowly until the wall is found.</li>
          <li>The frame appears at its real size. Drag it to where you want it.</li>
        </ol>
      ) : (
        <p className="ar-page__note">
          {phone
            ? "This phone or browser can't open AR. Try Chrome on Android or Safari on iPhone. You can still turn the frame above."
            : 'Open this link on your phone to place the frame on your wall. On a computer you can turn the 3D frame above.'}
        </p>
      )}
      <p className="pfc__note">On iPhone, if the frame lands on the floor, drag it up onto the wall.</p>
      {info.slug && (
        <a className="btn btn--ghost" href={`/frames/${info.slug}/`}>
          Back to the design
        </a>
      )}
    </div>
  );
}
