import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// base: "./" é essencial para o Electron conseguir carregar os assets
// via file:// depois do build (caminhos relativos, não absolutos).
export default defineConfig({
    plugins: [react()],
    base: "./",
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
    },
});
