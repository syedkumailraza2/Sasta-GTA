/**
 * Google Analytics 4. Only loads when VITE_GA_MEASUREMENT_ID is set (e.g. "G-XXXXXXXXXX" in Vercel's
 * Environment Variables), so local dev and forks send nothing.
 */
type Gtag = (...args: unknown[]) => void;
declare global { interface Window { dataLayer?: unknown[]; gtag?: Gtag } }

const ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim();

export function initAnalytics() {
  if (!ID || typeof window === "undefined" || window.gtag) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  // gtag must push the real `arguments` object, not an array
  window.gtag = function gtag() { window.dataLayer!.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", ID);
}

/** custom event (shows up under Reports → Engagement → Events) */
export function track(name: string, params: Record<string, string | number | boolean> = {}) {
  if (ID) window.gtag?.("event", name, params);
}
