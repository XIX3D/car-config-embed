import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  server: {
    allowedHosts: [
      "1a6b-2806-10a6-2b-8aeb-157a-1562-9d6e-af10.ngrok-free.app",
      "a942-189-186-105-201.ngrok-free.app",
      "1e2f-189-186-105-201.ngrok-free.app",
      "6784-189-186-105-201.ngrok-free.app",
    ],
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      name: "CarConfigEmbed",
      fileName: "car-config-embed",
      formats: ["iife"],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    minify: "terser",
    terserOptions: { compress: { drop_console: true } },
  },
});
