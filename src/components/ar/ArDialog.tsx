// "See it on your real wall". On a phone: builds the true-size 3D frame from
// the design and opens AR (WebXR on Android, Quick Look on iPhone). On a
// computer: shows the 3D frame and a QR code; the frame model (never the
// original photos) is uploaded so the phone can open the same design.
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import ModelView from './ModelView';
import { AR_LINK_DAYS, buildFrameGlb, isPhone, uploadFrameGlb, type FrameModelInput } from '../../lib/arModel';

export interface ArDesign extends Omit<FrameModelInput, 'image'> {
  render: () => HTMLCanvasElement;
  name: string;
  slug: string;
  size: string;
  finishLabel: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  design: ArDesign;
  supabase: { url: string; key: string };
}

type Handoff = { state: 'idle' } | { state: 'uploading' } | { state: 'ready'; link: string; qr: string } | { state: 'error' };

const Close = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>;

export default function ArDialog({ open, onClose, design, supabase }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [phone] = useState(isPhone);
  const [glb, setGlb] = useState<{ blob: Blob; url: string } | null>(null);
  const [buildError, setBuildError] = useState(false);
  const [canAR, setCanAR] = useState<boolean | null>(null);
  const [handoff, setHandoff] = useState<Handoff>({ state: 'idle' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Build the model each time the dialog opens, from the design as it is now.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let url: string | null = null;
    setGlb(null);
    setBuildError(false);
    setCanAR(null);
    setHandoff({ state: 'idle' });
    buildFrameGlb({ image: design.render(), widthIn: design.widthIn, heightIn: design.heightIn, edgeColor: design.edgeColor })
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setGlb({ blob, url });
      })
      .catch(() => alive && setBuildError(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const makeLink = async (): Promise<string | null> => {
    if (!glb) return null;
    setHandoff({ state: 'uploading' });
    try {
      const path = await uploadFrameGlb(glb.blob, supabase.url, supabase.key);
      const q = new URLSearchParams({ m: path, n: design.name, s: design.size, f: design.finishLabel, t: design.slug });
      const link = `${location.origin}/ar/?${q.toString()}`;
      const qr = await QRCode.toDataURL(link, { margin: 1, width: 440, color: { dark: '#111827', light: '#ffffff' }, errorCorrectionLevel: 'M' });
      setHandoff({ state: 'ready', link, qr });
      return link;
    } catch {
      setHandoff({ state: 'error' });
      return null;
    }
  };

  // Computers get the QR code as soon as the model exists.
  useEffect(() => {
    if (open && glb && !phone && handoff.state === 'idle') void makeLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, glb, phone]);

  const title = `${design.name} · ${design.size} · ${design.finishLabel}`;

  return (
    <dialog ref={ref} className="ar-dialog" onClose={onClose} aria-labelledby="ar-title">
      <div className="ar-dialog__head">
        <div>
          <h2 id="ar-title">See it on your real wall</h2>
          <p className="muted">{title}</p>
        </div>
        <button type="button" className="ar-dialog__close" aria-label="Close" onClick={onClose}>{Close}</button>
      </div>

      <div className={`ar-dialog__body${phone ? '' : ' is-desktop'}`}>
        <div className="ar-dialog__stage">
          {glb ? (
            <ModelView
              src={glb.url}
              alt={`3D model of ${design.name}`}
              ar={phone}
              onStatus={(s) => setCanAR(s.canAR)}
            />
          ) : buildError ? (
            <p className="mv__error">We couldn't build the 3D frame on this browser.</p>
          ) : (
            <div className="ar-dialog__loading" role="status">
              <span className="spinner" aria-hidden="true" />
              Building your 3D frame…
            </div>
          )}
        </div>

        {phone ? (
          <div className="ar-dialog__side">
            {canAR === false ? (
              <>
                <p>Your browser can't start AR from this page. Open the frame in your phone's AR viewer instead.</p>
                {handoff.state === 'ready' ? (
                  <a className="btn btn--primary" href={handoff.link}>Open AR viewer</a>
                ) : (
                  <button type="button" className="btn btn--primary" disabled={handoff.state === 'uploading'} onClick={() => void makeLink()}>
                    {handoff.state === 'uploading' ? 'Preparing…' : 'Prepare AR viewer'}
                  </button>
                )}
                {handoff.state === 'error' && <p className="ar-error">Couldn't prepare the AR viewer. Check your connection and try again.</p>}
              </>
            ) : (
              <ol className="ar-steps">
                <li>Tap <b>Place on your wall</b> and allow the camera.</li>
                <li>Point your phone at the wall and move it slowly until the wall is found.</li>
                <li>The frame appears at its real size. Drag it to where you want it.</li>
              </ol>
            )}
            <p className="pfc__note">On iPhone, if the frame lands on the floor, drag it up onto the wall.</p>
          </div>
        ) : (
          <div className="ar-dialog__side">
            <h3>Scan with your phone</h3>
            <p className="muted">Open your phone's camera and point it at the code. Your frame opens in AR at its real size, ready to place on your wall.</p>
            <div className="ar-qr">
              {handoff.state === 'ready' ? (
                <img src={handoff.qr} alt="QR code that opens this frame in AR on your phone" width="220" height="220" />
              ) : handoff.state === 'error' ? (
                <div className="ar-qr__msg">
                  <p className="ar-error">Couldn't create the phone link. Check your connection and try again.</p>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void makeLink()}>Try again</button>
                </div>
              ) : (
                <div className="ar-qr__msg" role="status"><span className="spinner" aria-hidden="true" />Creating your phone link…</div>
              )}
            </div>
            {handoff.state === 'ready' && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(handoff.link).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? 'Link copied' : 'Copy link'}
              </button>
            )}
            <p className="pfc__note">
              Works on Android phones with Google Play Services for AR and on iPhones (iOS 12+). Only this 3D preview is
              shared through the link, and it is deleted after {AR_LINK_DAYS} days; your original photos stay on this computer.
            </p>
          </div>
        )}
      </div>
    </dialog>
  );
}
