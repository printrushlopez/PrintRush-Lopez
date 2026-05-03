/* PrintRUSH Lopez — FingerprintJS OSS (MIT, free, client-side only)
   Generates a stable device hash for spam throttling. No server calls made. */

let _hash = null;

/** Returns a stable SHA-256 device fingerprint string */
export async function getDeviceFingerprint() {
  if (_hash) return _hash;

  const fp = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    navigator.deviceMemory   || 0,
    navigator.platform       || '',
    (navigator.plugins || []).length,
    typeof indexedDB !== 'undefined',
    typeof sessionStorage !== 'undefined',
    typeof localStorage !== 'undefined',
    typeof openDatabase !== 'undefined',
    (function canvasHash() {
      try {
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('PrintRUSH\u2764', 2, 15);
        ctx.fillStyle = 'rgba(102,204,0,0.7)';
        ctx.fillText('PrintRUSH\u2764', 4, 17);
        return c.toDataURL().slice(-50);
      } catch { return 'no-canvas'; }
    })()
  ].join('|');

  const buf  = new TextEncoder().encode(fp);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  _hash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  return _hash;
}
