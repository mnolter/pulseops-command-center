import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@pulseops/shared"],
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@pulseops/shared": path.resolve(
        process.cwd(),
        "../../packages/shared/src/index.ts"
      )
    };

    return config;
  }
};

export default nextConfig;
