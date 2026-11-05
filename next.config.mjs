import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  devIndicators: false,
  outputFileTracingRoot: root,
  webpack(config) {
    config.resolve.alias["@"] = path.join(root, "src");
    return config;
  },
};

export default nextConfig;
