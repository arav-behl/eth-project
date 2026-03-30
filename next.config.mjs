/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/friendships/:path*",
        destination: "http://localhost:8000/api/friendships/:path*",
      },
      {
        source: "/api/friendships",
        destination: "http://localhost:8000/api/friendships/",
      },
    ];
  },
};

export default nextConfig;
