import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Production builds go through Nitro. By default they produce a standalone Node.js server
// (`node .output/server/index.mjs`). Set NITRO_PRESET to target another host, e.g.
// `NITRO_PRESET=cloudflare-module`, `vercel` or `netlify` (see the README's Deploying section).
//
// Never set ssr.external or resolve.external: Worker targets have no runtime module resolution.
export default defineConfig(({ command }) => ({
  server: { port: 3000 },
  resolve: {
    // Resolve the "@/*" alias from tsconfig.json.
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Use src/server.ts (our SSR error wrapper) as the server entry.
      server: { entry: "server" },
      // Fail the build if server-only code is imported into the client bundle. `files` replaces
      // Start's default list rather than extending it, so the default `**/*.server.*` is repeated.
      importProtection: {
        behavior: "error",
        client: { files: ["**/*.server.*", "**/server/**"] },
      },
    }),
    command === "build" && nitro({ defaultPreset: "node-server" }),
    viteReact(),
  ],
}));
