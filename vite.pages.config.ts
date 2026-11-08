import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deployment from "./github-pages/deployment.json";

export default defineConfig({
  root: "github-pages",
  base: process.env.GITHUB_PAGES_BASE || "/instakeep/",
  publicDir: "../public",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_STATIC_ONLY": JSON.stringify("true"),
    "import.meta.env.VITE_PRIVATE_WORKSPACE_URL": JSON.stringify(deployment.privateWorkspaceUrl),
  },
  build: { outDir: "../out", emptyOutDir: true },
});
