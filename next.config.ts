import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { nextRuntime, webpack }) => {
    // A CJS artifact inside the supabase client references __dirname, which
    // Vercel's Edge runtime does not define; middleware then 500s with
    // MIDDLEWARE_INVOCATION_FAILED. Define it away at build time.
    if (nextRuntime === "edge") {
      config.plugins.push(
        new webpack.DefinePlugin({ __dirname: JSON.stringify("/") }),
      );
    }
    return config;
  },
};

export default nextConfig;
