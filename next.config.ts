import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    // Logo uploads go through a server action: 5 MB image plus form overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
}

export default nextConfig
