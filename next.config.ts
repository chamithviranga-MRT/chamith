import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit loads font metric files from disk at runtime; keep it out of the bundle.
  serverExternalPackages: ["pdfkit", "@prisma/client", "@mendable/firecrawl-js"],
  poweredByHeader: false,
};

export default nextConfig;
