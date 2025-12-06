import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Temporarily disabled to debug double render
  allowedDevOrigins: ["http://192.168.1.42:3000"], // only affects dev
  eslint: {
    ignoreDuringBuilds: true, // Disable ESLint during production builds
  },
  typescript: {
    ignoreBuildErrors: true, // Disable TypeScript errors during production builds
  },
};

export default nextConfig;
