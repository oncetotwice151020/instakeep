import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deployment from "./pages/deployment.json";

export default defineConfig({
  root: "pages",
  base: process.env.GITHUB_PAGES_BASE || "/instakeep/",
  publicDir: "../public",
  plugins: [react()],
  define: { "import.meta.env.VITE_API_ORIGIN": JSON.stringify(process.env.VITE_API_ORIGIN || deployment.apiOrigin) },
  build: { outDir: "../out", emptyOutDir: true },
});
