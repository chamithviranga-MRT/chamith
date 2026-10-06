import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit loads font metric files from disk at runtime; keep it out of the bundle.
  serverExternalPackages: ["pdfkit", "@prisma/client", "@mendable/firecrawl-js"],
  poweredByHeader: false,
  // pdfkit loads its font metrics through dynamic requires the file tracer cannot see; without this a serverless
  // deployment (Vercel) builds the PDF route without its fonts and the export fails.
  outputFileTracingIncludes: { "/api/report": ["./node_modules/pdfkit/js/**/*"] },
};

export default nextConfig;
