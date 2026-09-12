/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/admin/booking-cancellation-gift-certificate": [
      "./public/gift-certificates/juja-100-background.png",
      "./node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf",
    ],
  },
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
