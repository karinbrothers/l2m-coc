import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this project.
  // Without this, Turbopack infers the root by walking up looking for
  // lockfiles/workspace markers and guesses wrong in some setups.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
