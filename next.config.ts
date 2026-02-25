import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Hide Next.js dev indicator in local/dev tunnel sessions.
  devIndicators: false,
  // Keep Turbopack anchored to repository root when workspace inference is ambiguous.
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
