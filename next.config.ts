import type { NextConfig } from "next";

// Not a static export any more: the group board needs API routes (src/app/api/board). Every page
// is still prerendered as static HTML.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
