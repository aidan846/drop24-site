import type { NextConfig } from "next";
const isProduction = process.env.NODE_ENV === "production";
const nextConfig: NextConfig = { output: "export", trailingSlash: true, basePath: isProduction ? "/drop24-site" : "", assetPrefix: isProduction ? "/drop24-site/" : "", images: { unoptimized: true } };
export default nextConfig;
