import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nothing about the operator should be inferable from the site itself.
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
