import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',            // This creates an 'out' folder instead of '.next'
  images: { unoptimized: true } // Required because static export doesn't support Next.js Image Optimization
};
// pnpm --filter web build (required to be hosted on Firebase hosting as a static sitey)
export default nextConfig;