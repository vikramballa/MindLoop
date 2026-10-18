import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MindLoop",
    short_name: "MindLoop",
    description: "A 10-second daily check-in, one small thing that helps, and a garden that grows with you.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f0ea",
    theme_color: "#f3f0ea",
    categories: ["health", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Check in", url: "/check-in", description: "Ten seconds, a few taps" },
      { name: "Breathe", url: "/calm", description: "A one-minute breathing reset" },
      { name: "Talk", url: "/talk" },
    ],
  };
}
