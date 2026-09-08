/** Detects phones/tablets and narrow touch layouts without relying on a UA alone. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const touchMac = /Macintosh/i.test(userAgent) && (navigator.maxTouchPoints ?? 0) > 1;
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
    || touchMac
    || window.matchMedia?.('(max-width: 767px)').matches === true;
}
