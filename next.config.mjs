/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse v2 pulls in pdfjs-dist which uses Object.defineProperty on
  // ES module namespaces — incompatible with webpack. Both the top-level
  // serverExternalPackages and the webpack externals entry are needed to
  // cover App Router (RSC) routes on Next.js 14.2.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = config.externals ?? [];
      const asArray = Array.isArray(existing) ? existing : [existing];
      config.externals = [...asArray, "pdf-parse", "pdfjs-dist"];
    }
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
