import { defineConfig, type Plugin } from "vite";

declare const process: { env: Record<string, string | undefined> };

/**
 * Absolute site URL for canonical / Open Graph / sitemap.
 * 1. VITE_SITE_URL if you set one (e.g. a custom domain)
 * 2. on Vercel: the production domain Vercel exposes at build time (VERCEL_PROJECT_PRODUCTION_URL)
 * 3. local fallback
 */
function siteUrl() {
  const raw = process.env.VITE_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "localhost:5173";
  const url = /^https?:\/\//.test(raw) ? raw : `${raw.startsWith("localhost") ? "http" : "https"}://${raw}`;
  return url.replace(/\/+$/, "");
}

/** fills __SITE_URL__ in index.html and emits robots.txt + sitemap.xml with the real domain */
function seo(): Plugin {
  const url = siteUrl();
  return {
    name: "sasta-seo",
    transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", url),
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n` });
      this.emitFile({
        type: "asset", fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({ plugins: [seo()] });
