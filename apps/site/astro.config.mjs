import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { siteConfig } from "./site.config.mjs";

const editBaseUrl = `${siteConfig.repo.url}/edit/${siteConfig.repo.editBranch}/apps/site/`;

export default defineConfig({
  site: siteConfig.url,
  output: "static",
  integrations: [
    starlight({
      title: siteConfig.name,
      description: siteConfig.description,
      logo: { src: "./src/assets/logo.svg", alt: "" },
      favicon: "/favicon.svg",
      social: [
        { label: "GitHub", icon: "github", href: siteConfig.repo.url },
        { label: "npm", icon: "npm", href: siteConfig.npm.url },
      ],
      editLink: { baseUrl: editBaseUrl },
      lastUpdated: true,
      credits: false,
      components: {
        Head: "./src/components/Head.astro",
        Footer: "./src/components/Footer.astro",
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", link: "/getting-started/" },
            { label: "Installation", link: "/installation/" },
            { label: "Quick start", link: "/quick-start/" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "CLI reference", link: "/guides/cli/" },
            { label: "Security model", link: "/guides/security/" },
            { label: "Platform support", link: "/guides/platform/" },
            { label: "Input model", link: "/guides/input/" },
          ],
        },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});
