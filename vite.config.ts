import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// Which entry to build. Defaults to the production widget; the v2 comparison artifact is
// built from a SEPARATE entry (src/index-v2.tsx) rather than a flag, because that is the only
// thing that keeps v2 code structurally out of the bundle customer sites load — a runtime
// allowlist cannot fold a branch away, and `inlineDynamicImports` below defeats lazy imports.
// See src/index-v2.tsx and tools/build-v2test.mjs.
const isV2Entry = process.env.BUILD_ENTRY === "v2";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  build: {
    // The v2 artifact is written alongside the v1 one, never over it: the comparison page
    // loads both, and a build that clobbered the other would silently compare v1 to itself.
    emptyOutDir: !isV2Entry,
    lib: {
      entry: resolve(__dirname, isV2Entry ? "src/index-v2.tsx" : "src/index.tsx"),
      name: isV2Entry ? "CarConfigEmbedV2" : "CarConfigEmbed",
      fileName: isV2Entry ? "car-config-embed-v2" : "car-config-embed",
      formats: ["iife"],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    minify: "terser",
    terserOptions: {
      compress: {
        // Strip console noise from customer sites, but KEEP console.warn and console.error.
        // Dropping everything meant the widget failed silently: a deactivated token, a
        // network error or a bad JWT all produced an absent button and an empty console,
        // which is unusable to debug from a deployed page. Diagnostics go through
        // `debugLog`/`debugWarn` in src/utils/debug.ts, which compile to console.warn.
        pure_funcs: ["console.log", "console.info", "console.debug", "console.trace"],
        drop_console: false,
      },
    },
  },
});
