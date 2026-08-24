import { fileURLToPath } from "url";
import { dirname } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));

let userConfig = undefined;
try {
  userConfig = await import("./v0-user-next.config");
} catch (e) {
  // ignore error
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "pg"],
  // NOTE: no `instrumentationHook`. It was an `experimental` flag in Next 13/14
  // and is a stable, always-on feature since 15 — Next 16 rejects the key
  // outright ("Unrecognized key(s) in object"). It was also sitting at the top
  // level rather than under `experimental`, so it never did anything here.
  // `instrumentation.ts` is picked up automatically.

  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    // Pin the workspace root so Next.js doesn't pick up the stray
    // package-lock.json at /home/gabs/ and resolve modules from there.
    root: __dirname,
  },
};

mergeConfig(nextConfig, userConfig);

function mergeConfig(nextConfig, userConfig) {
  if (!userConfig) {
    return;
  }

  for (const key in userConfig) {
    if (
      typeof nextConfig[key] === "object" &&
      !Array.isArray(nextConfig[key])
    ) {
      nextConfig[key] = {
        ...nextConfig[key],
        ...userConfig[key],
      };
    } else {
      nextConfig[key] = userConfig[key];
    }
  }
}

export default nextConfig;
