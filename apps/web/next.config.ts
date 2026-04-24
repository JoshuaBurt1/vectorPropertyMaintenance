import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only use 'export' when we are actually running the build command
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  images: { unoptimized: true } 
};

export default nextConfig;