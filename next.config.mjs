/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse v2 pulls in pdfjs-dist which uses Object.defineProperty on
  // ES module namespaces — incompatible with webpack. Both the
  // experimental.serverComponentsExternalPackages (for App Router RSC /
  // route handlers on 14.2) and the webpack externals entry are needed.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = config.externals ?? [];
      const asArray = Array.isArray(existing) ? existing : [existing];
      config.externals = [...asArray, "pdf-parse", "pdfjs-dist"];
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
