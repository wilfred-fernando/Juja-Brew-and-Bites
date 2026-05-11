/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true, // Bypass strict type checks
  },
  eslint: {
    ignoreDuringBuilds: true, // Bypass linting errors
  },
};

export default nextConfig;