import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UNO vs AI",
    short_name: "UNO vs AI",
    description: "UNO against card-counting, Monte Carlo AI opponents.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#07130d",
    theme_color: "#0a3a23",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
