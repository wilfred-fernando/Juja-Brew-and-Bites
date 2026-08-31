/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "files.jujabrewandbites.com",
        pathname: "/public-media/**",
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true, // Bypass strict type checks
  },
  eslint: {
    ignoreDuringBuilds: true, // Bypass linting errors
  },
};

export default nextConfig;
