import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // pywebview loads the built bundle off the filesystem, so assets must be
  // referenced relatively rather than from the server root.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
