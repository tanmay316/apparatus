import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X, ScanLine, Barcode, FileText, Image as ImageIcon, Keyboard, Camera as CameraIcon, Zap } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useUIStore } from '@/stores/ui-store';
import { compressImageFile } from '@/utils/image-compression';
import { isBarcode } from '@/lib/food-db';
import { useLockBody } from './cal-ui';

export type ScanMode = 'food' | 'barcode' | 'label';

export interface CapturedPhoto { base64: string; mime: string; preview: string; mode: ScanMode }

interface Props {
  initialMode?: ScanMode;
  onPhoto: (photo: CapturedPhoto) => void;
  onBarcode: (code: string) => void;
  onClose: () => void;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

/** Decode a barcode from a canvas: native BarcodeDetector when present, else ZXing. */
async function decodeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const BD = (window as any).BarcodeDetector;
  if (BD) {
    try {
      const detector = new BD({ formats: FORMATS });
      const found = await detector.detect(canvas);
      const raw = found?.[0]?.rawValue;
      if (raw) return String(raw);
      return null;
    } catch {
      // Fall through to ZXing (unsupported format list etc.).
    }
  }
  const Z = await import('@zxing/library');
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  try {
    return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText();
  } catch {
    return null;
  }
}

function dataUrlToCanvas(dataUrl: string, max = 1400): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => reject(new Error('bad image'));
    img.src = dataUrl;
  });
}

const buzz = () => { Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}); };

export default function FoodCamera({ initialMode = 'food', onPhoto, onBarcode, onClose }: Props) {
  useLockBody();
  const { showToast } = useUIStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [live, setLive] = useState<'starting' | 'on' | 'off'>('starting');
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [torch, setTorch] = useState(false);
  const doneRef = useRef(false);

  // Live camera preview (falls back to the system camera when unavailable).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setLive('on');
      } catch {
        if (!cancelled) setLive('off');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  const grabFrame = useCallback((max = 1280, crop?: { w: number; h: number }): HTMLCanvasElement | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
    if (crop) {
      sw = Math.round(v.videoWidth * crop.w);
      sh = Math.round(v.videoHeight * crop.h);
      sx = Math.round((v.videoWidth - sw) / 2);
      sy = Math.round((v.videoHeight - sh) / 2);
    }
    const s = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * s);
    c.height = Math.round(sh * s);
    c.getContext('2d')!.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }, []);

  const finishBarcode = useCallback((value: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    buzz();
    onBarcode(value);
  }, [onBarcode]);

  // Continuous barcode scanning on the live preview.
  useEffect(() => {
    if (mode !== 'barcode' || live !== 'on') return;
    let stop = false;
    let timer = 0;
    const loop = async () => {
      if (stop) return;
      const frame = grabFrame(1000, { w: 0.9, h: 0.6 });
      const found = frame ? await decodeCanvas(frame).catch(() => null) : null;
      if (stop) return;
      if (found && isBarcode(found)) finishBarcode(found);
      else timer = window.setTimeout(loop, 220);
    };
    loop();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [mode, live, grabFrame, finishBarcode]);

  const setTorchOn = async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    try {
      await (track as any)?.applyConstraints({ advanced: [{ torch: on }] });
      setTorch(on);
    } catch {
      showToast('Flash is not available on this camera', 'info');
    }
  };

  const handleStill = async (dataUrl: string) => {
    if (mode === 'barcode') {
      const canvas = await dataUrlToCanvas(dataUrl);
      const found = await decodeCanvas(canvas);
      if (found && isBarcode(found)) finishBarcode(found);
      else showToast("Couldn't read a barcode. Try again closer, or type it in.", 'error');
      return;
    }
    const base64 = dataUrl.split(',')[1];
    const mime = dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/jpeg';
    if (!base64) return;
    buzz();
    onPhoto({ base64, mime, preview: dataUrl, mode });
  };

  const acceptFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file.', 'error');
      return;
    }
    try {
      await handleStill(await compressImageFile(file, 1280, 1280, 0.8));
    } catch {
      showToast('Could not process that image.', 'error');
    }
  };

  const systemPhoto = async (source: CameraSource) => {
    const input = source === CameraSource.Camera ? captureRef : fileRef;
    if (!Capacitor.isNativePlatform()) {
      input.current?.click();
      return;
    }
    try {
      const image = await Camera.getPhoto({ quality: 80, allowEditing: false, resultType: CameraResultType.Base64, source, width: 1280 });
      if (image.base64String) await handleStill(`data:image/${image.format};base64,${image.base64String}`);
    } catch (error: any) {
      const message = String(error?.message || '');
      if (/cancel/i.test(message)) return;
      input.current?.click();
    }
  };

  const shutter = async () => {
    if (live !== 'on') return systemPhoto(CameraSource.Camera);
    const frame = grabFrame(1280);
    if (!frame) return;
    await handleStill(frame.toDataURL('image/jpeg', 0.82));
  };

  const frameBox = mode === 'barcode' ? { w: '82%', h: '26%' } : mode === 'label' ? { w: '78%', h: '52%' } : { w: '80%', h: '46%' };
  const modes: { id: ScanMode | 'library'; label: string; icon: typeof ScanLine }[] = [
    { id: 'food', label: 'Scan food', icon: ScanLine },
    { id: 'barcode', label: 'Barcode', icon: Barcode },
    { id: 'label', label: 'Food label', icon: FileText },
    { id: 'library', label: 'Library', icon: ImageIcon },
  ];

  return createPortal(
    <div className="cal" style={{ position: 'fixed', inset: 0, zIndex: 10010, background: '#000', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <input ref={captureRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { acceptFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { acceptFile(e.target.files?.[0]); e.target.value = ''; }} />

      <div style={{ position: 'absolute', inset: 0 }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: live === 'on' ? 'block' : 'none' }} />
        {live !== 'on' && (
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 60% at 50% 40%, #26272b 0%, #000 100%)' }} />
        )}
      </div>

      {/* Viewfinder */}
      <div aria-hidden style={{ position: 'absolute', left: '50%', top: '44%', width: frameBox.w, height: frameBox.h, transform: 'translate(-50%, -50%)', transition: 'width 0.25s, height 0.25s', boxShadow: live === 'on' ? '0 0 0 9999px rgba(0,0,0,0.35)' : undefined, borderRadius: 26 }}>
        {[
          { top: 0, left: 0, br: '26px 0 0 0', b: 'borderTop borderLeft' },
          { top: 0, right: 0, br: '0 26px 0 0', b: 'borderTop borderRight' },
          { bottom: 0, left: 0, br: '0 0 0 26px', b: 'borderBottom borderLeft' },
          { bottom: 0, right: 0, br: '0 0 26px 0', b: 'borderBottom borderRight' },
        ].map((c, i) => {
          const style: CSSProperties = { position: 'absolute', width: 44, height: 44, borderRadius: c.br, top: c.top, left: c.left, right: c.right, bottom: c.bottom };
          for (const side of c.b.split(' ')) (style as any)[side] = '4px solid #fff';
          return <span key={i} style={style} />;
        })}
        {mode === 'barcode' && live === 'on' && (
          <span style={{ position: 'absolute', left: '8%', right: '8%', height: 2, background: '#ef4444', boxShadow: '0 0 12px #ef4444', animation: 'cal-scanline 2.2s ease-in-out infinite' }} />
        )}
      </div>

      {/* Top bar */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', paddingTop: 'max(14px, var(--sat))' }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 42, height: 42, borderRadius: 42, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
        <div style={{ fontSize: 17, fontWeight: 700, textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>Scanner</div>
        {live === 'on' ? (
          <button type="button" onClick={() => setTorchOn(!torch)} aria-label="Flash" aria-pressed={torch} style={{ width: 42, height: 42, borderRadius: 42, background: torch ? '#fff' : 'rgba(0,0,0,0.45)', color: torch ? '#000' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={18} /></button>
        ) : <span style={{ width: 42 }} />}
      </div>

      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {live === 'off' && (
          <div style={{ textAlign: 'center', padding: 24, maxWidth: 300, marginTop: '-10%' }}>
            <CameraIcon size={34} style={{ margin: '0 auto', opacity: 0.8 }} />
            <div style={{ marginTop: 10, fontSize: 16, fontWeight: 700 }}>{mode === 'barcode' ? 'Photograph the barcode' : mode === 'label' ? 'Photograph the nutrition label' : 'Take a photo of your meal'}</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>Tap the shutter to open the camera.</div>
          </div>
        )}
        {mode === 'barcode' && (
          <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            {manual ? (
              <form
                onSubmit={e => { e.preventDefault(); if (isBarcode(code)) finishBarcode(code); else showToast('Barcodes are 8–14 digits', 'error'); }}
                style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 18 }}
              >
                <input autoFocus inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="Barcode number" style={{ width: 190, height: 40, borderRadius: 12, padding: '0 12px', background: '#fff', color: '#000', fontWeight: 600, fontSize: 16 }} />
                <button type="submit" style={{ height: 40, padding: '0 14px', borderRadius: 12, background: '#fff', color: '#000', fontWeight: 700 }}>Look up</button>
              </form>
            ) : (
              <button type="button" onClick={() => setManual(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', fontSize: 13, fontWeight: 700 }}>
                <Keyboard size={15} /> Type barcode
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modes + shutter */}
      <div style={{ position: 'relative', padding: '10px 14px', paddingBottom: 'max(22px, var(--sab))' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {modes.map(m => {
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => (m.id === 'library' ? systemPhoto(CameraSource.Photos) : (doneRef.current = false, setMode(m.id)))}
                aria-pressed={active}
                style={{ height: 64, borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, background: active ? '#fff' : 'rgba(255,255,255,0.14)', color: active ? '#000' : '#fff', backdropFilter: 'blur(10px)' }}
              >
                <m.icon size={19} />
                {m.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
          <button type="button" onClick={shutter} aria-label={mode === 'barcode' ? 'Photograph barcode' : 'Take photo'} style={{ width: 76, height: 76, borderRadius: 76, border: '4px solid #fff', padding: 4, background: 'transparent' }}>
            <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: 76, background: '#fff' }} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
