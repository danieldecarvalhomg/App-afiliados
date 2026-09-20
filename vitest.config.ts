import { defineConfig } from "vitest/config";

// Configuração de testes deliberadamente independente do servidor Vite e de
// plugins de build. Mantém a suíte hermética e evita iniciar integrações reais.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "browser-companion/**/*.test.js"],
    passWithNoTests: false,
  },
});
