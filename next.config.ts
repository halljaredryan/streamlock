import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avatars, hero icons and Twitch thumbnails are fixed-size CDN images served
  // over plain <img>, so next/image's remote allowlist is not needed yet.
  reactStrictMode: true,
};

export default nextConfig;
