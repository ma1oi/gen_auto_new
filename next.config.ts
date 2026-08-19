import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  env: {
    GEN_AUTO_DIR: path.join(process.cwd(), "gen_auto"),
  },
};

export default nextConfig;
