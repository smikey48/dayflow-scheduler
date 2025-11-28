import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Temporarily disabled to debug double render
  allowedDevOrigins: ["http://192.168.1.42:3000"], // only affects dev
};

export default nextConfig;
