// QR rendering (qrcode) and scanning (jsQR via camera or uploaded photo).
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

export function QRImage({ text, size = 220 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: size, color: { dark: '#2a1d15', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [text, size]);
  return <div className="qr-box">{src ? <img src={src} width={size} height={size} alt="QR code" /> : <div style={{ width: size, height: size }} />}</div>;
}

export function decodeImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = img.width * scale;
      c.height = img.height * scale;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(data.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
      URL.revokeObjectURL(img.src);
      code ? resolve(code.data) : reject(new Error('No QR code found in this image. Try a sharper, closer photo.'));
    };
    img.onerror = () => reject(new Error('Could not read the image.'));
    img.src = URL.createObjectURL(file);
  });
}

export function CameraScanner({ onResult }) {
  const video = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream;
    let raf;
    let stopped = false;
    const c = document.createElement('canvas');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.current.srcObject = stream;
        await video.current.play();
        const tick = () => {
          if (stopped) return;
          const v = video.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(v, 0, 0);
            const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
            if (code) {
              stopped = true;
              onResult(code.data);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setErr('Camera not available. Allow camera access, or use "Upload photo" / "Paste code" instead.');
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onResult]);
  return (
    <div>
      {err ? <div className="callout warn">{err}</div> : <video ref={video} playsInline muted style={{ width: '100%', maxWidth: 420, border: '2px solid var(--ink)', background: '#000' }} />}
      <div className="small muted mt-s">Hold the QR code steady inside the frame.</div>
    </div>
  );
}
