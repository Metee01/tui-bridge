/**
 * Merkezi site ayarları — domain, GitHub, npm, başlık hepsi burada.
 * Hem astro.config.mjs hem src/pages/index.astro buradan okur.
 * Sadece bu dosyayı düzenleyerek tüm siteyi güncellersin.
 */
export const siteConfig = {
  /** Site URL'si (sonunda / yok). SEO, sitemap, OG etiketleri için kullanılır.
   *  Vercel'in verdiği domaini buraya yaz. Ör: "https://tui-bridge.vercel.app"
   *  Sonradan kendi domainini alınca burayı güncellersin. */
  url: "https://tui-bridge.vercel.app",

  name: "tui-bridge",
  heroLine1: "Any TUI,",
  heroLine2: "on your phone.",
  description:
    "Bridge any TUI application to a mobile-friendly web terminal. No port forwarding, no central server, no network configuration.",

  repo: {
    url: "https://github.com/Metee01/tui-bridge",
    /** "Edit this page" linklerinin hangi branch'e işaret edeceği. */
    editBranch: "main",
  },

  npm: {
    name: "tui-bridge",
    url: "https://www.npmjs.com/package/tui-bridge",
  },
};
