import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Social Booster",
    short_name: "Social Booster",
    description: "Social media marketing services for creators, brands and resellers across Nigeria and Africa.",
    start_url: "/",
    display: "standalone",
    background_color: "#06101f",
    theme_color: "#07101f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
